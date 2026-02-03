import {
  ArrowRightFromLine,
  BrainCircuit,
  CheckCircle,
  ChevronDown,
  Code2,
  GitBranch,
  GitCompareArrows,
  Minus,
  Plus,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";

export type SessionStatus = "idle" | "starting" | "working" | "needs-input" | "done" | "error" | "timeout";

export type AIProvider = "claude" | "gemini" | "codex" | "plain";

interface TerminalHeaderProps {
  sessionId: number;
  provider?: AIProvider;
  status?: SessionStatus;
  mcpCount?: number;
  activeCount?: number;
  statusMessage?: string;
  branchName?: string;
  showLaunch?: boolean;
  isWorktree?: boolean;
  fontSize?: number;
  /** Auto-generated title from first user message. */
  sessionTitle?: string;
  onKill: (sessionId: number) => void;
  onHandoff?: () => void;
  onLaunch?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
}

const STATUS_COLOR: Record<SessionStatus, string> = {
  idle: "text-chorus-muted",
  starting: "text-chorus-orange",
  working: "text-chorus-accent",
  "needs-input": "text-chorus-yellow",
  done: "text-chorus-green",
  error: "text-chorus-red",
  timeout: "text-chorus-red",
};

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: "Idle",
  starting: "Starting...",
  working: "Working",
  "needs-input": "Needs Input",
  done: "Done",
  error: "Error",
  timeout: "Startup Timeout",
};

const providerConfig: Record<AIProvider, { icon: typeof BrainCircuit; label: string }> = {
  claude: { icon: BrainCircuit, label: "Claude Code" },
  gemini: { icon: Sparkles, label: "Gemini CLI" },
  codex: { icon: Code2, label: "Codex" },
  plain: { icon: Terminal, label: "Terminal" },
};

export function TerminalHeader({
  sessionId,
  provider = "claude",
  status = "idle",
  mcpCount = 1,
  activeCount = 0,
  statusMessage,
  branchName = "Current",
  showLaunch = false,
  isWorktree = false,
  fontSize,
  sessionTitle,
  onKill,
  onHandoff,
  onLaunch,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: TerminalHeaderProps) {
  const { icon: ProviderIcon, label: providerLabel } = providerConfig[provider];
  const displayTitle = sessionTitle || `${providerLabel} #${sessionId}`;

  return (
    <div className="no-select flex h-7 shrink-0 items-center gap-1.5 border-b border-chorus-border bg-chorus-surface px-2">
      {/* Left cluster */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {/* AI provider icon + dropdown */}
        <button
          type="button"
          aria-label="Select AI provider"
          aria-disabled="true"
          title="Provider selection not yet available"
          className="flex shrink-0 items-center gap-0.5 text-chorus-muted hover:text-chorus-text"
        >
          <ProviderIcon
            size={18}
            strokeWidth={1.5}
            className="text-violet-500 drop-shadow-[0_0_4px_rgba(139,92,246,0.5)]"
          />
          <ChevronDown size={9} className="text-chorus-muted/60" />
        </button>

        {/* Session label (auto-generated title or fallback) */}
        <span
          className="shrink-0 max-w-[200px] truncate text-[11px] font-medium text-chorus-text"
          title={displayTitle}
        >
          {displayTitle}
        </span>

        {/* MCP badge */}
        <span className="shrink-0 rounded-full bg-chorus-accent/15 px-1.5 py-px text-[9px] font-medium text-chorus-accent">
          {mcpCount} MCP
        </span>

        {/* Terminal count badge */}
        {/* TODO: Replace hardcoded "1" with actual terminal count prop */}
        <span className="shrink-0 rounded-full bg-chorus-muted/10 px-1.5 py-px text-[9px] font-medium text-chorus-muted">
          1
        </span>

        {/* Blue checkmark (verified/ready) */}
        <CheckCircle size={11} className="shrink-0 text-chorus-accent" />

        {/* Active count */}
        <span
          className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium ${
            activeCount > 0
              ? "bg-chorus-orange/15 text-chorus-orange"
              : "bg-chorus-muted/10 text-chorus-muted"
          }`}
        >
          {activeCount} Active
        </span>

        {/* Git arrows + change count */}
        {/* TODO: Replace hardcoded "0" with actual git change count prop */}
        <span className="flex shrink-0 items-center gap-0.5 text-chorus-muted">
          <GitCompareArrows size={11} />
          <span className="text-[9px]">0</span>
        </span>

        {/* Truncated status message */}
        {statusMessage && (
          <span className="min-w-0 truncate text-[10px] text-chorus-muted">{statusMessage}</span>
        )}
      </div>

      {/* Right cluster */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Branch display - static when on worktree, button otherwise */}
        {isWorktree ? (
          <span
            className="flex items-center gap-0.5 px-1 py-0.5 text-[10px] text-chorus-muted"
            title={`Worktree branch: ${branchName}`}
          >
            <GitBranch size={10} />
            <span className="max-w-[60px] truncate">{branchName}</span>
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Select branch, current: ${branchName || "none"}`}
            aria-disabled="true"
            title="Branch selection not yet available"
            className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-chorus-muted transition-colors hover:bg-chorus-card hover:text-chorus-text"
          >
            <GitBranch size={10} />
            <span className="max-w-[60px] truncate">{branchName}</span>
            <ChevronDown size={9} />
          </button>
        )}

        {/* Launch button (pre-launch only) */}
        {showLaunch && (
          <button
            type="button"
            onClick={() => onLaunch?.()}
            className="rounded bg-chorus-green px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-chorus-green/80"
          >
            Launch
          </button>
        )}

        {/* Status indicator */}
        <span className={`text-[10px] font-medium ${STATUS_COLOR[status]}`}>
          {STATUS_LABEL[status]}
        </span>

        {/* Zoom controls */}
        {onZoomOut && onZoomIn && (
          <div className="flex items-center gap-0.5 border-l border-chorus-border pl-1 ml-1">
            <button
              type="button"
              onClick={onZoomOut}
              className="rounded p-0.5 text-chorus-muted transition-colors hover:bg-chorus-card hover:text-chorus-text"
              title="Zoom out (Cmd+-)"
              aria-label="Zoom out"
            >
              <Minus size={11} />
            </button>
            {fontSize && (
              <button
                type="button"
                onClick={onZoomReset}
                className="min-w-[28px] rounded px-1 py-0.5 text-[9px] font-medium text-chorus-muted transition-colors hover:bg-chorus-card hover:text-chorus-text"
                title="Reset zoom (Cmd+0)"
              >
                {fontSize}px
              </button>
            )}
            <button
              type="button"
              onClick={onZoomIn}
              className="rounded p-0.5 text-chorus-muted transition-colors hover:bg-chorus-card hover:text-chorus-text"
              title="Zoom in (Cmd++)"
              aria-label="Zoom in"
            >
              <Plus size={11} />
            </button>
          </div>
        )}

        {/* Handoff button - transfer context to new session */}
        {onHandoff && status !== "starting" && status !== "done" && (
          <button
            type="button"
            onClick={onHandoff}
            className="rounded p-0.5 text-chorus-muted transition-colors hover:bg-chorus-card hover:text-chorus-accent"
            title="Handoff to new session (Cmd+Shift+H)"
            aria-label="Handoff session context to new session"
          >
            <ArrowRightFromLine size={11} />
          </button>
        )}

        {/* Close button */}
        <button
          type="button"
          onClick={() => onKill(sessionId)}
          className="rounded p-0.5 text-chorus-muted transition-colors hover:bg-chorus-card hover:text-chorus-red"
          title="Kill session"
          aria-label={`Kill session ${sessionId}`}
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}
