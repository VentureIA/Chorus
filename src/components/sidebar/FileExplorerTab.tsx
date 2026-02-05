import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useEffect } from "react";
import { type FileEntry, useFileExplorerStore } from "@/stores/useFileExplorerStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

/** Extension → Tailwind text color */
function getFileColor(ext: string | null): string {
  if (!ext) return "text-muted-foreground";
  switch (ext.toLowerCase()) {
    case "ts":
    case "tsx":
      return "text-blue-400";
    case "js":
    case "jsx":
      return "text-yellow-400";
    case "rs":
      return "text-orange-400";
    case "json":
      return "text-green-400";
    case "md":
      return "text-gray-400";
    case "css":
      return "text-purple-400";
    case "html":
      return "text-red-400";
    case "toml":
    case "yaml":
    case "yml":
      return "text-pink-400";
    case "sh":
      return "text-emerald-400";
    case "lock":
      return "text-muted-foreground/50";
    default:
      return "text-muted-foreground";
  }
}

/* ── Tree Node (recursive) ── */

function FileTreeNode({ entry, depth = 0 }: { entry: FileEntry; depth?: number }) {
  const expanded = useFileExplorerStore((s) => s.expanded);
  const isLoading = useFileExplorerStore((s) => s.isLoading);
  const tree = useFileExplorerStore((s) => s.tree);
  const toggleExpand = useFileExplorerStore((s) => s.toggleExpand);
  const openFile = useFileExplorerStore((s) => s.openFile);

  const isExpanded = expanded.has(entry.path);
  const isLoadingDir = isLoading.has(entry.path);
  const children = tree.get(entry.path) ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={() => (entry.isDirectory ? toggleExpand(entry.path) : openFile(entry))}
        className="group flex w-full items-center gap-1 rounded py-[1px] px-1 text-xs cursor-pointer hover:bg-muted/50"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {/* Chevron / spacer */}
        {entry.isDirectory ? (
          isLoadingDir ? (
            <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" />
          ) : isExpanded ? (
            <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {entry.isDirectory ? (
          isExpanded ? (
            <FolderOpen size={13} className="shrink-0 text-blue-400" />
          ) : (
            <Folder size={13} className="shrink-0 text-blue-400" />
          )
        ) : (
          <File size={13} className={`shrink-0 ${getFileColor(entry.extension)}`} />
        )}

        {/* Name */}
        <span className="truncate text-foreground/80">{entry.name}</span>
      </button>

      {/* Children */}
      {entry.isDirectory && isExpanded && (
        <div>
          {children.map((child) => (
            <FileTreeNode key={child.path} entry={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Explorer Tab Root ── */

export function FileExplorerTab() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.active);
  const repoPath = activeTab?.projectPath ?? "";

  const tree = useFileExplorerStore((s) => s.tree);
  const loadDirectory = useFileExplorerStore((s) => s.loadDirectory);
  const refresh = useFileExplorerStore((s) => s.refresh);
  const collapseAll = useFileExplorerStore((s) => s.collapseAll);

  const rootEntries = tree.get(repoPath) ?? [];

  useEffect(() => {
    if (repoPath && !tree.has(repoPath)) {
      loadDirectory(repoPath);
    }
  }, [repoPath, tree, loadDirectory]);

  const projectName = repoPath.split("/").pop() || "Project";

  if (!repoPath) {
    return <div className="py-4 text-center text-xs text-muted-foreground">No project open</div>;
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {projectName}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={collapseAll}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            title="Collapse All"
          >
            <ChevronRight size={12} />
          </button>
          <button
            type="button"
            onClick={() => refresh(repoPath)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div>
        {rootEntries.map((entry) => (
          <FileTreeNode key={entry.path} entry={entry} />
        ))}
      </div>
    </div>
  );
}
