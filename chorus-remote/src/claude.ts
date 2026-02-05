import { spawn, type ChildProcess } from "node:child_process";

export interface StreamEvent {
  type: "progress" | "tool" | "text" | "result" | "error";
  content: string;
  sessionId?: string;
  cost?: number;
  duration?: number;
}

export interface ClaudeSession {
  process: ChildProcess;
  sessionId?: string;
  aborted: boolean;
}

const activeSessions = new Map<number, ClaudeSession>();

export function getActiveSession(chatId: number): ClaudeSession | undefined {
  return activeSessions.get(chatId);
}

export function cancelSession(chatId: number): boolean {
  const session = activeSessions.get(chatId);
  if (session && !session.aborted) {
    session.aborted = true;
    session.process.kill("SIGTERM");
    setTimeout(() => {
      if (!session.process.killed) session.process.kill("SIGKILL");
    }, 3000);
    activeSessions.delete(chatId);
    return true;
  }
  return false;
}

export async function runClaude(
  chatId: number,
  prompt: string,
  cwd: string,
  onEvent: (event: StreamEvent) => void,
  resumeSessionId?: string,
  maxTime = 300
): Promise<void> {
  // Kill any existing session for this chat
  cancelSession(chatId);

  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
  ];

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("claude", args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const session: ClaudeSession = { process: proc, aborted: false };
    activeSessions.set(chatId, session);

    const timeout = setTimeout(() => {
      session.aborted = true;
      proc.kill("SIGTERM");
      onEvent({ type: "error", content: "Timeout — execution exceeded " + maxTime + "s" });
    }, maxTime * 1000);

    let buffer = "";
    let lastToolName = "";

    proc.stdout!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          handleStreamEvent(event, onEvent, session, () => lastToolName, (t) => { lastToolName = t; });
        } catch {
          // Not JSON, skip
        }
      }
    });

    let stderrBuf = "";
    proc.stderr!.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      activeSessions.delete(chatId);

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          handleStreamEvent(event, onEvent, session, () => lastToolName, (t) => { lastToolName = t; });
        } catch {
          // ignore
        }
      }

      if (session.aborted) {
        resolve();
        return;
      }

      if (code !== 0 && stderrBuf.trim()) {
        onEvent({ type: "error", content: stderrBuf.trim().slice(-1000) });
      }

      resolve();
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      activeSessions.delete(chatId);
      onEvent({ type: "error", content: "Failed to start claude: " + err.message });
      reject(err);
    });
  });
}

function handleStreamEvent(
  event: Record<string, unknown>,
  onEvent: (e: StreamEvent) => void,
  session: ClaudeSession,
  getLastTool: () => string,
  setLastTool: (t: string) => void,
) {
  // System init
  if (event.type === "system" && event.subtype === "init") {
    const sid = event.session_id as string | undefined;
    if (sid) session.sessionId = sid;
    onEvent({ type: "progress", content: "Session started", sessionId: sid });
    return;
  }

  // Assistant text message
  if (event.type === "assistant") {
    const msg = event.message as Record<string, unknown> | undefined;
    if (msg?.content && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          onEvent({ type: "text", content: b.text, sessionId: session.sessionId });
        }
        if (b.type === "tool_use") {
          const name = b.name as string;
          setLastTool(name);
          const input = b.input as Record<string, unknown> | undefined;
          const detail = getToolDetail(name, input);
          onEvent({ type: "tool", content: detail });
        }
      }
    }
    return;
  }

  // Tool result
  if (event.type === "tool_result" || (event.type === "user" && event.subtype === "tool_result")) {
    // We don't forward raw tool results (too verbose)
    return;
  }

  // Final result
  if (event.type === "result") {
    onEvent({
      type: "result",
      content: (event.result as string) || "",
      sessionId: session.sessionId || (event.session_id as string),
      cost: event.cost_usd as number | undefined,
      duration: event.duration_ms as number | undefined,
    });
    return;
  }
}

function getToolDetail(name: string, input?: Record<string, unknown>): string {
  const icons: Record<string, string> = {
    Read: "\u{1F4D6}",
    Edit: "\u{270F}\u{FE0F}",
    Write: "\u{1F4DD}",
    Bash: "\u{1F4BB}",
    Glob: "\u{1F50D}",
    Grep: "\u{1F50E}",
    Task: "\u{1F916}",
    WebSearch: "\u{1F310}",
    WebFetch: "\u{1F310}",
  };

  const icon = icons[name] || "\u{1F527}";

  if (!input) return `${icon} ${name}`;

  switch (name) {
    case "Read":
      return `${icon} Reading ${shortPath(input.file_path as string)}`;
    case "Edit":
      return `${icon} Editing ${shortPath(input.file_path as string)}`;
    case "Write":
      return `${icon} Writing ${shortPath(input.file_path as string)}`;
    case "Bash":
      return `${icon} Running: ${truncate(input.command as string, 60)}`;
    case "Glob":
      return `${icon} Searching: ${input.pattern}`;
    case "Grep":
      return `${icon} Grep: ${truncate(input.pattern as string, 40)}`;
    case "Task":
      return `${icon} Spawning agent: ${truncate(input.description as string, 50)}`;
    default:
      return `${icon} ${name}`;
  }
}

function shortPath(p?: string): string {
  if (!p) return "...";
  const parts = p.split("/");
  return parts.length > 3 ? ".../" + parts.slice(-2).join("/") : p;
}

function truncate(s: string | undefined, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "..." : s;
}
