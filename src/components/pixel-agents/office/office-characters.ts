import type { SessionConfig, BackendSessionStatus } from "@/stores/useSessionStore"
import { AVATAR_FILES, avatarFromSessionId, OFFICE, SEAT_MAP, IDLE_SEAT_MAP, STATE_COLORS } from "./office-config"
import { findPath } from "./office-pathfinder"
import { tickAnimation } from "./office-sprites"
import type { OfficeCoords } from "./office-coords"

export interface OfficeCharacter {
  id: number
  x: number
  y: number
  path: Array<{ x: number; y: number }>
  pathIndex: number
  facingDir: "down" | "up" | "left" | "right"
  avatarFile: string
  deskIndex: number | undefined
  currentAnim: string
  animFrame: number
  animTimer: number
  agentState: string
  bubble: { text: string; color: string; expiresAt: number }
  name: string
}

const characters = new Map<number, OfficeCharacter>()
const seatAssignments = new Map<number, number>() // deskId → characterId

function mapStatus(status: BackendSessionStatus): string {
  switch (status) {
    case "Working": return "working"
    case "NeedsInput": return "help"
    case "Done": return "complete"
    case "Error":
    case "Timeout": return "error"
    default: return "waiting"
  }
}

function stateZone(state: string): "desk" | "idle" {
  if (state === "working" || state === "thinking" || state === "error" || state === "help") return "desk"
  return "idle"
}

export function getCharacters(): OfficeCharacter[] {
  return Array.from(characters.values())
}

export function syncSessions(
  sessions: SessionConfig[],
  coords: OfficeCoords,
  bgW: number,
  bgH: number,
): void {
  const activeIds = new Set(sessions.map((s) => s.id))

  // Remove characters for removed sessions
  for (const id of characters.keys()) {
    if (!activeIds.has(id)) {
      releaseDesk(id)
      characters.delete(id)
    }
  }

  // Add/update characters
  for (const session of sessions) {
    const state = mapStatus(session.status)
    const existing = characters.get(session.id)

    if (!existing) {
      // Spawn new character
      const avatarIdx = avatarFromSessionId(session.id)
      const centerX = bgW / 2 + (Math.random() - 0.5) * 160
      const centerY = bgH / 2 + (Math.random() - 0.5) * 160
      const char: OfficeCharacter = {
        id: session.id,
        x: centerX,
        y: centerY,
        path: [],
        pathIndex: 0,
        facingDir: "down",
        avatarFile: AVATAR_FILES[avatarIdx],
        deskIndex: undefined,
        currentAnim: "front_idle",
        animFrame: 0,
        animTimer: 0,
        agentState: state,
        bubble: {
          text: session.statusMessage ?? STATE_CONFIG_LABEL[state],
          color: STATE_COLORS[state] ?? "#94a3b8",
          expiresAt: Date.now() + 8000,
        },
        name: session.title ?? `${session.mode} #${session.id}`,
      }

      if (stateZone(state) === "desk") {
        assignDesk(char, coords)
      }
      setTarget(char, coords)
      characters.set(session.id, char)
    } else {
      // Update existing
      const prevState = existing.agentState
      existing.agentState = state
      existing.name = session.title ?? `${session.mode} #${session.id}`

      if (prevState !== state) {
        // State changed — update zone
        existing.bubble = {
          text: session.statusMessage ?? STATE_CONFIG_LABEL[state],
          color: STATE_COLORS[state] ?? "#94a3b8",
          expiresAt: Date.now() + 8000,
        }

        if (stateZone(prevState) !== stateZone(state)) {
          if (stateZone(state) === "desk") {
            assignDesk(existing, coords)
          } else {
            releaseDesk(existing.id)
          }
          setTarget(existing, coords)
        }
      }
    }
  }
}

const STATE_CONFIG_LABEL: Record<string, string> = {
  working: "Working...",
  thinking: "Thinking...",
  waiting: "Idle",
  complete: "Done!",
  error: "Error!",
  help: "Need help!",
}

function assignDesk(char: OfficeCharacter, coords: OfficeCoords): void {
  // Find available desk
  const available = coords.desk.filter((d) => !seatAssignments.has(d.id))
  if (available.length === 0) return

  const hash = avatarFromSessionId(char.id)
  const desk = available[hash % available.length]
  char.deskIndex = desk.id
  seatAssignments.set(desk.id, char.id)
}

function releaseDesk(charId: number): void {
  for (const [deskId, assignedId] of seatAssignments) {
    if (assignedId === charId) {
      seatAssignments.delete(deskId)
      break
    }
  }
  const char = characters.get(charId)
  if (char) char.deskIndex = undefined
}

function setTarget(char: OfficeCharacter, coords: OfficeCoords): void {
  let target: { x: number; y: number } | undefined

  if (stateZone(char.agentState) === "desk" && char.deskIndex !== undefined) {
    const desk = coords.desk.find((d) => d.id === char.deskIndex)
    if (desk) target = { x: desk.x, y: desk.y }
  }

  if (!target) {
    // Go to random idle spot
    const idleSpots = coords.idle
    if (idleSpots.length > 0) {
      const idx = avatarFromSessionId(char.id) % idleSpots.length
      target = { x: idleSpots[idx].x, y: idleSpots[idx].y }
    }
  }

  if (target) {
    char.path = findPath(char.x, char.y, target.x, target.y)
    char.pathIndex = 0
  }
}

export function updateAll(deltaSec: number, deltaMs: number): void {
  for (const char of characters.values()) {
    // Move along path
    if (char.path.length > 0 && char.pathIndex < char.path.length) {
      const target = char.path[char.pathIndex]
      const dx = target.x - char.x
      const dy = target.y - char.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < OFFICE.ARRIVE_THRESHOLD) {
        char.x = target.x
        char.y = target.y
        char.pathIndex++

        if (char.pathIndex >= char.path.length) {
          // Arrived at destination
          char.path = []
          setArrivalAnim(char)
        }
      } else {
        const speed = OFFICE.MOVE_SPEED * deltaSec
        const ratio = Math.min(speed / dist, 1)
        char.x += dx * ratio
        char.y += dy * ratio

        // Update facing direction
        if (Math.abs(dx) > Math.abs(dy)) {
          char.facingDir = dx > 0 ? "right" : "left"
        } else {
          char.facingDir = dy > 0 ? "down" : "up"
        }

        // Walking animation
        const dirMap: Record<string, string> = {
          down: "front_walk",
          up: "back_walk",
          left: "left_walk",
          right: "right_walk",
        }
        char.currentAnim = dirMap[char.facingDir] ?? "front_walk"
      }
    }

    // Tick sprite animation
    tickAnimation(char, deltaMs)
  }
}

function setArrivalAnim(char: OfficeCharacter): void {
  const zone = stateZone(char.agentState)

  if (char.agentState === "complete") {
    char.currentAnim = "front_done_dance"
    return
  }
  if (char.agentState === "error" || char.agentState === "help") {
    char.currentAnim = "front_alert_jump"
    return
  }

  if (zone === "desk" && char.deskIndex !== undefined) {
    const seat = SEAT_MAP[char.deskIndex]
    if (seat) {
      const prefix = seat.dir === "down" ? "front" : seat.dir === "up" ? "back" : seat.dir
      char.currentAnim = char.agentState === "working"
        ? `${prefix}_sit_work`
        : `${prefix}_sit_idle`
    } else {
      char.currentAnim = "front_sit_work"
    }
  } else {
    // Idle zone
    const idleSeat = char.deskIndex !== undefined ? IDLE_SEAT_MAP[char.deskIndex] : undefined
    if (idleSeat === "dance") {
      char.currentAnim = "front_done_dance"
    } else {
      char.currentAnim = "front_idle"
    }
  }

  char.animFrame = 0
  char.animTimer = 0
}

export function clearAll(): void {
  characters.clear()
  seatAssignments.clear()
}
