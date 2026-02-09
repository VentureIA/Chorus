import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

import { QuickActionsManager } from "@/components/quickactions/QuickActionsManager";
import { TerminalSpecialKeys } from "@/components/mobile/TerminalSpecialKeys";
import { buildFontFamily, EMBEDDED_FONT, waitForFont } from "@/lib/fonts";
import { useIsMobile } from "@/hooks/useIsMobile";
import { StatusDetector } from "@/lib/statusDetector";
import { getBackendInfo, killSession, onPtyOutput, resizePty, writeStdin, type BackendInfo } from "@/lib/terminal";
import { DEFAULT_THEME, LIGHT_THEME, toXtermTheme } from "@/lib/terminalTheme";
import { invoke } from "@/lib/transport";
import { useMcpStore } from "@/stores/useMcpStore";
import { type AiMode, type BackendSessionStatus, useSessionStore } from "@/stores/useSessionStore";
import { useTerminalSettingsStore } from "@/stores/useTerminalSettingsStore";
import { QuickActionPills } from "./QuickActionPills";
import { TerminalFindWidget } from "./TerminalFindWidget";
import { type AIProvider, type SessionStatus, TerminalHeader } from "./TerminalHeader";

/**
 * Props for {@link TerminalView}.
 * @property sessionId - Backend PTY session ID used to route stdin/stdout and resize events.
 * @property status - Fallback status used only when the session store has no entry yet.
 * @property isFocused - Whether this terminal is currently focused (shows accent ring).
 * @property onFocus - Callback when the terminal is clicked/focused.
 * @property onKill - Callback invoked after the backend kill IPC completes (or fails).
 */
interface TerminalViewProps {
  sessionId: number;
  status?: SessionStatus;
  isFocused?: boolean;
  onFocus?: () => void;
  onKill: (sessionId: number) => void;
  onHandoff?: (sessionId: number) => void;
}

/**
 * Methods exposed via ref for parent components to interact with the terminal.
 */
export interface TerminalViewHandle {
  /** Extract the full terminal buffer content as plain text (scrollback + visible). */
  getBufferContent: () => string;
  /** Focus the terminal. */
  focus: () => void;
}

/** Map backend AiMode to frontend AIProvider */
function mapAiMode(mode: AiMode): AIProvider {
  const map: Record<AiMode, AIProvider> = {
    Claude: "claude",
    Gemini: "gemini",
    Codex: "codex",
    Plain: "plain",
  };
  const provider = map[mode];
  if (!provider) {
    console.warn("Unknown AiMode:", mode);
    return "claude";
  }
  return provider;
}

/** Map backend SessionStatus to frontend SessionStatus */
function mapStatus(status: BackendSessionStatus): SessionStatus {
  const map: Record<BackendSessionStatus, SessionStatus> = {
    Starting: "starting",
    Idle: "idle",
    Working: "working",
    NeedsInput: "needs-input",
    Done: "done",
    Error: "error",
    Timeout: "timeout",
  };
  const mapped = map[status];
  if (!mapped) {
    console.warn("Unknown backend session status:", status);
    return "idle";
  }
  return mapped;
}

/** Map session status to CSS class for border/glow */
function cellStatusClass(status: SessionStatus): string {
  switch (status) {
    case "starting":
      return "terminal-cell-starting";
    case "working":
      return "terminal-cell-working";
    case "needs-input":
      return "terminal-cell-needs-input";
    case "done":
      return "terminal-cell-done";
    case "error":
      return "terminal-cell-error";
    default:
      return "terminal-cell-idle";
  }
}

/**
 * Renders a single xterm.js terminal bound to a backend PTY session.
 *
 * On mount: creates a Terminal instance with FitAddon (auto-resize) and WebLinksAddon
 * (clickable URLs), subscribes to the Tauri `pty-output-{sessionId}` event, and wires
 * xterm onData/onResize to the corresponding backend IPC calls. A ResizeObserver keeps
 * the terminal dimensions in sync when the container layout changes.
 *
 * On unmount: sets a `disposed` flag to prevent late PTY writes, disconnects the
 * ResizeObserver, disposes xterm listeners, unsubscribes the Tauri event listener
 * (even if the listener promise hasn't resolved yet), and destroys the Terminal.
 */
export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView(
  { sessionId, status = "idle", isFocused = false, onFocus, onKill, onHandoff },
  ref,
) {
  const isMobile = useIsMobile();

  const sessionConfig = useSessionStore((s) => s.sessions.find((sess) => sess.id === sessionId));
  const effectiveStatus = sessionConfig ? mapStatus(sessionConfig.status) : status;
  const effectiveProvider = sessionConfig ? mapAiMode(sessionConfig.mode) : "claude";
  const effectiveBranch = sessionConfig?.branch ?? "Current";
  const isWorktree = Boolean(sessionConfig?.worktree_path);
  const projectPath = sessionConfig?.project_path ?? "";

  // Get terminal settings from store
  const terminalSettings = useTerminalSettingsStore((s) => s.settings);
  const getEffectiveFontFamily = useTerminalSettingsStore((s) => s.getEffectiveFontFamily);

  // Get MCP count for this session (primitive values are stable, no reference issues)
  const mcpCount = useMcpStore((s) => {
    if (!projectPath) return 0;
    return s.getEnabledCount(projectPath, sessionId);
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);

  // Find widget state
  const [showFind, setShowFind] = useState(false);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getBufferContent: () => {
      const term = termRef.current;
      if (!term) return "";
      const buffer = term.buffer.active;
      const lines: string[] = [];
      // Include scrollback and visible content
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          lines.push(line.translateToString(true));
        }
      }
      // Trim trailing empty lines
      while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
      }
      return lines.join("\n");
    },
    focus: () => {
      termRef.current?.focus();
    },
  }), []);

  // Track user input for auto-title generation
  const inputBufferRef = useRef<string>("");
  const titleSetRef = useRef<boolean>(!!sessionConfig?.title);
  const updateSessionTitle = useSessionStore((s) => s.updateSessionTitle);

  // Sync titleSetRef if session already has a title
  if (sessionConfig?.title && !titleSetRef.current) {
    titleSetRef.current = true;
  }

  // Quick actions manager modal state
  const [showQuickActionsManager, setShowQuickActionsManager] = useState(false);

  // Local font size override for this terminal (allows per-terminal zoom)
  const [localFontSize, setLocalFontSize] = useState<number | null>(null);
  const effectiveFontSize = localFontSize ?? terminalSettings.fontSize;

  // Backend capabilities (for future enhanced features like terminal state queries)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_backendInfo, setBackendInfo] = useState<BackendInfo | null>(null);

  // Track app theme (dark/light) for terminal theming
  const [appTheme, setAppTheme] = useState<"dark" | "light">(() => {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  });

  // Track whether a mobile device is connected
  const [mobileConnected, setMobileConnected] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      invoke<{ connectedClients: number }>("get_web_access_status")
        .then((status) => { if (!cancelled) setMobileConnected(status.connectedClients > 0); })
        .catch(() => {});
    };
    check();
    const interval = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const handlePushToMobile = useCallback(() => {
    invoke("push_session_to_mobile", { sessionId }).catch((err) =>
      console.error("Failed to push session to mobile:", err)
    );
  }, [sessionId]);

  // Fetch backend info on mount (cached after first call)
  useEffect(() => {
    getBackendInfo()
      .then(setBackendInfo)
      .catch((err) => console.warn("Failed to get backend info:", err));
  }, []);

  // Watch for theme changes via MutationObserver
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "data-theme") {
          const newTheme = document.documentElement.getAttribute("data-theme");
          setAppTheme(newTheme === "light" ? "light" : "dark");
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Update terminal theme when appTheme changes
  useEffect(() => {
    if (termRef.current) {
      const theme = appTheme === "light" ? LIGHT_THEME : DEFAULT_THEME;
      termRef.current.options.theme = toXtermTheme(theme);
    }
  }, [appTheme]);

  // Update terminal font settings when they change
  useEffect(() => {
    if (termRef.current && fitAddonRef.current) {
      const effectiveFont = getEffectiveFontFamily();
      const fontFamily = buildFontFamily(effectiveFont);

      termRef.current.options.fontSize = effectiveFontSize;
      termRef.current.options.fontFamily = fontFamily;
      termRef.current.options.lineHeight = terminalSettings.lineHeight;

      // Refit terminal to recalculate cell dimensions
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
        } catch {
          // Ignore fit errors during transition
        }
      });
    }
  }, [effectiveFontSize, terminalSettings.fontFamily, terminalSettings.lineHeight, getEffectiveFontFamily]);

  // Terminal zoom is controlled only via header buttons (onZoomIn/onZoomOut/onZoomReset)
  // Keyboard shortcuts and mouse wheel zoom are disabled to prevent accidental zoom changes

  /**
   * Immediately removes the terminal from UI (optimistic update),
   * then kills the backend session in the background.
   */
  const handleKill = useCallback(
    (id: number) => {
      // Update UI immediately (optimistic)
      onKill(id);
      // Kill session in background - don't await
      killSession(id).catch((err) => {
        console.error("Failed to kill session:", err);
      });
    },
    [onKill],
  );

  /**
   * Handles quick action button clicks by writing the prompt to the terminal.
   */
  const handleQuickAction = useCallback(
    (prompt: string) => {
      writeStdin(sessionId, prompt + "\n").catch(console.error);
    },
    [sessionId],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Get current settings at initialization time (not reactive)
    const currentSettings = useTerminalSettingsStore.getState();
    const effectiveFont = currentSettings.getEffectiveFontFamily();
    let fontFamily = buildFontFamily(effectiveFont);

    let disposed = false;
    let term: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let unlisten: (() => void) | null = null;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeDisposable: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let fontLoadHandler: (() => void) | null = null;

    // Create status detector for this session with callback to update store
    // Always create the detector - it will update the session status regardless of projectPath
    console.log(`[TerminalView] Session ${sessionId}: Creating StatusDetector`);
    const statusDetector = new StatusDetector(sessionId, "", (detectedStatus) => {
      // Map detected status to backend status format
      const statusMap: Record<string, "Idle" | "Working" | "NeedsInput" | "Done" | "Error"> = {
        idle: "Idle",
        working: "Working",
        "needs-input": "NeedsInput",
        done: "Done",
        error: "Error",
      };
      const backendStatus = statusMap[detectedStatus];
      if (backendStatus) {
        console.log(`[TerminalView] Session ${sessionId}: Updating status to ${backendStatus}`);
        useSessionStore.getState().updateSessionStatus(sessionId, backendStatus);
      }
    });

    // Wait for font to load before initializing terminal
    const initTerminal = async () => {
      // Ensure all @font-face fonts (including embedded base64) are loaded
      await document.fonts.ready;
      const fontLoaded = await waitForFont(fontFamily, 2000);

      // If the preferred font didn't load in the browser (font-kit name mismatch),
      // fall back to the embedded JetBrains Mono which is always available via base64
      if (!fontLoaded) {
        console.warn(`Font "${fontFamily}" not available in browser, falling back to embedded font`);
        fontFamily = buildFontFamily(EMBEDDED_FONT);
      }

      if (disposed) return;

      const initialTheme = document.documentElement.getAttribute("data-theme") === "light" ? LIGHT_THEME : DEFAULT_THEME;
      term = new Terminal({
        cursorBlink: true,
        fontSize: currentSettings.settings.fontSize,
        fontFamily: fontFamily,
        lineHeight: currentSettings.settings.lineHeight,
        theme: toXtermTheme(initialTheme),
        allowProposedApi: true,
        scrollback: 10000,
        tabStopWidth: 8,
      });

      fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      const searchAddon = new SearchAddon();
      const unicode11Addon = new Unicode11Addon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.loadAddon(searchAddon);
      term.loadAddon(unicode11Addon);
      term.open(container);

      // Activate Unicode 11 for better emoji/CJK rendering
      term.unicode.activeVersion = "11";

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;

      requestAnimationFrame(() => {
        try {
          fitAddon?.fit();
        } catch {
          // Container may not be sized yet
        }
      });

      dataDisposable = term.onData((data) => {
        writeStdin(sessionId, data).catch(console.error);

        // Auto-title: capture first user message
        if (!titleSetRef.current) {
          // Check if Enter was pressed (submit)
          if (data === "\r" || data === "\n") {
            const input = inputBufferRef.current.trim();
            // Only set title if there's meaningful input (not empty, not just commands)
            if (input.length >= 5 && !input.startsWith("/") && !input.startsWith("!")) {
              // Extract short title (max 40 chars, first line)
              const firstLine = input.split("\n")[0];
              const title = firstLine.length > 40 ? `${firstLine.slice(0, 37)}…` : firstLine;
              updateSessionTitle(sessionId, title);
              titleSetRef.current = true;
            }
            inputBufferRef.current = "";
          } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
            // Accumulate printable characters
            inputBufferRef.current += data;
          } else if (data === "\x7f" || data === "\b") {
            // Handle backspace
            inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          }
        }
      });

      resizeDisposable = term.onResize(({ rows, cols }) => {
        resizePty(sessionId, rows, cols).catch(console.error);
      });

      // Handle special keyboard shortcuts
      term.attachCustomKeyEventHandler((event) => {
        // Shift+Enter: block BOTH keydown and keyup to prevent xterm from sending \r
        if (event.key === "Enter" && event.shiftKey) {
          if (event.type === "keydown") {
            if (term?.modes.bracketedPasteMode) {
              writeStdin(sessionId, "\x1b[200~\n\x1b[201~").catch(console.error);
            } else {
              writeStdin(sessionId, "\n").catch(console.error);
            }
          }
          return false; // Block both keydown AND keyup from xterm
        }

        if (event.type !== "keydown") return true;

        const mod = event.metaKey || event.ctrlKey;

        // Cmd/Ctrl+F: toggle find widget
        if (event.key === "f" && mod) {
          event.preventDefault();
          setShowFind((v) => !v);
          return false;
        }

        // Cmd/Ctrl+K: clear terminal
        if (event.key === "k" && mod) {
          event.preventDefault();
          term?.clear();
          return false;
        }

        // Cmd/Ctrl+V: let the browser handle paste natively.
        // xterm.js will receive the paste event and fire onData automatically.
        // Using navigator.clipboard.readText() shows a permission popup in Chromium webviews.

        // Escape: close find widget if open
        if (event.key === "Escape") {
          setShowFind((prev) => {
            if (prev) {
              searchAddon.clearDecorations();
              return false;
            }
            return prev;
          });
          // Always let Escape propagate to the terminal too
          return true;
        }

        // Cmd/Ctrl+C: copy selection to clipboard (if there's a selection)
        if (event.key === "c" && mod && term?.hasSelection()) {
          const selection = term.getSelection();
          navigator.clipboard.writeText(selection).catch(console.error);
          return false;
        }

        return true;
      });

      const listenerReady = onPtyOutput(sessionId, (data) => {
        if (!disposed && term) {
          term.write(data);
          // Feed output to status detector for automatic status detection
          statusDetector.processOutput(data);
        }
      });
      listenerReady
        .then((fn) => {
          if (disposed) {
            fn();
          } else {
            unlisten = fn;
          }
        })
        .catch((err) => {
          if (!disposed) {
            console.error("PTY listener failed:", err);
          }
        });

      // Listen for late font loads (e.g., @font-face still processing)
      // and re-render the terminal with correct character measurements
      fontLoadHandler = () => {
        if (!disposed && term && fitAddon) {
          const fa = fitAddon;
          term.options.fontFamily = fontFamily;
          requestAnimationFrame(() => {
            try {
              fa.fit();
            } catch {
              // Ignore fit errors during font reload
            }
          });
        }
      };
      document.fonts.addEventListener("loadingdone", fontLoadHandler);

      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (!disposed && fitAddon) {
            try {
              fitAddon.fit();
            } catch {
              // Container may have zero dimensions during layout transitions
            }
          }
        });
      });
      resizeObserver.observe(container);
    };

    initTerminal().catch((err) => {
      if (!disposed) {
        console.error("Failed to initialize terminal:", err);
      }
    });

    return () => {
      disposed = true;
      if (fontLoadHandler) {
        document.fonts.removeEventListener("loadingdone", fontLoadHandler);
      }
      resizeObserver?.disconnect();
      dataDisposable?.dispose();
      resizeDisposable?.dispose();
      statusDetector.dispose();
      if (unlisten) unlisten();
      term?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Font settings are read once at init, dynamic updates via separate effect
  }, [sessionId]);

  // Focus the terminal when isFocused becomes true
  useEffect(() => {
    if (isFocused && termRef.current) {
      termRef.current.focus();
    }
  }, [isFocused]);

  return (
    <div
      className={`terminal-cell flex h-full flex-col ${cellStatusClass(effectiveStatus)}`}
      style={{ backgroundColor: "#1e1e1e" }}
      onClick={onFocus}
    >
      {/* Rich header bar */}
      <TerminalHeader
        sessionId={sessionId}
        provider={effectiveProvider}
        status={effectiveStatus}
        statusMessage={sessionConfig?.statusMessage || sessionConfig?.needsInputPrompt}
        mcpCount={mcpCount}
        branchName={effectiveBranch}
        isWorktree={isWorktree}
        fontSize={effectiveFontSize}
        sessionTitle={sessionConfig?.title}
        onKill={handleKill}
        onHandoff={onHandoff ? () => onHandoff(sessionId) : undefined}
        onZoomIn={() => setLocalFontSize((prev) => Math.min(32, (prev ?? terminalSettings.fontSize) + 1))}
        onZoomOut={() => setLocalFontSize((prev) => Math.max(8, (prev ?? terminalSettings.fontSize) - 1))}
        onZoomReset={() => setLocalFontSize(null)}
        onPushToMobile={handlePushToMobile}
        mobileConnected={mobileConnected}
      />

      {/* xterm.js container with context menu */}
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div className="relative flex-1 overflow-hidden">
            {showFind && searchAddonRef.current && (
              <TerminalFindWidget
                searchAddon={searchAddonRef.current}
                onClose={() => setShowFind(false)}
              />
            )}
            <div ref={containerRef} className="h-full px-4 py-2" style={{ backgroundColor: "#1e1e1e" }} />
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className="min-w-[180px] overflow-hidden rounded-md border border-[#3c3c3c] bg-[#252526] p-1 shadow-xl"
          >
            <ContextMenu.Item
              className="flex cursor-default select-none items-center justify-between rounded-sm px-2 py-1.5 text-xs text-[#cccccc] outline-none data-[highlighted]:bg-[#094771] data-[highlighted]:text-white"
              onSelect={() => {
                const sel = termRef.current?.getSelection();
                if (sel) navigator.clipboard.writeText(sel).catch(console.error);
              }}
              disabled={!termRef.current?.hasSelection()}
            >
              Copy
              <span className="ml-4 text-[10px] text-[#777]">{navigator.platform.includes("Mac") ? "⌘C" : "Ctrl+C"}</span>
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-default select-none items-center justify-between rounded-sm px-2 py-1.5 text-xs text-[#cccccc] outline-none data-[highlighted]:bg-[#094771] data-[highlighted]:text-white"
              onSelect={() => {
                navigator.clipboard.readText().then((text) => {
                  if (text) writeStdin(sessionId, text).catch(console.error);
                }).catch(console.error);
              }}
            >
              Paste
              <span className="ml-4 text-[10px] text-[#777]">{navigator.platform.includes("Mac") ? "⌘V" : "Ctrl+V"}</span>
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-default select-none items-center justify-between rounded-sm px-2 py-1.5 text-xs text-[#cccccc] outline-none data-[highlighted]:bg-[#094771] data-[highlighted]:text-white"
              onSelect={() => termRef.current?.selectAll()}
            >
              Select All
              <span className="ml-4 text-[10px] text-[#777]">{navigator.platform.includes("Mac") ? "⌘A" : "Ctrl+A"}</span>
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-default select-none items-center justify-between rounded-sm px-2 py-1.5 text-xs text-[#cccccc] outline-none data-[highlighted]:bg-[#094771] data-[highlighted]:text-white"
              onSelect={() => setShowFind(true)}
            >
              Find
              <span className="ml-4 text-[10px] text-[#777]">{navigator.platform.includes("Mac") ? "⌘F" : "Ctrl+F"}</span>
            </ContextMenu.Item>
            <ContextMenu.Separator className="my-1 h-px bg-[#3c3c3c]" />
            <ContextMenu.Item
              className="flex cursor-default select-none items-center justify-between rounded-sm px-2 py-1.5 text-xs text-[#cccccc] outline-none data-[highlighted]:bg-[#094771] data-[highlighted]:text-white"
              onSelect={() => termRef.current?.clear()}
            >
              Clear Terminal
              <span className="ml-4 text-[10px] text-[#777]">{navigator.platform.includes("Mac") ? "⌘K" : "Ctrl+K"}</span>
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-default select-none items-center justify-between rounded-sm px-2 py-1.5 text-xs text-[#cccccc] outline-none data-[highlighted]:bg-[#094771] data-[highlighted]:text-red-400"
              onSelect={() => handleKill(sessionId)}
            >
              Kill Session
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {/* Quick action pills */}
      <QuickActionPills
        onAction={handleQuickAction}
        onManageClick={() => setShowQuickActionsManager(true)}
      />

      {/* Quick actions manager modal */}
      {showQuickActionsManager && (
        <QuickActionsManager onClose={() => setShowQuickActionsManager(false)} />
      )}

      {/* Mobile special keys bar */}
      {isMobile && <TerminalSpecialKeys sessionId={sessionId} />}
    </div>
  );
});
