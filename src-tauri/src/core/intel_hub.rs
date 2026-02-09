//! Inter-Session Intelligence Hub.
//!
//! Stores broadcast messages, file activity, and scratchpad entries
//! shared between sessions. Provides conflict detection when multiple
//! sessions edit the same file.

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

/// Maximum number of broadcast messages to keep in memory.
const MAX_MESSAGES: usize = 200;
/// Maximum number of scratchpad entries.
const MAX_SCRATCHPAD: usize = 50;
/// File activity entries older than this are pruned on each report.
const FILE_ACTIVITY_TTL_SECS: i64 = 300; // 5 minutes

/// Maximum size (bytes) for a broadcast message body.
const MAX_MESSAGE_LEN: usize = 10_000;
/// Maximum size (bytes) for a scratchpad title.
const MAX_TITLE_LEN: usize = 256;
/// Maximum size (bytes) for scratchpad content.
const MAX_CONTENT_LEN: usize = 100_000;
/// Maximum size (bytes) for a file path.
const MAX_FILE_PATH_LEN: usize = 4_096;

/// Valid broadcast categories.
const BROADCAST_CATEGORIES: &[&str] = &["discovery", "warning", "knowledge", "info"];
/// Valid scratchpad categories.
const SCRATCHPAD_CATEGORIES: &[&str] = &["architecture", "api", "decision", "note"];
/// Valid file activity actions.
const FILE_ACTIONS: &[&str] = &["editing", "created", "deleted"];

/// A broadcast message sent from one session to all others.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastMessage {
    pub id: String,
    pub session_id: u32,
    pub instance_id: String,
    pub category: String, // "discovery", "warning", "knowledge", "info"
    pub message: String,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: String,
}

/// Tracks a session's file modification activity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileActivity {
    pub session_id: u32,
    pub file_path: String,
    pub action: String, // "editing", "created", "deleted"
    pub timestamp: String,
}

/// A file conflict detected between sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileConflict {
    pub file_path: String,
    pub sessions: Vec<u32>,
    pub actions: Vec<FileActivity>,
}

/// A shared scratchpad entry visible to all sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScratchpadEntry {
    pub id: String,
    pub session_id: u32,
    pub category: String, // "architecture", "api", "decision", "note"
    pub title: String,
    pub content: String,
    pub timestamp: String,
}

/// Request payloads received from MCP servers.
#[derive(Debug, Deserialize)]
pub struct BroadcastRequest {
    pub session_id: u32,
    pub instance_id: String,
    pub category: String,
    pub message: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct FileActivityRequest {
    pub session_id: u32,
    pub instance_id: String,
    pub file_path: String,
    pub action: String,
}

#[derive(Debug, Deserialize)]
pub struct ScratchpadWriteRequest {
    pub session_id: u32,
    pub instance_id: String,
    pub category: String,
    pub title: String,
    pub content: String,
}

/// Validation error returned when input constraints are violated.
#[derive(Debug, Clone, Serialize)]
pub struct IntelValidationError {
    pub field: String,
    pub message: String,
}

impl std::fmt::Display for IntelValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.field, self.message)
    }
}

/// Central hub for inter-session intelligence data.
pub struct IntelHub {
    messages: RwLock<Vec<BroadcastMessage>>,
    file_activities: RwLock<HashMap<String, Vec<FileActivity>>>,
    scratchpad: RwLock<Vec<ScratchpadEntry>>,
}

impl IntelHub {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            messages: RwLock::new(Vec::new()),
            file_activities: RwLock::new(HashMap::new()),
            scratchpad: RwLock::new(Vec::new()),
        })
    }

    /// Validate a broadcast request.
    fn validate_broadcast(req: &BroadcastRequest) -> Result<(), IntelValidationError> {
        if !BROADCAST_CATEGORIES.contains(&req.category.as_str()) {
            return Err(IntelValidationError {
                field: "category".into(),
                message: format!("must be one of {:?}", BROADCAST_CATEGORIES),
            });
        }
        if req.message.len() > MAX_MESSAGE_LEN {
            return Err(IntelValidationError {
                field: "message".into(),
                message: format!("exceeds max length of {} bytes", MAX_MESSAGE_LEN),
            });
        }
        Ok(())
    }

    /// Validate a file activity request.
    fn validate_file_activity(req: &FileActivityRequest) -> Result<(), IntelValidationError> {
        if !FILE_ACTIONS.contains(&req.action.as_str()) {
            return Err(IntelValidationError {
                field: "action".into(),
                message: format!("must be one of {:?}", FILE_ACTIONS),
            });
        }
        if req.file_path.len() > MAX_FILE_PATH_LEN {
            return Err(IntelValidationError {
                field: "file_path".into(),
                message: format!("exceeds max length of {} bytes", MAX_FILE_PATH_LEN),
            });
        }
        if req.file_path.contains("..") {
            return Err(IntelValidationError {
                field: "file_path".into(),
                message: "path traversal not allowed".into(),
            });
        }
        Ok(())
    }

    /// Validate a scratchpad write request.
    fn validate_scratchpad(req: &ScratchpadWriteRequest) -> Result<(), IntelValidationError> {
        if !SCRATCHPAD_CATEGORIES.contains(&req.category.as_str()) {
            return Err(IntelValidationError {
                field: "category".into(),
                message: format!("must be one of {:?}", SCRATCHPAD_CATEGORIES),
            });
        }
        if req.title.len() > MAX_TITLE_LEN {
            return Err(IntelValidationError {
                field: "title".into(),
                message: format!("exceeds max length of {} bytes", MAX_TITLE_LEN),
            });
        }
        if req.content.len() > MAX_CONTENT_LEN {
            return Err(IntelValidationError {
                field: "content".into(),
                message: format!("exceeds max length of {} bytes", MAX_CONTENT_LEN),
            });
        }
        Ok(())
    }

    /// Add a broadcast message and return it with an assigned ID.
    pub async fn add_broadcast(
        &self,
        req: BroadcastRequest,
    ) -> Result<BroadcastMessage, IntelValidationError> {
        Self::validate_broadcast(&req)?;

        let msg = BroadcastMessage {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: req.session_id,
            instance_id: req.instance_id,
            category: req.category,
            message: req.message,
            metadata: req.metadata,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        let mut messages = self.messages.write().await;
        messages.push(msg.clone());
        // Ring buffer: drop oldest if over limit
        if messages.len() > MAX_MESSAGES {
            let excess = messages.len() - MAX_MESSAGES;
            messages.drain(..excess);
        }

        Ok(msg)
    }

    /// Get messages for a session (excludes messages sent by that session).
    pub async fn get_messages_for(&self, session_id: u32) -> Vec<BroadcastMessage> {
        let messages = self.messages.read().await;
        messages
            .iter()
            .filter(|m| m.session_id != session_id)
            .cloned()
            .collect()
    }

    /// Get all broadcast messages (for frontend).
    pub async fn get_all_messages(&self) -> Vec<BroadcastMessage> {
        self.messages.read().await.clone()
    }

    /// Report file activity and return any conflicts detected.
    pub async fn report_file(
        &self,
        req: FileActivityRequest,
    ) -> Result<Vec<FileConflict>, IntelValidationError> {
        Self::validate_file_activity(&req)?;

        let activity = FileActivity {
            session_id: req.session_id,
            file_path: req.file_path.clone(),
            action: req.action,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        let mut activities = self.file_activities.write().await;

        // Prune old entries for this file
        let now = chrono::Utc::now();
        Self::prune_old_entries(&mut activities, &req.file_path, now);

        // Add the new activity
        activities
            .entry(req.file_path.clone())
            .or_default()
            .push(activity);

        // Detect conflicts: multiple sessions editing the same file
        let mut conflicts = Vec::new();
        if let Some(entries) = activities.get(&req.file_path) {
            if let Some(conflict) = Self::detect_conflict(req.file_path, entries.clone()) {
                conflicts.push(conflict);
            }
        }

        Ok(conflicts)
    }

    /// Prune file activity entries older than the TTL.
    /// Entries with unparseable timestamps are kept (and logged) to avoid silent data loss.
    fn prune_old_entries(
        activities: &mut HashMap<String, Vec<FileActivity>>,
        file_path: &str,
        now: chrono::DateTime<chrono::Utc>,
    ) {
        if let Some(entries) = activities.get_mut(file_path) {
            entries.retain(|e| {
                match chrono::DateTime::parse_from_rfc3339(&e.timestamp) {
                    Ok(ts) => (now - ts.with_timezone(&chrono::Utc)).num_seconds() < FILE_ACTIVITY_TTL_SECS,
                    Err(_) => {
                        log::warn!("Keeping file activity with unparseable timestamp: {:?}", e);
                        true // Keep entries with bad timestamps to avoid silent data loss
                    }
                }
            });
        }
    }

    /// Detect a file conflict when multiple sessions are editing the same file.
    fn detect_conflict(file_path: String, entries: Vec<FileActivity>) -> Option<FileConflict> {
        let mut session_ids: Vec<u32> = entries.iter().map(|e| e.session_id).collect();
        session_ids.sort();
        session_ids.dedup();

        if session_ids.len() > 1 {
            Some(FileConflict {
                file_path,
                sessions: session_ids,
                actions: entries,
            })
        } else {
            None
        }
    }

    /// Get all current file conflicts.
    pub async fn get_all_conflicts(&self) -> Vec<FileConflict> {
        let activities = self.file_activities.read().await;
        let now = chrono::Utc::now();
        let mut conflicts = Vec::new();

        for (file_path, entries) in activities.iter() {
            // Only consider recent entries (keep those with bad timestamps)
            let recent: Vec<FileActivity> = entries
                .iter()
                .filter(|e| {
                    match chrono::DateTime::parse_from_rfc3339(&e.timestamp) {
                        Ok(ts) => (now - ts.with_timezone(&chrono::Utc)).num_seconds() < FILE_ACTIVITY_TTL_SECS,
                        Err(_) => {
                            log::warn!("Keeping file activity with unparseable timestamp: {:?}", e);
                            true
                        }
                    }
                })
                .cloned()
                .collect();

            if let Some(conflict) = Self::detect_conflict(file_path.clone(), recent) {
                conflicts.push(conflict);
            }
        }

        conflicts
    }

    /// Write a scratchpad entry.
    pub async fn write_scratchpad(
        &self,
        req: ScratchpadWriteRequest,
    ) -> Result<ScratchpadEntry, IntelValidationError> {
        Self::validate_scratchpad(&req)?;

        let entry = ScratchpadEntry {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: req.session_id,
            category: req.category,
            title: req.title,
            content: req.content,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        let mut scratchpad = self.scratchpad.write().await;
        scratchpad.push(entry.clone());
        if scratchpad.len() > MAX_SCRATCHPAD {
            let excess = scratchpad.len() - MAX_SCRATCHPAD;
            scratchpad.drain(..excess);
        }

        Ok(entry)
    }

    /// Read all scratchpad entries.
    pub async fn read_scratchpad(&self) -> Vec<ScratchpadEntry> {
        self.scratchpad.read().await.clone()
    }

    /// Clear all scratchpad entries.
    pub async fn clear_scratchpad(&self) {
        self.scratchpad.write().await.clear();
    }
}
