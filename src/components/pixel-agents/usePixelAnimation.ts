import { useEffect, useRef } from "react"
import { SHEET, ANIM_SEQUENCES } from "./sprite-config"

/**
 * Custom hook for rAF-based sprite sheet animation.
 * Mutates the DOM ref directly for performance (avoids React re-renders).
 */
export function usePixelAnimation(
  spriteRef: React.RefObject<HTMLDivElement | null>,
  animName: string,
) {
  const frameRef = useRef(0)
  const lastTimeRef = useRef(0)
  const animNameRef = useRef(animName)

  // Reset frame when animation changes
  useEffect(() => {
    if (animNameRef.current !== animName) {
      frameRef.current = 0
      animNameRef.current = animName
    }
  }, [animName])

  useEffect(() => {
    const el = spriteRef.current
    if (!el) return

    const frames = ANIM_SEQUENCES[animName]
    if (!frames || frames.length === 0) return

    const isIdle = animName.includes("idle")
    const interval = isIdle ? 500 : 125 // slower for idle anims

    let rafId: number

    const tick = (now: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = now
      const delta = now - lastTimeRef.current

      if (delta >= interval) {
        lastTimeRef.current = now - (delta % interval)
        frameRef.current = (frameRef.current + 1) % frames.length
        const frameIndex = frames[frameRef.current]
        const col = frameIndex % SHEET.cols
        const row = Math.floor(frameIndex / SHEET.cols)
        el.style.backgroundPosition = `-${col * SHEET.frameWidth}px -${row * SHEET.frameHeight}px`
      }

      rafId = requestAnimationFrame(tick)
    }

    // Set initial frame
    const initialFrame = frames[0]
    const col = initialFrame % SHEET.cols
    const row = Math.floor(initialFrame / SHEET.cols)
    el.style.backgroundPosition = `-${col * SHEET.frameWidth}px -${row * SHEET.frameHeight}px`

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      lastTimeRef.current = 0
    }
  }, [animName, spriteRef])
}
