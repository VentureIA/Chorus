/**
 * Watches Claude Code debug logs to detect session status changes.
 *
 * Claude Code writes debug logs to ~/.claude/debug/{session-id}.txt
 * The file ~/.claude/debug/latest is a symlink to the current session's debug file.
 *
 * By monitoring this file for specific patterns, we can detect:
 * - Tool calls (working state)
 * - Idle periods
 * - Notifications (needs input)
 */

import { homeDir } from "@tauri-apps/api/path";
import { readTextFile, watchImmediate, type DebouncedWatchOptions } from "@tauri-apps/plugin-fs";

export type ClaudeState = "idle" | "working" | "needs_input" | "error";

export interface ClaudeDebugWatcher {
  start(): Promise<void>;
  stop(): void;
  getState(): ClaudeState;
}

// Patterns in debug logs that indicate Claude is working
const WORKING_PATTERNS = [
  /executePreToolHooks called for tool:/,
  /\[API:request\] Creating client/,
  /Stream started/,
  /Tool search/,
];

// Patterns that indicate idle state
const IDLE_PATTERNS = [
  /Forked agent.*finished/,
  /Hook.*success/,
];

/**
 * Creates a watcher that monitors Claude Code's debug log file
 * and reports state changes via callback.
 */
export async function createClaudeDebugWatcher(
  onStateChange: (state: ClaudeState) => void
): Promise<ClaudeDebugWatcher> {
  const home = await homeDir();
  const debugPath = `${home}.claude/debug/latest`;

  let currentState: ClaudeState = "idle";
  let lastActivityTime = Date.now();
  let stopWatching: (() => void) | null = null;
  let idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  let lastFileSize = 0;

  const checkForStateChange = async () => {
    try {
      const content = await readTextFile(debugPath);
      const newContent = content.slice(lastFileSize);
      lastFileSize = content.length;

      if (newContent.length === 0) return;

      // Check for working patterns
      for (const pattern of WORKING_PATTERNS) {
        if (pattern.test(newContent)) {
          lastActivityTime = Date.now();
          if (currentState !== "working") {
            currentState = "working";
            onStateChange("working");
          }
          return;
        }
      }

      // Check for idle patterns
      for (const pattern of IDLE_PATTERNS) {
        if (pattern.test(newContent)) {
          // Don't immediately go idle, wait for idle check
          return;
        }
      }
    } catch (err) {
      // File might not exist or be inaccessible
      console.debug("[ClaudeDebugWatcher] Error reading debug file:", err);
    }
  };

  // Check if we've been inactive for a while
  const checkIdle = () => {
    const idleThreshold = 3000; // 3 seconds
    if (currentState === "working" && Date.now() - lastActivityTime > idleThreshold) {
      currentState = "idle";
      onStateChange("idle");
    }
  };

  return {
    async start() {
      try {
        // Initial read to get current file size
        const content = await readTextFile(debugPath);
        lastFileSize = content.length;
      } catch {
        // File doesn't exist yet
        lastFileSize = 0;
      }

      // Watch for file changes
      const options: DebouncedWatchOptions = {
        delayMs: 100,
      };

      stopWatching = await watchImmediate(
        debugPath,
        async (event) => {
          if (event.type === "modify" || event.type === "create") {
            await checkForStateChange();
          }
        },
        options
      ) as unknown as () => void;

      // Periodic idle check
      idleCheckInterval = setInterval(checkIdle, 1000);
    },

    stop() {
      if (stopWatching) {
        stopWatching();
        stopWatching = null;
      }
      if (idleCheckInterval) {
        clearInterval(idleCheckInterval);
        idleCheckInterval = null;
      }
    },

    getState() {
      return currentState;
    },
  };
}
