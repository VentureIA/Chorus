import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  File,
  FileMinus,
  FilePlus,
  FileQuestion,
  GitCommit,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGitStore, type FileChangeStatus } from "@/stores/useGitStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import type { WorkingChange } from "@/lib/git";
import { toast } from "sonner";

const cardClass =
  "rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md";

interface GitChangesSectionProps {
  onPushComplete?: () => void;
}

/** Maps file status to icon component. */
function getStatusIcon(status: FileChangeStatus | null) {
  switch (status) {
    case "added":
      return <FilePlus size={12} className="text-green-500" />;
    case "modified":
      return <Circle size={12} className="text-yellow-500 fill-yellow-500" />;
    case "deleted":
      return <FileMinus size={12} className="text-red-500" />;
    case "renamed":
      return <File size={12} className="text-blue-500" />;
    case "copied":
      return <File size={12} className="text-purple-500" />;
    case "unknown":
      return <FileQuestion size={12} className="text-muted-foreground" />;
    default:
      return <Circle size={12} className="text-muted-foreground" />;
  }
}

/** Maps file status to display label. */
function getStatusLabel(status: FileChangeStatus | null): string {
  switch (status) {
    case "added":
      return "A";
    case "modified":
      return "M";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    case "unknown":
      return "?";
    default:
      return "";
  }
}

interface FileRowProps {
  change: WorkingChange;
  isStaged: boolean;
  onToggle: () => void;
  onDiscard: () => void;
}

function FileRow({ change, isStaged, onToggle, onDiscard }: FileRowProps) {
  const status = isStaged ? change.index_status : change.worktree_status;
  const filename = change.path.split("/").pop() || change.path;
  const directory = change.path.includes("/")
    ? change.path.substring(0, change.path.lastIndexOf("/"))
    : "";

  return (
    <div className="group flex items-center gap-1.5 py-0.5 px-1 hover:bg-muted/30 rounded text-xs">
      <button
        type="button"
        onClick={onToggle}
        className="flex-shrink-0 w-4 h-4 rounded border border-border flex items-center justify-center hover:bg-muted/50"
        title={isStaged ? "Unstage file" : "Stage file"}
      >
        {isStaged && <Check size={10} className="text-green-500" />}
      </button>
      <span className="flex-shrink-0 w-4 text-[10px] font-mono font-medium text-center">
        {getStatusLabel(status)}
      </span>
      {getStatusIcon(status)}
      <span className="truncate flex-1 text-foreground" title={change.path}>
        {filename}
        {directory && (
          <span className="text-muted-foreground ml-1 text-[10px]">{directory}</span>
        )}
      </span>
      <button
        type="button"
        onClick={onDiscard}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-opacity"
        title="Discard changes"
      >
        <RotateCcw size={10} />
      </button>
    </div>
  );
}

export function GitChangesSection({ onPushComplete }: GitChangesSectionProps) {
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [untrackedExpanded, setUntrackedExpanded] = useState(true);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [showPushButton, setShowPushButton] = useState(false);

  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.active);
  const repoPath = activeTab?.projectPath ?? "";

  const {
    workingChanges,
    isLoadingChanges,
    fetchWorkingChanges,
    stageFiles,
    unstageFiles,
    discardFiles,
    commitChanges,
    pushChanges,
  } = useGitStore();

  // Fetch working changes on mount and poll every 3s to stay in sync
  // with external changes (terminal commits, CLI tools, etc.)
  useEffect(() => {
    if (!repoPath) return;
    fetchWorkingChanges(repoPath);
    const interval = setInterval(() => {
      fetchWorkingChanges(repoPath, true);
    }, 15000);
    return () => clearInterval(interval);
  }, [repoPath, fetchWorkingChanges]);

  // Categorize changes
  const { staged, unstaged, untracked } = useMemo(() => {
    const staged: WorkingChange[] = [];
    const unstaged: WorkingChange[] = [];
    const untracked: WorkingChange[] = [];

    for (const change of workingChanges) {
      // Untracked files (both index and worktree are "unknown")
      if (change.index_status === "unknown" && change.worktree_status === "unknown") {
        untracked.push(change);
      } else {
        // Files with index changes are staged
        if (change.index_status) {
          staged.push(change);
        }
        // Files with worktree changes are unstaged
        if (change.worktree_status && change.worktree_status !== "unknown") {
          unstaged.push(change);
        }
      }
    }

    return { staged, unstaged, untracked };
  }, [workingChanges]);

  const totalChanges = staged.length + unstaged.length + untracked.length;

  const handleRefresh = useCallback(() => {
    if (repoPath) {
      fetchWorkingChanges(repoPath);
    }
  }, [repoPath, fetchWorkingChanges]);

  const handleStageFile = useCallback(
    async (path: string) => {
      if (!repoPath) return;
      try {
        await stageFiles(repoPath, [path]);
      } catch (err) {
        toast.error(`Failed to stage file: ${err}`);
      }
    },
    [repoPath, stageFiles]
  );

  const handleUnstageFile = useCallback(
    async (path: string) => {
      if (!repoPath) return;
      try {
        await unstageFiles(repoPath, [path]);
      } catch (err) {
        toast.error(`Failed to unstage file: ${err}`);
      }
    },
    [repoPath, unstageFiles]
  );

  const handleDiscardFile = useCallback(
    async (path: string, isUntracked: boolean) => {
      if (!repoPath) return;
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const confirmed = await ask(
        `Are you sure you want to discard changes to "${path}"? This cannot be undone.`,
        { title: "Discard Changes", kind: "warning" }
      );
      if (!confirmed) return;
      try {
        await discardFiles(repoPath, [path], isUntracked);
        toast.success("Changes discarded");
      } catch (err) {
        toast.error(`Failed to discard changes: ${err}`);
      }
    },
    [repoPath, discardFiles]
  );

  const handleStageAll = useCallback(async () => {
    if (!repoPath) return;
    const paths = [...unstaged, ...untracked].map((c) => c.path);
    if (paths.length === 0) return;
    try {
      await stageFiles(repoPath, paths);
    } catch (err) {
      toast.error(`Failed to stage files: ${err}`);
    }
  }, [repoPath, unstaged, untracked, stageFiles]);

  const handleUnstageAll = useCallback(async () => {
    if (!repoPath) return;
    const paths = staged.map((c) => c.path);
    if (paths.length === 0) return;
    try {
      await unstageFiles(repoPath, paths);
    } catch (err) {
      toast.error(`Failed to unstage files: ${err}`);
    }
  }, [repoPath, staged, unstageFiles]);

  const handleCommit = useCallback(async () => {
    if (!repoPath || !commitMessage.trim() || staged.length === 0) return;
    setIsCommitting(true);
    try {
      await commitChanges(repoPath, commitMessage.trim());
      setCommitMessage("");
      setShowPushButton(true);
      toast.success("Changes committed successfully");
    } catch (err) {
      toast.error(`Failed to commit: ${err}`);
    } finally {
      setIsCommitting(false);
    }
  }, [repoPath, commitMessage, staged.length, commitChanges]);

  const handlePush = useCallback(async () => {
    if (!repoPath) return;
    setIsPushing(true);
    try {
      await pushChanges(repoPath, undefined, undefined, true);
      setShowPushButton(false);
      toast.success("Changes pushed successfully");
      onPushComplete?.();
    } catch (err) {
      toast.error(`Failed to push: ${err}`);
    } finally {
      setIsPushing(false);
    }
  }, [repoPath, pushChanges, onPushComplete]);

  if (!repoPath) {
    return (
      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <GitCommit size={13} className="text-muted-foreground/80" />
          <span>Changes</span>
        </div>
        <div className="px-1 py-1 text-xs text-muted-foreground">No project selected</div>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <GitCommit size={13} className="text-orange-500" />
        <span>Changes</span>
        {totalChanges > 0 && (
          <span className="ml-auto bg-orange-500/20 text-orange-500 px-1.5 py-0.5 rounded text-[10px] font-medium">
            {totalChanges}
          </span>
        )}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoadingChanges}
          className="p-0.5 rounded hover:bg-muted/40 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw
            size={12}
            className={`text-muted-foreground ${isLoadingChanges ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {isLoadingChanges && workingChanges.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : totalChanges === 0 ? (
        <div className="px-1 py-2 text-xs text-muted-foreground text-center">
          No uncommitted changes
        </div>
      ) : (
        <div className="space-y-2">
          {/* Staged Changes */}
          {staged.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setStagedExpanded(!stagedExpanded)}
                className="flex items-center gap-1 w-full text-left text-[11px] font-medium text-green-500 hover:text-green-400 py-0.5"
              >
                {stagedExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Staged Changes</span>
                <span className="ml-auto text-[10px] opacity-70">{staged.length}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnstageAll();
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-muted/40 text-[10px]"
                  title="Unstage all"
                >
                  −
                </button>
              </button>
              {stagedExpanded && (
                <div className="mt-1 border-l-2 border-green-500/30 pl-1">
                  {staged.map((change) => (
                    <FileRow
                      key={`staged-${change.path}`}
                      change={change}
                      isStaged={true}
                      onToggle={() => handleUnstageFile(change.path)}
                      onDiscard={() => handleDiscardFile(change.path, false)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Unstaged Changes */}
          {unstaged.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setChangesExpanded(!changesExpanded)}
                className="flex items-center gap-1 w-full text-left text-[11px] font-medium text-yellow-500 hover:text-yellow-400 py-0.5"
              >
                {changesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Changes</span>
                <span className="ml-auto text-[10px] opacity-70">{unstaged.length}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStageAll();
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-muted/40 text-[10px]"
                  title="Stage all"
                >
                  +
                </button>
              </button>
              {changesExpanded && (
                <div className="mt-1 border-l-2 border-yellow-500/30 pl-1">
                  {unstaged.map((change) => (
                    <FileRow
                      key={`unstaged-${change.path}`}
                      change={change}
                      isStaged={false}
                      onToggle={() => handleStageFile(change.path)}
                      onDiscard={() => handleDiscardFile(change.path, false)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Untracked Files */}
          {untracked.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setUntrackedExpanded(!untrackedExpanded)}
                className="flex items-center gap-1 w-full text-left text-[11px] font-medium text-muted-foreground hover:text-foreground py-0.5"
              >
                {untrackedExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Untracked Files</span>
                <span className="ml-auto text-[10px] opacity-70">{untracked.length}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStageAll();
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-muted/40 text-[10px]"
                  title="Stage all"
                >
                  +
                </button>
              </button>
              {untrackedExpanded && (
                <div className="mt-1 border-l-2 border-muted/30 pl-1">
                  {untracked.map((change) => (
                    <FileRow
                      key={`untracked-${change.path}`}
                      change={change}
                      isStaged={false}
                      onToggle={() => handleStageFile(change.path)}
                      onDiscard={() => handleDiscardFile(change.path, true)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Commit Form */}
          <div className="pt-2 border-t border-border/50">
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message (required)"
              className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleCommit();
                }
              }}
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleCommit}
                disabled={isCommitting || staged.length === 0 || !commitMessage.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCommitting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <GitCommit size={12} />
                )}
                Commit
              </button>
              {showPushButton && (
                <button
                  type="button"
                  onClick={handlePush}
                  disabled={isPushing}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50"
                >
                  {isPushing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Push
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
