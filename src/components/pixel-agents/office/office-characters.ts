import type { SessionConfig, BackendSessionStatus } from "@/stores/useSessionStore"
import { AVATAR_FILES, avatarFromSessionId, OFFICE, SEAT_MAP, IDLE_SEAT_MAP, STATE_COLORS } from "./office-config"
import { findPath, findNearestWalkable } from "./office-pathfinder"
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
  deskGraceUntil: number
  idleActionTimer: number
}

const DESK_GRACE_MS = 10_000

const characters = new Map<number, OfficeCharacter>()
const seatAssignments = new Map<number, number>() // deskId → characterId
let cachedCoords: OfficeCoords | null = null

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
  _bgW: number,
  bgH: number,
): void {
  cachedCoords = coords
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
      // Spawn from entrance (left edge of office)
      const enterX = 16
      const enterY = bgH / 2
      // Use findNearestWalkable to ensure valid spawn position
      const walkable = findNearestWalkable(enterX, enterY)
      const spawnX = walkable?.x ?? enterX
      const spawnY = walkable?.y ?? enterY
      const char: OfficeCharacter = {
        id: session.id,
        x: spawnX,
        y: spawnY,
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
        name: session.project_path?.split("/").pop() ?? session.mode,
        deskGraceUntil: 0,
        idleActionTimer: 8 + Math.random() * 12,
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
      existing.name = session.project_path?.split("/").pop() ?? session.mode

      if (prevState !== state) {
        // State changed — update zone
        existing.bubble = {
          text: session.statusMessage ?? STATE_CONFIG_LABEL[state],
          color: STATE_COLORS[state] ?? "#94a3b8",
          expiresAt: Date.now() + 8000,
        }

        const prevZone = stateZone(prevState)
        const newZone = stateZone(state)

        if (prevZone !== newZone) {
          if (newZone === "desk") {
            // Returning to work — cancel grace, stay at desk
            if (existing.deskGraceUntil > 0) {
              existing.deskGraceUntil = 0
              setArrivalAnim(existing)
            } else {
              assignDesk(existing, coords)
              setTarget(existing, coords)
            }
          } else {
            // desk → idle: start grace period, stay seated but show idle anim
            existing.deskGraceUntil = Date.now() + DESK_GRACE_MS
            setArrivalAnim(existing)
            // DON'T release desk or setTarget — character stays at desk
          }
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
    // Check grace period expiry
    if (char.deskGraceUntil > 0 && Date.now() > char.deskGraceUntil) {
      char.deskGraceUntil = 0
      if (stateZone(char.agentState) === "idle") {
        releaseDesk(char.id)
        if (cachedCoords) setTarget(char, cachedCoords)
      }
    }

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

    // Idle behavior
    if (stateZone(char.agentState) === "idle" && char.path.length === 0 && char.deskGraceUntil === 0) {
      char.idleActionTimer -= deltaSec
      if (char.idleActionTimer <= 0) {
        const roll = Math.random()

        if (roll < 0.4) {
          // Head turn: cycle through idle directions
          const dirs = ["front_idle", "left_idle", "right_idle", "front_idle"]
          const currentIdx = dirs.indexOf(char.currentAnim)
          const nextIdx = (currentIdx + 1) % dirs.length
          char.currentAnim = dirs[nextIdx] || "front_idle"
          char.animFrame = 0
          char.animTimer = 0
        } else if (roll < 0.7) {
          // Micro-movement: walk to nearby idle spot
          if (cachedCoords) {
            const nearbySpots = cachedCoords.idle.filter(spot => {
              const dx = spot.x - char.x
              const dy = spot.y - char.y
              const dist = dx * dx + dy * dy
              return dist > 16 * 16 && dist < 96 * 96  // between 16 and 96 px away
            })
            if (nearbySpots.length > 0) {
              const spot = nearbySpots[Math.floor(Math.random() * nearbySpots.length)]
              char.path = findPath(char.x, char.y, spot.x, spot.y)
              char.pathIndex = 0
            }
          }
        } else {
          // Social interaction: face nearby idle character
          const others = Array.from(characters.values()).filter(other => {
            if (other.id === char.id) return false
            if (stateZone(other.agentState) !== "idle") return false
            if (other.path.length > 0) return false
            const dx = other.x - char.x
            const dy = other.y - char.y
            return dx * dx + dy * dy < 96 * 96
          })
          if (others.length > 0) {
            const other = others[Math.floor(Math.random() * others.length)]
            // Face each other
            const dx = other.x - char.x
            const dy = other.y - char.y
            if (Math.abs(dx) > Math.abs(dy)) {
              char.facingDir = dx > 0 ? "right" : "left"
              other.facingDir = dx > 0 ? "left" : "right"
            } else {
              char.facingDir = dy > 0 ? "down" : "up"
              other.facingDir = dy > 0 ? "up" : "down"
            }
            const dirAnimMap: Record<string, string> = {
              down: "front_idle", up: "back_idle", left: "left_idle", right: "right_idle"
            }
            char.currentAnim = dirAnimMap[char.facingDir] ?? "front_idle"
            other.currentAnim = dirAnimMap[other.facingDir] ?? "front_idle"
            char.animFrame = 0
            other.animFrame = 0
            // Both characters pause longer (social cooldown)
            other.idleActionTimer = 5 + Math.random() * 3
          }
        }

        // Reset timer
        char.idleActionTimer = 12 + Math.random() * 13
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

  if ((zone === "desk" || char.deskGraceUntil > 0) && char.deskIndex !== undefined) {
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
