// Office constants re-exported from sprite-config for use by office modules
export { OFFICE, SEAT_MAP, IDLE_SEAT_MAP, LAPTOP_ID_MAP, STATE_COLORS, STATE_ZONE_MAP } from "../sprite-config"
export { SHEET, ANIM_SEQUENCES, AVATAR_FILES, avatarFromSessionId } from "../sprite-config"

// Idle animation keys (use slower FPS)
export const IDLE_ANIM_KEYS = new Set([
  "front_idle", "left_idle", "right_idle", "back_idle",
  "front_sit_idle", "left_sit_idle", "right_sit_idle", "back_sit_idle",
])
