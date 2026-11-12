import { useEffect, useState } from 'react'

/** Dot positions on a 3 x 3 grid for each die face. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

interface DieProps {
  /** The player's last roll, or null before their first roll. */
  value: number | null
  /** While true, the die tumbles through random faces. */
  rolling: boolean
  /** Only the player to move can tap the die. */
  clickable: boolean
  onRoll: () => void
  label: string
}

/** A die that doubles as the roll button when it is the player's turn. */
export function Die({ value, rolling, clickable, onRoll, label }: DieProps) {
  const [flicker, setFlicker] = useState(1)

  useEffect(() => {
    if (!rolling) return
    const id = window.setInterval(() => {
      setFlicker(Math.floor(Math.random() * 6) + 1)
    }, 80)
    return () => window.clearInterval(id)
  }, [rolling])

  const face = rolling ? flicker : value ?? 1
  const pips = new Set(PIPS[face])

  return (
    <button
      type="button"
      className={`die${rolling ? ' die-rolling' : ''}${clickable ? ' die-clickable' : ''}${value === null ? ' die-blank' : ''}`}
      onClick={clickable ? onRoll : undefined}
      disabled={!clickable}
      aria-label={
        clickable
          ? `${label}: tap to roll`
          : `${label}: ${value === null ? 'not rolled yet' : `last rolled ${value}`}`
      }
      data-testid="die"
      data-value={value ?? ''}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip${pips.has(i) ? ' pip-on' : ''}`} />
      ))}
    </button>
  )
}
