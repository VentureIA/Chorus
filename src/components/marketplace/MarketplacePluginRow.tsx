import { useMarketplaceStore } from "@/stores/useMarketplaceStore";
import type { MarketplacePlugin } from "@/types/marketplace";
import { ArrowUpCircle, Check, ChevronRight, Download, Package } from "lucide-react";

interface MarketplacePluginRowProps {
  plugin: MarketplacePlugin;
  onInstall: () => void;
  onSelect: () => void;
}

export function MarketplacePluginRow({ plugin, onInstall, onSelect }: MarketplacePluginRowProps) {
  // Subscribe to installedPlugins to ensure re-render when installation status changes
  const { isInstalled, hasUpdate, updatePlugin, installingPluginId, updatingPluginId, installedPlugins, availableUpdates } = useMarketplaceStore();
  void installedPlugins; // Ensure subscription triggers re-render
  void availableUpdates;

  const installed = isInstalled(plugin.id);
  const updateAvailable = hasUpdate(plugin.id);
  const isInstalling = installingPluginId === plugin.id;
  const installedPlugin = installedPlugins.find((p) => p.plugin_id === plugin.id);
  const isUpdating = installedPlugin ? updatingPluginId === installedPlugin.id : false;

  // Format types for display
  const typesLabel = plugin.types.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(", ");

  return (
    <div
      className="group flex items-center gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer"
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      role="button"
      tabIndex={0}
    >
      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        {plugin.icon_url ? (
          <img
            src={plugin.icon_url}
            alt={plugin.name}
            className="h-5 w-5 rounded"
          />
        ) : (
          <Package size={16} className="text-primary" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {plugin.name}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            v{plugin.version}
          </span>
          {installed && updateAvailable ? (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400">
              <ArrowUpCircle size={10} />
              Update available
            </span>
          ) : installed ? (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">
              <Check size={10} />
              Installed
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {plugin.description || "No description"}
          </span>
        </div>
      </div>

      {/* Category and types */}
      <div className="hidden shrink-0 items-center gap-2 text-[10px] text-muted-foreground sm:flex">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
          {plugin.category}
        </span>
        {typesLabel && (
          <span className="text-border">|</span>
        )}
        <span>{typesLabel}</span>
      </div>

      {/* Stats */}
      <div className="hidden shrink-0 items-center gap-3 text-[10px] text-muted-foreground md:flex">
        {plugin.downloads !== null && (
          <span className="flex items-center gap-1">
            <Download size={10} />
            {plugin.downloads.toLocaleString()}
          </span>
        )}
        {plugin.stars !== null && (
          <span className="flex items-center gap-1">
            <span className="text-yellow-400">★</span>
            {plugin.stars}
          </span>
        )}
      </div>

      {/* Install/Update button */}
      <div className="shrink-0">
        {installed && updateAvailable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              installedPlugin && updatePlugin(installedPlugin.id);
            }}
            disabled={isUpdating}
            className="rounded bg-yellow-500/20 px-3 py-1 text-xs text-yellow-400 transition-colors hover:bg-yellow-500/30 disabled:opacity-50"
          >
            {isUpdating ? (
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-yellow-400/30 border-t-yellow-400" />
                Updating
              </span>
            ) : (
              "Update"
            )}
          </button>
        ) : installed ? (
          <span className="text-xs text-muted-foreground">
            <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInstall();
            }}
            disabled={isInstalling}
            className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50"
          >
            {isInstalling ? (
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Installing
              </span>
            ) : (
              "Install"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
