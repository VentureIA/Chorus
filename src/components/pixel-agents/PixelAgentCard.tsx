import { useCallback, useEffect, useRef, useState } from "react"
import type { BackendSessionStatus } from "@/stores/useSessionStore"
import { usePixelAnimation } from "./usePixelAnimation"
import {
  AVATAR_FILES,
  POKE_MESSAGES,
  STATE_CONFIG,
  avatarFromSessionId,
} from "./sprite-config"

interface PixelAgentCardProps {
  sessionId: number
  status: BackendSessionStatus
  mode: string
  projectPath: string
  statusMessage?: string
  title?: string
  onClick?: () => void
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function PixelAgentCard({
  sessionId,
  status,
  mode,
  statusMessage,
  title,
  onClick,
}: PixelAgentCardProps) {
  const spriteRef = useRef<HTMLDivElement>(null)
  const config = STATE_CONFIG[status]
  const avatarIndex = avatarFromSessionId(sessionId)
  const avatarFile = AVATAR_FILES[avatarIndex]

  // Poke state
  const [pokeMsg, setPokeMsg] = useState<string | null>(null)
  const pokeTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  // Timer for Working state
  const [elapsed, setElapsed] = useState(0)
  const workStartRef = useRef<number | null>(null)

  // Determine animation
  const currentAnim = pokeMsg ? "front_alert_jump" : config.anim
  usePixelAnimation(spriteRef, currentAnim)

  // Working timer
  useEffect(() => {
    if (status === "Working") {
      if (!workStartRef.current) workStartRef.current = Date.now()
      const id = setInterval(() => {
        setElapsed(Date.now() - workStartRef.current!)
      }, 1000)
      return () => clearInterval(id)
    }
    workStartRef.current = null
    setElapsed(0)
  }, [status])

  // Poke interaction
  const handlePoke = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      clearTimeout(pokeTimeoutRef.current)
      const msg = POKE_MESSAGES[Math.floor(Math.random() * POKE_MESSAGES.length)]
      setPokeMsg(msg)
      pokeTimeoutRef.current = setTimeout(() => setPokeMsg(null), 2000)
    },
    [],
  )

  useEffect(() => {
    return () => clearTimeout(pokeTimeoutRef.current)
  }, [])

  const dataState = pokeMsg
    ? "poke"
    : status === "Working"
      ? "working"
      : status === "NeedsInput"
        ? "help"
        : status === "Done"
          ? "complete"
          : status === "Error" || status === "Timeout"
            ? "error"
            : "waiting"

  const bubbleText = pokeMsg ?? statusMessage ?? config.label
  const displayName = title ?? `${mode} #${sessionId}`

  return (
    <div
      className="pixel-agent-card pixel-agent-enter"
      data-state={dataState}
      onClick={onClick}
      title={`${displayName} — ${config.label}`}
    >
      {/* Character sprite */}
      <div
        ref={spriteRef}
        className="pixel-agent-character"
        style={{
          backgroundImage: `url(/pixel-agents/${avatarFile})`,
        }}
        onClick={handlePoke}
      />

      {/* Speech bubble */}
      <div className="pixel-agent-bubble">
        {status === "Working" && !pokeMsg ? (
          <>
            Working
            <span className="thinking-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </>
        ) : (
          bubbleText
        )}
      </div>

      {/* Timer */}
      {status === "Working" && elapsed > 0 && (
        <div className="pixel-agent-timer">{formatElapsed(elapsed)}</div>
      )}

      {/* Name badge */}
      <div
        className="mt-1 truncate text-center text-[8px] leading-tight text-muted-foreground"
        style={{ maxWidth: 72 }}
      >
        {displayName}
      </div>
    </div>
  )
}
