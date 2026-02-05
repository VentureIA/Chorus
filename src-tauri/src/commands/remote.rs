//! Tauri commands for managing the Telegram remote bot.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;

use crate::core::remote_manager::{RemoteConfig, RemoteManager, RemoteStatus};

const REMOTE_STORE: &str = "remote-config.json";

/// Get the chorus-remote script directory (relative to app).
fn get_bot_script_dir(app: &AppHandle) -> Result<String, String> {
    // In development, it's a sibling directory
    // Try to resolve from the app's resource path or use a known location
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    // Check a few possible locations
    let candidates = [
        resource_dir.join("chorus-remote"),
        resource_dir.join("../chorus-remote"),
        // Development: relative to the src-tauri directory
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../chorus-remote"),
    ];

    for path in &candidates {
        if path.join("src/index.ts").exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    let checked: Vec<String> = candidates.iter().map(|p| p.display().to_string()).collect();
    Err(format!("chorus-remote not found. Checked: {:?}", checked))
}

/// Generate a random 6-character pairing code using UUID.
fn generate_pairing_code() -> String {
    uuid::Uuid::new_v4()
        .to_string()
        .replace('-', "")
        .chars()
        .take(6)
        .collect::<String>()
        .to_uppercase()
}

/// Load remote config from persistent store.
#[tauri::command]
pub fn get_remote_config(app: AppHandle) -> Result<RemoteConfig, String> {
    let store = app.store(REMOTE_STORE).map_err(|e| e.to_string())?;
    let config: RemoteConfig = store
        .get("config")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(config)
}

/// Save remote config to persistent store.
#[tauri::command]
pub fn save_remote_config(app: AppHandle, config: RemoteConfig) -> Result<(), String> {
    let store = app.store(REMOTE_STORE).map_err(|e| e.to_string())?;
    store.set("config", serde_json::to_value(&config).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Start the Telegram bot with the given token.
/// Returns a pairing code that the user sends to the bot on Telegram.
#[tauri::command]
pub fn start_remote_bot(
    app: AppHandle,
    state: State<'_, RemoteManager>,
    token: String,
    project_dir: String,
) -> Result<StartBotResult, String> {
    // Load existing config to check for saved user_id
    let store = app.store(REMOTE_STORE).map_err(|e| e.to_string())?;
    let existing: RemoteConfig = store
        .get("config")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let pairing_code = generate_pairing_code();
    let bot_script_dir = get_bot_script_dir(&app)?;

    state.start(
        app.clone(),
        &token,
        &project_dir,
        &pairing_code,
        existing.user_id,
        &bot_script_dir,
    )?;

    // Save token to config
    let config = RemoteConfig {
        token: Some(token),
        user_id: existing.user_id,
        username: existing.username,
        bot_username: existing.bot_username,
        enabled: true,
    };
    store.set("config", serde_json::to_value(&config).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())?;

    Ok(StartBotResult {
        pairing_code: if existing.user_id.is_some() {
            None // Already paired, no code needed
        } else {
            Some(pairing_code)
        },
        already_paired: existing.user_id.is_some(),
    })
}

#[derive(Serialize)]
pub struct StartBotResult {
    pairing_code: Option<String>,
    already_paired: bool,
}

/// Stop the Telegram bot.
#[tauri::command]
pub fn stop_remote_bot(state: State<'_, RemoteManager>) -> Result<(), String> {
    state.stop()
}

/// Get the current bot status.
#[tauri::command]
pub fn get_remote_status(state: State<'_, RemoteManager>) -> RemoteStatus {
    state.status()
}

/// Called by the frontend when it receives a "paired" event.
/// Persists the user_id so we don't need to re-pair next time.
#[tauri::command]
pub fn save_remote_pairing(
    app: AppHandle,
    state: State<'_, RemoteManager>,
    user_id: i64,
    username: String,
    bot_username: Option<String>,
) -> Result<(), String> {
    state.set_paired(user_id, &username, bot_username.as_deref());

    // Persist to store
    let store = app.store(REMOTE_STORE).map_err(|e| e.to_string())?;
    let mut config: RemoteConfig = store
        .get("config")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    config.user_id = Some(user_id);
    config.username = Some(username);
    config.bot_username = bot_username;

    store.set("config", serde_json::to_value(&config).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Clear remote config (disconnect).
#[tauri::command]
pub fn clear_remote_config(
    app: AppHandle,
    state: State<'_, RemoteManager>,
) -> Result<(), String> {
    state.stop()?;

    let store = app.store(REMOTE_STORE).map_err(|e| e.to_string())?;
    store.set(
        "config",
        serde_json::to_value(RemoteConfig::default()).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

