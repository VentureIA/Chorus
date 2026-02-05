//! Tauri commands for managing the Telegram remote bot.

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;

use crate::core::remote_manager::{RemoteConfig, RemoteManager, RemoteStatus};

const REMOTE_STORE: &str = "remote-config.json";

// Embedded chorus-remote source files (extracted to app data dir at runtime)
const EMBEDDED_INDEX_TS: &str = include_str!("../../../chorus-remote/src/index.ts");
const EMBEDDED_CLAUDE_TS: &str = include_str!("../../../chorus-remote/src/claude.ts");
const EMBEDDED_FORMAT_TS: &str = include_str!("../../../chorus-remote/src/format.ts");
const EMBEDDED_PACKAGE_JSON: &str = include_str!("../../../chorus-remote/package.json");
const EMBEDDED_TSCONFIG: &str = include_str!("../../../chorus-remote/tsconfig.json");

/// Get the chorus-remote script directory.
/// Checks bundled resources, dev path, then falls back to auto-setup in app data.
fn get_bot_script_dir(app: &AppHandle) -> Result<String, String> {
    // 1. Check bundled resource locations
    if let Ok(resource_dir) = app.path().resource_dir() {
        for path in [
            resource_dir.join("chorus-remote"),
            resource_dir.join("../chorus-remote"),
        ] {
            if path.join("src/index.ts").exists() {
                return Ok(path.to_string_lossy().to_string());
            }
        }
    }

    // 2. Check development path (only valid when built locally)
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../chorus-remote");
    if dev_path.join("src/index.ts").exists() {
        return Ok(dev_path.to_string_lossy().to_string());
    }

    // 3. Auto-setup in app data directory (production fallback)
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let remote_dir = app_data.join("chorus-remote");

    ensure_remote_dir(&remote_dir)?;

    Ok(remote_dir.to_string_lossy().to_string())
}

/// Ensure the chorus-remote directory exists in app data with source files installed.
/// Writes embedded source files and runs `npm install` if node_modules is missing.
fn ensure_remote_dir(dir: &std::path::Path) -> Result<(), String> {
    let src_dir = dir.join("src");
    std::fs::create_dir_all(&src_dir)
        .map_err(|e| format!("Failed to create chorus-remote dir: {}", e))?;

    // Write embedded source files (always overwrite to keep in sync with app version)
    let files: &[(&str, &str)] = &[
        ("src/index.ts", EMBEDDED_INDEX_TS),
        ("src/claude.ts", EMBEDDED_CLAUDE_TS),
        ("src/format.ts", EMBEDDED_FORMAT_TS),
        ("package.json", EMBEDDED_PACKAGE_JSON),
        ("tsconfig.json", EMBEDDED_TSCONFIG),
    ];

    for (path, content) in files {
        std::fs::write(dir.join(path), content)
            .map_err(|e| format!("Failed to write {}: {}", path, e))?;
    }

    // Install npm dependencies if needed
    if !dir.join("node_modules").exists() {
        log::info!("[RemoteManager] Installing chorus-remote dependencies...");
        let output = std::process::Command::new("npm")
            .arg("install")
            .current_dir(dir)
            .output()
            .map_err(|e| format!("Failed to run npm install: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("npm install failed: {}", stderr));
        }
        log::info!("[RemoteManager] chorus-remote dependencies installed");
    }

    Ok(())
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

