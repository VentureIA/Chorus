//! MCP protocol implementation over stdio.
//!
//! Implements the Model Context Protocol (MCP) JSON-RPC over stdio,
//! providing automatic status reporting to Chorus based on MCP activity.
//!
//! Status is reported automatically:
//! - "idle" when initialized or after completing a tool call
//! - "working" when a tool call is received

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use thiserror::Error;
use tokio::sync::Mutex;

use crate::status_reporter::StatusReporter;

#[derive(Debug, Error)]
pub enum McpError {
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Status reporting error: {0}")]
    Status(#[from] crate::status_reporter::StatusError),
}

/// JSON-RPC request structure.
#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

/// JSON-RPC response structure.
#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

/// Tracks the current working state for automatic status reporting.
struct ActivityTracker {
    /// Last time we saw activity
    last_activity: Mutex<Instant>,
    /// Whether we're currently in "working" state
    is_working: AtomicBool,
}

impl ActivityTracker {
    fn new() -> Self {
        Self {
            last_activity: Mutex::new(Instant::now()),
            is_working: AtomicBool::new(false),
        }
    }

    async fn mark_activity(&self) {
        let mut last = self.last_activity.lock().await;
        *last = Instant::now();
    }

    fn set_working(&self, working: bool) {
        self.is_working.store(working, Ordering::SeqCst);
    }

    fn is_working(&self) -> bool {
        self.is_working.load(Ordering::SeqCst)
    }
}

/// MCP server implementation with automatic status reporting.
pub struct McpServer {
    status_reporter: StatusReporter,
    activity: Arc<ActivityTracker>,
}

impl McpServer {
    pub fn new(
        status_url: Option<String>,
        session_id: Option<u32>,
        instance_id: Option<String>,
    ) -> Self {
        Self {
            status_reporter: StatusReporter::new(status_url, session_id, instance_id),
            activity: Arc::new(ActivityTracker::new()),
        }
    }

    /// Run the MCP server, reading from stdin and writing to stdout.
    /// Automatically reports status based on MCP activity.
    pub async fn run(&self) -> Result<(), McpError> {
        let stdin = io::stdin();
        let mut stdout = io::stdout();

        // Spawn idle detection task
        let activity = self.activity.clone();
        let reporter = self.status_reporter.clone();
        tokio::spawn(async move {
            let idle_threshold = Duration::from_secs(2);
            loop {
                tokio::time::sleep(Duration::from_millis(500)).await;

                let last = *activity.last_activity.lock().await;
                let elapsed = last.elapsed();

                // If we were working but haven't seen activity for a while, go idle
                if activity.is_working() && elapsed > idle_threshold {
                    activity.set_working(false);
                    eprintln!("[chorus-mcp-server] No activity for {:?}, reporting idle", elapsed);
                    let _ = reporter.report_status("idle", "Ready", None).await;
                }
            }
        });

        for line in stdin.lock().lines() {
            let line = line?;
            if line.is_empty() {
                continue;
            }

            // Mark activity on every message
            self.activity.mark_activity().await;

            let request: JsonRpcRequest = match serde_json::from_str(&line) {
                Ok(req) => req,
                Err(e) => {
                    eprintln!("Failed to parse request: {}", e);
                    continue;
                }
            };

            let response = self.handle_request(&request).await;

            if let Some(resp) = response {
                let output = serde_json::to_string(&resp)?;
                writeln!(stdout, "{}", output)?;
                stdout.flush()?;
            }
        }

        Ok(())
    }

    /// Handle a single JSON-RPC request.
    async fn handle_request(&self, request: &JsonRpcRequest) -> Option<JsonRpcResponse> {
        // Notifications (no id) don't get responses
        let id = request.id.clone()?;

        let (result, error) = match request.method.as_str() {
            "initialize" => (Some(self.handle_initialize()), None),
            "notifications/initialized" => {
                // Auto-report "idle" status when Claude connects
                eprintln!("[chorus-mcp-server] Initialized - reporting idle status");
                let _ = self.status_reporter.report_status("idle", "Ready", None).await;
                return None;
            }
            "tools/list" => (Some(self.handle_tools_list()), None),
            "tools/call" => match self.handle_tools_call(&request.params).await {
                Ok(result) => (Some(result), None),
                Err(e) => (
                    None,
                    Some(JsonRpcError {
                        code: -32000,
                        message: e.to_string(),
                    }),
                ),
            },
            "ping" => (Some(json!({})), None),
            _ => (
                None,
                Some(JsonRpcError {
                    code: -32601,
                    message: format!("Method not found: {}", request.method),
                }),
            ),
        };

        Some(JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result,
            error,
        })
    }

    /// Handle the initialize request.
    fn handle_initialize(&self) -> Value {
        json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "serverInfo": {
                "name": "chorus-mcp-server",
                "version": env!("CARGO_PKG_VERSION")
            }
        })
    }

    /// Handle the tools/list request.
    fn handle_tools_list(&self) -> Value {
        json!({
            "tools": [
                {
                    "name": "chorus_status",
                    "description": "Report your current status to the Chorus UI. Use this to keep the user informed about what you're doing.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "state": {
                                "type": "string",
                                "enum": ["idle", "working", "needs_input", "finished", "error"],
                                "description": "Your current state: idle (waiting), working (actively processing), needs_input (blocked on user input), finished (task complete), error (something went wrong)"
                            },
                            "message": {
                                "type": "string",
                                "description": "Brief description of what you're doing or need (max 100 chars recommended)"
                            },
                            "needsInputPrompt": {
                                "type": "string",
                                "description": "When state is 'needs_input', the specific question or prompt for the user"
                            }
                        },
                        "required": ["state", "message"]
                    }
                }
            ]
        })
    }

    /// Handle the tools/call request.
    async fn handle_tools_call(&self, params: &Value) -> Result<Value, McpError> {
        let name = params
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        match name {
            "chorus_status" => {
                let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

                let state = arguments
                    .get("state")
                    .and_then(|v| v.as_str())
                    .unwrap_or("working");

                let message = arguments
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                let needs_input_prompt = arguments
                    .get("needsInputPrompt")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                // Report status via HTTP
                self.status_reporter
                    .report_status(state, message, needs_input_prompt)
                    .await?;

                Ok(json!({
                    "content": [
                        {
                            "type": "text",
                            "text": format!("Status reported: {} - {}", state, message)
                        }
                    ]
                }))
            }
            _ => Ok(json!({
                "content": [
                    {
                        "type": "text",
                        "text": format!("Unknown tool: {}", name)
                    }
                ],
                "isError": true
            })),
        }
    }
}
