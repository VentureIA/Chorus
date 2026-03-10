import { OFFICE } from "./office-config"

interface PathNode {
  x: number
  y: number
  g: number
  h: number
  f: number
  parent: PathNode | null
}

let grid: boolean[][] = []
let gridW = 0
let gridH = 0

function loadImageData(src: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) { resolve(null); return }
      ctx.drawImage(img, 0, 0)
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height))
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function initPathfinder(bgW: number, bgH: number): Promise<void> {
  const imgData = await loadImageData(`/pixel-agents/office/office_collision.webp?t=${Date.now()}`)
  if (!imgData) return

  const { width: imgW, height: imgH, data } = imgData
  const scaleX = imgW / bgW
  const scaleY = imgH / bgH

  gridW = Math.ceil(bgW / OFFICE.TILE_SIZE)
  gridH = Math.ceil(bgH / OFFICE.TILE_SIZE)
  grid = Array.from({ length: gridH }, () => Array(gridW).fill(true))

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const px = Math.floor((gx * OFFICE.TILE_SIZE + OFFICE.TILE_SIZE / 2) * scaleX)
      const py = Math.floor((gy * OFFICE.TILE_SIZE + OFFICE.TILE_SIZE / 2) * scaleY)
      if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
        const alpha = data[(py * imgW + px) * 4 + 3]
        grid[gy][gx] = alpha < 128 // transparent = walkable
      }
    }
  }
}

export function isWalkable(gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) return false
  return grid[gy]?.[gx] ?? false
}

export function findNearestWalkable(gx: number, gy: number): { x: number; y: number } {
  if (isWalkable(gx, gy)) return { x: gx, y: gy }
  for (let r = 1; r <= 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
        if (isWalkable(gx + dx, gy + dy)) return { x: gx + dx, y: gy + dy }
      }
    }
  }
  return { x: gx, y: gy }
}

export function findPath(
  startX: number, startY: number,
  endX: number, endY: number,
): Array<{ x: number; y: number }> {
  if (gridW === 0) {
    return [{ x: endX, y: endY }]
  }

  let sg = { x: Math.floor(startX / OFFICE.TILE_SIZE), y: Math.floor(startY / OFFICE.TILE_SIZE) }
  let eg = { x: Math.floor(endX / OFFICE.TILE_SIZE), y: Math.floor(endY / OFFICE.TILE_SIZE) }

  if (!isWalkable(sg.x, sg.y)) sg = findNearestWalkable(sg.x, sg.y)
  if (!isWalkable(eg.x, eg.y)) eg = findNearestWalkable(eg.x, eg.y)

  if (sg.x === eg.x && sg.y === eg.y) return [{ x: endX, y: endY }]

  const open: PathNode[] = [{ x: sg.x, y: sg.y, g: 0, h: 0, f: 0, parent: null }]
  const closed = new Set<string>()
  const dirs = [
    [0, -1, 1], [0, 1, 1], [-1, 0, 1], [1, 0, 1],
    [-1, -1, 1.4], [1, -1, 1.4], [-1, 1, 1.4], [1, 1, 1.4],
  ]

  while (open.length > 0 && closed.size < 2000) {
    // Find lowest f
    let bestIdx = 0
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i
    }
    const current = open.splice(bestIdx, 1)[0]
    const key = `${current.x},${current.y}`

    if (closed.has(key)) continue
    closed.add(key)

    if (current.x === eg.x && current.y === eg.y) {
      // Reconstruct path
      const path: Array<{ x: number; y: number }> = []
      let node: PathNode | null = current
      while (node) {
        path.unshift({
          x: node.x * OFFICE.TILE_SIZE + OFFICE.TILE_SIZE / 2,
          y: node.y * OFFICE.TILE_SIZE + OFFICE.TILE_SIZE / 2,
        })
        node = node.parent
      }
      // Replace last with exact destination
      path[path.length - 1] = { x: endX, y: endY }
      return path
    }

    for (const [dx, dy, cost] of dirs) {
      const nx = current.x + dx
      const ny = current.y + dy
      if (!isWalkable(nx, ny) || closed.has(`${nx},${ny}`)) continue

      const g = current.g + cost
      const h = Math.abs(nx - eg.x) + Math.abs(ny - eg.y)
      open.push({ x: nx, y: ny, g, h, f: g + h, parent: current })
    }
  }

  // No path found — direct waypoint
  return [{ x: endX, y: endY }]
}
