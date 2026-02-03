import { useMarketplaceStore } from "@/stores/useMarketplaceStore";
import type { PluginCategory, PluginType } from "@/types/marketplace";

const CATEGORIES: { value: PluginCategory; label: string }[] = [
  { value: "development", label: "Development" },
  { value: "productivity", label: "Productivity" },
  { value: "integration", label: "Integration" },
  { value: "ai", label: "AI" },
  { value: "data", label: "Data" },
  { value: "security", label: "Security" },
  { value: "documentation", label: "Docs" },
  { value: "learning", label: "Learning" },
  { value: "utility", label: "Utility" },
];

const TYPES: { value: PluginType; label: string }[] = [
  { value: "skill", label: "Skills" },
  { value: "command", label: "Commands" },
  { value: "mcp", label: "MCP" },
  { value: "agent", label: "Agents" },
  { value: "hook", label: "Hooks" },
];

export function MarketplaceFilters() {
  const { filters, setFilter, clearFilters } = useMarketplaceStore();

  const hasActiveFilters =
    filters.category !== null ||
    filters.type !== null ||
    filters.showInstalled ||
    filters.showNotInstalled;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-chorus-border px-4 py-2">
      {/* Category chips */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-chorus-muted">
          Category:
        </span>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() =>
              setFilter("category", filters.category === cat.value ? null : cat.value)
            }
            className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
              filters.category === cat.value
                ? "bg-chorus-accent text-white"
                : "bg-chorus-card text-chorus-muted hover:bg-chorus-surface hover:text-chorus-text"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="mx-2 h-4 w-px bg-chorus-border" />

      {/* Type chips */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-chorus-muted">
          Type:
        </span>
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() =>
              setFilter("type", filters.type === t.value ? null : t.value)
            }
            className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
              filters.type === t.value
                ? "bg-chorus-accent text-white"
                : "bg-chorus-card text-chorus-muted hover:bg-chorus-surface hover:text-chorus-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mx-2 h-4 w-px bg-chorus-border" />

      {/* Installed filter */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setFilter("showInstalled", !filters.showInstalled)}
          className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
            filters.showInstalled
              ? "bg-green-500/20 text-green-400"
              : "bg-chorus-card text-chorus-muted hover:bg-chorus-surface hover:text-chorus-text"
          }`}
        >
          Installed
        </button>
        <button
          type="button"
          onClick={() => setFilter("showNotInstalled", !filters.showNotInstalled)}
          className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
            filters.showNotInstalled
              ? "bg-blue-500/20 text-blue-400"
              : "bg-chorus-card text-chorus-muted hover:bg-chorus-surface hover:text-chorus-text"
          }`}
        >
          Not Installed
        </button>
      </div>

      {/* Clear button */}
      {hasActiveFilters && (
        <>
          <div className="mx-2 h-4 w-px bg-chorus-border" />
          <button
            type="button"
            onClick={clearFilters}
            className="rounded px-2 py-0.5 text-xs text-chorus-muted hover:bg-chorus-surface hover:text-chorus-text"
          >
            Clear filters
          </button>
        </>
      )}
    </div>
  );
}
