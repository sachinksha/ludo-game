import { useEffect, useRef, useState } from 'react'

/** How often the displayed time refreshes, in milliseconds. */
const TICK_MS = 250

/**
 * Elapsed play time in milliseconds. It only advances while `running` is true,
 * so pausing (or the game ending) freezes it, and resuming carries on from the
 * same value. Mount a fresh component to reset it for a new game.
 */
export function useGameClock(running: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  // Time banked before the current running stretch began.
  const banked = useRef(0)

  useEffect(() => {
    if (!running) return
    const startedAt = Date.now()
    const id = window.setInterval(() => {
      setElapsed(banked.current + Date.now() - startedAt)
    }, TICK_MS)
    return () => {
      window.clearInterval(id)
      banked.current += Date.now() - startedAt
      setElapsed(banked.current)
    }
  }, [running])

  return elapsed
}

/** Formats milliseconds as m:ss, or h:mm:ss once past an hour. */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
