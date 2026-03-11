import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import type { SessionConfig } from "@/stores/useSessionStore"
import * as officeRenderer from "./office/office-renderer"
import * as officeAudio from "./office/office-audio"
import "./pixel-agents.css"

interface OfficeModalProps {
  sessions: SessionConfig[]
  onClose: () => void
}

export function OfficeModal({ sessions, onClose }: OfficeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; session: SessionConfig } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: number; projectPath: string } | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(false)

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null)
        onClose()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  // Initialize office
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false

    async function setup() {
      try {
        await officeRenderer.init(canvas!)
        if (cancelled) return
        officeRenderer.startLoop(canvas!, sessions)
        setLoading(false)
        fitCanvas()
      } catch (err) {
        if (!cancelled) setError(String(err))
      }
    }

    setup()

    return () => {
      cancelled = true
      officeRenderer.stop()
    }
    // Only init once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update sessions when they change
  useEffect(() => {
    if (!loading) {
      officeRenderer.updateSessions(sessions)
    }
  }, [sessions, loading])

  // Sound effect
  useEffect(() => {
    if (!soundEnabled) {
      officeAudio.stopAll()
      return
    }
    const workingCount = sessions.filter(s => s.status === "Working").length
    officeAudio.setWorkingCount(workingCount)

    return () => officeAudio.stopAll()
  }, [soundEnabled, sessions])

  // Fit canvas to viewport
  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const logicalW = officeRenderer.baseWidth || canvas.width
    const logicalH = officeRenderer.baseHeight || canvas.height
    const maxW = window.innerWidth * 0.9
    const maxH = window.innerHeight * 0.9
    const scale = Math.min(maxW / logicalW, maxH / logicalH, 2)

    canvas.style.width = `${Math.floor(logicalW * scale)}px`
    canvas.style.height = `${Math.floor(logicalH * scale)}px`
  }, [])

  useEffect(() => {
    window.addEventListener("resize", fitCanvas)
    return () => window.removeEventListener("resize", fitCanvas)
  }, [fitCanvas])

  // Convert mouse event to logical canvas coordinates, with zero-guard (F1+F6)
  const canvasToLogical = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current
    if (!canvas || officeRenderer.baseWidth === 0 || officeRenderer.baseHeight === 0) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / (rect.width / officeRenderer.baseWidth),
      y: (e.clientY - rect.top) / (rect.height / officeRenderer.baseHeight),
    }
  }

  const focusSession = (id: number) => {
    window.dispatchEvent(new CustomEvent("focus-session", { detail: { sessionId: id } }))
  }

  // Click character to focus session
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setContextMenu(null) // F5: dismiss context menu on any click
    const pos = canvasToLogical(e)
    if (!pos) return
    const sessionId = officeRenderer.hitTest(pos.x, pos.y)
    if (sessionId != null) {
      focusSession(sessionId)
      onClose()
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = canvasToLogical(e)
    if (!pos) { setTooltip(null); return }
    const sessionId = officeRenderer.hitTest(pos.x, pos.y)
    if (sessionId != null) {
      const session = sessions.find(s => s.id === sessionId)
      if (session) {
        setTooltip({ x: e.clientX + 12, y: e.clientY + 12, session })
        return
      }
    }
    setTooltip(null)
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const pos = canvasToLogical(e)
    if (!pos) return
    const sessionId = officeRenderer.hitTest(pos.x, pos.y)
    if (sessionId != null) {
      const session = sessions.find(s => s.id === sessionId)
      if (session) {
        setContextMenu({ x: e.clientX, y: e.clientY, sessionId, projectPath: session.project_path })
        return
      }
    }
    setContextMenu(null)
  }

  // Click backdrop to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      setContextMenu(null)
      onClose()
    }
  }

  return createPortal(
    <div
      ref={containerRef}
      className="pixel-office-modal"
      onClick={handleBackdropClick}
    >
      <button
        type="button"
        className="pixel-office-sound-toggle"
        onClick={() => setSoundEnabled(s => !s)}
      >
        {soundEnabled ? "\uD83D\uDD0A" : "\uD83D\uDD07"}
      </button>

      <button type="button" className="pixel-office-close" onClick={onClose}>
        <X size={16} />
      </button>

      {loading && !error && (
        <div className="pixel-office-loading">
          <div
            className="pixel-office-loading-sprite"
            style={{
              backgroundImage: "url(/pixel-agents/avatar_0.webp)",
              backgroundPosition: "0px 0px",
            }}
          />
          Loading office...
        </div>
      )}

      {error && (
        <div className="pixel-office-loading" style={{ color: "#ef4444" }}>
          Failed to load office: {error}
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="pixel-office-canvas"
        style={{ display: loading ? "none" : "block", cursor: "pointer" }}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={() => setTooltip(null)}
        onContextMenu={handleContextMenu}
      />

      {tooltip && (
        <div className="pixel-office-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div className="pixel-office-tooltip-title">
            {tooltip.session.project_path?.split("/").pop() ?? tooltip.session.mode}
          </div>
          <div className="pixel-office-tooltip-status">
            {tooltip.session.status} — {tooltip.session.mode}
          </div>
          {tooltip.session.statusMessage && (
            <div className="pixel-office-tooltip-msg">{tooltip.session.statusMessage}</div>
          )}
        </div>
      )}

      {contextMenu && (
        <div className="pixel-office-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => { focusSession(contextMenu.sessionId); onClose() }}>
            View Session
          </button>
          <button onClick={() => { navigator.clipboard.writeText(contextMenu.projectPath); setContextMenu(null) }}>
            Copy Project Path
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
