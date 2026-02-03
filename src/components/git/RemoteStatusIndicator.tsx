import { Check, Loader2, X } from "lucide-react";
import type { RemoteStatus } from "@/stores/useGitStore";

interface RemoteStatusIndicatorProps {
  status: RemoteStatus;
  size?: "sm" | "md";
}

/**
 * Shows a connection status indicator for a git remote.
 * - unknown: gray dot
 * - checking: spinning loader
 * - connected: green dot with checkmark
 * - disconnected: red dot with X
 */
export function RemoteStatusIndicator({ status, size = "sm" }: RemoteStatusIndicatorProps) {
  const dotSize = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  const iconSize = size === "sm" ? 10 : 12;

  if (status === "checking") {
    return <Loader2 size={iconSize} className="animate-spin text-muted-foreground shrink-0" />;
  }

  if (status === "connected") {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <span className={`${dotSize} rounded-full bg-green-500`} />
        <Check size={iconSize} className="text-green-500" />
      </div>
    );
  }

  if (status === "disconnected") {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <span className={`${dotSize} rounded-full bg-destructive`} />
        <X size={iconSize} className="text-destructive" />
      </div>
    );
  }

  // unknown
  return <span className={`${dotSize} rounded-full bg-muted-foreground shrink-0`} />;
}
