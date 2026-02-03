import { useEffect, useRef, useState } from "react";
import { X, RotateCcw, Keyboard, Edit2 } from "lucide-react";
import { useShortcutsStore } from "@/stores/useShortcutsStore";
import {
  formatKeyCombo,
  CATEGORY_INFO,
  DEFAULT_SHORTCUTS,
  type ShortcutCategory,
  type ShortcutDefinition,
} from "@/types/shortcuts";
import { ShortcutRecorder } from "./ShortcutRecorder";

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

/**
 * Modal for viewing and customizing keyboard shortcuts.
 */
export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const {
    shortcuts,
    updateShortcut,
    resetShortcut,
    resetToDefaults,
    findConflicts,
    hasModifications,
  } = useShortcutsStore();

  const [editingId, setEditingId] = useState<string | null>(null);

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

  // Close on Escape (only when not editing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editingId) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, editingId]);

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category].push(shortcut);
      return acc;
    },
    {} as Record<ShortcutCategory, ShortcutDefinition[]>
  );

  // Order categories
  const categoryOrder: ShortcutCategory[] = [
    "terminal",
    "session",
    "panel",
    "quickAction",
    "git",
    "project",
    "zoom",
  ];

  const handleUpdateShortcut = (id: string, keys: string) => {
    updateShortcut(id, keys);
    setEditingId(null);
  };

  const isModified = (shortcut: ShortcutDefinition): boolean => {
    const defaultShortcut = DEFAULT_SHORTCUTS.find((d) => d.id === shortcut.id);
    return defaultShortcut ? defaultShortcut.keys !== shortcut.keys : false;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-2xl rounded-lg border border-chorus-border bg-chorus-bg shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-chorus-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Keyboard size={16} className="text-chorus-accent" />
            <h2 className="text-sm font-semibold text-chorus-text">
              Keyboard Shortcuts
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {hasModifications() && (
              <button
                onClick={resetToDefaults}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-chorus-muted hover:bg-chorus-border/40"
                title="Reset all to defaults"
              >
                <RotateCcw size={12} />
                Reset All
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded p-1 hover:bg-chorus-border/40"
            >
              <X size={16} className="text-chorus-muted" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <div className="space-y-6">
            {categoryOrder.map((category) => {
              const categoryShortcuts = groupedShortcuts[category];
              if (!categoryShortcuts || categoryShortcuts.length === 0) return null;

              const info = CATEGORY_INFO[category];

              return (
                <div key={category}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-chorus-muted">
                    {info.label}
                  </h3>
                  <div className="space-y-1">
                    {categoryShortcuts.map((shortcut) => (
                      <ShortcutRow
                        key={shortcut.id}
                        shortcut={shortcut}
                        isEditing={editingId === shortcut.id}
                        isModified={isModified(shortcut)}
                        onEdit={() => setEditingId(shortcut.id)}
                        onSave={(keys) => handleUpdateShortcut(shortcut.id, keys)}
                        onCancel={() => setEditingId(null)}
                        onReset={() => resetShortcut(shortcut.id)}
                        findConflicts={(keys) => findConflicts(keys, shortcut.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-chorus-border px-4 py-3">
          <p className="text-xs text-chorus-muted">
            Click a shortcut to edit. Press Escape to cancel. Changes are saved automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

interface ShortcutRowProps {
  shortcut: ShortcutDefinition;
  isEditing: boolean;
  isModified: boolean;
  onEdit: () => void;
  onSave: (keys: string) => void;
  onCancel: () => void;
  onReset: () => void;
  findConflicts: (keys: string) => ShortcutDefinition[];
}

function ShortcutRow({
  shortcut,
  isEditing,
  isModified,
  onEdit,
  onSave,
  onCancel,
  onReset,
  findConflicts,
}: ShortcutRowProps) {
  if (isEditing) {
    return (
      <div className="rounded-lg border border-chorus-accent/50 bg-chorus-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-chorus-text">{shortcut.label}</span>
        </div>
        <ShortcutRecorder
          value={shortcut.keys}
          onChange={onSave}
          onCancel={onCancel}
          conflicts={findConflicts(shortcut.keys)}
        />
      </div>
    );
  }

  return (
    <div
      className="group flex items-center justify-between rounded-lg border border-transparent px-3 py-2 hover:border-chorus-border hover:bg-chorus-card/50"
    >
      <div className="flex flex-col">
        <span className="text-sm text-chorus-text">{shortcut.label}</span>
        <span className="text-xs text-chorus-muted">{shortcut.description}</span>
      </div>
      <div className="flex items-center gap-2">
        {isModified && (
          <button
            onClick={onReset}
            className="rounded p-1 text-chorus-muted opacity-0 hover:bg-chorus-border/40 group-hover:opacity-100"
            title="Reset to default"
          >
            <RotateCcw size={12} />
          </button>
        )}
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded border border-chorus-border bg-chorus-surface px-2 py-1 font-mono text-xs text-chorus-text hover:border-chorus-accent"
        >
          <span>{formatKeyCombo(shortcut.keys)}</span>
          <Edit2 size={10} className="text-chorus-muted opacity-0 group-hover:opacity-100" />
        </button>
      </div>
    </div>
  );
}
