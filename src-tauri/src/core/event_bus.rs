//! Broadcast channel for forwarding Tauri events to WebSocket clients.
//!
//! The EventBus sits between Tauri's event system and external consumers
//! (e.g., WebSocket clients). Backend code emits events both through
//! `app.emit()` (for desktop) and `EventBus::send()` (for web clients).

use tokio::sync::broadcast;
use serde_json::Value;

/// A single event carried through the bus.
#[derive(Clone, Debug)]
pub struct BusEvent {
    pub event: String,
    pub payload: Value,
}

/// Broadcast channel that fans out events to all subscribers.
pub struct EventBus {
    sender: broadcast::Sender<BusEvent>,
}

impl EventBus {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(1024);
        Self { sender }
    }

    /// Send an event to all subscribers. Silently drops if no receivers.
    pub fn send(&self, event: String, payload: Value) {
        let _ = self.sender.send(BusEvent { event, payload });
    }

    /// Create a new receiver that will get all future events.
    pub fn subscribe(&self) -> broadcast::Receiver<BusEvent> {
        self.sender.subscribe()
    }
}
