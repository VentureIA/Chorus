//! Tauri commands for Inter-Session Intelligence.
//!
//! Provides frontend access to broadcast messages, file conflicts,
//! and the shared scratchpad via IPC.

use std::sync::Arc;

use tauri::State;

use crate::core::status_server::StatusServer;

/// Get all broadcast messages.
#[tauri::command]
pub async fn get_intel_broadcasts(
    status_server: State<'_, Arc<StatusServer>>,
) -> Result<serde_json::Value, String> {
    let messages = status_server.intel_hub().get_all_messages().await;
    serde_json::to_value(messages).map_err(|e| e.to_string())
}

/// Get all current file conflicts.
#[tauri::command]
pub async fn get_intel_conflicts(
    status_server: State<'_, Arc<StatusServer>>,
) -> Result<serde_json::Value, String> {
    let conflicts = status_server.intel_hub().get_all_conflicts().await;
    serde_json::to_value(conflicts).map_err(|e| e.to_string())
}

/// Get all scratchpad entries.
#[tauri::command]
pub async fn get_intel_scratchpad(
    status_server: State<'_, Arc<StatusServer>>,
) -> Result<serde_json::Value, String> {
    let entries = status_server.intel_hub().read_scratchpad().await;
    serde_json::to_value(entries).map_err(|e| e.to_string())
}

/// Write a scratchpad entry from the frontend.
#[tauri::command]
pub async fn write_intel_scratchpad(
    status_server: State<'_, Arc<StatusServer>>,
    category: String,
    title: String,
    content: String,
) -> Result<serde_json::Value, String> {
    use crate::core::intel_hub::ScratchpadWriteRequest;

    let req = ScratchpadWriteRequest {
        session_id: 0, // Frontend writes use session_id 0
        instance_id: status_server.instance_id().to_string(),
        category,
        title,
        content,
    };

    let entry = status_server
        .intel_hub()
        .write_scratchpad(req)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(entry).map_err(|e| e.to_string())
}

/// Clear all scratchpad entries.
#[tauri::command]
pub async fn clear_intel_scratchpad(
    status_server: State<'_, Arc<StatusServer>>,
) -> Result<(), String> {
    status_server.intel_hub().clear_scratchpad().await;
    Ok(())
}
