//! Command dispatch table for WebSocket invoke requests.
//!
//! Maps string command names to actual Tauri state method calls.
//! This avoids going through Tauri's IPC layer, directly accessing
//! the managed state via `AppHandle`.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use serde_json::Value;
use tauri::Manager;

use crate::core::event_bus::EventBus;
use crate::core::mcp_config_writer;
use crate::core::mcp_manager::McpManager;
use crate::core::plugin_manager::PluginManager;
use crate::core::process_manager::ProcessManager;
use crate::core::session_manager::{AiMode, SessionManager, SessionStatus};
use crate::core::status_server::StatusServer;
use crate::core::worktree_manager::WorktreeManager;

/// Dispatch a command by name, extracting args from the JSON value.
pub async fn dispatch(
    app: &tauri::AppHandle,
    command: &str,
    args: Value,
) -> Result<Value, String> {
    match command {
        // === Terminal commands ===
        "spawn_shell" => cmd_spawn_shell(app, args).await,
        "write_stdin" => cmd_write_stdin(app, args).await,
        "resize_pty" => cmd_resize_pty(app, args).await,
        "kill_session" => cmd_kill_session(app, args).await,
        "kill_all_sessions" => cmd_kill_all_sessions(app).await,
        "check_cli_available" => cmd_check_cli_available(args).await,
        "get_backend_info" => cmd_get_backend_info(),
        "get_status_server_info" => cmd_get_status_server_info(app),

        // === Session commands ===
        "get_sessions" => cmd_get_sessions(app),
        "create_session" => cmd_create_session(app, args),
        "update_session_status" => cmd_update_session_status(app, args),
        "update_session_title" => cmd_update_session_title(app, args),
        "assign_session_branch" => cmd_assign_session_branch(app, args),
        "remove_session" => cmd_remove_session(app, args),
        "get_sessions_for_project" => cmd_get_sessions_for_project(app, args),
        "remove_sessions_for_project" => cmd_remove_sessions_for_project(app, args).await,

        // === Worktree commands ===
        "prepare_session_worktree" => cmd_prepare_session_worktree(app, args).await,
        "cleanup_session_worktree" => cmd_cleanup_session_worktree(app, args).await,

        // === MCP commands ===
        "get_project_mcp_servers" => cmd_get_project_mcp_servers(app, args),
        "get_session_mcp_servers" => cmd_get_session_mcp_servers(app, args),
        "set_session_mcp_servers" => cmd_set_session_mcp_servers(app, args),
        "get_session_mcp_count" => cmd_get_session_mcp_count(app, args),
        "write_session_mcp_config" => cmd_write_session_mcp_config(app, args).await,
        "remove_session_mcp_config" => cmd_remove_session_mcp_config(args).await,
        "generate_project_hash" => cmd_generate_project_hash(args),

        // === Git commands ===
        "git_current_branch" => {
            let repo_path = get_str(&args, "repoPath")?;
            let git = crate::git::Git::new(&repo_path);
            let branch = git.current_branch().await.map_err(|e| e.to_string())?;
            Ok(Value::String(branch))
        }
        "git_branches" => cmd_git_branches(args).await,
        "git_worktree_list" => cmd_git_worktree_list(args).await,

        // === Plugin commands ===
        "get_project_plugins" => cmd_get_project_plugins(app, args),
        "get_session_skills" => cmd_get_session_skills(app, args),
        "set_session_skills" => cmd_set_session_skills(app, args),

        // === ClaudeMd commands ===
        "check_claude_md" => cmd_check_claude_md(args).await,
        "read_claude_md" => cmd_read_claude_md(args).await,

        // === Font commands ===
        "get_available_fonts" => cmd_get_available_fonts(),
        "check_font_available" => cmd_check_font_available(args),

        // === Explorer commands ===
        "read_directory" => cmd_read_directory(args).await,
        "read_file_content" => cmd_read_file_content(args).await,

        // === Mobile push commands ===
        "push_session_to_mobile" => cmd_push_session_to_mobile(app, args),
        "get_session_output" => cmd_get_session_output(app, args),

        // === Store proxy commands (for mobile browser) ===
        "store_get" => cmd_store_get(app, args).await,
        "store_set" => cmd_store_set(app, args).await,

        // === Unsupported ===
        _ => Err(format!("Command '{}' not yet supported via web access", command)),
    }
}

// ============================================================================
// Terminal commands
// ============================================================================

async fn cmd_spawn_shell(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let cwd = args.get("cwd").and_then(|v| v.as_str()).map(String::from);
    let env: Option<HashMap<String, String>> = args
        .get("env")
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    let canonical_cwd = if let Some(ref dir) = cwd {
        let canonical = crate::core::path_utils::normalize_path_buf(Path::new(dir));
        if !canonical.is_dir() {
            return Err(format!("cwd '{}' is not a directory", dir));
        }
        Some(canonical.to_string_lossy().into_owned())
    } else {
        None
    };

    let pm = app.state::<ProcessManager>();
    let pm = pm.inner().clone();
    let id = pm
        .spawn_shell(app.clone(), canonical_cwd, env)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(id).unwrap())
}

async fn cmd_write_stdin(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let session_id = get_u32(&args, "sessionId")?;
    let data = get_str(&args, "data")?;
    let pm = app.state::<ProcessManager>();
    let pm = pm.inner().clone();
    pm.write_stdin(session_id, &data).map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

async fn cmd_resize_pty(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let session_id = get_u32(&args, "sessionId")?;
    let rows = get_u16(&args, "rows")?;
    let cols = get_u16(&args, "cols")?;
    if rows == 0 || cols == 0 || rows > 500 || cols > 500 {
        return Err("Invalid dimensions".to_string());
    }
    let pm = app.state::<ProcessManager>();
    let pm = pm.inner().clone();
    pm.resize_pty(session_id, rows, cols).map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

async fn cmd_kill_session(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let session_id = get_u32(&args, "sessionId")?;
    let pm = app.state::<ProcessManager>();
    let pm = pm.inner().clone();
    pm.kill_session(session_id).await.map_err(|e| e.to_string())?;

    let ss = app.state::<Arc<StatusServer>>();
    ss.unregister_session(session_id).await;

    Ok(Value::Null)
}

async fn cmd_kill_all_sessions(app: &tauri::AppHandle) -> Result<Value, String> {
    let pm = app.state::<ProcessManager>();
    let pm = pm.inner().clone();
    let count = pm.kill_all_sessions().await.map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(count).unwrap())
}

async fn cmd_check_cli_available(args: Value) -> Result<Value, String> {
    let command = get_str(&args, "command")?;
    // Delegate to the existing command function logic
    let available = crate::commands::terminal::check_cli_available(command)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(available).unwrap())
}

fn cmd_get_backend_info() -> Result<Value, String> {
    let info = crate::commands::terminal::get_backend_info();
    serde_json::to_value(info).map_err(|e| e.to_string())
}

fn cmd_get_status_server_info(app: &tauri::AppHandle) -> Result<Value, String> {
    let ss = app.state::<Arc<StatusServer>>();
    let info = crate::commands::mcp::StatusServerInfo {
        port: ss.port(),
        status_url: ss.status_url(),
        instance_id: ss.instance_id().to_string(),
    };
    serde_json::to_value(info).map_err(|e| e.to_string())
}

// ============================================================================
// Session commands
// ============================================================================

fn cmd_get_sessions(app: &tauri::AppHandle) -> Result<Value, String> {
    let sm = app.state::<SessionManager>();
    let sessions = sm.all_sessions();
    serde_json::to_value(sessions).map_err(|e| e.to_string())
}

fn cmd_create_session(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let id = get_u32(&args, "id")?;
    let mode: AiMode = serde_json::from_value(
        args.get("mode").cloned().unwrap_or(Value::String("Claude".into())),
    )
    .map_err(|e| e.to_string())?;
    let project_path = get_str(&args, "projectPath")?;
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    let sm = app.state::<SessionManager>();
    let session = sm
        .create_session(id, mode, canonical)
        .map_err(|existing| format!("Session {} already exists", existing.id))?;
    serde_json::to_value(session).map_err(|e| e.to_string())
}

fn cmd_update_session_status(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let session_id = get_u32(&args, "sessionId")?;
    let status: SessionStatus = serde_json::from_value(
        args.get("status").cloned().ok_or("Missing 'status'")?,
    )
    .map_err(|e| e.to_string())?;

    let sm = app.state::<SessionManager>();
    let updated = sm.update_status(session_id, status);
    Ok(serde_json::to_value(updated).unwrap())
}

fn cmd_update_session_title(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let session_id = get_u32(&args, "sessionId")?;
    let title = get_str(&args, "title")?;

    let sm = app.state::<SessionManager>();
    let updated = sm.update_title(session_id, title);
    Ok(serde_json::to_value(updated).unwrap())
}

fn cmd_assign_session_branch(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let session_id = get_u32(&args, "sessionId")?;
    let branch = get_str(&args, "branch")?;
    let worktree_path = args.get("worktreePath").and_then(|v| v.as_str()).map(String::from);

    let sm = app.state::<SessionManager>();
    let session = sm
        .assign_branch(session_id, branch, worktree_path)
        .ok_or_else(|| format!("Session {} not found", session_id))?;
    serde_json::to_value(session).map_err(|e| e.to_string())
}

fn cmd_remove_session(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let session_id = get_u32(&args, "sessionId")?;
    let sm = app.state::<SessionManager>();
    let removed = sm.remove_session(session_id);
    serde_json::to_value(removed).map_err(|e| e.to_string())
}

fn cmd_get_sessions_for_project(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let canonical = crate::core::path_utils::normalize_path(&project_path);
    let sm = app.state::<SessionManager>();
    let sessions = sm.get_sessions_for_project(&canonical);
    serde_json::to_value(sessions).map_err(|e| e.to_string())
}

async fn cmd_remove_sessions_for_project(
    app: &tauri::AppHandle,
    args: Value,
) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let canonical = crate::core::path_utils::normalize_path(&project_path);

    let sm = app.state::<SessionManager>();
    let pm = app.state::<ProcessManager>();
    let mcp = app.state::<McpManager>();
    let ss = app.state::<Arc<StatusServer>>();
    let plugins = app.state::<PluginManager>();

    let removed = sm.remove_sessions_for_project(&canonical);

    for session in &removed {
        mcp.remove_session(&canonical, session.id);
        plugins.remove_session(&canonical, session.id);
        ss.unregister_session(session.id).await;

        let working_dir = session
            .worktree_path
            .as_deref()
            .unwrap_or(&session.project_path);
        if let Err(e) =
            mcp_config_writer::remove_session_mcp_config(Path::new(working_dir), session.id).await
        {
            log::warn!("Failed to remove MCP config for session {}: {}", session.id, e);
        }

        if let Err(e) = pm.kill_session(session.id).await {
            log::warn!("Failed to kill PTY for session {}: {}", session.id, e);
        }
    }

    serde_json::to_value(removed).map_err(|e| e.to_string())
}

// ============================================================================
// Worktree commands
// ============================================================================

async fn cmd_prepare_session_worktree(
    app: &tauri::AppHandle,
    args: Value,
) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let branch = args.get("branch").and_then(|v| v.as_str()).map(String::from);

    let wm = app.state::<WorktreeManager>();
    // Delegate to the Tauri command handler directly
    let result = crate::commands::worktree::prepare_session_worktree(
        wm, project_path, branch,
    )
    .await?;

    serde_json::to_value(result).map_err(|e| e.to_string())
}

async fn cmd_cleanup_session_worktree(
    app: &tauri::AppHandle,
    args: Value,
) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let worktree_path = get_str(&args, "worktreePath")?;

    let wm = app.state::<WorktreeManager>();
    let result = crate::commands::worktree::cleanup_session_worktree(
        wm, project_path, worktree_path,
    )
    .await?;

    Ok(serde_json::to_value(result).unwrap())
}

// ============================================================================
// MCP commands
// ============================================================================

fn cmd_get_project_mcp_servers(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let canonical = crate::core::path_utils::normalize_path(&project_path);
    let mcp = app.state::<McpManager>();
    let servers = mcp.get_project_servers(&canonical);
    serde_json::to_value(servers).map_err(|e| e.to_string())
}

fn cmd_get_session_mcp_servers(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let session_id = get_u32(&args, "sessionId")?;
    let canonical = crate::core::path_utils::normalize_path(&project_path);
    let mcp = app.state::<McpManager>();
    let enabled = mcp.get_session_enabled(&canonical, session_id);
    serde_json::to_value(enabled).map_err(|e| e.to_string())
}

fn cmd_set_session_mcp_servers(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let session_id = get_u32(&args, "sessionId")?;
    let enabled: Vec<String> = serde_json::from_value(
        args.get("enabled").cloned().unwrap_or(Value::Array(vec![])),
    )
    .map_err(|e| e.to_string())?;
    let canonical = crate::core::path_utils::normalize_path(&project_path);
    let mcp = app.state::<McpManager>();
    mcp.set_session_enabled(&canonical, session_id, enabled);
    Ok(Value::Null)
}

fn cmd_get_session_mcp_count(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let session_id = get_u32(&args, "sessionId")?;
    let canonical = crate::core::path_utils::normalize_path(&project_path);
    let mcp = app.state::<McpManager>();
    let count = mcp.get_enabled_count(&canonical, session_id);
    Ok(serde_json::to_value(count).unwrap())
}

async fn cmd_write_session_mcp_config(
    app: &tauri::AppHandle,
    args: Value,
) -> Result<Value, String> {
    let working_dir = get_str(&args, "workingDir")?;
    let session_id = get_u32(&args, "sessionId")?;
    let project_path = get_str(&args, "projectPath")?;
    let enabled_server_names: Vec<String> = serde_json::from_value(
        args.get("enabledServerNames")
            .cloned()
            .unwrap_or(Value::Array(vec![])),
    )
    .map_err(|e| e.to_string())?;

    // Use the Tauri command directly (it uses AppHandle + State)
    // We need to replicate the logic here since we can't call tauri commands directly.
    let canonical = crate::core::path_utils::normalize_path(&project_path);
    let ss = app.state::<Arc<StatusServer>>();
    ss.register_session(session_id, &canonical).await;

    let mcp_state = app.state::<McpManager>();
    let all_discovered = mcp_state.get_project_servers(&canonical);
    let enabled_discovered: Vec<_> = all_discovered
        .into_iter()
        .filter(|s| enabled_server_names.contains(&s.name))
        .collect();

    mcp_config_writer::write_session_mcp_config(
        Path::new(&working_dir),
        session_id,
        &enabled_discovered,
        &[],  // No custom servers in web context
        None, // No chorus-status binary path in web context
    )
    .await?;

    Ok(Value::Null)
}

async fn cmd_remove_session_mcp_config(args: Value) -> Result<Value, String> {
    let working_dir = get_str(&args, "workingDir")?;
    let session_id = get_u32(&args, "sessionId")?;
    mcp_config_writer::remove_session_mcp_config(Path::new(&working_dir), session_id).await?;
    Ok(Value::Null)
}

fn cmd_generate_project_hash(args: Value) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let canonical = crate::core::path_utils::normalize_path(&project_path);
    let hash = StatusServer::generate_project_hash(&canonical);
    Ok(Value::String(hash))
}

// ============================================================================
// Git commands
// ============================================================================

async fn cmd_git_branches(args: Value) -> Result<Value, String> {
    let repo_path = get_str(&args, "repoPath")?;
    let git = crate::git::Git::new(&repo_path);
    let branches = git.list_branches().await.map_err(|e| e.to_string())?;
    serde_json::to_value(branches).map_err(|e| e.to_string())
}

async fn cmd_git_worktree_list(args: Value) -> Result<Value, String> {
    let repo_path = get_str(&args, "repoPath")?;
    let git = crate::git::Git::new(&repo_path);
    let worktrees = git.worktree_list().await.map_err(|e| e.to_string())?;
    serde_json::to_value(worktrees).map_err(|e| e.to_string())
}

// ============================================================================
// Plugin commands
// ============================================================================

fn cmd_get_project_plugins(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let canonical = crate::core::path_utils::normalize_path(&project_path);
    let pm = app.state::<PluginManager>();
    let plugins = pm.get_project_plugins(&canonical);
    serde_json::to_value(plugins).map_err(|e| e.to_string())
}

fn cmd_get_session_skills(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let session_id = get_u32(&args, "sessionId")?;
    let canonical = crate::core::path_utils::normalize_path(&project_path);
    let pm = app.state::<PluginManager>();
    let skills = pm.get_session_skills(&canonical, session_id);
    serde_json::to_value(skills).map_err(|e| e.to_string())
}

fn cmd_set_session_skills(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let session_id = get_u32(&args, "sessionId")?;
    let enabled: Vec<String> = serde_json::from_value(
        args.get("enabled").cloned().unwrap_or(Value::Array(vec![])),
    )
    .map_err(|e| e.to_string())?;
    let canonical = crate::core::path_utils::normalize_path(&project_path);
    let pm = app.state::<PluginManager>();
    pm.set_session_skills(&canonical, session_id, enabled);
    Ok(Value::Null)
}

// ============================================================================
// ClaudeMd commands
// ============================================================================

async fn cmd_check_claude_md(args: Value) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let result = crate::commands::claudemd::check_claude_md(project_path).await?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

async fn cmd_read_claude_md(args: Value) -> Result<Value, String> {
    let project_path = get_str(&args, "projectPath")?;
    let content = crate::commands::claudemd::read_claude_md(project_path).await?;
    Ok(Value::String(content))
}

// ============================================================================
// Font commands
// ============================================================================

fn cmd_get_available_fonts() -> Result<Value, String> {
    let fonts = crate::core::detect_available_fonts();
    serde_json::to_value(fonts).map_err(|e| e.to_string())
}

fn cmd_check_font_available(args: Value) -> Result<Value, String> {
    let family = get_str(&args, "family")?;
    let available = crate::core::is_font_available(&family);
    Ok(Value::Bool(available))
}

// ============================================================================
// Explorer commands
// ============================================================================

async fn cmd_read_directory(args: Value) -> Result<Value, String> {
    let path = get_str(&args, "path")?;
    let entries = crate::commands::explorer::read_directory(path).await?;
    serde_json::to_value(entries).map_err(|e| e.to_string())
}

async fn cmd_read_file_content(args: Value) -> Result<Value, String> {
    let path = get_str(&args, "path")?;
    let content = crate::commands::explorer::read_file_content(path).await?;
    Ok(Value::String(content))
}

// ============================================================================
// Arg extraction helpers
// ============================================================================

fn get_str(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| format!("Missing or invalid '{}' argument", key))
}

fn get_u32(args: &Value, key: &str) -> Result<u32, String> {
    args.get(key)
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .ok_or_else(|| format!("Missing or invalid '{}' argument", key))
}

fn get_u16(args: &Value, key: &str) -> Result<u16, String> {
    args.get(key)
        .and_then(|v| v.as_u64())
        .map(|v| v as u16)
        .ok_or_else(|| format!("Missing or invalid '{}' argument", key))
}

// ============================================================================
// Mobile push commands
// ============================================================================

fn cmd_push_session_to_mobile(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let session_id = get_u32(&args, "sessionId")?;

    let sm = app.state::<SessionManager>();
    let session = sm
        .get_session(session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    let pm = app.state::<ProcessManager>();
    let buffer = pm.get_session_output(session_id).unwrap_or_default();

    let event_bus = app.state::<Arc<EventBus>>();
    let payload = serde_json::json!({
        "sessionId": session.id,
        "title": session.title.unwrap_or_else(|| format!("Session #{}", session.id)),
        "status": session.status,
        "projectPath": session.project_path,
        "buffer": buffer,
    });
    event_bus.send("mobile:push-session".to_string(), payload);

    Ok(Value::Null)
}

fn cmd_get_session_output(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let session_id = get_u32(&args, "sessionId")?;
    let pm = app.state::<ProcessManager>();
    let buffer = pm.get_session_output(session_id).unwrap_or_default();
    Ok(Value::String(buffer))
}

// ============================================================================
// Store proxy commands — let the mobile browser read/write the same
// tauri-plugin-store JSON files that the desktop Zustand uses.
// ============================================================================

/// Resolve the app data dir (same location tauri-plugin-store uses).
fn store_file_path(app: &tauri::AppHandle, file_name: &str) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(file_name))
}

/// Read a key from a store JSON file.  Returns `Value::Null` if missing.
async fn cmd_store_get(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let file_name = get_str(&args, "fileName")?;
    let key = get_str(&args, "key")?;

    let path = store_file_path(app, &file_name)?;
    if !path.exists() {
        return Ok(Value::Null);
    }

    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read store file: {}", e))?;
    let store: serde_json::Map<String, Value> =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse store: {}", e))?;

    Ok(store.get(&key).cloned().unwrap_or(Value::Null))
}

/// Write a key into a store JSON file (read-modify-write).
async fn cmd_store_set(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let file_name = get_str(&args, "fileName")?;
    let key = get_str(&args, "key")?;
    let value = args.get("value").cloned().ok_or("Missing 'value' argument")?;

    let path = store_file_path(app, &file_name)?;

    // Read existing store or start empty
    let mut store: serde_json::Map<String, Value> = if path.exists() {
        let content = tokio::fs::read_to_string(&path)
            .await
            .unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    store.insert(key, value);

    let content = serde_json::to_string_pretty(&store)
        .map_err(|e| format!("Failed to serialize store: {}", e))?;
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| format!("Failed to write store file: {}", e))?;

    Ok(Value::Null)
}
