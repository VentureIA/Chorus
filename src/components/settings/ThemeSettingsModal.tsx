import { Palette, RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useThemeSettingsStore } from "@/stores/useThemeSettingsStore";
import { type ThemeColors, UI_FONTS } from "@/lib/themeUtils";

interface ThemeSettingsModalProps {
  onClose: () => void;
  currentTheme: "dark" | "light";
}

/** Color configuration item. */
type ColorConfig = {
  key: keyof ThemeColors;
  label: string;
  description: string;
};

const COLOR_CONFIGS: ColorConfig[] = [
  { key: "accent", label: "Accent", description: "Buttons, links, highlights" },
  { key: "bg", label: "Background", description: "Main app background" },
  { key: "surface", label: "Surface", description: "Sidebar, panels" },
  { key: "card", label: "Card", description: "Cards, sections" },
  { key: "border", label: "Border", description: "Borders, dividers" },
  { key: "text", label: "Text", description: "Primary text" },
  { key: "muted", label: "Muted", description: "Secondary text" },
];

/**
 * Modal for customizing theme colors and typography.
 */
export function ThemeSettingsModal({ onClose, currentTheme }: ThemeSettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const {
    settings,
    setColor,
    setFontFamily,
    setCustomThemeEnabled,
    resetToDefaults,
    applyTheme,
  } = useThemeSettingsStore();

  const colors = currentTheme === "dark" ? settings.darkColors : settings.lightColors;

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

  // Apply theme when settings change
  useEffect(() => {
    if (settings.isCustomThemeEnabled) {
      applyTheme(currentTheme);
    }
  }, [settings, currentTheme, applyTheme]);

  const handleColorChange = (colorKey: keyof ThemeColors, value: string) => {
    setColor(currentTheme, colorKey, value);
  };

  const handleToggleEnabled = () => {
    const newEnabled = !settings.isCustomThemeEnabled;
    setCustomThemeEnabled(newEnabled);
    if (newEnabled) {
      applyTheme(currentTheme);
    } else {
      // Will clear custom theme
      applyTheme(currentTheme);
    }
  };

  const handleFontChange = (fontFamily: string) => {
    setFontFamily(fontFamily);
  };

  const handleReset = () => {
    resetToDefaults();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg border border-border bg-background shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-4 py-3">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Theme Settings</h2>
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
          {/* Enable Custom Theme Toggle */}
          <section>
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  Enable Custom Theme
                </h3>
                <p className="text-xs text-muted-foreground">
                  Override default colors with your own
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleEnabled}
                className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                  settings.isCustomThemeEnabled
                    ? "bg-primary"
                    : "bg-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    settings.isCustomThemeEnabled
                      ? "translate-x-5"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Current theme indicator */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground">Editing colors for:</span>
            <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
              {currentTheme === "dark" ? "Dark Mode" : "Light Mode"}
            </span>
          </div>

          {/* Colors Section */}
          <section className={!settings.isCustomThemeEnabled ? "opacity-50 pointer-events-none" : ""}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Colors
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {COLOR_CONFIGS.map((config) => (
                <ColorPicker
                  key={config.key}
                  label={config.label}
                  description={config.description}
                  value={colors[config.key]}
                  onChange={(value) => handleColorChange(config.key, value)}
                />
              ))}
            </div>
          </section>

          {/* Typography Section */}
          <section className={!settings.isCustomThemeEnabled ? "opacity-50 pointer-events-none" : ""}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              UI Font
            </h3>
            <div className="rounded-lg border border-border bg-card p-3">
              <select
                value={settings.fontFamily}
                onChange={(e) => handleFontChange(e.target.value)}
                disabled={!settings.isCustomThemeEnabled}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
              >
                {UI_FONTS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
              {/* Preview */}
              <div
                className="mt-2 rounded border border-border bg-background p-2 text-sm text-foreground"
                style={{
                  fontFamily: settings.isCustomThemeEnabled
                    ? `${settings.fontFamily}, -apple-system, BlinkMacSystemFont, sans-serif`
                    : undefined,
                }}
              >
                The quick brown fox jumps over the lazy dog
              </div>
            </div>
          </section>

          {/* Preview Section */}
          <section className={!settings.isCustomThemeEnabled ? "opacity-50" : ""}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Preview
            </h3>
            <ThemePreview colors={colors} fontFamily={settings.fontFamily} />
          </section>

          {/* Reset Button */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-border/40 hover:text-foreground"
            >
              <RotateCcw size={12} />
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Color Picker ── */

interface ColorPickerProps {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorPicker({ label, description, value, onChange }: ColorPickerProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent"
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-foreground">{label}</div>
          <div className="text-[10px] text-muted-foreground truncate">{description}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Theme Preview ── */

interface ThemePreviewProps {
  colors: ThemeColors;
  fontFamily: string;
}

function ThemePreview({ colors, fontFamily }: ThemePreviewProps) {
  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        backgroundColor: colors.bg,
        borderColor: colors.border,
        fontFamily: `${fontFamily}, -apple-system, BlinkMacSystemFont, sans-serif`,
      }}
    >
      {/* Mini header */}
      <div
        className="px-3 py-2 text-xs font-medium border-b"
        style={{ backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }}
      >
        Preview
      </div>
      {/* Content */}
      <div className="p-3 space-y-2">
        <div
          className="rounded p-2"
          style={{ backgroundColor: colors.card, color: colors.text }}
        >
          <div className="text-xs font-medium">Card Title</div>
          <div className="text-[10px]" style={{ color: colors.muted }}>
            Secondary text appears muted
          </div>
        </div>
        <button
          type="button"
          className="rounded px-2 py-1 text-[10px] font-medium text-white"
          style={{ backgroundColor: colors.accent }}
        >
          Accent Button
        </button>
      </div>
    </div>
  );
}
