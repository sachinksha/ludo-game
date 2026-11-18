import { useState } from 'react'
import { COLOR_ORDER } from '../game/board'
import { displayNames } from '../game/engine'
import { validateNames } from '../game/names'
import { MAX_NAME_LENGTH, type Color, type PlayerConfig } from '../game/types'
import { COLOR_HEX, COLOR_NAME } from './colors'
import { RulesButton } from './RulesSheet'
import { SettingsButton } from './SettingsSheet'

/**
 * What sits in a seat, as chosen on this screen. "friend" is a human playing
 * from another device; it only exists in online play.
 */
type SeatKind = 'human' | 'bot' | 'friend'

type PlayMode = 'local' | 'online'

/** Short labels for the seat menu, which is narrow on a phone. The hint below the seats explains them. */
const OPTION_LABEL: Record<SeatKind, string> = { human: 'Human', bot: 'Bot', friend: 'Online' }

/** Who can sit in a seat. "Online friend" only exists when playing online. */
const SEAT_KINDS: Record<PlayMode, readonly SeatKind[]> = { local: ['human', 'bot'], online: ['human', 'bot', 'friend'] }

const DEFAULT_KINDS: Record<Color, SeatKind> = { red: 'human', green: 'bot', yellow: 'bot', blue: 'bot' }

/** Default colours for two players: opposite corners. */
const DEFAULT_PAIR: Color[] = ['red', 'yellow']

/** Custom names per seat. null means "use the default name". */
type NameMap = Record<Color, string | null>
const NO_NAMES: NameMap = { red: null, green: null, yellow: null, blue: null }

interface SetupScreenProps {
  /** `online` asks to open an online lobby instead of starting at once. */
  onStart: (configs: PlayerConfig[], online: boolean) => void
  /** Seats from the previous game, used to prefill the form. */
  initial?: PlayerConfig[] | null
  /** True while an online lobby is being opened. */
  busy?: boolean
  /** A problem to show, such as the connection server being unreachable. */
  error?: string | null
}

export function SetupScreen({ onStart, initial, busy = false, error = null }: SetupScreenProps) {
  const [mode, setMode] = useState<2 | 4>(() => (initial?.length === 2 ? 2 : 4))
  const [play, setPlay] = useState<PlayMode>(() => (initial?.some((c) => c.remote) ? 'online' : 'local'))
  const [pair, setPair] = useState<Color[]>(() => (initial?.length === 2 ? initial.map((c) => c.color) : DEFAULT_PAIR))
  const [kinds, setKinds] = useState<Record<Color, SeatKind>>(() => {
    const next = { ...DEFAULT_KINDS }
    for (const c of initial ?? []) next[c.color] = c.remote ? 'friend' : c.kind
    return next
  })
  const [names, setNames] = useState<NameMap>(() => {
    const next = { ...NO_NAMES }
    for (const c of initial ?? []) if (c.name && !c.remote) next[c.color] = c.name
    return next
  })

  // Seats in turn order (clockwise from red). In local play a friend seat is just a human.
  const seats = mode === 4 ? [...COLOR_ORDER] : COLOR_ORDER.filter((c) => pair.includes(c))
  const kindOf = (c: Color): SeatKind => (play === 'local' && kinds[c] === 'friend' ? 'human' : kinds[c])
  const configsFor = (custom: boolean): PlayerConfig[] =>
    seats.map((color) => {
      const kind = kindOf(color)
      if (kind === 'friend') return { color, kind: 'human', remote: true }
      const name = custom && kind === 'human' ? names[color]?.trim() : undefined
      return name ? { color, kind, name } : { color, kind }
    })

  const defaults = displayNames(configsFor(false))
  const shown = seats.map((color, i) => {
    const kind = kindOf(color)
    return { color, kind, name: kind === 'human' ? (names[color] ?? defaults[i]) : defaults[i] }
  })
  // Friend names come from the guests themselves, so only local humans are checked here.
  const errors = validateNames(shown.map((s) => ({ ...s, kind: s.kind === 'human' ? 'human' : 'bot' })))
  const anyHuman = shown.some((s) => s.kind === 'human')
  const anyFriend = shown.some((s) => s.kind === 'friend')
  const problem = !anyHuman
    ? play === 'online'
      ? 'You need a Human seat on this device to host.'
      : 'At least one seat must be a human player.'
    : play === 'online' && !anyFriend
      ? 'Set at least one seat to Online friend.'
      : null
  const valid = Object.keys(errors).length === 0 && problem === null && !busy

  /** Picks a colour for a two-player game. A third pick replaces the older one. */
  const pickColour = (color: Color) => {
    if (pair.includes(color)) return
    setPair((prev) => [prev[1], color])
  }

  const start = () => {
    if (!valid) return
    onStart(configsFor(true), play === 'online')
  }

  return (
    <section className="setup" aria-labelledby="setup-title">
      <div className="setup-tools">
        <RulesButton />
        <SettingsButton />
      </div>
      <h1 id="setup-title">Ludo</h1>
      <p className="tagline">Free to play. No login, no scores. Just roll.</p>

      <fieldset className="mode-picker">
        <legend>Play</legend>
        {(['local', 'online'] as const).map((p) => (
          <label key={p} className="chip">
            <input type="radio" name="play" value={p} checked={play === p} onChange={() => setPlay(p)} />
            {p === 'local' ? 'On this device' : 'Online (invite link)'}
          </label>
        ))}
      </fieldset>

      <fieldset className="mode-picker">
        <legend>Players</legend>
        {([2, 4] as const).map((n) => (
          <label key={n} className="chip">
            <input type="radio" name="mode" value={n} checked={mode === n} onChange={() => setMode(n)} />
            {n} players
          </label>
        ))}
      </fieldset>

      {mode === 2 && (
        <fieldset className="colour-picker">
          <legend>Colours</legend>
          <p className="setup-hint">Pick two. Opposite corners are the classic layout.</p>
          <div className="colour-chips">
            {COLOR_ORDER.map((color) => (
              <button
                key={color}
                type="button"
                className={`colour-chip colour-chip-${color}`}
                aria-pressed={pair.includes(color)}
                onClick={() => pickColour(color)}
              >
                <span className="seat-colour" aria-hidden="true" />
                {COLOR_NAME[color]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="seat-picker">
        <legend>Seats</legend>
        {shown.map(({ color, kind, name }) => {
          const error = errors[color]
          const inputId = `name-${color}`
          return (
            <div key={color} className="seat-card" style={{ ['--arm' as string]: COLOR_HEX[color] }}>
              <div className="seat-kind">
                <span className="seat-dot" aria-hidden="true" />
                <span>{COLOR_NAME[color]}</span>
                {/* A labelled dropdown says plainly what can change and to what. */}
                <select
                  className="seat-kind-select"
                  aria-label={`${COLOR_NAME[color]} seat`}
                  value={kind}
                  onChange={(e) => setKinds((prev) => ({ ...prev, [color]: e.target.value as SeatKind }))}
                >
                  {SEAT_KINDS[play].map((k) => (
                    <option key={k} value={k}>
                      {OPTION_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
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
                <span className="seat-bot-name">{kind === 'friend' ? 'Joins by link' : name}</span>
              )}
            </div>
          )
        })}
      </fieldset>
      <p className="setup-hint">
        Use each seat's menu to choose who plays it: <b>Human</b> (on this device) or <b>Bot</b>
        {play === 'online' ? <>, or <b>Online</b>: a friend who joins with your invite link and picks their own name</> : ' (choose Online above to invite friends)'}.
        Names can be up to {MAX_NAME_LENGTH} characters.
      </p>
      {problem && (
        <p className="seat-error setup-need-human" role="alert">
          {problem}
        </p>
      )}

      {error && (
        <p className="seat-error setup-need-human" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="primary" onClick={start} disabled={!valid}>
        {play === 'online' ? (busy ? 'Opening lobby...' : 'Create invite link') : 'Start game'}
      </button>
    </section>
  )
}
