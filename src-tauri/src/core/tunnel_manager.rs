//! Manages a Cloudflare Quick Tunnel to expose the web access server
//! to the public internet via a `https://*.trycloudflare.com` URL.

use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::RwLock;

struct TunnelState {
    child: Option<tokio::process::Child>,
    url: Option<String>,
}

pub struct TunnelManager {
    state: Arc<RwLock<TunnelState>>,
}

impl TunnelManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(TunnelState {
                child: None,
                url: None,
            })),
        }
    }

    /// Start a Cloudflare Quick Tunnel pointing to the given local port.
    /// Returns the public HTTPS URL.
    pub async fn start(&self, port: u16) -> Result<String, String> {
        // Hold write lock for the entire operation to prevent race conditions.
        let mut guard = self.state.write().await;

        // If already running with a URL, return it
        if guard.child.is_some() {
            if let Some(ref url) = guard.url {
                return Ok(url.clone());
            }
        }

        // Stop any existing tunnel
        if let Some(mut child) = guard.child.take() {
            log::info!("Stopping existing cloudflared tunnel");
            let _ = child.kill().await;
        }
        guard.url = None;

        let cloudflared = find_cloudflared().ok_or(
            "cloudflared not found. Install it with: brew install cloudflared"
        )?;

        log::info!("Starting cloudflared tunnel for port {}", port);

        let mut child = Command::new(&cloudflared)
            .args([
                "tunnel",
                "--url",
                &format!("http://localhost:{}", port),
                "--no-autoupdate",
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn cloudflared: {}", e))?;

        // Parse the tunnel URL from stderr output.
        // IMPORTANT: We must keep reading stderr after finding the URL,
        // otherwise the pipe closes and cloudflared dies from broken pipe.
        let stderr = child.stderr.take()
            .ok_or("Failed to capture cloudflared stderr")?;

        let (url_tx, url_rx) = tokio::sync::oneshot::channel::<String>();

        // Spawn a task that reads stderr for the lifetime of the process.
        // It sends the URL once found, then keeps draining output.
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            let mut url_tx = Some(url_tx);

            while let Ok(Some(line)) = lines.next_line().await {
                log::debug!("[cloudflared] {}", line);

                if url_tx.is_some() {
                    if let Some(start) = line.find("https://") {
                        let rest = &line[start..];
                        if rest.contains("trycloudflare.com") {
                            let url = rest
                                .split_whitespace()
                                .next()
                                .unwrap_or(rest)
                                .trim()
                                .to_string();
                            if let Some(tx) = url_tx.take() {
                                let _ = tx.send(url);
                            }
                        }
                    }
                }
            }
            log::info!("cloudflared stderr stream ended");
        });

        // Drop the lock while waiting for the URL (can take several seconds)
        guard.child = Some(child);
        drop(guard);

        let url = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            url_rx,
        )
        .await
        .map_err(|_| "Timeout waiting for cloudflared tunnel URL (30s)".to_string())?
        .map_err(|_| "cloudflared exited without providing a tunnel URL".to_string())?;

        log::info!("Cloudflared tunnel URL: {}", url);

        // Re-acquire lock to store the URL
        let mut guard = self.state.write().await;
        guard.url = Some(url.clone());

        Ok(url)
    }

    /// Stop the running tunnel.
    pub async fn stop(&self) -> Result<(), String> {
        let mut guard = self.state.write().await;
        if let Some(mut child) = guard.child.take() {
            log::info!("Stopping cloudflared tunnel");
            let _ = child.kill().await;
        }
        guard.url = None;
        Ok(())
    }

    /// Get the current tunnel URL, if running.
    pub async fn get_url(&self) -> Option<String> {
        let guard = self.state.read().await;
        guard.url.clone()
    }

    /// Check if the tunnel is running (actually probes the child process).
    pub async fn is_running(&self) -> bool {
        let mut guard = self.state.write().await;
        if let Some(ref mut child) = guard.child {
            // try_wait returns Ok(Some(status)) if exited, Ok(None) if still running
            match child.try_wait() {
                Ok(Some(_status)) => {
                    // Process exited — clean up stale state
                    log::warn!("cloudflared process has exited unexpectedly");
                    guard.child = None;
                    guard.url = None;
                    false
                }
                Ok(None) => guard.url.is_some(),
                Err(_) => false,
            }
        } else {
            false
        }
    }
}

/// Find the cloudflared binary.
fn find_cloudflared() -> Option<String> {
    // Check project-local binary first
    let local = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../.local/bin/cloudflared");
    if local.exists() {
        return Some(local.to_string_lossy().to_string());
    }

    // Check PATH
    if let Ok(output) = std::process::Command::new("which")
        .arg("cloudflared")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }

    // Common install locations
    for path in &[
        "/usr/local/bin/cloudflared",
        "/opt/homebrew/bin/cloudflared",
    ] {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    None
}

