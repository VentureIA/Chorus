//! HTTP client for Inter-Session Intelligence endpoints.
//!
//! Communicates with the Chorus StatusServer's intel endpoints
//! for broadcasting, reading messages, scratchpad, and file activity.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum IntelError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Intel hub not configured (no base_url)")]
    NotConfigured,
    #[error("Server error (HTTP {status}): {body}")]
    ServerError { status: u16, body: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastMessage {
    pub id: String,
    pub session_id: u32,
    #[serde(default)]
    pub instance_id: String,
    pub category: String,
    pub message: String,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileActivity {
    pub session_id: u32,
    pub file_path: String,
    pub action: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScratchpadEntry {
    pub id: String,
    pub session_id: u32,
    pub category: String,
    pub title: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileConflict {
    pub file_path: String,
    pub sessions: Vec<u32>,
    #[serde(default)]
    pub actions: Vec<FileActivity>,
}

/// Client for the IntelHub HTTP endpoints on the StatusServer.
#[derive(Clone)]
pub struct IntelClient {
    client: reqwest::Client,
    base_url: Option<String>,
    session_id: Option<u32>,
    instance_id: Option<String>,
}

impl IntelClient {
    pub fn new(
        base_url: Option<String>,
        session_id: Option<u32>,
        instance_id: Option<String>,
    ) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url,
            session_id,
            instance_id,
        }
    }

    fn url(&self, path: &str) -> Option<String> {
        self.base_url.as_ref().map(|base| format!("{}{}", base, path))
    }

    /// Broadcast a message to all other sessions.
    pub async fn broadcast(
        &self,
        category: &str,
        message: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<BroadcastMessage, IntelError> {
        let url = match self.url("/broadcast") {
            Some(u) => u,
            None => return Err(IntelError::NotConfigured),
        };

        let payload = serde_json::json!({
            "session_id": self.session_id.unwrap_or(0),
            "instance_id": self.instance_id.clone().unwrap_or_default(),
            "category": category,
            "message": message,
            "metadata": metadata,
        });

        let resp = self
            .client
            .post(&url)
            .json(&payload)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            eprintln!("[intel-client] broadcast failed: HTTP {} - {}", status.as_u16(), body);
            return Err(IntelError::ServerError { status: status.as_u16(), body });
        }

        let msg: BroadcastMessage = resp.json().await?;
        Ok(msg)
    }

    /// Get messages from other sessions.
    pub async fn get_messages(&self) -> Result<Vec<BroadcastMessage>, IntelError> {
        let session_id = self.session_id.unwrap_or(0);
        let url = match self.url(&format!("/messages/{}", session_id)) {
            Some(u) => u,
            None => return Err(IntelError::NotConfigured),
        };

        let resp = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            eprintln!("[intel-client] get_messages failed: HTTP {} - {}", status.as_u16(), body);
            return Err(IntelError::ServerError { status: status.as_u16(), body });
        }

        let messages: Vec<BroadcastMessage> = resp.json().await?;
        Ok(messages)
    }

    /// Write to the shared scratchpad.
    pub async fn write_scratchpad(
        &self,
        category: &str,
        title: &str,
        content: &str,
    ) -> Result<ScratchpadEntry, IntelError> {
        let url = match self.url("/scratchpad") {
            Some(u) => u,
            None => return Err(IntelError::NotConfigured),
        };

        let payload = serde_json::json!({
            "session_id": self.session_id.unwrap_or(0),
            "instance_id": self.instance_id.clone().unwrap_or_default(),
            "category": category,
            "title": title,
            "content": content,
        });

        let resp = self
            .client
            .post(&url)
            .json(&payload)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            eprintln!("[intel-client] write_scratchpad failed: HTTP {} - {}", status.as_u16(), body);
            return Err(IntelError::ServerError { status: status.as_u16(), body });
        }

        let entry: ScratchpadEntry = resp.json().await?;
        Ok(entry)
    }

    /// Read all scratchpad entries.
    pub async fn read_scratchpad(&self) -> Result<Vec<ScratchpadEntry>, IntelError> {
        let url = match self.url("/scratchpad") {
            Some(u) => u,
            None => return Err(IntelError::NotConfigured),
        };

        let resp = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            eprintln!("[intel-client] read_scratchpad failed: HTTP {} - {}", status.as_u16(), body);
            return Err(IntelError::ServerError { status: status.as_u16(), body });
        }

        let entries: Vec<ScratchpadEntry> = resp.json().await?;
        Ok(entries)
    }

    /// Report file activity and get any conflicts back.
    pub async fn report_file(
        &self,
        file_path: &str,
        action: &str,
    ) -> Result<Vec<FileConflict>, IntelError> {
        let url = match self.url("/file-activity") {
            Some(u) => u,
            None => return Err(IntelError::NotConfigured),
        };

        let payload = serde_json::json!({
            "session_id": self.session_id.unwrap_or(0),
            "instance_id": self.instance_id.clone().unwrap_or_default(),
            "file_path": file_path,
            "action": action,
        });

        eprintln!("[intel-client] report_file: url={} payload={}", url, payload);

        let resp = self
            .client
            .post(&url)
            .json(&payload)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            eprintln!("[intel-client] report_file failed: HTTP {} - {}", status.as_u16(), body);
            return Err(IntelError::ServerError { status: status.as_u16(), body });
        }

        let body_text = resp.text().await?;
        eprintln!("[intel-client] report_file response: {}", body_text);
        let conflicts: Vec<FileConflict> = serde_json::from_str(&body_text)?;
        Ok(conflicts)
    }
}
