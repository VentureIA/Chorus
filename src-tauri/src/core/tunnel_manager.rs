//! Manages a Cloudflare Quick Tunnel to expose the web access server
//! to the public internet via a `https://*.trycloudflare.com` URL.
//!
//! Auto-downloads `cloudflared` to `~/.chorus/bin/` if not already installed.

use std::path::PathBuf;
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
    /// Auto-downloads cloudflared if not found on the system.
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

        let cloudflared = ensure_cloudflared().await?;

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
            match child.try_wait() {
                Ok(Some(_status)) => {
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

/// Directory where Chorus stores its own binaries.
fn chorus_bin_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".chorus")
        .join("bin")
}

/// Ensure cloudflared is available — find it on the system or download it.
/// Public so it can be called at app startup to pre-download the binary.
pub async fn ensure_cloudflared() -> Result<String, String> {
    if let Some(path) = find_cloudflared() {
        return Ok(path);
    }

    log::info!("cloudflared not found on system, downloading...");
    download_cloudflared().await
}

/// Find the cloudflared binary on the system.
fn find_cloudflared() -> Option<String> {
    // Check Chorus bin dir first
    let chorus_bin = chorus_bin_dir().join("cloudflared");
    if chorus_bin.exists() {
        return Some(chorus_bin.to_string_lossy().to_string());
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

/// Download the cloudflared binary for the current platform.
async fn download_cloudflared() -> Result<String, String> {
    let bin_dir = chorus_bin_dir();
    std::fs::create_dir_all(&bin_dir)
        .map_err(|e| format!("Failed to create bin dir: {}", e))?;

    let dest = bin_dir.join("cloudflared");
    let url = download_url()?;

    log::info!("Downloading cloudflared from {}", url);

    if url.ends_with(".tgz") {
        // macOS: download tgz, extract, move binary
        let tgz_path = bin_dir.join("cloudflared.tgz");
        let status = Command::new("curl")
            .args(["-fsSL", "-o", &tgz_path.to_string_lossy(), &url])
            .status()
            .await
            .map_err(|e| format!("Failed to run curl: {}", e))?;
        if !status.success() {
            return Err("Failed to download cloudflared".to_string());
        }

        let status = Command::new("tar")
            .args(["-xzf", &tgz_path.to_string_lossy(), "-C", &bin_dir.to_string_lossy()])
            .status()
            .await
            .map_err(|e| format!("Failed to extract cloudflared: {}", e))?;
        if !status.success() {
            return Err("Failed to extract cloudflared archive".to_string());
        }

        // Clean up the archive
        let _ = std::fs::remove_file(&tgz_path);
    } else {
        // Linux: direct binary download
        let status = Command::new("curl")
            .args(["-fsSL", "-o", &dest.to_string_lossy(), &url])
            .status()
            .await
            .map_err(|e| format!("Failed to run curl: {}", e))?;
        if !status.success() {
            return Err("Failed to download cloudflared".to_string());
        }
    }

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to chmod cloudflared: {}", e))?;
    }

    if !dest.exists() {
        return Err("cloudflared binary not found after download".to_string());
    }

    log::info!("cloudflared downloaded to {}", dest.display());
    Ok(dest.to_string_lossy().to_string())
}

/// Get the download URL for the current OS/arch.
fn download_url() -> Result<String, String> {
    let base = "https://github.com/cloudflare/cloudflared/releases/latest/download";

    let url = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => format!("{}/cloudflared-darwin-arm64.tgz", base),
        ("macos", "x86_64") => format!("{}/cloudflared-darwin-amd64.tgz", base),
        ("linux", "x86_64") => format!("{}/cloudflared-linux-amd64", base),
        ("linux", "aarch64") => format!("{}/cloudflared-linux-arm64", base),
        (os, arch) => return Err(format!("Unsupported platform: {}-{}", os, arch)),
    };

    Ok(url)
}
