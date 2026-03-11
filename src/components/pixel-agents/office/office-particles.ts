interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

const particles: Particle[] = []

export function spawnParticles(x: number, y: number, type: "steam" | "sparkle" | "error"): void {
  if (particles.length > 500) return // F8: cap particle pool
  const count = type === "steam" ? 2 : 4
  for (let i = 0; i < count; i++) {
    if (type === "steam") {
      particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y - 30,
        vx: (Math.random() - 0.5) * 4,
        vy: -(Math.random() * 8 + 4),
        life: 2 + Math.random(),
        maxLife: 3,
        color: "rgba(180,180,180,",
        size: 2 + Math.random() * 2,
      })
    } else if (type === "sparkle") {
      particles.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y - 40,
        vx: (Math.random() - 0.5) * 20,
        vy: -(Math.random() * 30 + 10),
        life: 1 + Math.random() * 0.5,
        maxLife: 1.5,
        color: "rgba(255,215,0,",
        size: 2 + Math.random() * 3,
      })
    } else {
      // error
      particles.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y - 35,
        vx: (Math.random() - 0.5) * 15,
        vy: -(Math.random() * 20 + 8),
        life: 0.8 + Math.random() * 0.4,
        maxLife: 1.2,
        color: "rgba(239,68,68,",
        size: 2 + Math.random() * 2,
      })
    }
  }
}

export function updateParticles(deltaSec: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx * deltaSec
    p.y += p.vy * deltaSec
    p.life -= deltaSec
    if (p.life <= 0) {
      particles.splice(i, 1)
    }
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D): void {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife)
    ctx.fillStyle = p.color + alpha.toFixed(2) + ")"
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function clearParticles(): void {
  particles.length = 0
}
