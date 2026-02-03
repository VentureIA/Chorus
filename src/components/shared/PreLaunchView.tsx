import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface PreLaunchViewProps {
  onSelectProject: () => void;
}

export function PreLaunchView({ onSelectProject }: PreLaunchViewProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <Card className="p-6">
          <FolderOpen size={48} className="text-primary" />
        </Card>
        <h1 className="text-2xl font-bold text-foreground">Welcome to Chorus</h1>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Multi-session AI orchestrator for Linux. Open a project to get started with Claude,
          Gemini, or Codex sessions.
        </p>
      </div>

      <Button onClick={onSelectProject} className="gap-2">
        <FolderOpen size={16} />
        Open Project
      </Button>

      <div className="mt-8 grid grid-cols-3 gap-6 text-center text-xs text-muted-foreground">
        <div>
          <div className="mb-1 text-lg font-bold text-foreground">12</div>
          <div>Max Sessions</div>
        </div>
        <div>
          <div className="mb-1 text-lg font-bold text-foreground">4</div>
          <div>AI Modes</div>
        </div>
        <div>
          <div className="mb-1 text-lg font-bold text-foreground">Git</div>
          <div>Worktrees</div>
        </div>
      </div>
    </div>
  );
}
