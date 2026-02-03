import { useRef, forwardRef, useImperativeHandle, useMemo } from "react";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { IdleLandingView } from "./IdleLandingView";
import { TerminalGrid, type TerminalGridHandle } from "../terminal/TerminalGrid";

interface MultiProjectViewProps {
  onSessionCountChange?: (tabId: string, slotCount: number, launchedCount: number) => void;
}

export interface MultiProjectViewHandle {
  addSessionToActiveProject: () => void;
  launchAllInActiveProject: () => Promise<void>;
  // Terminal navigation
  focusTerminal: (index: number) => void;
  cycleNextTerminal: () => void;
  cyclePrevTerminal: () => void;
  unfocusTerminal: () => void;
  getFocusedIndex: () => number | null;
  // Terminal actions
  clearTerminal: () => Promise<void>;
  closeSession: () => Promise<void>;
  restartSession: () => Promise<void>;
}

/**
 * Root content view that renders ALL open projects simultaneously.
 * Uses CSS opacity/pointer-events to show only the active project
 * while keeping terminal state alive in inactive projects (ZStack pattern).
 *
 * This is modeled after the Swift app's MultiProjectContentView which
 * uses a ZStack to preserve terminal NSView state across project switches.
 */
export const MultiProjectView = forwardRef<MultiProjectViewHandle, MultiProjectViewProps>(
  function MultiProjectView({ onSessionCountChange }, ref) {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const setSessionsLaunched = useWorkspaceStore((s) => s.setSessionsLaunched);
  const gridRefs = useRef<Map<string, TerminalGridHandle>>(new Map());

  // Helper to get active grid ref
  const getActiveGridRef = () => {
    const activeTab = tabs.find((t) => t.active);
    return activeTab ? gridRefs.current.get(activeTab.id) : undefined;
  };

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    addSessionToActiveProject: () => {
      getActiveGridRef()?.addSession();
    },
    launchAllInActiveProject: async () => {
      await getActiveGridRef()?.launchAll();
    },
    // Terminal navigation
    focusTerminal: (index: number) => {
      const gridRef = getActiveGridRef();
      console.log("[MultiProjectView] focusTerminal called, index:", index, "gridRef exists:", !!gridRef);
      gridRef?.focusTerminal(index);
    },
    cycleNextTerminal: () => {
      getActiveGridRef()?.cycleNextTerminal();
    },
    cyclePrevTerminal: () => {
      getActiveGridRef()?.cyclePrevTerminal();
    },
    unfocusTerminal: () => {
      getActiveGridRef()?.unfocusTerminal();
    },
    getFocusedIndex: () => {
      return getActiveGridRef()?.getFocusedIndex() ?? null;
    },
    // Terminal actions
    clearTerminal: async () => {
      await getActiveGridRef()?.clearTerminal();
    },
    closeSession: async () => {
      await getActiveGridRef()?.closeSession();
    },
    restartSession: async () => {
      await getActiveGridRef()?.restartSession();
    },
  }), [tabs]);

  // Create stable callbacks per tab to avoid infinite re-render loops
  // The callbacks are memoized by tab.id so they don't change on every render
  const sessionCountChangeCallbacks = useMemo(() => {
    const callbacks = new Map<string, (slotCount: number, launchedCount: number) => void>();
    for (const tab of tabs) {
      callbacks.set(tab.id, (slotCount: number, launchedCount: number) => {
        onSessionCountChange?.(tab.id, slotCount, launchedCount);
      });
    }
    return callbacks;
  }, [tabs, onSessionCountChange]);

  // Stable launch callbacks per tab
  const launchCallbacks = useMemo(() => {
    const callbacks = new Map<string, () => void>();
    for (const tab of tabs) {
      callbacks.set(tab.id, () => {
        setSessionsLaunched(tab.id, true);
      });
    }
    return callbacks;
  }, [tabs, setSessionsLaunched]);

  // Stable ref setters per tab
  const gridRefSetters = useMemo(() => {
    const setters = new Map<string, (handle: TerminalGridHandle | null) => void>();
    for (const tab of tabs) {
      setters.set(tab.id, (handle: TerminalGridHandle | null) => {
        if (handle) {
          gridRefs.current.set(tab.id, handle);
        } else {
          gridRefs.current.delete(tab.id);
        }
      });
    }
    return setters;
  }, [tabs]);

  // No projects open - show simple message
  if (tabs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-maestro-muted">
          Select a directory to launch Claude Code instances
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Render ALL project views in a stacked container (ZStack equivalent) */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`absolute inset-0 transition-opacity duration-150 ${
            tab.active
              ? "opacity-100 pointer-events-auto z-10"
              : "opacity-0 pointer-events-none z-0"
          }`}
          style={{
            // Keep in DOM but visually hidden when inactive
            visibility: tab.active ? "visible" : "hidden",
          }}
        >
          {tab.sessionsLaunched ? (
            <TerminalGrid
              ref={gridRefSetters.get(tab.id)}
              tabId={tab.id}
              projectPath={tab.projectPath}
              preserveOnHide={true}
              onSessionCountChange={sessionCountChangeCallbacks.get(tab.id)}
            />
          ) : (
            <IdleLandingView onAdd={launchCallbacks.get(tab.id)!} />
          )}
        </div>
      ))}
    </div>
  );
});

/**
 * Get a grid handle for a specific tab to call addSession.
 */
export function useMultiProjectGridRef() {
  const gridRefs = useRef<Map<string, TerminalGridHandle>>(new Map());

  return {
    getGridRef: (tabId: string) => gridRefs.current.get(tabId),
    setGridRef: (tabId: string, handle: TerminalGridHandle | null) => {
      if (handle) {
        gridRefs.current.set(tabId, handle);
      } else {
        gridRefs.current.delete(tabId);
      }
    },
  };
}
