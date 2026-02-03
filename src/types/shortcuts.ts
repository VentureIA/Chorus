/**
 * Keyboard shortcuts type definitions and defaults
 */

export type ShortcutCategory =
  | "terminal"
  | "session"
  | "panel"
  | "quickAction"
  | "git"
  | "project"
  | "zoom";

export type ShortcutAction =
  // Terminal Navigation
  | "focusTerminal1"
  | "focusTerminal2"
  | "focusTerminal3"
  | "focusTerminal4"
  | "focusTerminal5"
  | "focusTerminal6"
  | "cycleNextTerminal"
  | "cyclePrevTerminal"
  | "unfocusTerminal"
  | "clearTerminal"
  // Session Management
  | "launchAll"
  | "stopAll"
  | "addSession"
  | "closeSession"
  | "restartSession"
  // Panel Toggles
  | "toggleSidebar"
  | "toggleGitPanel"
  | "toggleFullscreen"
  | "maximizeTerminal"
  // Quick Actions
  | "quickAction1"
  | "quickAction2"
  | "quickAction3"
  | "quickAction4"
  | "runApp"
  | "commitPush"
  // Git
  | "openBranchSelector"
  | "createNewBranch"
  // Project
  | "nextProject"
  | "prevProject"
  // Zoom
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  // Settings
  | "openSettings";

export interface ShortcutDefinition {
  id: string;
  action: ShortcutAction;
  keys: string; // e.g., "mod+1", "mod+shift+enter", "alt+r"
  category: ShortcutCategory;
  label: string;
  description: string;
}

/**
 * Platform detection for keyboard shortcuts
 */
export function isMac(): boolean {
  return typeof navigator !== "undefined" &&
    navigator.platform.toLowerCase().includes("mac");
}

/**
 * Parse a key combo string into its components
 * @param combo - e.g., "mod+shift+k"
 * @returns Object with modifier flags and key
 */
export function parseKeyCombo(combo: string): {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
} {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  return {
    mod: parts.includes("mod"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    key,
  };
}

/**
 * Format a key combo for display (platform-specific)
 * @param combo - e.g., "mod+shift+k"
 * @returns Display string like "⌘⇧K" on Mac or "Ctrl+Shift+K" on Windows
 */
export function formatKeyCombo(combo: string): string {
  const { mod, shift, alt, key } = parseKeyCombo(combo);
  const mac = isMac();

  const parts: string[] = [];

  if (mod) {
    parts.push(mac ? "⌘" : "Ctrl");
  }
  if (shift) {
    parts.push(mac ? "⇧" : "Shift");
  }
  if (alt) {
    parts.push(mac ? "⌥" : "Alt");
  }

  // Format special keys
  const keyMap: Record<string, string> = {
    enter: mac ? "↵" : "Enter",
    escape: "Esc",
    tab: "Tab",
    "[": "[",
    "]": "]",
    "\\": "\\",
    ",": ",",
    ".": ".",
    "/": "/",
    "-": "-",
    "=": "=",
    "+": "+",
  };

  const displayKey = keyMap[key] || key.toUpperCase();
  parts.push(displayKey);

  return mac ? parts.join("") : parts.join("+");
}

/**
 * Check if a KeyboardEvent matches a shortcut combo
 */
export function matchesKeyCombo(event: KeyboardEvent, combo: string): boolean {
  const { mod, shift, alt, key } = parseKeyCombo(combo);
  const mac = isMac();

  const modKey = mac ? event.metaKey : event.ctrlKey;

  // Check modifier keys
  if (mod !== modKey) return false;
  if (shift !== event.shiftKey) return false;
  if (alt !== event.altKey) return false;

  // Check the actual key
  const eventKey = event.key.toLowerCase();

  // Handle special cases
  if (key === "enter" && eventKey === "enter") return true;
  if (key === "escape" && (eventKey === "escape" || eventKey === "esc")) return true;
  if (key === "tab" && eventKey === "tab") return true;
  if (key === "=" && (eventKey === "=" || eventKey === "+")) return true;

  return eventKey === key;
}

/**
 * Build a combo string from a KeyboardEvent
 */
export function buildComboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  const mac = isMac();

  const modKey = mac ? event.metaKey : event.ctrlKey;
  if (modKey) parts.push("mod");
  if (event.shiftKey) parts.push("shift");
  if (event.altKey) parts.push("alt");

  // Get the key, handling special cases
  let key = event.key.toLowerCase();

  // Ignore pure modifier keys
  if (["control", "meta", "shift", "alt"].includes(key)) {
    return "";
  }

  // Normalize some keys
  if (key === " ") key = "space";
  if (key === "arrowup") key = "up";
  if (key === "arrowdown") key = "down";
  if (key === "arrowleft") key = "left";
  if (key === "arrowright") key = "right";

  parts.push(key);

  return parts.join("+");
}

/**
 * Default keyboard shortcuts
 */
export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  // Terminal Navigation
  {
    id: "focus-terminal-1",
    action: "focusTerminal1",
    keys: "mod+1",
    category: "terminal",
    label: "Focus Terminal 1",
    description: "Focus the first terminal",
  },
  {
    id: "focus-terminal-2",
    action: "focusTerminal2",
    keys: "mod+2",
    category: "terminal",
    label: "Focus Terminal 2",
    description: "Focus the second terminal",
  },
  {
    id: "focus-terminal-3",
    action: "focusTerminal3",
    keys: "mod+3",
    category: "terminal",
    label: "Focus Terminal 3",
    description: "Focus the third terminal",
  },
  {
    id: "focus-terminal-4",
    action: "focusTerminal4",
    keys: "mod+4",
    category: "terminal",
    label: "Focus Terminal 4",
    description: "Focus the fourth terminal",
  },
  {
    id: "focus-terminal-5",
    action: "focusTerminal5",
    keys: "mod+5",
    category: "terminal",
    label: "Focus Terminal 5",
    description: "Focus the fifth terminal",
  },
  {
    id: "focus-terminal-6",
    action: "focusTerminal6",
    keys: "mod+6",
    category: "terminal",
    label: "Focus Terminal 6",
    description: "Focus the sixth terminal",
  },
  {
    id: "cycle-next-terminal",
    action: "cycleNextTerminal",
    keys: "mod+]",
    category: "terminal",
    label: "Next Terminal",
    description: "Cycle to the next terminal",
  },
  {
    id: "cycle-prev-terminal",
    action: "cyclePrevTerminal",
    keys: "mod+[",
    category: "terminal",
    label: "Previous Terminal",
    description: "Cycle to the previous terminal",
  },
  {
    id: "unfocus-terminal",
    action: "unfocusTerminal",
    keys: "escape",
    category: "terminal",
    label: "Unfocus Terminal",
    description: "Remove focus from current terminal",
  },
  {
    id: "clear-terminal",
    action: "clearTerminal",
    keys: "mod+k",
    category: "terminal",
    label: "Clear Terminal",
    description: "Clear the focused terminal output",
  },

  // Session Management
  {
    id: "launch-all",
    action: "launchAll",
    keys: "mod+enter",
    category: "session",
    label: "Launch All",
    description: "Launch all configured sessions",
  },
  {
    id: "stop-all",
    action: "stopAll",
    keys: "mod+shift+enter",
    category: "session",
    label: "Stop All",
    description: "Stop all running sessions",
  },
  {
    id: "add-session",
    action: "addSession",
    keys: "mod+n",
    category: "session",
    label: "Add Session",
    description: "Add a new session slot",
  },
  {
    id: "close-session",
    action: "closeSession",
    keys: "mod+w",
    category: "session",
    label: "Close Session",
    description: "Close the focused session",
  },
  {
    id: "restart-session",
    action: "restartSession",
    keys: "mod+shift+r",
    category: "session",
    label: "Restart Session",
    description: "Restart the focused session",
  },

  // Panel Toggles
  {
    id: "toggle-sidebar",
    action: "toggleSidebar",
    keys: "mod+b",
    category: "panel",
    label: "Toggle Sidebar",
    description: "Show or hide the sidebar",
  },
  {
    id: "toggle-git-panel",
    action: "toggleGitPanel",
    keys: "mod+g",
    category: "panel",
    label: "Toggle Git Panel",
    description: "Show or hide the git panel",
  },
  {
    id: "toggle-fullscreen",
    action: "toggleFullscreen",
    keys: "mod+\\",
    category: "panel",
    label: "Fullscreen Terminals",
    description: "Hide all panels for maximum terminal space",
  },
  {
    id: "maximize-terminal",
    action: "maximizeTerminal",
    keys: "mod+m",
    category: "panel",
    label: "Maximize Terminal",
    description: "Maximize or restore the focused terminal",
  },

  // Quick Actions
  {
    id: "quick-action-1",
    action: "quickAction1",
    keys: "alt+1",
    category: "quickAction",
    label: "Quick Action 1",
    description: "Execute the first quick action",
  },
  {
    id: "quick-action-2",
    action: "quickAction2",
    keys: "alt+2",
    category: "quickAction",
    label: "Quick Action 2",
    description: "Execute the second quick action",
  },
  {
    id: "quick-action-3",
    action: "quickAction3",
    keys: "alt+3",
    category: "quickAction",
    label: "Quick Action 3",
    description: "Execute the third quick action",
  },
  {
    id: "quick-action-4",
    action: "quickAction4",
    keys: "alt+4",
    category: "quickAction",
    label: "Quick Action 4",
    description: "Execute the fourth quick action",
  },
  {
    id: "run-app",
    action: "runApp",
    keys: "alt+r",
    category: "quickAction",
    label: "Run App",
    description: "Execute the Run App quick action",
  },
  {
    id: "commit-push",
    action: "commitPush",
    keys: "alt+c",
    category: "quickAction",
    label: "Commit & Push",
    description: "Execute the Commit & Push quick action",
  },

  // Git
  {
    id: "open-branch-selector",
    action: "openBranchSelector",
    keys: "mod+shift+b",
    category: "git",
    label: "Branch Selector",
    description: "Open the branch selector dropdown",
  },
  {
    id: "create-new-branch",
    action: "createNewBranch",
    keys: "mod+shift+n",
    category: "git",
    label: "New Branch",
    description: "Create a new git branch",
  },

  // Project
  {
    id: "next-project",
    action: "nextProject",
    keys: "mod+tab",
    category: "project",
    label: "Next Project",
    description: "Switch to the next project tab",
  },
  {
    id: "prev-project",
    action: "prevProject",
    keys: "mod+shift+tab",
    category: "project",
    label: "Previous Project",
    description: "Switch to the previous project tab",
  },

  // Zoom
  {
    id: "zoom-in",
    action: "zoomIn",
    keys: "mod+=",
    category: "zoom",
    label: "Zoom In",
    description: "Increase the UI zoom level",
  },
  {
    id: "zoom-out",
    action: "zoomOut",
    keys: "mod+-",
    category: "zoom",
    label: "Zoom Out",
    description: "Decrease the UI zoom level",
  },
  {
    id: "zoom-reset",
    action: "zoomReset",
    keys: "mod+0",
    category: "zoom",
    label: "Reset Zoom",
    description: "Reset the UI zoom to 100%",
  },

  // Settings
  {
    id: "open-settings",
    action: "openSettings",
    keys: "mod+,",
    category: "panel",
    label: "Open Settings",
    description: "Open the keyboard shortcuts settings",
  },
];

/**
 * Category display information
 */
export const CATEGORY_INFO: Record<
  ShortcutCategory,
  { label: string; description: string }
> = {
  terminal: {
    label: "Terminal Navigation",
    description: "Navigate between terminals",
  },
  session: {
    label: "Session Management",
    description: "Control AI sessions",
  },
  panel: {
    label: "Panels & UI",
    description: "Toggle UI panels",
  },
  quickAction: {
    label: "Quick Actions",
    description: "Execute quick actions",
  },
  git: {
    label: "Git",
    description: "Git operations",
  },
  project: {
    label: "Projects",
    description: "Switch between projects",
  },
  zoom: {
    label: "Zoom",
    description: "Control UI zoom level",
  },
};
