/**
 * Transport abstraction layer.
 *
 * Decouples the frontend from `@tauri-apps/api` so that the same React code
 * can run inside the Tauri webview (IPC) or inside a plain browser (WebSocket).
 *
 * Detection: `window.__TAURI_INTERNALS__` is set by the Tauri runtime.
 */

// Re-export the UnlistenFn type for convenience
export type UnlistenFn = () => void;

/** Returns true when running inside the Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// ---------------------------------------------------------------------------
// WebSocket transport state (lazy-initialized on first call in browser mode)
// ---------------------------------------------------------------------------

/** Connection status for the WebSocket transport. */
export type WsConnectionStatus = "disconnected" | "connecting" | "authenticating" | "connected";

let ws: WebSocket | null = null;
let wsReady: Promise<void> | null = null;
let wsStatus: WsConnectionStatus = "disconnected";
const wsStatusListeners = new Set<(status: WsConnectionStatus) => void>();
let nextInvokeId = 1;
const pendingInvokes = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
const subscribedEvents = new Set<string>();
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function setWsStatus(status: WsConnectionStatus) {
  wsStatus = status;
  for (const fn of wsStatusListeners) fn(status);
}

/** Subscribe to WebSocket connection status changes. */
export function onWsStatusChange(handler: (status: WsConnectionStatus) => void): () => void {
  wsStatusListeners.add(handler);
  return () => { wsStatusListeners.delete(handler); };
}

/** Get the current WebSocket connection status. */
export function getWsStatus(): WsConnectionStatus {
  return wsStatus;
}

function getTokenFromHash(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/token=([^&]+)/);
  return match ? match[1] : null;
}

function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function connectWs(): Promise<void> {
  if (wsReady) return wsReady;

  wsReady = new Promise<void>((resolveReady, rejectReady) => {
    setWsStatus("connecting");
    const socket = new WebSocket(getWsUrl());

    socket.onopen = () => {
      setWsStatus("authenticating");
      const token = getTokenFromHash();
      if (!token) {
        rejectReady(new Error("No auth token in URL hash"));
        return;
      }
      socket.send(JSON.stringify({ type: "Auth", token }));
    };

    socket.onmessage = (event) => {
      let msg: { type: string; [key: string]: unknown };
      try {
        msg = JSON.parse(event.data);
      } catch {
        console.error("[WS] Unparseable message:", event.data);
        return;
      }

      switch (msg.type) {
        case "AuthResult": {
          if (msg.success) {
            ws = socket;
            setWsStatus("connected");
            reconnectAttempt = 0;
            // Re-subscribe to events that were active before reconnect
            for (const evt of subscribedEvents) {
              socket.send(JSON.stringify({ type: "Subscribe", event: evt }));
            }
            resolveReady();
          } else {
            rejectReady(new Error(`Auth failed: ${msg.error ?? "unknown"}`));
            socket.close();
          }
          break;
        }
        case "InvokeResult": {
          const id = msg.id as number;
          const pending = pendingInvokes.get(id);
          if (pending) {
            pendingInvokes.delete(id);
            clearTimeout(pending.timer);
            if (msg.error) {
              pending.reject(new Error(msg.error as string));
            } else {
              pending.resolve(msg.result);
            }
          }
          break;
        }
        case "Event": {
          const handlers = eventHandlers.get(msg.event as string);
          if (handlers) {
            for (const h of handlers) {
              try { h(msg.payload); } catch (e) { console.error("[WS] Event handler error:", e); }
            }
          }
          break;
        }
      }
    };

    socket.onclose = () => {
      ws = null;
      wsReady = null;
      setWsStatus("disconnected");
      // Reject all pending invokes
      for (const [id, pending] of pendingInvokes) {
        clearTimeout(pending.timer);
        pending.reject(new Error("WebSocket closed"));
        pendingInvokes.delete(id);
      }
      scheduleReconnect();
    };

    socket.onerror = (err) => {
      console.error("[WS] Error:", err);
    };
  });

  wsReady.catch(() => {
    wsReady = null;
    setWsStatus("disconnected");
  });

  return wsReady;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000);
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWs().catch(() => {});
  }, delay);
}

async function ensureWs(): Promise<WebSocket> {
  await connectWs();
  if (!ws) throw new Error("WebSocket not connected");
  return ws;
}

// ---------------------------------------------------------------------------
// Public API — auto-detect transport
// ---------------------------------------------------------------------------

/**
 * Calls a backend command.
 * In Tauri: delegates to `@tauri-apps/api/core` invoke.
 * In browser: sends an Invoke message over WebSocket.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
  }

  const socket = await ensureWs();
  const id = nextInvokeId++;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingInvokes.delete(id);
      reject(new Error(`Invoke "${cmd}" timed out after 30s`));
    }, 30000);

    pendingInvokes.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
      timer,
    });

    socket.send(JSON.stringify({ type: "Invoke", id, command: cmd, args: args ?? {} }));
  });
}

/**
 * Subscribes to a backend event.
 * In Tauri: delegates to `@tauri-apps/api/event` listen.
 * In browser: sends a Subscribe message over WebSocket.
 */
export async function listen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (isTauri()) {
    const { listen: tauriListen } = await import("@tauri-apps/api/event");
    return tauriListen<T>(event, (e) => handler(e.payload));
  }

  // Register handler locally
  let handlers = eventHandlers.get(event);
  if (!handlers) {
    handlers = new Set();
    eventHandlers.set(event, handlers);
  }
  const wrappedHandler = handler as (payload: unknown) => void;
  handlers.add(wrappedHandler);

  // Send subscribe message if this is the first handler for this event
  if (!subscribedEvents.has(event)) {
    subscribedEvents.add(event);
    try {
      const socket = await ensureWs();
      socket.send(JSON.stringify({ type: "Subscribe", event }));
    } catch {
      // Will be subscribed on reconnect
    }
  }

  return () => {
    const h = eventHandlers.get(event);
    if (h) {
      h.delete(wrappedHandler);
      if (h.size === 0) {
        eventHandlers.delete(event);
        subscribedEvents.delete(event);
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "Unsubscribe", event }));
        }
      }
    }
  };
}
