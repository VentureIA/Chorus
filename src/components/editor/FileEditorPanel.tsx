import { File, Loader2, Save, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { type OpenFile, useFileExplorerStore } from "@/stores/useFileExplorerStore";

/** Extension → Tailwind text color (mirrors explorer) */
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
    default:
      return "text-muted-foreground";
  }
}

/* ── Single file tab ── */

function FileTab({ file, index, isActive }: { file: OpenFile; index: number; isActive: boolean }) {
  const setActiveFile = useFileExplorerStore((s) => s.setActiveFile);
  const closeFile = useFileExplorerStore((s) => s.closeFile);
  const isDirty = file.content !== file.originalContent;

  return (
    <button
      type="button"
      onClick={() => setActiveFile(index)}
      className={`group flex items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs ${
        isActive ? "bg-background text-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
      }`}
    >
      <File size={12} className={getFileColor(file.extension)} />
      <span className="max-w-[120px] truncate">{file.name}</span>
      {isDirty && <span className="size-1.5 rounded-full bg-primary" />}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          closeFile(file.path);
        }}
        className="ml-0.5 rounded p-0.5 opacity-0 hover:bg-muted-foreground/20 group-hover:opacity-100"
      >
        <X size={10} />
      </button>
    </button>
  );
}

/* ── Editor content for one file ── */

function FileContent({ file }: { file: OpenFile }) {
  const updateFileContent = useFileExplorerStore((s) => s.updateFileContent);
  const saveFile = useFileExplorerStore((s) => s.saveFile);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = useCallback(() => {
    saveFile(file.path);
  }, [file.path, saveFile]);

  // Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  if (file.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const isDirty = file.content !== file.originalContent;
  const lineCount = file.content.split("\n").length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1">
        <span className="flex-1 truncate text-[10px] text-muted-foreground">{file.path}</span>
        <span className="text-[10px] text-muted-foreground">{lineCount} lines</span>
        {isDirty && (
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20"
          >
            <Save size={10} />
            Save
          </button>
        )}
      </div>

      {/* Editor area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Line numbers */}
        <div className="shrink-0 select-none overflow-hidden border-r border-border bg-muted/20 px-2 py-2 text-right font-mono text-[11px] leading-[1.4rem] text-muted-foreground/50">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={file.content}
          onChange={(e) => updateFileContent(file.path, e.target.value)}
          className="flex-1 resize-none bg-background p-2 font-mono text-[11px] leading-[1.4rem] text-foreground outline-none"
          spellCheck={false}
          wrap="off"
        />
      </div>
    </div>
  );
}

/* ── Main Panel ── */

export function FileEditorPanel() {
  const openFiles = useFileExplorerStore((s) => s.openFiles);
  const activeFileIndex = useFileExplorerStore((s) => s.activeFileIndex);

  if (openFiles.length === 0) return null;

  const activeFile = openFiles[activeFileIndex];

  return (
    <div className="flex flex-1 flex-col overflow-hidden border-l border-border bg-background">
      {/* Tab bar */}
      <div className="flex shrink-0 overflow-x-auto border-b border-border bg-muted/40">
        {openFiles.map((file, i) => (
          <FileTab key={file.path} file={file} index={i} isActive={i === activeFileIndex} />
        ))}
      </div>

      {/* Active file content */}
      {activeFile && <FileContent file={activeFile} />}
    </div>
  );
}
