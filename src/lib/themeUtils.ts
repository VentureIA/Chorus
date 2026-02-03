/**
 * Theme utilities for color conversion and CSS variable management.
 */

/** Converts a hex color (#1a1a1e) to RGB triplet string ("26 26 30"). */
export function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "0 0 0";
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
}

/** Converts RGB triplet string ("26 26 30") to hex color (#1a1a1e). */
export function rgbToHex(rgb: string): string {
  const parts = rgb.split(" ").map(Number);
  if (parts.length !== 3) return "#000000";
  return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** Theme color configuration. */
export type ThemeColors = {
  bg: string;
  surface: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
};

/** Default dark theme colors (hex values). */
export const DEFAULT_DARK_COLORS: ThemeColors = {
  bg: "#1a1a1e",
  surface: "#1e1f23",
  card: "#252529",
  border: "#333338",
  text: "#e5e5e9",
  muted: "#8c8c96",
  accent: "#58a6ff",
};

/** Default light theme colors (hex values). */
export const DEFAULT_LIGHT_COLORS: ThemeColors = {
  bg: "#f1f1f3",
  surface: "#fcfcfd",
  card: "#f5f5f7",
  border: "#d2d2d8",
  text: "#141418",
  muted: "#646470",
  accent: "#58a6ff",
};

/** Common UI font options. */
export const UI_FONTS = [
  { value: "system-ui", label: "System Default" },
  { value: "Inter", label: "Inter" },
  { value: "-apple-system, BlinkMacSystemFont", label: "SF Pro (macOS)" },
  { value: "Segoe UI", label: "Segoe UI (Windows)" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Nunito", label: "Nunito" },
  { value: "Poppins", label: "Poppins" },
] as const;

/** Applies theme colors to the document's CSS variables. */
export function applyThemeToDocument(
  colors: ThemeColors,
  fontFamily: string
): void {
  const root = document.documentElement;

  // Apply color variables
  root.style.setProperty("--chorus-bg", hexToRgb(colors.bg));
  root.style.setProperty("--chorus-surface", hexToRgb(colors.surface));
  root.style.setProperty("--chorus-card", hexToRgb(colors.card));
  root.style.setProperty("--chorus-border", hexToRgb(colors.border));
  root.style.setProperty("--chorus-text", hexToRgb(colors.text));
  root.style.setProperty("--chorus-muted", hexToRgb(colors.muted));
  root.style.setProperty("--chorus-accent", hexToRgb(colors.accent));

  // Apply font family
  if (fontFamily && fontFamily !== "system-ui") {
    document.body.style.fontFamily = `"${fontFamily}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  } else {
    document.body.style.fontFamily = "";
  }
}

/** Removes custom theme from document, reverting to CSS defaults. */
export function clearCustomTheme(): void {
  const root = document.documentElement;

  root.style.removeProperty("--chorus-bg");
  root.style.removeProperty("--chorus-surface");
  root.style.removeProperty("--chorus-card");
  root.style.removeProperty("--chorus-border");
  root.style.removeProperty("--chorus-text");
  root.style.removeProperty("--chorus-muted");
  root.style.removeProperty("--chorus-accent");
  document.body.style.fontFamily = "";
}
