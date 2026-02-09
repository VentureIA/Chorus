//! Writes session-specific `.mcp.json` configuration files for Claude CLI.
//!
//! This module handles generating and writing MCP configuration files to the
//! working directory before launching the Claude CLI. It merges Chorus's
//! session-specific server configuration with any existing user-defined servers.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use super::mcp_manager::{McpServerConfig, McpServerType};
use crate::commands::mcp::McpCustomServer;

/// Converts an McpServerConfig to the JSON format expected by `.mcp.json`.
fn server_config_to_json(config: &McpServerConfig) -> Value {
    match &config.server_type {
        McpServerType::Stdio { command, args, env } => {
            let mut obj = json!({
                "type": "stdio",
                "command": command,
                "args": args,
            });
            if !env.is_empty() {
                obj["env"] = json!(env);
            }
            obj
        }
        McpServerType::Http { url } => {
            json!({
                "type": "http",
                "url": url
            })
        }
    }
}

/// Converts a custom MCP server to the JSON format expected by `.mcp.json`.
fn custom_server_to_json(server: &McpCustomServer) -> Value {
    let mut obj = json!({
        "type": "stdio",
        "command": server.command,
        "args": server.args,
    });
    if !server.env.is_empty() {
        obj["env"] = json!(server.env);
    }
    obj
}

/// Checks if a server entry should be removed when updating the MCP config.
///
/// Removes:
/// 1. The single "chorus-status" entry (will be replaced with updated config)
/// 2. Legacy per-session "chorus-status-*" entries (cleanup from old approach)
/// 3. Legacy "chorus-*" entries (cleanup from old approach)
/// 4. Legacy "chorus" entry (bare entry without session ID)
///
/// This follows the Swift pattern: ONE MCP entry per project, session ID in env vars.
/// Each Claude instance spawns its own MCP server process with the env vars from when
/// it read the config.
fn should_remove_server(name: &str, _config: &Value, _session_id: u32) -> bool {
    // Remove the single chorus-status entry (we'll add an updated one)
    if name == "chorus-status" {
        log::debug!("[MCP] should_remove_server('{}') = true (single chorus-status entry)", name);
        return true;
    }

    // Remove legacy per-session entries (cleanup from old per-session approach)
    if name.starts_with("chorus-status-") {
        log::debug!("[MCP] should_remove_server('{}') = true (legacy per-session entry)", name);
        return true;
    }

    // Remove legacy "chorus-{N}" entries
    if name.starts_with("chorus-") && name != "chorus-status" {
        log::debug!("[MCP] should_remove_server('{}') = true (legacy chorus-N entry)", name);
        return true;
    }

    // Remove the legacy bare "chorus" entry
    if name == "chorus" {
        log::debug!("[MCP] should_remove_server('{}') = true (legacy bare chorus entry)", name);
        return true;
    }

    log::debug!("[MCP] should_remove_server('{}') = false (keeping)", name);
    false
}

/// Merges new MCP servers with an existing `.mcp.json` file.
///
/// This function preserves user-defined servers while removing all Chorus-related
/// entries (they'll be replaced with the new single "chorus-status" entry).
/// This follows the Swift pattern: ONE MCP entry per project with session ID in env.
fn merge_with_existing(
    mcp_path: &Path,
    new_servers: HashMap<String, Value>,
    session_id: u32,
) -> Result<Value, String> {
    log::debug!("[MCP] merge_with_existing: {:?} for session {}", mcp_path, session_id);

    let mut final_servers: HashMap<String, Value> = if mcp_path.exists() {
        let content = std::fs::read_to_string(mcp_path)
            .map_err(|e| format!("Failed to read existing .mcp.json: {}", e))?;

        let existing: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse existing .mcp.json: {}", e))?;

        // Keep all servers EXCEPT this session's Chorus entry
        existing
            .get("mcpServers")
            .and_then(|s| s.as_object())
            .map(|obj| {
                obj.iter()
                    .filter(|(name, v)| {
                        let should_remove = should_remove_server(name, v, session_id);
                        if should_remove {
                            log::info!(
                                "merge_with_existing: removing session {}'s server '{}'",
                                session_id,
                                name
                            );
                        }
                        !should_remove
                    })
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect::<HashMap<_, _>>()
            })
            .unwrap_or_default()
    } else {
        HashMap::new()
    };

    // Add new servers for this session
    for (name, config) in new_servers {
        log::info!("merge_with_existing: adding server '{}' for session {}", name, session_id);
        final_servers.insert(name, config);
    }

    log::info!(
        "merge_with_existing: final servers for session {}: {:?}",
        session_id,
        final_servers.keys().collect::<Vec<_>>()
    );

    Ok(json!({ "mcpServers": final_servers }))
}

/// Configuration for the Chorus status MCP server.
#[derive(Debug, Clone)]
pub struct ChorusStatusConfig {
    /// Path to the chorus-mcp-server binary
    pub binary_path: PathBuf,
    /// URL of the Chorus status HTTP server (e.g., "http://127.0.0.1:9900/status")
    pub status_url: String,
    /// Unique instance ID for this Chorus app instance
    pub instance_id: String,
}

/// Writes a session-specific `.mcp.json` to the working directory.
///
/// This function:
/// 1. Adds the Chorus status server for real-time status reporting
/// 2. Adds enabled discovered servers from the project's .mcp.json
/// 3. Adds enabled custom servers (user-defined, global)
/// 4. Merges with any existing `.mcp.json` (preserving user servers)
/// 5. Writes the final config to the working directory
///
/// # Arguments
///
/// * `working_dir` - Directory where `.mcp.json` will be written
/// * `session_id` - Session identifier used for merging
/// * `enabled_servers` - List of discovered MCP server configs enabled for this session
/// * `custom_servers` - List of custom MCP servers that are enabled
/// * `chorus_status` - Optional configuration for the Chorus status MCP server
pub async fn write_session_mcp_config(
    working_dir: &Path,
    session_id: u32,
    enabled_servers: &[McpServerConfig],
    custom_servers: &[McpCustomServer],
    chorus_status: Option<&ChorusStatusConfig>,
) -> Result<(), String> {
    let mut mcp_servers: HashMap<String, Value> = HashMap::new();

    // Add enabled discovered servers from project .mcp.json
    // Skip any chorus-managed entries — they get re-discovered from our own .mcp.json
    // writes and would carry stale env vars. We'll add the correct chorus-status below.
    for server in enabled_servers {
        if should_remove_server(&server.name, &Value::Null, session_id) {
            log::info!(
                "Skipping discovered server '{}' (Chorus-managed, will be replaced)",
                server.name
            );
            continue;
        }
        mcp_servers.insert(server.name.clone(), server_config_to_json(server));
    }

    // Add enabled custom servers (user-defined, global)
    for server in custom_servers {
        mcp_servers.insert(server.name.clone(), custom_server_to_json(server));
    }

    // Add the Chorus status server LAST so it always wins over any re-discovered version.
    // All three env vars must be explicit here because Claude CLI only passes env vars
    // listed in .mcp.json to MCP server processes (shell env is NOT inherited).
    // The "skip discovered chorus servers" logic above prevents stale re-discovered
    // entries from overwriting these fresh values.
    if let Some(config) = chorus_status {
        let chorus_server = json!({
            "type": "stdio",
            "command": config.binary_path.to_string_lossy(),
            "args": [],
            "env": {
                "CHORUS_SESSION_ID": session_id.to_string(),
                "CHORUS_STATUS_URL": config.status_url,
                "CHORUS_INSTANCE_ID": config.instance_id
            }
        });
        mcp_servers.insert("chorus-status".to_string(), chorus_server);
        log::info!(
            "Added chorus-status MCP server: binary={:?}, session_id={} (URL and instance_id inherited from shell env)",
            config.binary_path,
            session_id,
        );
    }

    // Merge with existing .mcp.json if present (preserve user servers AND other sessions)
    let mcp_path = working_dir.join(".mcp.json");
    let final_config = merge_with_existing(&mcp_path, mcp_servers, session_id)?;

    // Write the file
    let content = serde_json::to_string_pretty(&final_config)
        .map_err(|e| format!("Failed to serialize MCP config: {}", e))?;

    log::info!(
        "[MCP] Writing .mcp.json to {:?} ({} bytes)",
        mcp_path,
        content.len()
    );

    tokio::fs::write(&mcp_path, &content)
        .await
        .map_err(|e| format!("Failed to write .mcp.json to {:?}: {}", mcp_path, e))?;

    // Verify the write by reading back
    match tokio::fs::read_to_string(&mcp_path).await {
        Ok(readback) => {
            if readback == content {
                log::info!("[MCP] Verified .mcp.json write for session {} at {:?}", session_id, mcp_path);
            } else {
                log::error!(
                    "[MCP] WRITE VERIFICATION FAILED for session {} at {:?}! Written {} bytes, read back {} bytes",
                    session_id, mcp_path, content.len(), readback.len()
                );
            }
        }
        Err(e) => {
            log::error!("[MCP] Failed to read back .mcp.json at {:?}: {}", mcp_path, e);
        }
    }

    Ok(())
}

/// Removes Chorus server entries from `.mcp.json`.
///
/// This should be called when a session is killed to clean up the config file.
/// Removes the single "chorus-status" entry and any legacy per-session entries.
/// The function is idempotent - it does nothing if no entries exist.
///
/// Note: With the single-entry pattern, this removes the entry entirely.
/// The next session to start will write a fresh entry with its session ID.
///
/// # Arguments
///
/// * `working_dir` - Directory containing the `.mcp.json` file
/// * `session_id` - Session identifier (used for logging, cleanup removes all Chorus entries)
pub async fn remove_session_mcp_config(working_dir: &Path, session_id: u32) -> Result<(), String> {
    let mcp_path = working_dir.join(".mcp.json");
    if !mcp_path.exists() {
        return Ok(());
    }

    let content = tokio::fs::read_to_string(&mcp_path)
        .await
        .map_err(|e| format!("Failed to read .mcp.json: {}", e))?;

    let mut config: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse .mcp.json: {}", e))?;

    if let Some(servers) = config.get_mut("mcpServers").and_then(|s| s.as_object_mut()) {
        // Remove the single chorus-status entry
        if servers.remove("chorus-status").is_some() {
            log::debug!("Removed chorus-status MCP config from {:?} (session {})", mcp_path, session_id);
        }

        // Also clean up any legacy per-session entries that might exist
        let legacy_keys: Vec<String> = servers
            .keys()
            .filter(|k| k.starts_with("chorus-status-") || k.starts_with("chorus-") || *k == "chorus")
            .cloned()
            .collect();

        for key in legacy_keys {
            if servers.remove(&key).is_some() {
                log::debug!("Removed legacy {} MCP config from {:?}", key, mcp_path);
            }
        }
    }

    let output = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    tokio::fs::write(&mcp_path, output)
        .await
        .map_err(|e| format!("Failed to write .mcp.json: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::tempdir;

    #[test]
    fn test_server_config_to_json_stdio() {
        let config = McpServerConfig {
            name: "test".to_string(),
            server_type: McpServerType::Stdio {
                command: "/usr/bin/test".to_string(),
                args: vec!["--flag".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("KEY".to_string(), "value".to_string());
                    env
                },
            },
        };

        let json = server_config_to_json(&config);
        assert_eq!(json["type"], "stdio");
        assert_eq!(json["command"], "/usr/bin/test");
        assert_eq!(json["args"][0], "--flag");
        assert_eq!(json["env"]["KEY"], "value");
    }

    #[test]
    fn test_server_config_to_json_http() {
        let config = McpServerConfig {
            name: "test".to_string(),
            server_type: McpServerType::Http {
                url: "http://localhost:3000".to_string(),
            },
        };

        let json = server_config_to_json(&config);
        assert_eq!(json["type"], "http");
        assert_eq!(json["url"], "http://localhost:3000");
    }

    #[tokio::test]
    async fn test_write_session_mcp_config_creates_file() {
        let dir = tempdir().unwrap();
        let result = write_session_mcp_config(
            dir.path(),
            1,
            &[],
            &[],
            None, // No chorus-status config for this test
        )
        .await;

        assert!(result.is_ok());
        assert!(dir.path().join(".mcp.json").exists());
    }

    #[test]
    fn test_merge_preserves_user_servers_removes_all_chorus() {
        let dir = tempdir().unwrap();
        let mcp_path = dir.path().join(".mcp.json");

        // Write an existing config with a user server and multiple legacy Chorus entries
        let existing = json!({
            "mcpServers": {
                "user-server": {
                    "type": "stdio",
                    "command": "/usr/bin/user-server",
                    "args": []
                },
                "chorus": {
                    "type": "stdio",
                    "command": "/usr/bin/old-chorus",
                    "args": []
                },
                "chorus-status-1": {
                    "type": "stdio",
                    "command": "/usr/bin/chorus-status-1",
                    "args": [],
                    "env": {
                        "CHORUS_SESSION_ID": "1"
                    }
                },
                "chorus-status-2": {
                    "type": "stdio",
                    "command": "/usr/bin/chorus-status-2",
                    "args": [],
                    "env": {
                        "CHORUS_SESSION_ID": "2"
                    }
                },
                "chorus-status": {
                    "type": "stdio",
                    "command": "/usr/bin/old-chorus-status",
                    "args": [],
                    "env": {
                        "CHORUS_SESSION_ID": "old"
                    }
                }
            }
        });
        std::fs::write(&mcp_path, serde_json::to_string(&existing).unwrap()).unwrap();

        // Merge with new single chorus-status entry for session 3
        let mut new_servers = HashMap::new();
        new_servers.insert(
            "chorus-status".to_string(),
            json!({
                "type": "stdio",
                "command": "/usr/bin/new-chorus-status",
                "args": [],
                "env": {
                    "CHORUS_SESSION_ID": "3"
                }
            }),
        );

        let result = merge_with_existing(&mcp_path, new_servers, 3).unwrap();
        let servers = result["mcpServers"].as_object().unwrap();

        // User server should be preserved
        assert!(servers.contains_key("user-server"), "user-server should be preserved");
        // ALL legacy Chorus entries should be removed
        assert!(!servers.contains_key("chorus"), "bare 'chorus' should be removed");
        assert!(!servers.contains_key("chorus-status-1"), "legacy session 1 entry should be removed");
        assert!(!servers.contains_key("chorus-status-2"), "legacy session 2 entry should be removed");
        // New single chorus-status entry should be present with updated command and session ID
        assert!(servers.contains_key("chorus-status"), "chorus-status entry should be present");
        assert_eq!(
            servers["chorus-status"]["command"],
            "/usr/bin/new-chorus-status",
            "chorus-status should have new command"
        );
        assert_eq!(
            servers["chorus-status"]["env"]["CHORUS_SESSION_ID"],
            "3",
            "chorus-status should have session ID 3 in env"
        );
        // CHORUS_STATUS_URL and CHORUS_INSTANCE_ID should NOT be in .mcp.json
        // (they are inherited from the shell environment)
        assert!(
            servers["chorus-status"]["env"].get("CHORUS_STATUS_URL").is_none(),
            "CHORUS_STATUS_URL should not be in .mcp.json env"
        );
        assert!(
            servers["chorus-status"]["env"].get("CHORUS_INSTANCE_ID").is_none(),
            "CHORUS_INSTANCE_ID should not be in .mcp.json env"
        );
    }

    #[test]
    fn test_merge_removes_all_legacy_formats() {
        let dir = tempdir().unwrap();
        let mcp_path = dir.path().join(".mcp.json");

        // Write config with various legacy format entries
        let existing = json!({
            "mcpServers": {
                "chorus-1": {
                    "type": "stdio",
                    "command": "/usr/bin/chorus-1",
                    "args": [],
                    "env": {
                        "CHORUS_SESSION_ID": "1"
                    }
                },
                "chorus-2": {
                    "type": "stdio",
                    "command": "/usr/bin/chorus-2",
                    "args": [],
                    "env": {
                        "CHORUS_SESSION_ID": "2"
                    }
                },
                "other-server": {
                    "type": "stdio",
                    "command": "/usr/bin/other",
                    "args": []
                }
            }
        });
        std::fs::write(&mcp_path, serde_json::to_string(&existing).unwrap()).unwrap();

        // Add new single entry
        let mut new_servers = HashMap::new();
        new_servers.insert(
            "chorus-status".to_string(),
            json!({
                "type": "stdio",
                "command": "/usr/bin/new-chorus-status",
                "args": [],
                "env": {
                    "CHORUS_SESSION_ID": "5"
                }
            }),
        );

        let result = merge_with_existing(&mcp_path, new_servers, 5).unwrap();
        let servers = result["mcpServers"].as_object().unwrap();

        // All legacy entries should be removed
        assert!(!servers.contains_key("chorus-1"), "chorus-1 legacy entry should be removed");
        assert!(!servers.contains_key("chorus-2"), "chorus-2 legacy entry should be removed");
        // Non-Chorus server should be preserved
        assert!(servers.contains_key("other-server"), "other-server should be preserved");
        // New entry should be present
        assert!(servers.contains_key("chorus-status"), "new chorus-status entry should be present");
    }
}
