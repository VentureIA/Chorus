import { AVATAR_FILES, SHEET, ANIM_SEQUENCES, IDLE_ANIM_KEYS, OFFICE } from "./office-config"
import type { OfficeCharacter } from "./office-characters"

const skinImages = new Map<string, HTMLImageElement>()

export async function loadAllSkins(): Promise<void> {
  const promises = AVATAR_FILES.map(
    (file) =>
      new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => {
          skinImages.set(file, img)
          resolve()
        }
        img.onerror = () => resolve()
        img.src = `/pixel-agents/${file}`
      }),
  )
  await Promise.all(promises)
}

export function getSkinImage(avatarFile: string): HTMLImageElement | undefined {
  return skinImages.get(avatarFile) ?? skinImages.values().next().value
}

export function drawSprite(ctx: CanvasRenderingContext2D, char: OfficeCharacter, scale = 1): void {
  const img = getSkinImage(char.avatarFile)
  if (!img) return

  const frames = ANIM_SEQUENCES[char.currentAnim]
  if (!frames || frames.length === 0) return

  const frameIdx = frames[char.animFrame % frames.length]
  const sx = (frameIdx % SHEET.cols) * SHEET.frameWidth
  const sy = Math.floor(frameIdx / SHEET.cols) * SHEET.frameHeight

  const dw = OFFICE.FRAME_W * scale
  const dh = OFFICE.FRAME_H * scale
  const dx = char.x - dw / 2
  const dy = char.y - dh

  ctx.drawImage(img, sx, sy, SHEET.frameWidth, SHEET.frameHeight, dx, dy, dw, dh)
}

export function tickAnimation(char: OfficeCharacter, deltaMs: number): void {
  const frames = ANIM_SEQUENCES[char.currentAnim]
  if (!frames || frames.length === 0) return

  const interval = IDLE_ANIM_KEYS.has(char.currentAnim) ? OFFICE.IDLE_ANIM_INTERVAL : OFFICE.ANIM_INTERVAL

  char.animTimer += deltaMs
  while (char.animTimer >= interval) {
    char.animTimer -= interval
    char.animFrame = (char.animFrame + 1) % frames.length
  }
}
