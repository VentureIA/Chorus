import { BrainCircuit, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface IdleLandingViewProps {
  onAdd: () => void;
}

export function IdleLandingView({ onAdd }: IdleLandingViewProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <BrainCircuit
        size={56}
        strokeWidth={1.2}
        className="motion-safe:animate-breathe motion-reduce:animate-none text-violet-500 drop-shadow-[0_0_10px_rgba(139,92,246,0.6)]"
      />

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-sm text-muted-foreground">Select branch and click Launch</p>
        <p className="text-xs text-muted-foreground/50">Using current branch</p>
      </div>

      <Button
        onClick={onAdd}
        size="icon"
        className="h-14 w-14 rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
        aria-label="Launch new session"
        title="Launch new session"
      >
        <Plus size={28} strokeWidth={1.5} />
      </Button>
    </div>
  );
}
