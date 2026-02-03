import { ArrowRightFromLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type AiMode } from "@/stores/useSessionStore";

interface HandoffDialogProps {
  /** Initial context extracted from terminal buffer. */
  initialContext: string;
  /** Current session's AI mode. */
  currentMode: AiMode;
  /** Current session's title (optional). */
  currentTitle?: string;
  onClose: () => void;
  onConfirm: (context: string, mode: AiMode, archiveOld: boolean) => void;
}

const AI_MODES: { value: AiMode; label: string }[] = [
  { value: "Claude", label: "Claude Code" },
  { value: "Gemini", label: "Gemini CLI" },
  { value: "Codex", label: "Codex" },
  { value: "Plain", label: "Plain Terminal" },
];

/**
 * Modal dialog for handoff configuration.
 * Allows editing the context summary before transferring to a new session.
 */
export function HandoffDialog({
  initialContext,
  currentMode,
  currentTitle,
  onClose,
  onConfirm,
}: HandoffDialogProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [context, setContext] = useState(initialContext);
  const [mode, setMode] = useState<AiMode>(currentMode);
  const [archiveOld, setArchiveOld] = useState(true);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
    // Select all text for easy replacement
    textareaRef.current?.select();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleConfirm = () => {
    if (context.trim()) {
      onConfirm(context.trim(), mode, archiveOld);
    }
  };

  // Generate preview title from context (first line, max 40 chars)
  const previewTitle = context.trim().split("\n")[0].slice(0, 40) || "New Session";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-lg border border-border bg-background shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ArrowRightFromLine size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Handoff to New Session</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-border/40"
          >
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 p-4">
          {/* Context info */}
          {currentTitle && (
            <div className="text-xs text-muted-foreground">
              Transferring from: <span className="text-foreground">{currentTitle}</span>
            </div>
          )}

          {/* Context textarea */}
          <section>
            <label
              htmlFor="handoff-context"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Context for New Session
            </label>
            <textarea
              id="handoff-context"
              ref={textareaRef}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Enter context or edit the extracted terminal content..."
              className="h-48 w-full resize-none rounded-lg border border-border bg-card p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />
            <div className="mt-1 text-[10px] text-muted-foreground">
              This will be sent as the first message in the new session.
            </div>
          </section>

          {/* Preview title */}
          <div className="rounded border border-border/50 bg-card/50 px-3 py-2">
            <span className="text-[10px] text-muted-foreground">New session title preview: </span>
            <span className="text-xs text-foreground">{previewTitle}</span>
          </div>

          {/* AI Mode selector */}
          <section>
            <label
              htmlFor="handoff-mode"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              AI Provider
            </label>
            <select
              id="handoff-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as AiMode)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {AI_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </section>

          {/* Archive checkbox */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={archiveOld}
              onChange={(e) => setArchiveOld(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-card accent-primary"
            />
            <span className="text-xs text-foreground">Close current session after handoff</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-border/40 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!context.trim()}
            className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowRightFromLine size={12} />
            Handoff
          </button>
        </div>
      </div>
    </div>
  );
}
