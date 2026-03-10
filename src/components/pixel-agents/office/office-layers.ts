export interface OfficeLayers {
  bgImage: HTMLImageElement | null
  fgImage: HTMLImageElement | null
  width: number
  height: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      // Fallback: blank image
      const canvas = document.createElement("canvas")
      canvas.width = 800
      canvas.height = 800
      const fallback = new Image()
      fallback.src = canvas.toDataURL()
      fallback.onload = () => resolve(fallback)
    }
    img.src = src
  })
}

export async function buildOfficeLayers(): Promise<OfficeLayers> {
  const t = Date.now()
  const [bgImage, fgImage] = await Promise.all([
    loadImage(`/pixel-agents/office/office_bg_32.webp?t=${t}`),
    loadImage(`/pixel-agents/office/office_fg_32.webp?t=${t}`),
  ])

  return {
    bgImage,
    fgImage,
    width: bgImage.naturalWidth || 800,
    height: bgImage.naturalHeight || 800,
  }
}
