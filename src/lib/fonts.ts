/**
 * Font detection and management utilities for terminal fonts.
 *
 * Provides functions to detect available system fonts, check font availability,
 * and build CSS font-family strings with appropriate fallbacks.
 */

import { invoke } from "@/lib/transport";

/** Information about an available font on the system. */
export interface AvailableFont {
  /** The font family name (e.g., "JetBrains Mono") */
  family: string;
  /** Whether this is a Nerd Font variant */
  is_nerd_font: boolean;
  /** Whether this font is monospace (suitable for terminals) */
  is_monospace: boolean;
}

/** The embedded fallback font bundled with the app. */
export const EMBEDDED_FONT = "JetBrains Mono";

/** Default fallback fonts for CSS font-family. */
export const FALLBACK_FONTS = "monospace";

/** Cached list of available fonts. */
let cachedFonts: AvailableFont[] | null = null;

/**
 * Fetches the list of available terminal-suitable fonts on the system.
 * Results are cached after the first call.
 *
 * @returns Array of available fonts, sorted by priority (Nerd Fonts first)
 */
export async function getAvailableFonts(): Promise<AvailableFont[]> {
  if (cachedFonts) {
    return cachedFonts;
  }
  cachedFonts = await invoke<AvailableFont[]>("get_available_fonts");
  return cachedFonts;
}

/**
 * Clears the cached font list, forcing a fresh detection on next call.
 * Useful if the user installs new fonts while the app is running.
 */
export function clearFontCache(): void {
  cachedFonts = null;
}

/**
 * Checks if a specific font family is available on the system.
 *
 * @param family - The font family name to check
 * @returns True if the font is available
 */
export async function checkFontAvailable(family: string): Promise<boolean> {
  return invoke<boolean>("check_font_available", { family });
}

/**
 * Builds a CSS font-family string with appropriate fallbacks.
 *
 * The resulting string will include:
 * 1. The preferred font (if provided and different from embedded)
 * 2. The embedded JetBrains Mono font
 * 3. Generic monospace fallback
 *
 * @param preferredFont - The user's preferred font family
 * @returns CSS font-family value string
 */
export function buildFontFamily(preferredFont?: string): string {
  const fonts: string[] = [];

  if (preferredFont && preferredFont !== EMBEDDED_FONT) {
    fonts.push(quoteFont(preferredFont));
  }

  fonts.push(quoteFont(EMBEDDED_FONT));
  fonts.push(FALLBACK_FONTS);

  return fonts.join(", ");
}

/**
 * Quotes a font family name if it contains spaces.
 */
function quoteFont(font: string): string {
  if (font.includes(" ")) {
    return `"${font}"`;
  }
  return font;
}

/**
 * Waits for a font to be loaded and ready for use.
 *
 * Uses the CSS Font Loading API to detect when a font is available.
 * Times out after the specified duration and resolves to false.
 *
 * @param fontFamily - The font family to wait for
 * @param timeout - Timeout in milliseconds (default: 2000)
 * @returns True if the font loaded successfully, false on timeout
 */
export async function waitForFont(
  fontFamily: string,
  timeout: number = 2000
): Promise<boolean> {
  // Extract the first font from the font-family string
  const firstFont = fontFamily.split(",")[0].trim().replace(/["']/g, "");

  try {
    // Wait for all pending @font-face loads to complete first
    await document.fonts.ready;

    // Check if the font is already available (e.g., embedded @font-face)
    if (document.fonts.check(`16px "${firstFont}"`)) {
      return true;
    }

    // Try to explicitly trigger loading
    const font = await Promise.race([
      document.fonts.load(`16px "${firstFont}"`),
      new Promise<FontFace[]>((resolve) =>
        setTimeout(() => resolve([]), timeout)
      ),
    ]);

    return font.length > 0;
  } catch (error) {
    console.warn(`Failed to wait for font "${firstFont}":`, error);
    return false;
  }
}

/**
 * Selects the best available font based on priority.
 *
 * Priority order:
 * 1. First available Nerd Font
 * 2. First available monospace font
 * 3. Embedded JetBrains Mono
 *
 * Uses the CSS Font Loading API to verify each candidate actually renders
 * in the browser — font-kit (Rust) may detect fonts whose family names
 * don't match what the browser/Canvas recognises on macOS.
 *
 * @param fonts - List of available fonts from the Rust backend
 * @returns The best available font family name (browser-validated)
 */
export async function selectBestFont(fonts: AvailableFont[]): Promise<string> {
  await document.fonts.ready;

  // Nerd Fonts first, then standard monospace — preserve detection order within each group
  const candidates = [
    ...fonts.filter((f) => f.is_nerd_font),
    ...fonts.filter((f) => f.is_monospace && !f.is_nerd_font),
  ];

  for (const font of candidates) {
    if (document.fonts.check(`16px "${font.family}"`)) {
      return font.family;
    }
  }

  // Fall back to embedded font
  return EMBEDDED_FONT;
}
