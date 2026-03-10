import type { SessionConfig } from "@/stores/useSessionStore"
import { buildOfficeLayers, type OfficeLayers } from "./office-layers"
import { parseMapCoordinates, type OfficeCoords } from "./office-coords"
import { initPathfinder } from "./office-pathfinder"
import { loadAllSkins, drawSprite } from "./office-sprites"
import { syncSessions, updateAll, getCharacters, clearAll } from "./office-characters"

interface LaptopImages {
  down: HTMLImageElement | null
  up: HTMLImageElement | null
  left: HTMLImageElement | null
  right: HTMLImageElement | null
}

let layers: OfficeLayers | null = null
let coords: OfficeCoords | null = null
let laptopClosed: LaptopImages = { down: null, up: null, left: null, right: null }
let laptopOpen: LaptopImages = { down: null, up: null, left: null, right: null }
let rafId: number | null = null
let lastTime = 0
let initialized = false

/** Logical (pre-DPR) canvas dimensions, exported for CSS sizing */
export let baseWidth = 0
export let baseHeight = 0

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function init(canvas: HTMLCanvasElement): Promise<void> {
  // Load everything in parallel
  const [officeLayers, , lfc, lfo, lbc, lbo, llc, llo, lrc, lro] = await Promise.all([
    buildOfficeLayers(),
    loadAllSkins(),
    loadImg("/pixel-agents/office/office_laptop_front_close.webp"),
    loadImg("/pixel-agents/office/office_laptop_front_open.webp"),
    loadImg("/pixel-agents/office/office_laptop_back_close.webp"),
    loadImg("/pixel-agents/office/office_laptop_back_open.webp"),
    loadImg("/pixel-agents/office/office_laptop_left_close.webp"),
    loadImg("/pixel-agents/office/office_laptop_left_open.webp"),
    loadImg("/pixel-agents/office/office_laptop_right_close.webp"),
    loadImg("/pixel-agents/office/office_laptop_right_open.webp"),
  ])

  layers = officeLayers
  laptopClosed = { down: lfc, up: lbc, left: llc, right: lrc }
  laptopOpen = { down: lfo, up: lbo, left: llo, right: lro }

  baseWidth = layers.width
  baseHeight = layers.height
  const dpr = window.devicePixelRatio || 1
  canvas.width = layers.width * dpr
  canvas.height = layers.height * dpr

  // Init subsystems that need map dimensions
  await Promise.all([
    initPathfinder(layers.width, layers.height),
    parseMapCoordinates(layers.width, layers.height).then((c) => { coords = c }),
  ])

  initialized = true
}

export function startLoop(canvas: HTMLCanvasElement, sessions: SessionConfig[]): void {
  const ctx = canvas.getContext("2d")
  if (!ctx || !layers || !coords) return

  ctx.imageSmoothingEnabled = false
  const dpr = window.devicePixelRatio || 1
  ctx.scale(dpr, dpr)

  // Sync initial sessions
  syncSessions(sessions, coords, layers.width, layers.height)

  lastTime = performance.now()

  const loop = (now: number) => {
    const deltaMs = Math.min(now - lastTime, 100)
    lastTime = now
    const deltaSec = deltaMs / 1000

    // Update characters
    updateAll(deltaSec, deltaMs)

    // Render (use logical dimensions since ctx is DPR-scaled)
    render(ctx, baseWidth, baseHeight)

    rafId = requestAnimationFrame(loop)
  }

  rafId = requestAnimationFrame(loop)
}

export function updateSessions(sessions: SessionConfig[]): void {
  if (!layers || !coords) return
  syncSessions(sessions, coords, layers.width, layers.height)
}

function render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h)

  // 1. Background
  if (layers?.bgImage) {
    ctx.drawImage(layers.bgImage, 0, 0)
  }

  // 2. Laptops
  if (coords) {
    const chars = getCharacters()
    const seatOccupants = new Map<number, string>()
    for (const char of chars) {
      if (char.deskIndex !== undefined) {
        seatOccupants.set(char.deskIndex, char.agentState)
      }
    }

    for (const spot of coords.laptopSpots) {
      const deskSpot = coords.desk.find(
        (d) => Math.abs(d.x - spot.x) < 32 && Math.abs(d.y - spot.y) < 32,
      )
      const isOccupied = deskSpot ? seatOccupants.has(deskSpot.id) : false
      const imgs = isOccupied ? laptopOpen : laptopClosed
      const img = imgs[spot.dir]
      if (img) {
        ctx.drawImage(img, spot.x - img.width / 2, spot.y - img.height / 2)
      }
    }
  }

  // 3. Characters (Y-sorted)
  const chars = getCharacters().sort((a, b) => a.y - b.y)
  for (const char of chars) {
    ctx.save()
    drawSprite(ctx, char)

    // Name tag
    ctx.font = "bold 8px monospace"
    ctx.textAlign = "center"
    ctx.fillStyle = "rgba(0,0,0,0.6)"
    const nameY = char.y - 68
    const nameW = ctx.measureText(char.name).width + 6
    ctx.fillRect(char.x - nameW / 2, nameY - 7, nameW, 12)
    ctx.fillStyle = "#fff"
    ctx.fillText(char.name, char.x, nameY + 2)

    // Bubble
    if (char.bubble && (char.bubble.expiresAt > Date.now() || isActiveState(char.agentState))) {
      const bubbleY = char.y + 4
      ctx.font = "7px monospace"
      const tw = ctx.measureText(char.bubble.text).width + 8
      ctx.fillStyle = "rgba(255,255,255,0.9)"
      ctx.strokeStyle = char.bubble.color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      roundRect(ctx, char.x - tw / 2, bubbleY, tw, 14, 4)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = "#333"
      ctx.textAlign = "center"
      ctx.fillText(char.bubble.text, char.x, bubbleY + 10)
    }

    ctx.restore()
  }

  // 4. Foreground
  if (layers?.fgImage) {
    ctx.drawImage(layers.fgImage, 0, 0)
  }
}

function isActiveState(state: string): boolean {
  return state === "working" || state === "thinking" || state === "help" || state === "error"
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function stop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  clearAll()
  initialized = false
  layers = null
  coords = null
  baseWidth = 0
  baseHeight = 0
}

export function isInitialized(): boolean {
  return initialized
}
