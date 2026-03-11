import type { SessionConfig } from "@/stores/useSessionStore"
import { buildOfficeLayers, type OfficeLayers } from "./office-layers"
import { parseMapCoordinates, type OfficeCoords } from "./office-coords"
import { initPathfinder } from "./office-pathfinder"
import { loadAllSkins, drawSprite } from "./office-sprites"
import { syncSessions, updateAll, getCharacters, clearAll } from "./office-characters"
import { spawnParticles, updateParticles, drawParticles, clearParticles } from "./office-particles"

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

// Particle tracking state
let steamTimer = 0
const prevStates = new Map<number, string>()

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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // F2: idempotent, won't accumulate on re-init

  // Sync initial sessions
  syncSessions(sessions, coords, layers.width, layers.height)

  lastTime = performance.now()

  const loop = (now: number) => {
    const deltaMs = Math.min(now - lastTime, 100)
    lastTime = now
    const deltaSec = deltaMs / 1000

    // Update characters
    updateAll(deltaSec, deltaMs)

    // Update particles
    updateParticles(deltaSec)

    // Spawn steam periodically for working chars at desks
    steamTimer += deltaSec
    if (steamTimer >= 2) {
      steamTimer = 0
      const chars = getCharacters()
      for (const char of chars) {
        if (char.agentState === "working" && char.deskIndex !== undefined) {
          spawnParticles(char.x, char.y, "steam")
        }
      }
    }

    // Detect state transitions for sparkle/error particles
    const chars = getCharacters()
    for (const char of chars) {
      const prev = prevStates.get(char.id)
      if (prev !== char.agentState) {
        if (char.agentState === "complete") {
          spawnParticles(char.x, char.y, "sparkle")
        } else if (char.agentState === "error" || char.agentState === "help") {
          spawnParticles(char.x, char.y, "error")
        }
        prevStates.set(char.id, char.agentState)
      }
    }
    // Clean up removed chars
    for (const id of prevStates.keys()) {
      if (!chars.find((c) => c.id === id)) {
        prevStates.delete(id)
      }
    }

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

      // Laptop screen glow when occupied
      if (isOccupied) {
        const glowAlpha = Math.sin(Date.now() / 1000) * 0.05 + 0.12
        ctx.save()
        ctx.globalAlpha = glowAlpha
        ctx.fillStyle = "rgba(100, 180, 255, 1)"
        const gw = 12
        const gh = 6
        let gx = spot.x - gw / 2
        let gy = spot.y - gh / 2
        if (spot.dir === "down") gy += 8
        else if (spot.dir === "up") gy -= 8
        else if (spot.dir === "left") gx -= 8
        else if (spot.dir === "right") gx += 8
        ctx.fillRect(gx, gy, gw, gh)
        ctx.restore()
      }
    }
  }

  // 3. Characters (Y-sorted)
  const chars = getCharacters().sort((a, b) => a.y - b.y)
  for (const char of chars) {
    ctx.save()

    // Drop shadow under each character
    ctx.globalAlpha = 0.2
    ctx.fillStyle = "#000"
    ctx.beginPath()
    ctx.ellipse(char.x, char.y + 2, 12, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    drawSprite(ctx, char)

    // Mini progress bar above name tag for working/complete/error/help agents
    const nameX = Math.round(char.x)
    const nameY = Math.round(char.y - 68)
    if (
      char.agentState === "working" ||
      char.agentState === "complete" ||
      char.agentState === "error" ||
      char.agentState === "help"
    ) {
      const barW = 24
      const barH = 3
      const barX = nameX - barW / 2
      const barY = nameY - 8

      // Background
      ctx.fillStyle = "rgba(0,0,0,0.4)"
      ctx.fillRect(barX, barY, barW, barH)

      if (char.agentState === "working") {
        // Animated indeterminate bar
        ctx.fillStyle = "#60a5fa"
        ctx.fillRect(barX, barY, barW, barH)
        const progress = (Date.now() / 1000) % 1
        const highlightW = 8
        const highlightX = barX + progress * (barW - highlightW)
        ctx.fillStyle = "rgba(255,255,255,0.6)"
        ctx.fillRect(highlightX, barY, highlightW, barH)
      } else if (char.agentState === "complete") {
        ctx.fillStyle = "#22c55e"
        ctx.fillRect(barX, barY, barW, barH)
      } else if (char.agentState === "error") {
        ctx.fillStyle = "#ef4444"
        ctx.fillRect(barX, barY, barW, barH)
      } else if (char.agentState === "help") {
        ctx.fillStyle = "#eab308"
        ctx.fillRect(barX, barY, barW, barH)
      }
    }

    // Name tag
    const safeName = sanitizeText(char.name, 20)
    ctx.font = "bold 12px monospace"
    ctx.textAlign = "center"
    ctx.fillStyle = "rgba(0,0,0,0.6)"
    const nameW = ctx.measureText(safeName).width + 6
    ctx.fillRect(Math.round(nameX - nameW / 2), nameY - 10, nameW, 16)
    ctx.fillStyle = "#fff"
    ctx.fillText(safeName, nameX, nameY + 3)

    // Bubble
    if (char.bubble && (char.bubble.expiresAt > Date.now() || isActiveState(char.agentState))) {
      const bubbleX = Math.round(char.x)
      const bubbleY = Math.round(char.y + 4)
      const safeBubble = sanitizeText(char.bubble.text, 30)
      ctx.font = "11px monospace"
      const tw = ctx.measureText(safeBubble).width + 8
      ctx.fillStyle = "rgba(255,255,255,0.9)"
      ctx.strokeStyle = char.bubble.color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      roundRect(ctx, Math.round(bubbleX - tw / 2), bubbleY, tw, 18, 4)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = "#333"
      ctx.textAlign = "center"
      ctx.fillText(safeBubble, bubbleX, bubbleY + 13)
    }

    ctx.restore()
  }

  // Draw particles (after characters, before foreground)
  drawParticles(ctx)

  // 4. Foreground
  if (layers?.fgImage) {
    ctx.drawImage(layers.fgImage, 0, 0)
  }

  // 5. Day/night cycle overlay
  const hour = new Date().getHours()
  let overlayColor: string | null = null
  if (hour >= 18 && hour < 22) {
    overlayColor = "rgba(255, 160, 50, 0.08)"
  } else if (hour >= 22 || hour < 6) {
    overlayColor = "rgba(30, 40, 80, 0.12)"
  } else if (hour >= 6 && hour < 8) {
    overlayColor = "rgba(255, 200, 150, 0.06)"
  }
  if (overlayColor) {
    ctx.fillStyle = overlayColor
    ctx.fillRect(0, 0, w, h)
  }
}

function sanitizeText(text: string, maxLen: number): string {
  const clean = text.replace(/[^\x20-\x7E\u00C0-\u024F]/g, "")
  return clean.length > maxLen ? clean.slice(0, maxLen) + "\u2026" : clean
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

export function hitTest(cx: number, cy: number): number | null {
  const chars = getCharacters()
  for (const char of chars) {
    const dx = cx - char.x
    const dy = cy - (char.y - 24) // sprite center is above foot position
    if (dx * dx + dy * dy < 32 * 32) return char.id
  }
  return null
}

export function stop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  clearAll()
  clearParticles()
  prevStates.clear()
  steamTimer = 0 // F3: reset steam timer on stop
  initialized = false
  layers = null
  coords = null
  baseWidth = 0
  baseHeight = 0
}

export function isInitialized(): boolean {
  return initialized
}
