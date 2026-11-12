import { useState } from 'react'
import { displayNames } from '../game/engine'
import { validateNames } from '../game/names'
import { MAX_NAME_LENGTH, type Color, type PlayerConfig, type PlayerKind } from '../game/types'
import { COLOR_NAME } from './colors'

/** Seat colours for each mode. Two-player games put opponents opposite. */
const SEATS: Record<2 | 4, Color[]> = {
  2: ['red', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
}

const DEFAULT_KINDS: Record<Color, PlayerKind> = {
  red: 'human',
  green: 'bot',
  yellow: 'bot',
  blue: 'bot',
}

/** Custom names per seat. null means "use the default name". */
type NameMap = Record<Color, string | null>

const NO_NAMES: NameMap = { red: null, green: null, yellow: null, blue: null }

interface SetupScreenProps {
  onStart: (configs: PlayerConfig[]) => void
  /** Seats from the previous game, used to prefill the form. */
  initial?: PlayerConfig[] | null
}

export function SetupScreen({ onStart, initial }: SetupScreenProps) {
  const [mode, setMode] = useState<2 | 4>(() => (initial?.length === 2 ? 2 : 4))
  const [kinds, setKinds] = useState<Record<Color, PlayerKind>>(() => {
    const next = { ...DEFAULT_KINDS }
    for (const c of initial ?? []) next[c.color] = c.kind
    return next
  })
  const [names, setNames] = useState<NameMap>(() => {
    const next = { ...NO_NAMES }
    for (const c of initial ?? []) if (c.name) next[c.color] = c.name
    return next
  })

  const seats = SEATS[mode]
  const defaults = displayNames(seats.map((color) => ({ color, kind: kinds[color] })))
  const shown = seats.map((color, i) => ({
    color,
    kind: kinds[color],
    name: kinds[color] === 'human' ? (names[color] ?? defaults[i]) : defaults[i],
  }))
  const errors = validateNames(shown)
  const valid = Object.keys(errors).length === 0

  const toggle = (color: Color) =>
    setKinds((prev) => ({ ...prev, [color]: prev[color] === 'human' ? 'bot' : 'human' }))

  const start = () => {
    if (!valid) return
    onStart(
      seats.map((color) => {
        const custom = kinds[color] === 'human' ? names[color]?.trim() : undefined
        return custom ? { color, kind: kinds[color], name: custom } : { color, kind: kinds[color] }
      }),
    )
  }

  return (
    <section className="setup" aria-labelledby="setup-title">
      <h1 id="setup-title">Ludo</h1>
      <p className="tagline">Free to play. No login, no scores. Just roll.</p>

      <fieldset className="mode-picker">
        <legend>Players</legend>
        {([2, 4] as const).map((n) => (
          <label key={n} className="chip">
            <input
              type="radio"
              name="mode"
              value={n}
              checked={mode === n}
              onChange={() => setMode(n)}
            />
            {n} players
          </label>
        ))}
      </fieldset>

      <fieldset className="seat-picker">
        <legend>Seats</legend>
        {shown.map(({ color, kind, name }) => {
          const error = errors[color]
          const inputId = `name-${color}`
          return (
            <div key={color} className="seat-card">
              <button
                type="button"
                className={`seat seat-${color}`}
                onClick={() => toggle(color)}
                aria-label={`${COLOR_NAME[color]} seat: ${kind === 'human' ? 'Human' : 'Bot'}. Click to change`}
              >
                <span className="seat-colour" aria-hidden="true" />
                <span>{COLOR_NAME[color]}</span>
                <strong>{kind === 'human' ? 'Human' : 'Bot'}</strong>
              </button>
              {kind === 'human' ? (
                <>
                  <label className="sr-only" htmlFor={inputId}>
                    {COLOR_NAME[color]} player name
                  </label>
                  <input
                    id={inputId}
                    className={`seat-name${error ? ' seat-name-invalid' : ''}`}
                    type="text"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${inputId}-error` : undefined}
                    onChange={(e) => setNames((prev) => ({ ...prev, [color]: e.target.value }))}
                  />
                  {error && (
                    <span id={`${inputId}-error`} className="seat-error" role="alert">
                      {error}
                    </span>
                  )}
                </>
              ) : (
                <span className="seat-bot-name">{name}</span>
              )}
            </div>
          )
        })}
      </fieldset>
      <p className="setup-hint">Names can be up to {MAX_NAME_LENGTH} characters.</p>

      <button type="button" className="primary" onClick={start} disabled={!valid}>
        Start game
      </button>
    </section>
  )
}
