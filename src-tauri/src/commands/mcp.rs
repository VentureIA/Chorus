//! IPC commands for MCP server discovery and session configuration.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;

use crate::core::mcp_config_writer::{self, ChorusStatusConfig};
use crate::core::mcp_manager::{McpManager, McpServerConfig};
use crate::core::status_server::StatusServer;

/// Store filename for custom MCP servers (global, user-level).
const CUSTOM_MCP_SERVERS_STORE: &str = "mcp-custom-servers.json";

/// A custom MCP server configured by the user.
/// Stored globally (user-level) and available across all projects.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCustomServer {
    /// Unique identifier for the custom server.
    pub id: String,
    /// Display name for the server.
    pub name: String,
    /// Command to run (e.g., "npx", "node", "python").
    pub command: String,
    /// Arguments to pass to the command.
    pub args: Vec<String>,
    /// Environment variables for the server process.
    pub env: HashMap<String, String>,
    /// Working directory for the server process.
    pub working_directory: Option<String>,
    /// Whether this server is enabled by default.
    pub is_enabled: bool,
    /// ISO timestamp of when the server was created.
    pub created_at: String,
}

/// Status server info returned to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusServerInfo {
    pub port: u16,
    pub status_url: String,
    pub instance_id: String,
}

/// Creates a stable hash of a project path for use in store filenames.
fn hash_project_path(path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    let result = hasher.finalize();
    // Take first 12 hex characters for a reasonably short but unique filename
    format!("{:x}", &result)[..12].to_string()
}

/// Discovers and returns MCP servers configured in the project's `.mcp.json`.
///
/// The project path is normalized before lookup. Results are cached.
#[tauri::command]
pub async fn get_project_mcp_servers(
    state: State<'_, McpManager>,
    project_path: String,
) -> Result<Vec<McpServerConfig>, String> {
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    Ok(state.get_project_servers(&canonical))
}

/// Re-parses the `.mcp.json` file for a project, updating the cache.
#[tauri::command]
pub async fn refresh_project_mcp_servers(
    state: State<'_, McpManager>,
    project_path: String,
) -> Result<Vec<McpServerConfig>, String> {
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    Ok(state.refresh_project_servers(&canonical))
}

/// Gets the enabled MCP server names for a specific session.
///
/// If not explicitly set, returns all available servers as enabled.
#[tauri::command]
pub async fn get_session_mcp_servers(
    state: State<'_, McpManager>,
    project_path: String,
    session_id: u32,
) -> Result<Vec<String>, String> {
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    Ok(state.get_session_enabled(&canonical, session_id))
}

/// Sets the enabled MCP server names for a specific session.
#[tauri::command]
pub async fn set_session_mcp_servers(
    state: State<'_, McpManager>,
    project_path: String,
    session_id: u32,
    enabled: Vec<String>,
) -> Result<(), String> {
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    state.set_session_enabled(&canonical, session_id, enabled);
    Ok(())
}

/// Returns the count of enabled MCP servers for a session.
#[tauri::command]
pub async fn get_session_mcp_count(
    state: State<'_, McpManager>,
    project_path: String,
    session_id: u32,
) -> Result<usize, String> {
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    Ok(state.get_enabled_count(&canonical, session_id))
}

/// Saves the default enabled MCP servers for a project.
///
/// These defaults are loaded when a new session starts, so server selections
/// persist across app restarts.
#[tauri::command]
pub async fn save_project_mcp_defaults(
    app: AppHandle,
    project_path: String,
    enabled_servers: Vec<String>,
) -> Result<(), String> {
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    let store_name = format!("chorus-{}.json", hash_project_path(&canonical));
    let store = app.store(&store_name).map_err(|e| e.to_string())?;

    store.set("enabled_mcp_servers", serde_json::json!(enabled_servers));
    store.save().map_err(|e| e.to_string())?;

    log::debug!("Saved MCP server defaults for project: {}", canonical);
    Ok(())
}

/// Loads the default enabled MCP servers for a project.
///
/// Returns None if no defaults have been saved yet.
#[tauri::command]
pub async fn load_project_mcp_defaults(
    app: AppHandle,
    project_path: String,
) -> Result<Option<Vec<String>>, String> {
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    let store_name = format!("chorus-{}.json", hash_project_path(&canonical));
    let store = app.store(&store_name).map_err(|e| e.to_string())?;

    let result = store
        .get("enabled_mcp_servers")
        .and_then(|v| v.as_array().cloned())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        });

    Ok(result)
}

/// Registers a project with the status server.
///
/// This is a no-op in the new HTTP-based architecture since we don't need
/// file-based monitoring anymore. Kept for backwards compatibility.
#[tauri::command]
pub async fn add_mcp_project(project_path: String) -> Result<(), String> {
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    log::debug!(
        "add_mcp_project called for '{}' (no-op in HTTP architecture)",
        canonical
    );
    Ok(())
}

/// Removes a project from monitoring.
///
/// This is a no-op in the new HTTP-based architecture since we don't need
/// file-based monitoring anymore. Kept for backwards compatibility.
#[tauri::command]
pub async fn remove_mcp_project(project_path: String) -> Result<(), String> {
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    log::debug!(
        "remove_mcp_project called for '{}' (no-op in HTTP architecture)",
        canonical
    );
    Ok(())
}

/// Removes a session's status from tracking.
///
/// In the new HTTP-based architecture, this unregisters the session from
/// the status server so it stops accepting updates for this session.
#[tauri::command]
pub async fn remove_session_status(
    status_server: State<'_, Arc<StatusServer>>,
    _project_path: String,
    session_id: u32,
) -> Result<(), String> {
    status_server.unregister_session(session_id).await;
    log::debug!("Unregistered session {} from status server", session_id);
    Ok(())
}

/// Gets the status server info (URL, port, instance ID).
///
/// This is needed by the frontend when writing MCP configs so the
/// MCP server knows where to POST status updates.
#[tauri::command]
pub async fn get_status_server_info(
    status_server: State<'_, Arc<StatusServer>>,
) -> Result<StatusServerInfo, String> {
    let registered = status_server.registered_sessions().await;
    log::info!(
        "get_status_server_info: instance_id={}, registered_sessions={:?}",
        status_server.instance_id(),
        registered
    );
    Ok(StatusServerInfo {
        port: status_server.port(),
        status_url: status_server.status_url(),
        instance_id: status_server.instance_id().to_string(),
    })
}

/// Writes a session-specific `.mcp.json` file to the working directory.
///
/// This must be called BEFORE launching the Claude CLI so it can discover
/// and connect to the configured MCP servers, including the Chorus status server.
///
/// The written config includes:
/// - All enabled servers from the project's `.mcp.json`
/// - All enabled custom servers (user-defined, global)
///
/// Existing user-defined servers in the working directory's `.mcp.json` are
/// preserved (only Chorus-managed servers are replaced).
#[tauri::command]
pub async fn write_session_mcp_config(
    app: AppHandle,
    mcp_state: State<'_, McpManager>,
    status_server: State<'_, Arc<StatusServer>>,
    working_dir: String,
    session_id: u32,
    project_path: String,
    enabled_server_names: Vec<String>,
) -> Result<(), String> {
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    // Register this session with the status server (for cleanup tracking)
    status_server
        .register_session(session_id, &canonical)
        .await;

    // Get full server configs for enabled discovered servers
    let all_discovered = mcp_state.get_project_servers(&canonical);
    let enabled_discovered: Vec<_> = all_discovered
        .into_iter()
        .filter(|s| enabled_server_names.contains(&s.name))
        .collect();

    // Get enabled custom servers
    let custom_servers = get_custom_mcp_servers_internal(&app)?;
    let enabled_custom: Vec<_> = custom_servers
        .into_iter()
        .filter(|s| s.is_enabled)
        .collect();

    // Resolve the path to the chorus-mcp-server binary
    // In development, it's in the target directory; in production, it's bundled as a resource
    let chorus_status_config = resolve_chorus_mcp_server_path(&app)
        .map(|binary_path| {
            ChorusStatusConfig {
                binary_path,
                status_url: status_server.status_url(),
                instance_id: status_server.instance_id().to_string(),
            }
        });

    if chorus_status_config.is_none() {
        log::warn!("chorus-mcp-server binary not found - status reporting will be disabled");
    }

    log::info!(
        "Writing MCP config for session {} to {} ({} discovered + {} custom servers, chorus-status={})",
        session_id,
        working_dir,
        enabled_discovered.len(),
        enabled_custom.len(),
        chorus_status_config.is_some(),
    );

    // Write .chorus-session file for hooks to find session config
    // This file allows Claude Code hooks to know the status URL and session ID
    let session_file_path = Path::new(&working_dir).join(".chorus-session");
    let session_file_content = format!(
        "# Chorus session configuration - auto-generated, do not edit\n\
         # This file is used by Claude Code hooks to report status\n\
         STATUS_URL=\"{}\"\n\
         SESSION_ID={}\n\
         INSTANCE_ID=\"{}\"\n",
        status_server.status_url(),
        session_id,
        status_server.instance_id(),
    );
    if let Err(e) = std::fs::write(&session_file_path, &session_file_content) {
        log::warn!("Failed to write .chorus-session file: {}", e);
    } else {
        log::info!("Wrote .chorus-session file to {:?}", session_file_path);
    }

    mcp_config_writer::write_session_mcp_config(
        Path::new(&working_dir),
        session_id,
        &enabled_discovered,
        &enabled_custom,
        chorus_status_config.as_ref(),
    )
    .await
}

/// Resolves the path to the chorus-mcp-server binary.
///
/// Tries multiple locations in order:
/// 1. Bundled resource (production builds)
/// 2. Target directory relative to executable (development)
/// 3. Same directory as the executable
fn resolve_chorus_mcp_server_path(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let binary_name = "chorus-mcp-server.exe";
    #[cfg(not(target_os = "windows"))]
    let binary_name = "chorus-mcp-server";

    // Try 1: Bundled resource path (production)
    if let Ok(resource_path) = app.path().resolve(binary_name, BaseDirectory::Resource) {
        if resource_path.exists() {
            log::info!("Found chorus-mcp-server at resource path: {:?}", resource_path);
            return Some(resource_path);
        }
    }

    // Try 2: Same directory as executable (common for bundled apps)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let sibling_path = exe_dir.join(binary_name);
            if sibling_path.exists() {
                log::info!("Found chorus-mcp-server next to executable: {:?}", sibling_path);
                return Some(sibling_path);
            }

            // Try 3: For macOS .app bundles, check Contents/Resources
            #[cfg(target_os = "macos")]
            {
                // exe is at Chorus.app/Contents/MacOS/Chorus
                // resources are at Chorus.app/Contents/Resources
                if let Some(contents_dir) = exe_dir.parent() {
                    let resources_path = contents_dir.join("Resources").join(binary_name);
                    if resources_path.exists() {
                        log::info!("Found chorus-mcp-server in Resources: {:?}", resources_path);
                        return Some(resources_path);
                    }
                }
            }
        }
    }

    // Try 4: Development - look in target/debug or target/release relative to current dir
    let current_dir = std::env::current_dir().ok()?;
    for profile in ["debug", "release"] {
        let dev_path = current_dir.join("target").join(profile).join(binary_name);
        if dev_path.exists() {
            log::info!("Found chorus-mcp-server in development target: {:?}", dev_path);
            return Some(dev_path);
        }
    }

    // Try 5: Look relative to the project root (for workspace builds)
    // Go up from src-tauri/target/{profile}/chorus to find root target dir
    if let Ok(exe_path) = std::env::current_exe() {
        let mut path = exe_path.as_path();
        for _ in 0..10 {
            if let Some(parent) = path.parent() {
                for profile in ["debug", "release"] {
                    let workspace_path = parent.join("target").join(profile).join(binary_name);
                    if workspace_path.exists() {
                        log::info!("Found chorus-mcp-server in workspace target: {:?}", workspace_path);
                        return Some(workspace_path);
                    }
                }
                path = parent;
            } else {
                break;
            }
        }
    }

    log::warn!("Could not find chorus-mcp-server binary in any expected location");
    None
}

/// Internal helper to get custom MCP servers (non-async for use within commands).
fn get_custom_mcp_servers_internal(app: &AppHandle) -> Result<Vec<McpCustomServer>, String> {
    let store = app
        .store(CUSTOM_MCP_SERVERS_STORE)
        .map_err(|e| e.to_string())?;

    let servers = store
        .get("servers")
        .and_then(|v| serde_json::from_value::<Vec<McpCustomServer>>(v.clone()).ok())
        .unwrap_or_default();

    Ok(servers)
}

/// Removes a session-specific Chorus server from `.mcp.json`.
///
/// This should be called when a session is killed to clean up the config file.
/// The function is idempotent - it does nothing if the session entry doesn't exist.
#[tauri::command]
pub async fn remove_session_mcp_config(working_dir: String, session_id: u32) -> Result<(), String> {
    let path = PathBuf::from(&working_dir);
    mcp_config_writer::remove_session_mcp_config(&path, session_id).await
}

/// Generates a project hash for the given path.
///
/// This hash is used for identification purposes. In the new HTTP-based
/// architecture, it's less critical but kept for backwards compatibility
/// and potential future use.
#[tauri::command]
pub async fn generate_project_hash(project_path: String) -> Result<String, String> {
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    Ok(StatusServer::generate_project_hash(&canonical))
}

/// Gets all custom MCP servers configured by the user.
///
/// Custom servers are stored globally (user-level) and available across all projects.
#[tauri::command]
pub async fn get_custom_mcp_servers(app: AppHandle) -> Result<Vec<McpCustomServer>, String> {
    let store = app
        .store(CUSTOM_MCP_SERVERS_STORE)
        .map_err(|e| e.to_string())?;

    let servers = store
        .get("servers")
        .and_then(|v| serde_json::from_value::<Vec<McpCustomServer>>(v.clone()).ok())
        .unwrap_or_default();

    log::debug!("Loaded {} custom MCP servers", servers.len());
    Ok(servers)
}

/// Saves a custom MCP server configuration.
///
/// If a server with the same ID already exists, it will be updated.
/// Otherwise, the new server is added to the list.
#[tauri::command]
pub async fn save_custom_mcp_server(app: AppHandle, server: McpCustomServer) -> Result<(), String> {
    let store = app
        .store(CUSTOM_MCP_SERVERS_STORE)
        .map_err(|e| e.to_string())?;

    // Load existing servers
    let mut servers: Vec<McpCustomServer> = store
        .get("servers")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Update or add the server
    if let Some(index) = servers.iter().position(|s| s.id == server.id) {
        servers[index] = server.clone();
        log::debug!("Updated custom MCP server: {}", server.name);
    } else {
        log::debug!("Added new custom MCP server: {}", server.name);
        servers.push(server);
    }

    // Save back to store
    store.set(
        "servers",
        serde_json::to_value(&servers).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Deletes a custom MCP server by ID.
#[tauri::command]
pub async fn delete_custom_mcp_server(app: AppHandle, server_id: String) -> Result<(), String> {
    let store = app
        .store(CUSTOM_MCP_SERVERS_STORE)
        .map_err(|e| e.to_string())?;

    // Load existing servers
    let mut servers: Vec<McpCustomServer> = store
        .get("servers")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Remove the server
    let original_len = servers.len();
    servers.retain(|s| s.id != server_id);

    if servers.len() < original_len {
        log::debug!("Deleted custom MCP server with ID: {}", server_id);
    }

    // Save back to store
    store.set(
        "servers",
        serde_json::to_value(&servers).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}
