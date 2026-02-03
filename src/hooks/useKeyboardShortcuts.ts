import { useEffect, useCallback } from "react";
import { useShortcutsStore } from "@/stores/useShortcutsStore";
import { matchesKeyCombo, buildComboFromEvent, type ShortcutAction } from "@/types/shortcuts";

export interface KeyboardShortcutCallbacks {
  // Terminal Navigation
  onFocusTerminal?: (index: number) => void;
  onCycleNextTerminal?: () => void;
  onCyclePrevTerminal?: () => void;
  onUnfocusTerminal?: () => void;
  onClearTerminal?: () => void;

  // Session Management
  onLaunchAll?: () => void;
  onStopAll?: () => void;
  onAddSession?: () => void;
  onCloseSession?: () => void;
  onRestartSession?: () => void;

  // Panel Toggles
  onToggleSidebar?: () => void;
  onToggleGitPanel?: () => void;
  onToggleFullscreen?: () => void;
  onMaximizeTerminal?: () => void;

  // Quick Actions
  onQuickAction?: (index: number) => void;
  onRunApp?: () => void;
  onCommitPush?: () => void;

  // Git
  onOpenBranchSelector?: () => void;
  onCreateNewBranch?: () => void;

  // Project
  onNextProject?: () => void;
  onPrevProject?: () => void;

  // Zoom
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;

  // Settings
  onOpenSettings?: () => void;
}

export interface UseKeyboardShortcutsOptions extends KeyboardShortcutCallbacks {
  /** Whether shortcuts should be enabled */
  enabled?: boolean;
  /** Elements that should not trigger shortcuts when focused */
  ignoreWhenFocused?: string[];
}

/**
 * Global keyboard shortcut handler hook.
 *
 * Listens for keyboard events and triggers appropriate callbacks
 * based on the shortcuts defined in the shortcuts store.
 */
export function useKeyboardShortcuts({
  enabled = true,
  ignoreWhenFocused = ["input", "textarea", "select"],
  ...callbacks
}: UseKeyboardShortcutsOptions): void {
  const shortcuts = useShortcutsStore((state) => state.shortcuts);

  const handleAction = useCallback(
    (action: ShortcutAction) => {
      switch (action) {
        // Terminal Navigation
        case "focusTerminal1":
          console.log("[Shortcuts] focusTerminal1 triggered, callback exists:", !!callbacks.onFocusTerminal);
          callbacks.onFocusTerminal?.(0);
          break;
        case "focusTerminal2":
          console.log("[Shortcuts] focusTerminal2 triggered, callback exists:", !!callbacks.onFocusTerminal);
          callbacks.onFocusTerminal?.(1);
          break;
        case "focusTerminal3":
          callbacks.onFocusTerminal?.(2);
          break;
        case "focusTerminal4":
          callbacks.onFocusTerminal?.(3);
          break;
        case "focusTerminal5":
          callbacks.onFocusTerminal?.(4);
          break;
        case "focusTerminal6":
          callbacks.onFocusTerminal?.(5);
          break;
        case "cycleNextTerminal":
          callbacks.onCycleNextTerminal?.();
          break;
        case "cyclePrevTerminal":
          callbacks.onCyclePrevTerminal?.();
          break;
        case "unfocusTerminal":
          callbacks.onUnfocusTerminal?.();
          break;
        case "clearTerminal":
          callbacks.onClearTerminal?.();
          break;

        // Session Management
        case "launchAll":
          callbacks.onLaunchAll?.();
          break;
        case "stopAll":
          callbacks.onStopAll?.();
          break;
        case "addSession":
          callbacks.onAddSession?.();
          break;
        case "closeSession":
          callbacks.onCloseSession?.();
          break;
        case "restartSession":
          callbacks.onRestartSession?.();
          break;

        // Panel Toggles
        case "toggleSidebar":
          callbacks.onToggleSidebar?.();
          break;
        case "toggleGitPanel":
          callbacks.onToggleGitPanel?.();
          break;
        case "toggleFullscreen":
          callbacks.onToggleFullscreen?.();
          break;
        case "maximizeTerminal":
          callbacks.onMaximizeTerminal?.();
          break;

        // Quick Actions
        case "quickAction1":
          callbacks.onQuickAction?.(0);
          break;
        case "quickAction2":
          callbacks.onQuickAction?.(1);
          break;
        case "quickAction3":
          callbacks.onQuickAction?.(2);
          break;
        case "quickAction4":
          callbacks.onQuickAction?.(3);
          break;
        case "runApp":
          callbacks.onRunApp?.();
          break;
        case "commitPush":
          callbacks.onCommitPush?.();
          break;

        // Git
        case "openBranchSelector":
          callbacks.onOpenBranchSelector?.();
          break;
        case "createNewBranch":
          callbacks.onCreateNewBranch?.();
          break;

        // Project
        case "nextProject":
          callbacks.onNextProject?.();
          break;
        case "prevProject":
          callbacks.onPrevProject?.();
          break;

        // Zoom
        case "zoomIn":
          callbacks.onZoomIn?.();
          break;
        case "zoomOut":
          callbacks.onZoomOut?.();
          break;
        case "zoomReset":
          callbacks.onZoomReset?.();
          break;

        // Settings
        case "openSettings":
          callbacks.onOpenSettings?.();
          break;
      }
    },
    [callbacks]
  );

  // Track which actions have handlers defined
  const hasHandler = useCallback(
    (action: ShortcutAction): boolean => {
      switch (action) {
        case "focusTerminal1":
        case "focusTerminal2":
        case "focusTerminal3":
        case "focusTerminal4":
        case "focusTerminal5":
        case "focusTerminal6":
          return !!callbacks.onFocusTerminal;
        case "cycleNextTerminal":
          return !!callbacks.onCycleNextTerminal;
        case "cyclePrevTerminal":
          return !!callbacks.onCyclePrevTerminal;
        case "unfocusTerminal":
          return !!callbacks.onUnfocusTerminal;
        case "clearTerminal":
          return !!callbacks.onClearTerminal;
        case "launchAll":
          return !!callbacks.onLaunchAll;
        case "stopAll":
          return !!callbacks.onStopAll;
        case "addSession":
          return !!callbacks.onAddSession;
        case "closeSession":
          return !!callbacks.onCloseSession;
        case "restartSession":
          return !!callbacks.onRestartSession;
        case "toggleSidebar":
          return !!callbacks.onToggleSidebar;
        case "toggleGitPanel":
          return !!callbacks.onToggleGitPanel;
        case "toggleFullscreen":
          return !!callbacks.onToggleFullscreen;
        case "maximizeTerminal":
          return !!callbacks.onMaximizeTerminal;
        case "quickAction1":
        case "quickAction2":
        case "quickAction3":
        case "quickAction4":
          return !!callbacks.onQuickAction;
        case "runApp":
          return !!callbacks.onRunApp;
        case "commitPush":
          return !!callbacks.onCommitPush;
        case "openBranchSelector":
          return !!callbacks.onOpenBranchSelector;
        case "createNewBranch":
          return !!callbacks.onCreateNewBranch;
        case "nextProject":
          return !!callbacks.onNextProject;
        case "prevProject":
          return !!callbacks.onPrevProject;
        case "zoomIn":
          return !!callbacks.onZoomIn;
        case "zoomOut":
          return !!callbacks.onZoomOut;
        case "zoomReset":
          return !!callbacks.onZoomReset;
        case "openSettings":
          return !!callbacks.onOpenSettings;
        default:
          return false;
      }
    },
    [callbacks]
  );

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      // Check if focus is on an ignored element
      const activeElement = document.activeElement;
      if (activeElement) {
        const tagName = activeElement.tagName.toLowerCase();
        if (ignoreWhenFocused.includes(tagName)) {
          // Allow Escape to work even in inputs
          if (event.key !== "Escape") {
            return;
          }
        }
      }

      // Check each shortcut for a match
      const combo = buildComboFromEvent(event);
      console.log("[Shortcuts] Key pressed:", combo, "Looking for match in", shortcuts.length, "shortcuts");

      for (const shortcut of shortcuts) {
        if (matchesKeyCombo(event, shortcut.keys)) {
          console.log("[Shortcuts] Match found:", shortcut.action, "hasHandler:", hasHandler(shortcut.action));
          // Only handle if we have a callback for this action
          // This allows other handlers (like useTerminalKeyboard) to handle unhandled shortcuts
          if (hasHandler(shortcut.action)) {
            event.preventDefault();
            event.stopPropagation();
            handleAction(shortcut.action);
          }
          return;
        }
      }
      console.log("[Shortcuts] No match found for:", combo);
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [enabled, shortcuts, handleAction, hasHandler, ignoreWhenFocused]);
}
