import type { Color } from '../game/types'
import { COLOR_HEX, COLOR_NAME } from './colors'

interface WinOverlayProps {
  winners: Color[]
  /** Display name per colour. Falls back to the colour name. */
  names?: Partial<Record<Color, string>>
  /** Formatted game duration, shown under the heading. */
  time?: string
  /** The game was ended before every place was decided. */
  early?: boolean
  /** Omitted for online guests, who cannot start a game. */
  onNewGame?: () => void
  onSetup: () => void
  /** Label for the setup button. Defaults to "Change setup". */
  setupLabel?: string
  /** Extra line under the standings. */
  note?: string
}

const CONFETTI_COUNT = 90

/** Stable pseudo-random value in [0, 1) derived from a seed, so renders are pure. */
function unit(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/** Confetti pieces with fixed, varied positions and timings. */
function confettiPieces() {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    left: unit(i + 1) * 100,
    delay: unit(i + 101) * 1.2,
    duration: 2.6 + unit(i + 201) * 2,
    drift: (unit(i + 301) - 0.5) * 120,
    colour: Object.values(COLOR_HEX)[i % 4],
  }))
}

const PIECES = confettiPieces()

export function WinOverlay({ winners, names = {}, time, early, onNewGame, onSetup, setupLabel = 'Change setup', note }: WinOverlayProps) {
  // The win fanfare is played by the game hook when the gameOver event fires.
  const champion = winners[0]
  const label = (c: Color) => names[c] ?? COLOR_NAME[c]

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="win-title">
      <div className="confetti" aria-hidden="true">
        {PIECES.map((p) => (
          <span
            key={p.id}
            className="confetti-piece"
            style={{
              left: `${p.left}%`,
              background: p.colour,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              ['--drift' as string]: `${p.drift}px`,
            }}
          />
        ))}
      </div>
      <div className="overlay-card">
        <h2 id="win-title">{label(champion) === 'You' ? 'You win!' : `${label(champion)} wins!`}</h2>
        {time && <p className="win-time">Game time {time}</p>}
        {early && <p className="win-time">Ended early. Unfinished players are ranked by how far their pieces got.</p>}
        <ol className="standings">
          {winners.map((c, i) => (
            <li key={c}>
              <span className="standing-rank">{i + 1}</span>
              <span className={`standing-colour standing-${c}`} aria-hidden="true" />
              {label(c)}
              {names[c] && <span className="standing-colour-name"> ({COLOR_NAME[c]})</span>}
            </li>
          ))}
        </ol>
        {note && <p className="win-time" role="status">{note}</p>}
        <div className="overlay-actions">
          {onNewGame && (
            <button type="button" className="primary" onClick={onNewGame}>
              Play again
            </button>
          )}
          <button type="button" onClick={onSetup}>
            {setupLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

