import { useState } from "react"
import { Building2, Users } from "lucide-react"
import { useSessionStore } from "@/stores/useSessionStore"
import { useWorkspaceStore } from "@/stores/useWorkspaceStore"
import { PixelAgentCard } from "@/components/pixel-agents/PixelAgentCard"
import { OfficeModal } from "@/components/pixel-agents/OfficeModal"
import "@/components/pixel-agents/pixel-agents.css"

const cardClass =
  "rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"

export function AgentsTab() {
  const allSessions = useSessionStore((s) => s.sessions)
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTab = tabs.find((t) => t.active)
  const activeProjectPath = activeTab?.projectPath ?? ""
  const [officeOpen, setOfficeOpen] = useState(false)

  const projectSessions = activeProjectPath
    ? allSessions.filter((s) => s.project_path === activeProjectPath)
    : allSessions

  return (
    <div className="space-y-2.5">
      {/* Header with office button */}
      <div className={cardClass}>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Users size={12} />
            Agents
            {projectSessions.length > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">
                {projectSessions.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOfficeOpen(true)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Open virtual office"
          >
            <Building2 size={10} />
            Office
          </button>
        </div>

        {/* Agent grid */}
        {projectSessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center text-[10px] text-muted-foreground">
            <div
              className="pixel-agent-character"
              style={{
                backgroundImage: "url(/pixel-agents/avatar_0.webp)",
                backgroundPosition: "0px 0px",
                backgroundSize: "384px 576px",
                imageRendering: "pixelated",
                width: 48,
                height: 64,
              }}
            />
            No active agents
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 justify-items-center">
            {projectSessions.map((session) => (
              <PixelAgentCard
                key={session.id}
                sessionId={session.id}
                status={session.status}
                mode={session.mode}
                projectPath={session.project_path}
                statusMessage={session.statusMessage}
                title={session.title}
                onClick={() => {
                  // Navigate to session terminal
                  const event = new CustomEvent("focus-session", {
                    detail: { sessionId: session.id },
                  })
                  window.dispatchEvent(event)
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Office modal */}
      {officeOpen && (
        <OfficeModal
          sessions={allSessions}
          onClose={() => setOfficeOpen(false)}
        />
      )}
    </div>
  )
}
