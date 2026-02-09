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

use crate::intel_client::IntelClient;
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
    intel_client: IntelClient,
    activity: Arc<ActivityTracker>,
}

impl McpServer {
    pub fn new(
        status_url: Option<String>,
        session_id: Option<u32>,
        instance_id: Option<String>,
    ) -> Self {
        // Derive base URL from status URL (strip /status suffix)
        let base_url = status_url.as_ref().map(|url| {
            url.trim_end_matches("/status").to_string()
        });

        Self {
            status_reporter: StatusReporter::new(
                status_url,
                session_id,
                instance_id.clone(),
            ),
            intel_client: IntelClient::new(base_url, session_id, instance_id),
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
                },
                {
                    "name": "chorus_broadcast",
                    "description": "Broadcast a message to all other Chorus sessions. Use to share discoveries, patterns, warnings, or knowledge with other agents working in parallel.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "category": {
                                "type": "string",
                                "enum": ["discovery", "warning", "knowledge", "info"],
                                "description": "Message category: discovery (found a pattern/approach), warning (potential issue), knowledge (bug fix or lesson learned), info (general update)"
                            },
                            "message": {
                                "type": "string",
                                "description": "The message to broadcast to other sessions"
                            }
                        },
                        "required": ["category", "message"]
                    }
                },
                {
                    "name": "chorus_inbox",
                    "description": "Read messages broadcast by other Chorus sessions. Returns messages from other agents, excluding your own broadcasts.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                },
                {
                    "name": "chorus_scratchpad_write",
                    "description": "Write a note to the shared scratchpad visible to all sessions. Use for architecture decisions, API contracts, shared context, or important notes.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "category": {
                                "type": "string",
                                "enum": ["architecture", "api", "decision", "note"],
                                "description": "Note category: architecture (design decisions), api (API contracts/interfaces), decision (agreed-upon choices), note (general notes)"
                            },
                            "title": {
                                "type": "string",
                                "description": "Short title for the note"
                            },
                            "content": {
                                "type": "string",
                                "description": "Full content of the note"
                            }
                        },
                        "required": ["category", "title", "content"]
                    }
                },
                {
                    "name": "chorus_scratchpad_read",
                    "description": "Read all notes from the shared scratchpad. Returns notes written by all sessions.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                },
                {
                    "name": "chorus_report_file",
                    "description": "Report that you are modifying a file. This enables conflict detection — if another session is also editing the same file, a conflict alert is raised. Call this BEFORE you start editing a file.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Relative or absolute path of the file being modified"
                            },
                            "action": {
                                "type": "string",
                                "enum": ["editing", "created", "deleted"],
                                "description": "What you're doing with the file"
                            }
                        },
                        "required": ["file_path", "action"]
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

                let state = match arguments.get("state").and_then(|v| v.as_str()) {
                    Some(s) => s,
                    None => return Ok(json!({
                        "content": [{ "type": "text", "text": "Error: 'state' is required" }],
                        "isError": true
                    })),
                };

                // Validate state enum
                const VALID_STATES: &[&str] = &["idle", "working", "needs_input", "finished", "error"];
                if !VALID_STATES.contains(&state) {
                    return Ok(json!({
                        "content": [{ "type": "text", "text": format!("Error: 'state' must be one of {:?}", VALID_STATES) }],
                        "isError": true
                    }));
                }

                let message = match arguments.get("message").and_then(|v| v.as_str()) {
                    Some(m) => m,
                    None => return Ok(json!({
                        "content": [{ "type": "text", "text": "Error: 'message' is required" }],
                        "isError": true
                    })),
                };

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
            "chorus_broadcast" => {
                let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

                let category = match arguments.get("category").and_then(|v| v.as_str()) {
                    Some(c) => c,
                    None => return Ok(json!({
                        "content": [{ "type": "text", "text": "Error: 'category' is required" }],
                        "isError": true
                    })),
                };

                const VALID_CATEGORIES: &[&str] = &["discovery", "warning", "knowledge", "info"];
                if !VALID_CATEGORIES.contains(&category) {
                    return Ok(json!({
                        "content": [{ "type": "text", "text": format!("Error: 'category' must be one of {:?}", VALID_CATEGORIES) }],
                        "isError": true
                    }));
                }

                let message = match arguments.get("message").and_then(|v| v.as_str()) {
                    Some(m) => m,
                    None => return Ok(json!({
                        "content": [{ "type": "text", "text": "Error: 'message' is required" }],
                        "isError": true
                    })),
                };

                match self.intel_client.broadcast(category, message, None).await {
                    Ok(msg) => Ok(json!({
                        "content": [{ "type": "text", "text": format!("Broadcast sent [{}]: {}", msg.category, msg.message) }]
                    })),
                    Err(e) => Ok(json!({
                        "content": [{ "type": "text", "text": format!("Broadcast failed: {}", e) }],
                        "isError": true
                    })),
                }
            }
            "chorus_inbox" => {
                match self.intel_client.get_messages().await {
                    Ok(messages) => {
                        if messages.is_empty() {
                            Ok(json!({
                                "content": [{ "type": "text", "text": "No new messages from other sessions." }]
                            }))
                        } else {
                            let formatted: Vec<String> = messages.iter().map(|m| {
                                format!("[Session #{} | {}] {}", m.session_id, m.category, m.message)
                            }).collect();
                            Ok(json!({
                                "content": [{ "type": "text", "text": format!("{} message(s) from other sessions:\n{}", messages.len(), formatted.join("\n")) }]
                            }))
                        }
                    }
                    Err(e) => Ok(json!({
                        "content": [{ "type": "text", "text": format!("Failed to read inbox: {}", e) }],
                        "isError": true
                    })),
                }
            }
            "chorus_scratchpad_write" => {
                let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

                let category = match arguments.get("category").and_then(|v| v.as_str()) {
                    Some(c) => c,
                    None => return Ok(json!({
                        "content": [{ "type": "text", "text": "Error: 'category' is required" }],
                        "isError": true
                    })),
                };

                const VALID_SP_CATEGORIES: &[&str] = &["architecture", "api", "decision", "note"];
                if !VALID_SP_CATEGORIES.contains(&category) {
                    return Ok(json!({
                        "content": [{ "type": "text", "text": format!("Error: 'category' must be one of {:?}", VALID_SP_CATEGORIES) }],
                        "isError": true
                    }));
                }

                let title = match arguments.get("title").and_then(|v| v.as_str()) {
                    Some(t) => t,
                    None => return Ok(json!({
                        "content": [{ "type": "text", "text": "Error: 'title' is required" }],
                        "isError": true
                    })),
                };

                let content = match arguments.get("content").and_then(|v| v.as_str()) {
                    Some(c) => c,
                    None => return Ok(json!({
                        "content": [{ "type": "text", "text": "Error: 'content' is required" }],
                        "isError": true
                    })),
                };

                match self.intel_client.write_scratchpad(category, title, content).await {
                    Ok(entry) => Ok(json!({
                        "content": [{ "type": "text", "text": format!("Scratchpad note added: [{}] {}", entry.category, entry.title) }]
                    })),
                    Err(e) => Ok(json!({
                        "content": [{ "type": "text", "text": format!("Scratchpad write failed: {}", e) }],
                        "isError": true
                    })),
                }
            }
            "chorus_scratchpad_read" => {
                match self.intel_client.read_scratchpad().await {
                    Ok(entries) => {
                        if entries.is_empty() {
                            Ok(json!({
                                "content": [{ "type": "text", "text": "Scratchpad is empty." }]
                            }))
                        } else {
                            let formatted: Vec<String> = entries.iter().map(|e| {
                                format!("## [{}] {} (Session #{})\n{}", e.category, e.title, e.session_id, e.content)
                            }).collect();
                            Ok(json!({
                                "content": [{ "type": "text", "text": format!("{} scratchpad note(s):\n\n{}", entries.len(), formatted.join("\n\n")) }]
                            }))
                        }
                    }
                    Err(e) => Ok(json!({
                        "content": [{ "type": "text", "text": format!("Scratchpad read failed: {}", e) }],
                        "isError": true
                    })),
                }
            }
            "chorus_report_file" => {
                let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

                let file_path = match arguments.get("file_path").and_then(|v| v.as_str()) {
                    Some(p) => p,
                    None => return Ok(json!({
                        "content": [{ "type": "text", "text": "Error: 'file_path' is required" }],
                        "isError": true
                    })),
                };

                // Reject path traversal
                if file_path.contains("..") {
                    return Ok(json!({
                        "content": [{ "type": "text", "text": "Error: path traversal ('..') not allowed in file_path" }],
                        "isError": true
                    }));
                }

                let action = match arguments.get("action").and_then(|v| v.as_str()) {
                    Some(a) => a,
                    None => return Ok(json!({
                        "content": [{ "type": "text", "text": "Error: 'action' is required" }],
                        "isError": true
                    })),
                };

                const VALID_ACTIONS: &[&str] = &["editing", "created", "deleted"];
                if !VALID_ACTIONS.contains(&action) {
                    return Ok(json!({
                        "content": [{ "type": "text", "text": format!("Error: 'action' must be one of {:?}", VALID_ACTIONS) }],
                        "isError": true
                    }));
                }

                match self.intel_client.report_file(file_path, action).await {
                    Ok(conflicts) => {
                        if conflicts.is_empty() {
                            Ok(json!({
                                "content": [{ "type": "text", "text": format!("File activity recorded: {} {}", action, file_path) }]
                            }))
                        } else {
                            let warnings: Vec<String> = conflicts.iter().map(|c| {
                                format!("CONFLICT: {} is also being edited by session(s) {:?}", c.file_path, c.sessions)
                            }).collect();
                            Ok(json!({
                                "content": [{ "type": "text", "text": format!("WARNING - File conflicts detected:\n{}", warnings.join("\n")) }]
                            }))
                        }
                    }
                    Err(e) => Ok(json!({
                        "content": [{ "type": "text", "text": format!("File report failed: {}", e) }],
                        "isError": true
                    })),
                }
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
