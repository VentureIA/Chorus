/**
 * Detects Claude Code session status by parsing terminal output.
 *
 * Claude Code displays various visual indicators:
 * - Spinners (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) when working
 * - "Thinking...", "Working...", "Reading...", etc. status messages
 * - Tool use indicators like "[Read]", "[Write]", "[Bash]"
 * - The prompt ">" or "❯" when idle/waiting for input
 */

// Enable debug logging (set to false in production)
const DEBUG_STATUS_DETECTOR = false;

// Patterns that indicate Claude is working
const WORKING_PATTERNS = [
  /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/, // Braille spinners
  /[●·•]\s*\w+/i, // Bullet/dot with text (●, · middle dot, • bullet)
  /\[.*?(Read|Write|Edit|Bash|Glob|Grep|Task|WebFetch|WebSearch).*?\]/i,
  /Analyzing|Processing|Generating|Executing/i,
  /Claude is working/i,
  /Tool call:/i, // Claude Code shows "Tool call: ..." when calling tools
  /running\s+(stop\s+)?hooks/i, // "running hooks...", "running stop hooks..."
  /Searched for \d+ pattern/i, // "Searched for 1 pattern"
  /\w+ing\.\.\./i, // Any word ending in "ing..." like "Garnishing...", "Loading..."
];

// Patterns that indicate Claude needs input (waiting at a prompt)
const NEEDS_INPUT_PATTERNS = [
  /\?\s*\(y\/n\)/i, // Yes/no question
  /\?\s*\(Y\/n\)/i, // Yes/no with capital
  /Enter your choice/i,
  /Press Enter to continue/i,
  /Would you like to/i,
  /Do you want to/i,
  /Select an option/i,
  /\[1\].*\[2\]/s, // Multiple numbered options
];

// Patterns that indicate Claude is done
const DONE_PATTERNS = [
  /✓\s*(Done|Complete|Finished|Success)/i,
  /Task completed/i,
];

// Patterns that indicate an error
const ERROR_PATTERNS = [
  /✗\s*Error/i,
  /Error:|Exception:|Failed:/i,
  /panic!|PANIC/,
];

export type DetectedStatus = "idle" | "working" | "needs-input" | "done" | "error";

/**
 * Analyzes terminal output to detect the current status.
 *
 * @param output - Recent terminal output (last few lines)
 * @returns Detected status
 */
export function detectStatusFromOutput(output: string): DetectedStatus {
  // Check last 500 characters for recent indicators
  const recentOutput = output.slice(-500);

  // Check for error patterns first (highest priority)
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(recentOutput)) {
      return "error";
    }
  }

  // Check for done patterns
  for (const pattern of DONE_PATTERNS) {
    if (pattern.test(recentOutput)) {
      return "done";
    }
  }

  // Check for working patterns (spinners, status messages)
  for (const pattern of WORKING_PATTERNS) {
    if (pattern.test(recentOutput)) {
      return "working";
    }
  }

  // Check for needs input patterns (prompts)
  for (const pattern of NEEDS_INPUT_PATTERNS) {
    if (pattern.test(recentOutput)) {
      return "needs-input";
    }
  }

  // Default to idle if nothing detected
  return "idle";
}

/**
 * Callback type for status change notifications.
 */
export type StatusChangeCallback = (status: DetectedStatus) => void;

/**
 * Creates a status detector that tracks terminal output and reports status changes.
 */
export class StatusDetector {
  private lastStatus: DetectedStatus = "idle";
  private outputBuffer: string = "";
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private onStatusChange?: StatusChangeCallback;
  private sessionId: number;

  constructor(sessionId: number, _projectPath: string, onStatusChange?: StatusChangeCallback) {
    this.sessionId = sessionId;
    this.onStatusChange = onStatusChange;
    if (DEBUG_STATUS_DETECTOR) {
      console.log(`[StatusDetector] Created for session ${sessionId}`);
    }
  }

  /**
   * Process new terminal output and detect status changes.
   */
  processOutput(data: string): void {
    // Log raw data for debugging (first 200 chars, escape special chars)
    if (DEBUG_STATUS_DETECTOR && data.length > 0) {
      const escaped = data.slice(0, 200).replace(/\x1b\[[0-9;]*m/g, "[ESC]").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
      console.log(`[StatusDetector] Session ${this.sessionId}: Received ${data.length} chars: "${escaped}"`);
    }

    // Append to buffer (keep last 2000 chars)
    this.outputBuffer += data;
    if (this.outputBuffer.length > 2000) {
      this.outputBuffer = this.outputBuffer.slice(-2000);
    }

    // Quick check for working indicators (skip debounce for faster feedback)
    const hasSpinner = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(data);
    const hasWorkingText = /[●·•]\s*\w+|\w+ing\.\.\./i.test(data);

    if ((hasSpinner || hasWorkingText) && this.lastStatus !== "working") {
      if (DEBUG_STATUS_DETECTOR) {
        console.log(`[StatusDetector] Session ${this.sessionId}: Quick detect -> working (spinner=${hasSpinner}, text=${hasWorkingText})`);
      }
      this.lastStatus = "working";
      this.onStatusChange?.("working");
      return;
    }

    // Debounce status detection for other patterns
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.checkStatus();
    }, 100);
  }

  private checkStatus(): void {
    const newStatus = detectStatusFromOutput(this.outputBuffer);

    if (newStatus !== this.lastStatus) {
      if (DEBUG_STATUS_DETECTOR) {
        console.log(`[StatusDetector] Session ${this.sessionId}: ${this.lastStatus} -> ${newStatus}`);
        // Log last 100 chars of buffer for debugging
        const debugSnippet = this.outputBuffer.slice(-100).replace(/\n/g, "\\n");
        console.log(`[StatusDetector] Recent output: "${debugSnippet}"`);
      }
      this.lastStatus = newStatus;
      this.onStatusChange?.(newStatus);
    }
  }

  /**
   * Get the current detected status.
   */
  getStatus(): DetectedStatus {
    return this.lastStatus;
  }

  /**
   * Clean up the detector.
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}
