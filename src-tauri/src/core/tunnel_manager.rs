//! Manages an SSH reverse tunnel via localhost.run to expose the web access
//! server to the public internet via a secure HTTPS URL.
//!
//! Uses the system SSH binary — no external dependencies or accounts needed.

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

    /// Start an SSH tunnel pointing to the given local port.
    /// Returns the public HTTPS URL.
    pub async fn start(&self, port: u16) -> Result<String, String> {
        let mut guard = self.state.write().await;

        // If already running with a URL, return it
        if guard.child.is_some() {
            if let Some(ref url) = guard.url {
                return Ok(url.clone());
            }
        }

        // Stop any existing tunnel
        if let Some(mut child) = guard.child.take() {
            let _ = child.kill().await;
        }
        guard.url = None;

        // Ensure an SSH key exists (localhost.run requires one for the handshake)
        ensure_ssh_key().await?;

        log::info!("Starting SSH tunnel to localhost.run for port {}", port);

        let mut child = Command::new("ssh")
            .args([
                "-o", "StrictHostKeyChecking=accept-new",
                "-o", "ServerAliveInterval=30",
                "-o", "ServerAliveCountMax=3",
                "-o", "ExitOnForwardFailure=yes",
                "-o", "LogLevel=ERROR",
                "-R", &format!("80:localhost:{}", port),
                "nokey@localhost.run",
            ])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn SSH: {}", e))?;

        // localhost.run outputs the tunnel URL on stdout
        let stdout = child.stdout.take()
            .ok_or("Failed to capture SSH stdout")?;

        let (url_tx, url_rx) = tokio::sync::oneshot::channel::<String>();

        // Spawn a task that reads stdout for the URL, then keeps draining
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let mut url_tx = Some(url_tx);

            while let Ok(Some(line)) = lines.next_line().await {
                log::debug!("[ssh-tunnel] {}", line);

                if url_tx.is_some() {
                    // Look for HTTPS URL in the output
                    if let Some(start) = line.find("https://") {
                        let url = line[start..]
                            .split_whitespace()
                            .next()
                            .unwrap_or(&line[start..])
                            .trim()
                            .to_string();
                        if let Some(tx) = url_tx.take() {
                            let _ = tx.send(url);
                        }
                    }
                }
            }
            log::info!("SSH tunnel stdout stream ended");
        });

        // Also drain stderr to prevent pipe blocking
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    log::debug!("[ssh-tunnel:stderr] {}", line);
                }
            });
        }

        guard.child = Some(child);
        drop(guard);

        let url = tokio::time::timeout(
            std::time::Duration::from_secs(15),
            url_rx,
        )
        .await
        .map_err(|_| "Timeout waiting for tunnel URL (15s). Check your internet connection.".to_string())?
        .map_err(|_| "SSH exited without providing a tunnel URL".to_string())?;

        log::info!("SSH tunnel URL: {}", url);

        let mut guard = self.state.write().await;
        guard.url = Some(url.clone());

        Ok(url)
    }

    /// Stop the running tunnel.
    pub async fn stop(&self) -> Result<(), String> {
        let mut guard = self.state.write().await;
        if let Some(mut child) = guard.child.take() {
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

    /// Check if the tunnel is running.
    pub async fn is_running(&self) -> bool {
        let mut guard = self.state.write().await;
        if let Some(ref mut child) = guard.child {
            match child.try_wait() {
                Ok(Some(_)) => {
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

/// Ensure at least one SSH key exists for the handshake.
async fn ensure_ssh_key() -> Result<(), String> {
    let ssh_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".ssh");

    // Check for existing keys
    for name in &["id_ed25519", "id_rsa", "id_ecdsa"] {
        if ssh_dir.join(name).exists() {
            return Ok(());
        }
    }

    log::info!("No SSH key found, generating one...");
    std::fs::create_dir_all(&ssh_dir)
        .map_err(|e| format!("Failed to create ~/.ssh: {}", e))?;

    let key_path = ssh_dir.join("id_ed25519");
    let status = Command::new("ssh-keygen")
        .args([
            "-t", "ed25519",
            "-N", "",
            "-f", &key_path.to_string_lossy(),
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map_err(|e| format!("Failed to generate SSH key: {}", e))?;

    if !status.success() {
        return Err("ssh-keygen failed".to_string());
    }

    log::info!("Generated SSH key at {}", key_path.display());
    Ok(())
}
