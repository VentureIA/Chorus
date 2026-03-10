import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import type { SessionConfig } from "@/stores/useSessionStore"
import * as officeRenderer from "./office/office-renderer"
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

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
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

  // Click backdrop to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current) onClose()
  }

  return createPortal(
    <div
      ref={containerRef}
      className="pixel-office-modal"
      onClick={handleBackdropClick}
    >
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
        style={{ display: loading ? "none" : "block" }}
      />
    </div>,
    document.body,
  )
}
