//! Manages the Telegram bot process lifecycle.
//!
//! Spawns `chorus-remote` (Node.js) as a child process, reads IPC events
//! from its stdout, and emits Tauri events to the frontend.

use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// IPC events received from the bot process via stdout.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BotIpcEvent {
    Ready {
        #[serde(rename = "botUsername")]
        bot_username: String,
    },
    Paired {
        #[serde(rename = "userId")]
        user_id: i64,
        username: String,
        #[serde(rename = "firstName")]
        first_name: String,
    },
    Prompt {
        #[serde(rename = "userId")]
        user_id: i64,
        text: String,
    },
    Error {
        message: String,
    },
    #[serde(rename = "result")]
    Result {
        #[serde(rename = "userId")]
        user_id: i64,
        prompt: String,
        text: String,
        #[serde(rename = "sessionId")]
        session_id: Option<String>,
    },
    Stopped,
}

/// Configuration for the remote bot.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RemoteConfig {
    pub token: Option<String>,
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub bot_username: Option<String>,
    pub enabled: bool,
}

/// Current state of the bot process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteStatus {
    pub running: bool,
    pub bot_username: Option<String>,
    pub paired: bool,
    pub user_id: Option<i64>,
    pub username: Option<String>,
}

/// Manages the lifecycle of the Telegram bot child process.
pub struct RemoteManager {
    child: Mutex<Option<Child>>,
    child_stdin: Mutex<Option<std::process::ChildStdin>>,
    status: Mutex<RemoteStatus>,
}

impl RemoteManager {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            child_stdin: Mutex::new(None),
            status: Mutex::new(RemoteStatus {
                running: false,
                bot_username: None,
                paired: false,
                user_id: None,
                username: None,
            }),
        }
    }

    /// Start the bot process.
    ///
    /// Spawns `npx tsx chorus-remote/src/index.ts` with the given config.
    /// The bot communicates back via JSON lines on stdout.
    pub fn start(
        &self,
        app_handle: AppHandle,
        token: &str,
        project_dir: &str,
        pairing_code: &str,
        user_id: Option<i64>,
        bot_script_dir: &str,
    ) -> Result<(), String> {
        // Stop existing process if running
        self.stop()?;

        let mut cmd = Command::new("npx");
        cmd.arg("tsx")
            .arg("src/index.ts")
            .arg(format!("--token={}", token))
            .arg(format!("--project={}", project_dir))
            .arg(format!("--pairing-code={}", pairing_code))
            .current_dir(bot_script_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::piped());

        if let Some(uid) = user_id {
            cmd.arg(format!("--user-id={}", uid));
        }

        let mut child = cmd.spawn().map_err(|e| format!("Failed to start bot: {}", e))?;

        let stdout = child.stdout.take().ok_or("No stdout")?;
        let stderr = child.stderr.take().ok_or("No stderr")?;
        let stdin = child.stdin.take();

        // Update status
        {
            let mut status = self.status.lock().unwrap();
            status.running = true;
            if let Some(uid) = user_id {
                status.paired = true;
                status.user_id = Some(uid);
            }
        }

        // Store child process
        {
            let mut child_lock = self.child.lock().unwrap();
            *child_lock = Some(child);
        }

        // Store child stdin
        {
            let mut stdin_lock = self.child_stdin.lock().unwrap();
            *stdin_lock = stdin;
        }

        // Read stdout (IPC events) in background thread
        let app_handle_clone = app_handle.clone();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<BotIpcEvent>(&line) {
                    Ok(event) => {
                        log::info!("[RemoteManager] IPC event: {:?}", event);
                        let _ = app_handle_clone.emit("remote-bot-event", &event);
                    }
                    Err(e) => {
                        log::warn!("[RemoteManager] Invalid IPC line: {} ({})", line, e);
                    }
                }
            }
            log::info!("[RemoteManager] stdout reader exited");
            let _ = app_handle_clone.emit("remote-bot-event", &BotIpcEvent::Stopped);
        });

        // Read stderr (logs) in background thread
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                log::debug!("[chorus-remote] {}", line);
            }
        });

        log::info!("[RemoteManager] Bot process started");
        Ok(())
    }

    /// Send a JSON message to the bot process via stdin.
    pub fn send_to_bot(&self, message: &str) -> Result<(), String> {
        let mut stdin_lock = self.child_stdin.lock().map_err(|e| format!("Stdin lock error: {}", e))?;
        if let Some(ref mut stdin) = *stdin_lock {
            use std::io::Write;
            writeln!(stdin, "{}", message).map_err(|e| format!("Write to bot failed: {}", e))?;
            stdin.flush().map_err(|e| format!("Flush failed: {}", e))?;
            Ok(())
        } else {
            Err("Bot stdin not available".to_string())
        }
    }

    /// Stop the bot process.
    pub fn stop(&self) -> Result<(), String> {
        let mut stdin_lock = self.child_stdin.lock().unwrap();
        *stdin_lock = None;

        let mut child_lock = self.child.lock().unwrap();
        if let Some(mut child) = child_lock.take() {
            let _ = child.kill();
            let _ = child.wait();
            log::info!("[RemoteManager] Bot process stopped");
        }

        let mut status = self.status.lock().unwrap();
        status.running = false;
        status.bot_username = None;

        Ok(())
    }

    /// Get current bot status.
    pub fn status(&self) -> RemoteStatus {
        let mut status = self.status.lock().unwrap();

        // Check if process is still alive
        if status.running {
            let mut child_lock = self.child.lock().unwrap();
            if let Some(ref mut child) = *child_lock {
                match child.try_wait() {
                    Ok(Some(_)) => {
                        // Process exited
                        status.running = false;
                        *child_lock = None;
                    }
                    Ok(None) => {} // Still running
                    Err(_) => {
                        status.running = false;
                        *child_lock = None;
                    }
                }
            }
        }

        status.clone()
    }

    /// Update status when pairing completes (called from event handler).
    pub fn set_paired(&self, user_id: i64, username: &str, bot_username: Option<&str>) {
        let mut status = self.status.lock().unwrap();
        status.paired = true;
        status.user_id = Some(user_id);
        status.username = Some(username.to_string());
        if let Some(bu) = bot_username {
            status.bot_username = Some(bu.to_string());
        }
    }

    /// Update bot username (called when "ready" event received).
    pub fn set_bot_username(&self, username: &str) {
        let mut status = self.status.lock().unwrap();
        status.bot_username = Some(username.to_string());
    }
}

impl Drop for RemoteManager {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
