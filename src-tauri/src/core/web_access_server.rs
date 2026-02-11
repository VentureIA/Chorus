//! Axum server for serving the React app and handling WebSocket connections.
//!
//! Binds on `0.0.0.0` in port range 8800-8899 to allow LAN access from
//! mobile browsers. Provides token-based auth and a WebSocket protocol
//! for invoking Tauri commands and subscribing to events.

use std::collections::HashSet;
use std::net::TcpListener;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tokio::sync::RwLock;
use tower_http::services::ServeDir;

use super::event_bus::EventBus;
use super::web_dispatch;

/// Token info with expiry tracking.
struct TokenInfo {
    token: String,
    expires_at: std::time::Instant,
}

/// Web access server state.
pub struct WebAccessServer {
    port: u16,
    token: Arc<RwLock<Option<TokenInfo>>>,
    connected_clients: Arc<AtomicUsize>,
}

/// Status returned to the frontend UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebAccessStatus {
    pub running: bool,
    pub port: u16,
    pub connected_clients: usize,
    pub has_valid_token: bool,
}

/// Result of generating a new access token.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebAccessTokenResult {
    pub url: String,
    pub token: String,
    pub expires_in_secs: u64,
}

/// Shared state for WebSocket handlers.
struct WsState {
    app_handle: AppHandle,
    event_bus: Arc<EventBus>,
    token: Arc<RwLock<Option<TokenInfo>>>,
    connected_clients: Arc<AtomicUsize>,
}

// --- WebSocket Protocol Messages ---

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "PascalCase")]
enum ClientMessage {
    Auth { token: String },
    Invoke { id: u64, command: String, args: Value },
    Subscribe { event: String },
    Unsubscribe { event: String },
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "PascalCase")]
enum ServerMessage {
    AuthResult {
        success: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    InvokeResult {
        id: u64,
        #[serde(skip_serializing_if = "Option::is_none")]
        result: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Event {
        event: String,
        payload: Value,
    },
}

impl WebAccessServer {
    /// Try to start the server on a port in range 8800-8899.
    /// Returns None if no port is available.
    pub fn start(app_handle: AppHandle, event_bus: Arc<EventBus>) -> Option<Self> {
        let port = Self::find_available_port(8800, 8899)?;
        let token: Arc<RwLock<Option<TokenInfo>>> = Arc::new(RwLock::new(None));
        let connected_clients = Arc::new(AtomicUsize::new(0));

        let ws_state = Arc::new(WsState {
            app_handle: app_handle.clone(),
            event_bus,
            token: token.clone(),
            connected_clients: connected_clients.clone(),
        });

        // Resolve the dist directory for serving static files.
        // In development, this is the Vite output; in production, it's bundled.
        let dist_dir = Self::resolve_dist_dir(&app_handle);

        let app = Router::new()
            .route("/ws", get(ws_handler))
            .fallback_service(ServeDir::new(&dist_dir).append_index_html_on_directories(true))
            .with_state(ws_state);

        let addr = format!("0.0.0.0:{}", port);
        log::info!("Starting web access server on {}", addr);

        // We need to bind synchronously to confirm the port, then serve async.
        let listener = match std::net::TcpListener::bind(&addr) {
            Ok(l) => {
                l.set_nonblocking(true).ok();
                l
            }
            Err(e) => {
                log::error!("Failed to bind web access server to {}: {}", addr, e);
                return None;
            }
        };

        let tokio_listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(l) => l,
            Err(e) => {
                log::error!("Failed to convert listener: {}", e);
                return None;
            }
        };

        tokio::spawn(async move {
            if let Err(e) = axum::serve(tokio_listener, app).await {
                log::error!("Web access server error: {}", e);
            }
        });

        log::info!("Web access server started on port {}", port);

        Some(Self {
            port,
            token,
            connected_clients,
        })
    }

    /// Generate a new access token. Returns (url, token, expires_in_secs).
    pub async fn generate_token(&self) -> (String, String, u64) {
        let token = uuid::Uuid::new_v4().to_string();
        let expires_in = 300u64; // 5 minutes

        let info = TokenInfo {
            token: token.clone(),
            expires_at: std::time::Instant::now() + std::time::Duration::from_secs(expires_in),
        };

        *self.token.write().await = Some(info);

        let ip = local_ip_address::local_ip()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|_| "0.0.0.0".to_string());

        let url = format!("http://{}:{}", ip, self.port);
        (url, token, expires_in)
    }

    /// Get current server status.
    pub async fn get_status(&self) -> WebAccessStatus {
        let has_valid_token = {
            let guard = self.token.read().await;
            guard
                .as_ref()
                .map(|t| t.expires_at > std::time::Instant::now())
                .unwrap_or(false)
        };

        WebAccessStatus {
            running: true,
            port: self.port,
            connected_clients: self.connected_clients.load(Ordering::Relaxed),
            has_valid_token,
        }
    }

    /// Revoke the current token and disconnect all clients.
    pub async fn revoke(&self) {
        *self.token.write().await = None;
        // Clients will be disconnected when they next try to send/receive
        // since their auth will no longer be valid.
        log::info!("Web access token revoked");
    }

    fn find_available_port(start: u16, end: u16) -> Option<u16> {
        for port in start..=end {
            if TcpListener::bind(("0.0.0.0", port)).is_ok() {
                return Some(port);
            }
        }
        None
    }

    /// Resolve the directory containing the built frontend assets (dist/).
    fn resolve_dist_dir(app_handle: &AppHandle) -> String {
        use tauri::Manager;

        // Try Tauri resource dir first (production).
        // Resources bundled from "../dist" land under "_up_/dist/" in the bundle.
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            let dist = resource_dir.join("_up_").join("dist");
            if dist.exists() {
                log::info!("Serving web access from bundled dist: {}", dist.display());
                return dist.to_string_lossy().to_string();
            }
            let dist = resource_dir.join("dist");
            if dist.exists() {
                log::info!("Serving web access from resource dist: {}", dist.display());
                return dist.to_string_lossy().to_string();
            }
        }

        // Development: look for dist/ relative to CARGO_MANIFEST_DIR
        let dev_dist = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../dist");
        if dev_dist.exists() {
            log::info!("Serving web access from dev dist: {}", dev_dist.display());
            return dev_dist.to_string_lossy().to_string();
        }

        // Fallback
        log::warn!("Could not find dist directory for web access server");
        "dist".to_string()
    }
}

/// WebSocket upgrade handler.
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<WsState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

/// Handle an individual WebSocket connection.
async fn handle_ws(socket: WebSocket, state: Arc<WsState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut subscriptions: HashSet<String> = HashSet::new();

    // First message must be Auth
    let auth_timeout = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        receiver.next(),
    );

    let authenticated = match auth_timeout.await {
        Ok(Some(Ok(Message::Text(text)))) => {
            match serde_json::from_str::<ClientMessage>(&text) {
                Ok(ClientMessage::Auth { token }) => {
                    let valid = {
                        let guard = state.token.read().await;
                        guard
                            .as_ref()
                            .map(|t| t.token == token && t.expires_at > std::time::Instant::now())
                            .unwrap_or(false)
                    };

                    if valid {
                        let msg = ServerMessage::AuthResult { success: true, error: None };
                        let _ = sender.send(Message::Text(serde_json::to_string(&msg).unwrap().into())).await;
                        true
                    } else {
                        let msg = ServerMessage::AuthResult {
                            success: false,
                            error: Some("Invalid or expired token".to_string()),
                        };
                        let _ = sender.send(Message::Text(serde_json::to_string(&msg).unwrap().into())).await;
                        false
                    }
                }
                _ => {
                    let msg = ServerMessage::AuthResult {
                        success: false,
                        error: Some("First message must be Auth".to_string()),
                    };
                    let _ = sender.send(Message::Text(serde_json::to_string(&msg).unwrap().into())).await;
                    false
                }
            }
        }
        _ => false,
    };

    if !authenticated {
        return;
    }

    // Track connected client
    state.connected_clients.fetch_add(1, Ordering::Relaxed);
    log::info!("WebSocket client connected (total: {})", state.connected_clients.load(Ordering::Relaxed));

    // Split sender into a channel so we can send from multiple tasks
    let (tx, mut tx_rx) = tokio::sync::mpsc::channel::<String>(256);

    // Task: forward mpsc channel to WebSocket sender
    let send_task = tokio::spawn(async move {
        while let Some(msg) = tx_rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Task: forward event bus events matching subscriptions
    let event_tx = tx.clone();
    let event_bus_rx = state.event_bus.subscribe();
    let subs = Arc::new(RwLock::new(subscriptions.clone()));
    let subs_clone = subs.clone();

    let event_task = tokio::spawn(async move {
        let mut rx = event_bus_rx;
        loop {
            match rx.recv().await {
                Ok(bus_event) => {
                    let subscribed = {
                        let guard = subs_clone.read().await;
                        guard.contains(&bus_event.event)
                    };
                    if subscribed {
                        let msg = ServerMessage::Event {
                            event: bus_event.event,
                            payload: bus_event.payload,
                        };
                        if let Ok(json) = serde_json::to_string(&msg) {
                            if event_tx.send(json).await.is_err() {
                                break;
                            }
                        }
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    log::warn!("WebSocket client lagged, dropped {} events", n);
                }
                Err(_) => break,
            }
        }
    });

    // Main loop: process incoming messages
    let app_handle = state.app_handle.clone();
    while let Some(Ok(msg)) = receiver.next().await {
        let Message::Text(text) = msg else { continue };

        let client_msg = match serde_json::from_str::<ClientMessage>(&text) {
            Ok(m) => m,
            Err(e) => {
                log::warn!("Invalid WS message: {}", e);
                continue;
            }
        };

        match client_msg {
            ClientMessage::Auth { .. } => {
                // Already authenticated, ignore subsequent auth messages
            }
            ClientMessage::Invoke { id, command, args } => {
                let app = app_handle.clone();
                let invoke_tx = tx.clone();
                tokio::spawn(async move {
                    let result = web_dispatch::dispatch(&app, &command, args).await;
                    let msg = match result {
                        Ok(value) => ServerMessage::InvokeResult {
                            id,
                            result: Some(value),
                            error: None,
                        },
                        Err(err) => ServerMessage::InvokeResult {
                            id,
                            result: None,
                            error: Some(err),
                        },
                    };
                    if let Ok(json) = serde_json::to_string(&msg) {
                        let _ = invoke_tx.send(json).await;
                    }
                });
            }
            ClientMessage::Subscribe { event } => {
                subs.write().await.insert(event.clone());
                subscriptions.insert(event);
            }
            ClientMessage::Unsubscribe { event } => {
                subs.write().await.remove(&event);
                subscriptions.remove(&event);
            }
        }
    }

    // Clean up
    state.connected_clients.fetch_sub(1, Ordering::Relaxed);
    log::info!("WebSocket client disconnected (total: {})", state.connected_clients.load(Ordering::Relaxed));
    event_task.abort();
    send_task.abort();
}
