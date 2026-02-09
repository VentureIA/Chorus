import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createStorage } from "@/lib/storage";
import {
  type ThemeColors,
  DEFAULT_DARK_COLORS,
  DEFAULT_LIGHT_COLORS,
  applyThemeToDocument,
  clearCustomTheme,
} from "@/lib/themeUtils";

// --- Types ---

/** Theme settings that can be customized per theme mode. */
export type ThemeSettings = {
  /** Custom colors for dark mode. */
  darkColors: ThemeColors;
  /** Custom colors for light mode. */
  lightColors: ThemeColors;
  /** UI font family. */
  fontFamily: string;
  /** Whether custom theme is enabled. */
  isCustomThemeEnabled: boolean;
};

/** Read-only slice of the theme settings store; persisted to disk. */
type ThemeSettingsState = {
  settings: ThemeSettings;
  isInitialized: boolean;
};

/** Actions for managing theme settings. */
type ThemeSettingsActions = {
  /** Initialize the store and apply theme. */
  initialize: (currentTheme: "dark" | "light") => void;
  /** Update a color for a specific theme mode. */
  setColor: (
    mode: "dark" | "light",
    colorKey: keyof ThemeColors,
    value: string
  ) => void;
  /** Update the font family. */
  setFontFamily: (fontFamily: string) => void;
  /** Enable or disable custom theme. */
  setCustomThemeEnabled: (enabled: boolean) => void;
  /** Reset all settings to defaults. */
  resetToDefaults: () => void;
  /** Apply the current theme to the document. */
  applyTheme: (currentTheme: "dark" | "light") => void;
};

// --- Default Settings ---

const DEFAULT_SETTINGS: ThemeSettings = {
  darkColors: DEFAULT_DARK_COLORS,
  lightColors: DEFAULT_LIGHT_COLORS,
  fontFamily: "system-ui",
  isCustomThemeEnabled: false,
};

// --- Store ---

/**
 * Global store for theme customization settings.
 *
 * Manages custom colors and typography with persistence.
 * Supports separate color schemes for dark and light modes.
 */
export const useThemeSettingsStore = create<
  ThemeSettingsState & ThemeSettingsActions
>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      isInitialized: false,

      initialize: (currentTheme) => {
        const { isInitialized } = get();
        if (isInitialized) return;

        set({ isInitialized: true });

        // Apply theme if custom theme is enabled
        const { settings } = get();
        if (settings.isCustomThemeEnabled) {
          const colors =
            currentTheme === "dark"
              ? settings.darkColors
              : settings.lightColors;
          applyThemeToDocument(colors, settings.fontFamily);
        }
      },

      setColor: (mode, colorKey, value) => {
        const { settings } = get();
        const colorsKey = mode === "dark" ? "darkColors" : "lightColors";

        set({
          settings: {
            ...settings,
            [colorsKey]: {
              ...settings[colorsKey],
              [colorKey]: value,
            },
          },
        });
      },

      setFontFamily: (fontFamily) => {
        set({
          settings: {
            ...get().settings,
            fontFamily,
          },
        });
      },

      setCustomThemeEnabled: (enabled) => {
        set({
          settings: {
            ...get().settings,
            isCustomThemeEnabled: enabled,
          },
        });
      },

      resetToDefaults: () => {
        set({
          settings: DEFAULT_SETTINGS,
        });
        clearCustomTheme();
      },

      applyTheme: (currentTheme) => {
        const { settings } = get();

        if (!settings.isCustomThemeEnabled) {
          clearCustomTheme();
          return;
        }

        const colors =
          currentTheme === "dark" ? settings.darkColors : settings.lightColors;
        applyThemeToDocument(colors, settings.fontFamily);
      },
    }),
    {
      name: "chorus-theme-settings",
      storage: createJSONStorage(() => createStorage("theme-settings.json")),
      partialize: (state) => ({ settings: state.settings }),
      version: 1,
    }
  )
);
