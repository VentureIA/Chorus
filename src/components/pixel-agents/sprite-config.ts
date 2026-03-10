import type { BackendSessionStatus } from "@/stores/useSessionStore"

// Sprite sheet constants
export const SHEET = {
  cols: 8,
  rows: 9,
  frameWidth: 48,
  frameHeight: 64,
  sheetWidth: 384,  // cols * frameWidth
  sheetHeight: 576, // rows * frameHeight
} as const

// Animation sequences from sprite-frames.json
export const ANIM_SEQUENCES: Record<string, number[]> = {
  front_idle:       [0,  1,  2,  3],
  front_walk:       [4,  5,  6,  7],
  front_sit_idle:   [8,  9,  10, 11],
  front_sit_work:   [12, 13, 14, 15],
  left_idle:        [16, 17, 18, 19],
  left_walk:        [20, 21, 22, 23],
  left_sit_idle:    [24, 25, 26, 27],
  left_sit_work:    [28, 29, 30, 31],
  right_idle:       [32, 33, 34, 35],
  right_walk:       [36, 37, 38, 39],
  right_sit_idle:   [40, 41, 42, 43],
  right_sit_work:   [44, 45, 46, 47],
  back_idle:        [48, 49, 50, 51],
  back_walk:        [52, 53, 54, 55],
  back_sit_idle:    [56, 57, 58, 59],
  back_sit_work:    [60, 61, 62, 63],
  front_done_dance: [64, 65, 66, 67],
  front_alert_jump: [68, 69, 70, 71],
}

export type AgentVisualState = "working" | "thinking" | "waiting" | "complete" | "error" | "help"

export interface StateConfig {
  anim: string
  label: string
  color: string
  borderColor: string
  pulse?: boolean
}

// Map Chorus BackendSessionStatus → pixel-agent visual state
export const STATE_CONFIG: Record<BackendSessionStatus, StateConfig> = {
  Starting:   { anim: "front_idle",       label: "Starting",    color: "#94a3b8", borderColor: "border-slate-400" },
  Idle:       { anim: "front_idle",       label: "Idle",        color: "#94a3b8", borderColor: "border-slate-400" },
  Working:    { anim: "front_done_dance", label: "Working",     color: "#f97316", borderColor: "border-orange-500", pulse: true },
  NeedsInput: { anim: "front_alert_jump", label: "Needs Input", color: "#ef4444", borderColor: "border-red-500" },
  Done:       { anim: "front_alert_jump", label: "Done!",       color: "#22c55e", borderColor: "border-green-500" },
  Error:      { anim: "front_alert_jump", label: "Error",       color: "#ef4444", borderColor: "border-red-500" },
  Timeout:    { anim: "front_alert_jump", label: "Timeout",     color: "#ef4444", borderColor: "border-red-500" },
}

// State to office zone mapping
export const STATE_ZONE_MAP: Record<string, "desk" | "idle"> = {
  working:  "desk",
  thinking: "desk",
  waiting:  "idle",
  complete: "idle",
  help:     "desk",
  error:    "desk",
}

export const STATE_COLORS: Record<string, string> = {
  idle:      "#94a3b8",
  working:   "#f97316",
  thinking:  "#8b5cf6",
  waiting:   "#94a3b8",
  complete:  "#22c55e",
  done:      "#22c55e",
  error:     "#ef4444",
  help:      "#ef4444",
}

export const AVATAR_FILES = [
  "avatar_0.webp",
  "avatar_1.webp",
  "avatar_2.webp",
  "avatar_3.webp",
  "avatar_4.webp",
  "avatar_5.webp",
  "avatar_6.webp",
  "avatar_7.webp",
]

// Deterministic avatar hash — same algorithm as pixel-agent-desk
export function avatarFromSessionId(id: number): number {
  const str = String(id)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % AVATAR_FILES.length
}

export const POKE_MESSAGES = [
  "Hey! I'm working here!",
  "Stop poking me!",
  "Need more coffee...",
  "Bug? What bug?",
  "It works on my machine",
  "Have you tried turning it off?",
  "I'm not a button!",
  "Compiling...",
]

// Office constants
export const OFFICE = {
  TILE_SIZE: 32,
  FRAME_W: 48,
  FRAME_H: 64,
  COLS: 8,
  ANIM_FPS: 8,
  ANIM_INTERVAL: 125,
  IDLE_ANIM_INTERVAL: 500,
  MOVE_SPEED: 110,
  ARRIVE_THRESHOLD: 2,
} as const

// Seat map: desk ID → direction + pose
export const SEAT_MAP: Record<number, { dir: string; animType: string }> = {
  10: { dir: "right", animType: "sit" },
  12: { dir: "right", animType: "sit" },
  18: { dir: "right", animType: "sit" },
  28: { dir: "right", animType: "sit" },
  11: { dir: "left", animType: "sit" },
  13: { dir: "left", animType: "sit" },
  19: { dir: "left", animType: "sit" },
  29: { dir: "left", animType: "sit" },
  24: { dir: "up", animType: "stand" },
  4:  { dir: "up", animType: "sit" },
  5:  { dir: "up", animType: "sit" },
  6:  { dir: "up", animType: "sit" },
  7:  { dir: "up", animType: "sit" },
  14: { dir: "up", animType: "sit" },
  15: { dir: "up", animType: "sit" },
}

export const IDLE_SEAT_MAP: Record<number, string> = {
  18: "right",
  28: "right",
  24: "dance",
  19: "left",
  29: "left",
}

// Laptop ID → desk ID mapping
export const LAPTOP_ID_MAP: Record<number, number> = {
  0: 10, 1: 8, 2: 9, 3: 11,
  4: 0, 5: 1, 6: 2, 7: 3,
  8: 12, 9: 14, 10: 15, 11: 13,
  12: 4, 13: 5, 14: 6, 15: 7,
}
