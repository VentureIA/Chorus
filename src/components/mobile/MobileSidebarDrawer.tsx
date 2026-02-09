import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Sidebar, type SidebarTab } from "@/components/sidebar/Sidebar";

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  activeTab?: SidebarTab;
  onActiveTabChange?: (tab: SidebarTab) => void;
}

/**
 * Slide-out drawer wrapper for the sidebar on mobile devices.
 * Renders the full Sidebar component inside an overlay.
 */
export function MobileSidebarDrawer({
  open,
  onClose,
  theme,
  onToggleTheme,
  activeTab,
  onActiveTabChange,
}: MobileSidebarDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="absolute inset-y-0 left-0 w-[280px] max-w-[80vw] bg-muted border-r border-border shadow-xl animate-in slide-in-from-left duration-200"
      >
        {/* Close button */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-medium text-foreground">Settings</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-border hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Sidebar content - force full width */}
        <div className="h-[calc(100%-44px)] overflow-hidden">
          <Sidebar
            theme={theme}
            onToggleTheme={onToggleTheme}
            activeTab={activeTab}
            onActiveTabChange={onActiveTabChange}
          />
        </div>
      </div>
    </div>
  );
}
