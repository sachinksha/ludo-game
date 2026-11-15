import type { Color } from '../game/types'
import { COLOR_HEX } from './colors'

const RANK_WORD = ['', '1st', '2nd', '3rd', '4th']

/** Fixed confetti layout for the finish banner, so renders stay pure. */
const BURST = Array.from({ length: 28 }, (_, i) => {
  const unit = (seed: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453
    return x - Math.floor(x)
  }
  return { id: i, left: unit(i + 7) * 100, delay: unit(i + 77) * 0.5, drift: (unit(i + 177) - 0.5) * 80 }
})

/** Banner over the board when a player gets all four pieces home. */
export function FinishBanner({ name, color, rank }: { name: string; color: Color; rank: number }) {
  const who = name === 'You' ? 'You finished' : `${name} finished`
  return (
    <div className={`finish-banner finish-${color}`} role="status">
      <div className="confetti confetti-burst" aria-hidden="true">
        {BURST.map((p) => (
          <span
            key={p.id}
            className="confetti-piece confetti-burst-piece"
            style={{ left: `${p.left}%`, background: COLOR_HEX[color], animationDelay: `${p.delay}s`, ['--drift' as string]: `${p.drift}px` }}
          />
        ))}
      </div>
      <p className="finish-text">
        <span className="finish-rank">{RANK_WORD[rank] ?? `#${rank}`}</span>
        {who}!
      </p>
    </div>
  )
}
