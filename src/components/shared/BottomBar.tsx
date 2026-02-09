import { FolderOpen, Play, Plus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BottomBarProps {
  inGridView: boolean;
  slotCount: number;
  launchedCount: number;
  maxSessions?: number;
  isStoppingAll?: boolean;
  onSelectDirectory: () => void;
  onLaunchAll: () => void;
  onStopAll: () => void;
  onAddSession?: () => void;
}

export function BottomBar({
  inGridView,
  slotCount,
  launchedCount,
  maxSessions = 6,
  isStoppingAll = false,
  onSelectDirectory,
  onLaunchAll,
  onStopAll,
  onAddSession,
}: BottomBarProps) {
  const hasRunningSessions = launchedCount > 0;
  const hasUnlaunchedSlots = slotCount > launchedCount;
  const unlaunchedCount = slotCount - launchedCount;

  return (
    <div className="no-select flex h-11 md:h-11 items-center justify-center gap-2 md:gap-3 px-2 md:px-4 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        onClick={inGridView ? undefined : onSelectDirectory}
        disabled={inGridView}
        className="gap-2"
      >
        <FolderOpen size={13} />
        Select Directory
      </Button>

      {inGridView && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAddSession}
          disabled={slotCount >= maxSessions}
          className="gap-2"
        >
          <Plus size={13} />
          Add Session
        </Button>
      )}

      {hasRunningSessions && (
        <Button
          variant="destructive"
          size="sm"
          onClick={isStoppingAll ? undefined : onStopAll}
          disabled={isStoppingAll}
          className="gap-2"
        >
          <Square size={11} />
          {isStoppingAll ? "Stopping..." : "Stop All"}
        </Button>
      )}

      {(hasUnlaunchedSlots || !inGridView) && (
        <Button
          variant="default"
          size="sm"
          onClick={unlaunchedCount > 0 ? onLaunchAll : undefined}
          disabled={unlaunchedCount === 0}
          className="gap-2"
        >
          <Play size={11} fill="currentColor" />
          {unlaunchedCount === 0
            ? "Launch Sessions"
            : unlaunchedCount === 1
              ? "Launch Session"
              : `Launch All (${unlaunchedCount})`}
        </Button>
      )}
    </div>
  );
}
