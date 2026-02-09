import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

import { TerminalSpecialKeys } from "@/components/mobile/TerminalSpecialKeys";
import { onPtyOutput, resizePty, writeStdin } from "@/lib/terminal";
import { DEFAULT_THEME, toXtermTheme } from "@/lib/terminalTheme";
import { listen, onWsStatusChange, type WsConnectionStatus } from "@/lib/transport";

interface PushedSession {
  sessionId: number;
  title: string;
  status: string;
  projectPath: string;
  buffer: string;
}

const STATUS_DOT_COLOR: Record<string, string> = {
  idle: "bg-gray-400",
  starting: "bg-orange-400",
  working: "bg-violet-500 animate-pulse",
  "needs-input": "bg-yellow-400 animate-pulse",
  done: "bg-green-400",
  error: "bg-red-500",
  timeout: "bg-red-500",
  Starting: "bg-orange-400",
  Idle: "bg-gray-400",
  Working: "bg-violet-500 animate-pulse",
  NeedsInput: "bg-yellow-400 animate-pulse",
  Done: "bg-green-400",
  Error: "bg-red-500",
  Timeout: "bg-red-500",
};

/**
 * Full-screen mobile terminal view.
 *
 * Two states:
 * A) Waiting — dark screen with "Connected. Waiting for session..." message
 * B) Terminal — full-screen xterm.js with the pushed session
 */
export function MobileTerminalView() {
  const [wsStatus, setWsStatus] = useState<WsConnectionStatus>("disconnected");
  const [session, setSession] = useState<PushedSession | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string>("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Track WS connection status
  useEffect(() => {
    return onWsStatusChange(setWsStatus);
  }, []);

  // Listen for push-session events
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<PushedSession>("mobile:push-session", (payload) => {
      setSession(payload);
      setCurrentStatus(payload.status);
    })
      .then((fn) => { unlisten = fn; })
      .catch((err) => console.error("Failed to listen for push-session:", err));

    return () => { unlisten?.(); };
  }, []);

  // Listen for session status changes
  useEffect(() => {
    if (!session) return;
    let unlisten: (() => void) | null = null;

    listen<{ id: number; status: string }>("session-status-changed", (payload) => {
      if (payload.id === session.sessionId) {
        setCurrentStatus(payload.status);
      }
    })
      .then((fn) => { unlisten = fn; })
      .catch(console.error);

    return () => { unlisten?.(); };
  }, [session?.sessionId]);

  const handleDisconnect = useCallback(() => {
    // Tear down terminal and go back to waiting state
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
    fitAddonRef.current = null;
    setSession(null);
  }, []);

  // Initialize xterm when session is pushed
  useEffect(() => {
    if (!session || !containerRef.current) return;

    const container = containerRef.current;
    let disposed = false;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      lineHeight: 1.2,
      theme: toXtermTheme(DEFAULT_THEME),
      allowProposedApi: true,
      scrollback: 5000,
      tabStopWidth: 8,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Write initial buffer
    if (session.buffer) {
      term.write(session.buffer);
    }

    // Fit after a frame to get correct dimensions
    requestAnimationFrame(() => {
      if (disposed) return;
      try {
        fitAddon.fit();
        // Tell backend about our dimensions
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          resizePty(session.sessionId, dims.rows, dims.cols).catch(console.error);
        }
      } catch {
        // Container may not be sized yet
      }
    });

    // Wire input
    const dataDisposable = term.onData((data) => {
      writeStdin(session.sessionId, data).catch(console.error);
    });

    const resizeDisposable = term.onResize(({ rows, cols }) => {
      resizePty(session.sessionId, rows, cols).catch(console.error);
    });

    // Subscribe to PTY output
    let unlisten: (() => void) | null = null;
    onPtyOutput(session.sessionId, (data) => {
      if (!disposed && term) {
        term.write(data);
      }
    })
      .then((fn) => {
        if (disposed) { fn(); } else { unlisten = fn; }
      })
      .catch((err) => {
        if (!disposed) console.error("PTY listener failed:", err);
      });

    // Resize on container size change
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (!disposed && fitAddon) {
          try { fitAddon.fit(); } catch { /* ignore */ }
        }
      });
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      unlisten?.();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [session]);

  // === Waiting State ===
  if (!session) {
    const isConnected = wsStatus === "connected";

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#1e1e1e] text-white">
        {/* Logo / branding */}
        <div className="mb-8 text-4xl font-bold tracking-tight text-white/90">
          Chorus
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2 mb-3">
          <div className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-green-400" : "bg-yellow-400 animate-pulse"}`} />
          <span className="text-sm text-white/70">
            {isConnected ? "Connected to desktop" : wsStatus === "connecting" || wsStatus === "authenticating" ? "Connecting..." : "Disconnected"}
          </span>
        </div>

        {/* Waiting message */}
        {isConnected && (
          <p className="text-xs text-white/40">
            Waiting for session...
          </p>
        )}

        {!isConnected && wsStatus === "disconnected" && (
          <p className="text-xs text-white/40">
            Check your connection and try again
          </p>
        )}
      </div>
    );
  }

  // === Terminal State ===
  const dotColor = STATUS_DOT_COLOR[currentStatus] ?? "bg-gray-400";

  return (
    <div className="flex h-screen w-screen flex-col bg-[#1e1e1e]">
      {/* Minimal top bar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/10 bg-[#252526] px-3">
        <div className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className="flex-1 truncate text-xs font-medium text-white/80">
          {session.title}
        </span>
        <button
          type="button"
          onClick={handleDisconnect}
          className="rounded px-2 py-0.5 text-[10px] font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          Disconnect
        </button>
      </div>

      {/* Terminal container */}
      <div ref={containerRef} className="flex-1 overflow-hidden px-1 py-1" />

      {/* Special keys bar */}
      <TerminalSpecialKeys sessionId={session.sessionId} />
    </div>
  );
}
