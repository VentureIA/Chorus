import { useMarketplaceStore } from "@/stores/useMarketplaceStore";
import type { MarketplacePlugin } from "@/types/marketplace";
import { Check, Download, ExternalLink, Package } from "lucide-react";

interface MarketplacePluginCardProps {
  plugin: MarketplacePlugin;
  onInstall: () => void;
}

export function MarketplacePluginCard({ plugin, onInstall }: MarketplacePluginCardProps) {
  // Subscribe to installedPlugins to ensure re-render when installation status changes
  const { isInstalled, getInstalledVersion, installingPluginId, installedPlugins } = useMarketplaceStore();
  void installedPlugins; // Ensure subscription triggers re-render

  const installed = isInstalled(plugin.id);
  const installedVersion = getInstalledVersion(plugin.id);
  const isInstalling = installingPluginId === plugin.id;

  // Format category for display
  const categoryLabel = plugin.category.charAt(0).toUpperCase() + plugin.category.slice(1);

  // Format types for display
  const typesLabel = plugin.types.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(", ");

  return (
    <div className="group flex flex-col rounded-lg border border-chorus-border bg-chorus-card p-4 transition-all hover:border-chorus-accent/50 hover:shadow-lg">
      {/* Header */}
      <div className="mb-3 flex items-start gap-3">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-chorus-accent/10">
          {plugin.icon_url ? (
            <img
              src={plugin.icon_url}
              alt={plugin.name}
              className="h-6 w-6 rounded"
            />
          ) : (
            <Package size={20} className="text-chorus-accent" />
          )}
        </div>

        {/* Title and author */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-chorus-text">
            {plugin.name}
          </h3>
          <p className="truncate text-xs text-chorus-muted">
            by {plugin.author}
          </p>
        </div>

        {/* Version badge */}
        <span className="shrink-0 rounded bg-chorus-surface px-1.5 py-0.5 text-[10px] text-chorus-muted">
          v{plugin.version}
        </span>
      </div>

      {/* Description */}
      <p className="mb-3 line-clamp-2 flex-1 text-xs text-chorus-muted">
        {plugin.description || "No description available."}
      </p>

      {/* Tags */}
      {plugin.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {plugin.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-chorus-surface px-2 py-0.5 text-[10px] text-chorus-muted"
            >
              {tag}
            </span>
          ))}
          {plugin.tags.length > 3 && (
            <span className="rounded-full bg-chorus-surface px-2 py-0.5 text-[10px] text-chorus-muted">
              +{plugin.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Category and types */}
      <div className="mb-3 flex items-center gap-2 text-[10px] text-chorus-muted">
        <span className="rounded bg-chorus-accent/10 px-1.5 py-0.5 text-chorus-accent">
          {categoryLabel}
        </span>
        {typesLabel && (
          <span className="text-chorus-border">|</span>
        )}
        <span>{typesLabel}</span>
      </div>

      {/* Stats */}
      <div className="mb-3 flex items-center gap-4 text-[10px] text-chorus-muted">
        {plugin.downloads !== null && (
          <span className="flex items-center gap-1">
            <Download size={10} />
            {plugin.downloads.toLocaleString()}
          </span>
        )}
        {plugin.stars !== null && (
          <span className="flex items-center gap-1">
            <span className="text-yellow-400">★</span>
            {plugin.stars.toLocaleString()}
          </span>
        )}
        {plugin.license && (
          <span>{plugin.license}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {installed ? (
          <div className="flex flex-1 items-center justify-center gap-1 rounded bg-green-500/10 py-1.5 text-xs text-green-400">
            <Check size={14} />
            <span>Installed</span>
            {installedVersion && installedVersion !== plugin.version && (
              <span className="ml-1 text-[10px] text-yellow-400">
                (v{installedVersion})
              </span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onInstall}
            disabled={isInstalling}
            className="flex flex-1 items-center justify-center gap-1 rounded bg-chorus-accent py-1.5 text-xs text-white transition-colors hover:bg-chorus-accent/80 disabled:opacity-50"
          >
            {isInstalling ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span>Installing...</span>
              </>
            ) : (
              <>
                <Download size={14} />
                <span>Install</span>
              </>
            )}
          </button>
        )}

        {/* External link */}
        {plugin.homepage_url && (
          <a
            href={plugin.homepage_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1.5 text-chorus-muted transition-colors hover:bg-chorus-surface hover:text-chorus-text"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
