import { useEffect, useRef, useState } from "react";
import { buildComboFromEvent, formatKeyCombo } from "@/types/shortcuts";
import type { ShortcutDefinition } from "@/types/shortcuts";

interface ShortcutRecorderProps {
  value: string;
  onChange: (keys: string) => void;
  onCancel: () => void;
  conflicts: ShortcutDefinition[];
}

/**
 * Component for recording a new keyboard shortcut.
 * Captures key combinations and displays them in real-time.
 */
export function ShortcutRecorder({
  value,
  onChange,
  onCancel,
  conflicts,
}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(true);
  const [currentCombo, setCurrentCombo] = useState(value);
  const inputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!recording) return;

    function handleKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      // Escape cancels recording
      if (event.key === "Escape") {
        onCancel();
        return;
      }

      // Build the combo from the event
      const combo = buildComboFromEvent(event);
      if (combo) {
        setCurrentCombo(combo);
        setRecording(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [recording, onCancel]);

  const handleSave = () => {
    if (currentCombo) {
      onChange(currentCombo);
    }
  };

  const handleReset = () => {
    setCurrentCombo(value);
    setRecording(true);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={inputRef}
        tabIndex={0}
        className={`
          flex h-8 items-center justify-center rounded border px-3
          text-sm font-mono
          ${recording
            ? "border-maestro-accent bg-maestro-accent/10 animate-pulse"
            : "border-maestro-border bg-maestro-surface"
          }
        `}
      >
        {recording ? (
          <span className="text-maestro-muted">Press keys...</span>
        ) : (
          <span className="text-maestro-text">{formatKeyCombo(currentCombo)}</span>
        )}
      </div>

      {conflicts.length > 0 && (
        <div className="rounded border border-yellow-500/50 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-400">
          Conflict with: {conflicts.map((c) => c.label).join(", ")}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded px-2 py-1 text-xs text-maestro-muted hover:bg-maestro-border/40"
        >
          Cancel
        </button>
        {!recording && (
          <>
            <button
              onClick={handleReset}
              className="rounded px-2 py-1 text-xs text-maestro-muted hover:bg-maestro-border/40"
            >
              Re-record
            </button>
            <button
              onClick={handleSave}
              disabled={conflicts.length > 0}
              className={`
                rounded px-2 py-1 text-xs
                ${conflicts.length > 0
                  ? "text-maestro-muted cursor-not-allowed"
                  : "bg-maestro-accent text-white hover:bg-maestro-accent/80"
                }
              `}
            >
              Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}
