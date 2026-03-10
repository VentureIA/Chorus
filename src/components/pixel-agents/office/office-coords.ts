import { OFFICE } from "./office-config"

export interface Spot {
  x: number
  y: number
  id: number
  type: "idle" | "desk" | "meeting"
}

export interface LaptopSpot {
  x: number
  y: number
  dir: "down" | "up" | "left" | "right"
}

export interface OfficeCoords {
  idle: Spot[]
  desk: Spot[]
  laptopSpots: LaptopSpot[]
}

const THRESHOLD = 80

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

export async function parseMapCoordinates(bgW: number, bgH: number): Promise<OfficeCoords> {
  const coords: OfficeCoords = { idle: [], desk: [], laptopSpots: [] }

  const imgData = await loadImageData(`/pixel-agents/office/office_xy.webp?t=${Date.now()}`)
  if (!imgData) return coords

  const { width: imgW, height: imgH, data } = imgData
  const scaleX = bgW / imgW
  const scaleY = bgH / imgH
  const seenGrid = new Set<string>()
  let globalId = 0

  for (let py = 0; py < imgH; py++) {
    for (let px = 0; px < imgW; px++) {
      const i = (py * imgW + px) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 128) continue

      const worldX = px * scaleX
      const worldY = py * scaleY
      const gx = Math.floor(worldX / OFFICE.TILE_SIZE)
      const gy = Math.floor(worldY / OFFICE.TILE_SIZE)
      const key = `${gx},${gy}`
      if (seenGrid.has(key)) continue
      seenGrid.add(key)

      const finalX = gx * OFFICE.TILE_SIZE + OFFICE.TILE_SIZE / 2
      const finalY = gy * OFFICE.TILE_SIZE + OFFICE.TILE_SIZE

      // Green or Black → idle zone
      if ((g > THRESHOLD && r < THRESHOLD && b < THRESHOLD) || (r < 30 && g < 30 && b < 30 && a > 200)) {
        coords.idle.push({ x: finalX, y: finalY, id: globalId++, type: "idle" })
      }
      // Blue → desk zone
      else if (b > THRESHOLD && r < THRESHOLD && g < THRESHOLD) {
        coords.desk.push({ x: finalX, y: finalY, id: globalId++, type: "desk" })
      }
      // Yellow → meeting
      else if (r > THRESHOLD && g > THRESHOLD && b < THRESHOLD) {
        coords.desk.push({ x: finalX, y: finalY, id: globalId++, type: "meeting" })
      }
    }
  }

  // Parse laptop positions
  const laptopData = await loadImageData(`/pixel-agents/office/office_laptop.webp?t=${Date.now()}`)
  if (laptopData) {
    const { width: lw, height: lh, data: ld } = laptopData
    const lsx = bgW / lw
    const lsy = bgH / lh
    const laptopSeen = new Set<string>()

    for (let py = 0; py < lh; py++) {
      for (let px = 0; px < lw; px++) {
        const i = (py * lw + px) * 4
        const r = ld[i], g = ld[i + 1], b = ld[i + 2], a = ld[i + 3]
        if (a < 128) continue

        const wx = px * lsx
        const wy = py * lsy
        const gx = Math.floor(wx / OFFICE.TILE_SIZE)
        const gy = Math.floor(wy / OFFICE.TILE_SIZE)
        const key = `${gx},${gy}`
        if (laptopSeen.has(key)) continue
        laptopSeen.add(key)

        let dir: LaptopSpot["dir"] = "down"
        // Orange → left, Cyan → down, Magenta → up, Blue → right
        if (r > 200 && g > 100 && g < 180 && b < 50) dir = "left"
        else if (r < 50 && g > 200 && b > 200) dir = "down"
        else if (r > 200 && g < 50 && b > 200) dir = "up"
        else if (r < 50 && g < 50 && b > 200) dir = "right"

        coords.laptopSpots.push({
          x: gx * OFFICE.TILE_SIZE + OFFICE.TILE_SIZE / 2,
          y: gy * OFFICE.TILE_SIZE + OFFICE.TILE_SIZE / 2,
          dir,
        })
      }
    }
  }

  return coords
}
