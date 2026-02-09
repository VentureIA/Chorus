//! Tauri commands for controlling the web access server from the desktop UI.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::core::event_bus::EventBus;
use crate::core::process_manager::ProcessManager;
use crate::core::session_manager::SessionManager;
use crate::core::tunnel_manager::TunnelManager;
use crate::core::web_access_server::{WebAccessServer, WebAccessStatus, WebAccessTokenResult};

/// Generate a new web access token and return the URL + token + expiry.
#[tauri::command]
pub async fn generate_web_access_token(
    app: AppHandle,
) -> Result<WebAccessTokenResult, String> {
    let server = app
        .try_state::<WebAccessServer>()
        .ok_or("Web access server not running")?;

    let (url, token, expires_in_secs) = server.generate_token().await;

    // If a tunnel is running, use the tunnel URL instead
    let final_url = if let Some(tunnel) = app.try_state::<TunnelManager>() {
        if let Some(tunnel_url) = tunnel.get_url().await {
            tunnel_url
        } else {
            url
        }
    } else {
        url
    };

    Ok(WebAccessTokenResult {
        url: final_url,
        token,
        expires_in_secs,
    })
}

/// Get the current web access server status.
#[tauri::command]
pub async fn get_web_access_status(
    app: AppHandle,
) -> Result<WebAccessStatus, String> {
    match app.try_state::<WebAccessServer>() {
        Some(server) => Ok(server.get_status().await),
        None => Ok(WebAccessStatus {
            running: false,
            port: 0,
            connected_clients: 0,
            has_valid_token: false,
        }),
    }
}

/// Revoke the current token and disconnect web clients.
#[tauri::command]
pub async fn revoke_web_access(
    app: AppHandle,
) -> Result<(), String> {
    let server = app
        .try_state::<WebAccessServer>()
        .ok_or("Web access server not running")?;

    server.revoke().await;
    Ok(())
}

/// Tunnel status returned to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStatus {
    pub running: bool,
    pub url: Option<String>,
}

/// Start a Cloudflare Quick Tunnel for the web access server.
/// Returns the public HTTPS URL.
#[tauri::command]
pub async fn start_web_tunnel(
    app: AppHandle,
) -> Result<String, String> {
    let server = app
        .try_state::<WebAccessServer>()
        .ok_or("Web access server not running")?;
    let port = server.get_status().await.port;

    let tunnel = app.state::<TunnelManager>();
    tunnel.start(port).await
}

/// Stop the Cloudflare tunnel.
#[tauri::command]
pub async fn stop_web_tunnel(
    app: AppHandle,
) -> Result<(), String> {
    let tunnel = app.state::<TunnelManager>();
    tunnel.stop().await
}

/// Get the current tunnel status.
#[tauri::command]
pub async fn get_web_tunnel_status(
    app: AppHandle,
) -> Result<TunnelStatus, String> {
    let tunnel = app.state::<TunnelManager>();
    Ok(TunnelStatus {
        running: tunnel.is_running().await,
        url: tunnel.get_url().await,
    })
}

/// Push a desktop session to the connected mobile device via EventBus.
#[tauri::command]
pub fn push_session_to_mobile(
    app: AppHandle,
    session_id: u32,
) -> Result<(), String> {
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

    Ok(())
}
