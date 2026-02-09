import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createStorage } from "@/lib/storage";
import {
  type ShortcutDefinition,
  type ShortcutAction,
  DEFAULT_SHORTCUTS,
} from "@/types/shortcuts";

// --- Types ---

/** Read-only slice of the shortcuts store; persisted to disk. */
type ShortcutsState = {
  shortcuts: ShortcutDefinition[];
  isInitialized: boolean;
};

/** Actions for managing keyboard shortcuts. */
type ShortcutsActions = {
  /** Update a specific shortcut's key binding. */
  updateShortcut: (id: string, keys: string) => void;
  /** Reset a specific shortcut to its default. */
  resetShortcut: (id: string) => void;
  /** Reset all shortcuts to defaults. */
  resetToDefaults: () => void;
  /** Get a shortcut by its action. */
  getShortcutByAction: (action: ShortcutAction) => ShortcutDefinition | undefined;
  /** Get a shortcut by its keys. */
  getShortcutByKeys: (keys: string) => ShortcutDefinition | undefined;
  /** Find shortcuts that conflict with a given key combo. */
  findConflicts: (keys: string, excludeId?: string) => ShortcutDefinition[];
  /** Check if shortcuts have been modified from defaults. */
  hasModifications: () => boolean;
};

// --- Store ---

/**
 * Global store for keyboard shortcuts.
 *
 * Manages customizable keyboard shortcuts with persistence.
 * Each shortcut maps an action to a key combination.
 */
export const useShortcutsStore = create<ShortcutsState & ShortcutsActions>()(
  persist(
    (set, get) => ({
      shortcuts: DEFAULT_SHORTCUTS,
      isInitialized: false,

      updateShortcut: (id: string, keys: string) => {
        const { shortcuts } = get();
        set({
          shortcuts: shortcuts.map((s) =>
            s.id === id ? { ...s, keys } : s
          ),
        });
      },

      resetShortcut: (id: string) => {
        const { shortcuts } = get();
        const defaultShortcut = DEFAULT_SHORTCUTS.find((s) => s.id === id);
        if (!defaultShortcut) return;

        set({
          shortcuts: shortcuts.map((s) =>
            s.id === id ? { ...s, keys: defaultShortcut.keys } : s
          ),
        });
      },

      resetToDefaults: () => {
        set({ shortcuts: DEFAULT_SHORTCUTS });
      },

      getShortcutByAction: (action: ShortcutAction) => {
        return get().shortcuts.find((s) => s.action === action);
      },

      getShortcutByKeys: (keys: string) => {
        return get().shortcuts.find(
          (s) => s.keys.toLowerCase() === keys.toLowerCase()
        );
      },

      findConflicts: (keys: string, excludeId?: string) => {
        const { shortcuts } = get();
        const normalizedKeys = keys.toLowerCase();
        return shortcuts.filter(
          (s) =>
            s.keys.toLowerCase() === normalizedKeys &&
            s.id !== excludeId
        );
      },

      hasModifications: () => {
        const { shortcuts } = get();
        return shortcuts.some((s) => {
          const defaultShortcut = DEFAULT_SHORTCUTS.find((d) => d.id === s.id);
          return defaultShortcut && defaultShortcut.keys !== s.keys;
        });
      },
    }),
    {
      name: "chorus-shortcuts",
      storage: createJSONStorage(() => createStorage("shortcuts.json")),
      partialize: (state) => ({ shortcuts: state.shortcuts }),
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Merge with defaults to add any new shortcuts from updates
          const existingIds = new Set(state.shortcuts.map((s) => s.id));
          const newShortcuts = DEFAULT_SHORTCUTS.filter(
            (d) => !existingIds.has(d.id)
          );
          if (newShortcuts.length > 0) {
            state.shortcuts = [...state.shortcuts, ...newShortcuts];
          }
          state.isInitialized = true;
        }
      },
    }
  )
);
