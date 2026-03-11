let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

let typingInterval: ReturnType<typeof setInterval> | null = null

export function setWorkingCount(count: number): void {
  if (count > 0 && !typingInterval) {
    typingInterval = setInterval(() => {
      const ctx = getCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      // Random typing click
      osc.frequency.value = 800 + Math.random() * 600
      osc.type = "square"
      const vol = 0.02 + Math.random() * 0.02
      gain.gain.setValueAtTime(vol, ctx.currentTime) // F4: explicit anchor for ramp
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.05)
    }, 80 + Math.random() * 120)
  } else if (count === 0 && typingInterval) {
    clearInterval(typingInterval)
    typingInterval = null
  }
}

export function playDing(): void {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = 880
  osc.type = "sine"
  gain.gain.setValueAtTime(0.08, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.5)
}

export function playBuzz(): void {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = 150
  osc.type = "sawtooth"
  gain.gain.setValueAtTime(0.06, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.3)
}

export function stopAll(): void {
  if (typingInterval) {
    clearInterval(typingInterval)
    typingInterval = null
  }
  if (audioCtx) {
    audioCtx.close()
    audioCtx = null
  }
}
