import { useEffect, useRef, useState } from 'react'
import { isMuted, setMuted } from '../audio/sfx'
import { formatClock, useGameClock } from '../hooks/useGameClock'
import type { LudoController } from '../hooks/useLudoGame'
import { useGuestView, useHostView } from '../hooks/useOnline'
import { useGameStore } from '../store/gameStore'
import { useOnlineStore } from '../store/onlineStore'
import { COLOR_HEX, COLOR_NAME } from './colors'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon, type IconName } from './Icons'
import { PlayerPanel } from './PlayerPanel'
import { Board } from './Board'
import { WinOverlay } from './WinOverlay'
import type { Color } from '../game/types'

interface GameScreenProps {
  ludo: LudoController
}

type PendingAction = 'settings' | 'new' | null

/** Toolbar button with a logo and a text label. */
function ToolButton({ icon, label, onClick, disabled, pressed, shortcut, shortcutLabel }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; shortcut?: string; shortcutLabel?: string }) {
  return (
    <button
      type="button"
      className="tool"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut}
      title={shortcutLabel ? `${label} (${shortcutLabel})` : label}
    >
      <Icon name={icon} />
      <span className="tool-label">{label}</span>
    </button>
  )
}

/** A labelled on/off switch with a logo, styled like the toolbar buttons. */
function ToggleSwitch({ icon, label, on, onChange, title }: { icon: IconName; label: string; on: boolean; onChange: (on: boolean) => void; title?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="tool tool-switch" title={title} onClick={() => onChange(!on)}>
      <Icon name={icon} />
      <span className="tool-label">{label}</span>
      <span className={`switch-track${on ? ' switch-on' : ''}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  )
}

/** Sound on/off. Mute state lives in the audio module. */
function SoundSwitch() {
  const [muted, setMutedState] = useState(isMuted())
  return (
    <ToggleSwitch
      icon="speaker"
      label="Sound"
      on={!muted}
      onChange={(on) => {
        setMuted(!on)
        setMutedState(!on)
      }}
    />
  )
}

/** Auto roll on/off, saved with the other settings. */
function AutoRollSwitch() {
  const autoRoll = useGameStore((s) => s.settings.autoRoll)
  const updateSettings = useGameStore((s) => s.updateSettings)
  return (
    <ToggleSwitch
      icon="dice"
      label="Auto roll"
      on={autoRoll}
      onChange={(on) => updateSettings({ autoRoll: on })}
      title="Roll the dice automatically on your turn. You still choose which piece to move."
    />
  )
}

function AutoMoveSwitch() {
  const autoMove = useGameStore((s) => s.settings.autoMove)
  const updateSettings = useGameStore((s) => s.updateSettings)
  return (
    <ToggleSwitch
      icon="forward"
      label="Auto move"
      on={autoMove}
      onChange={(on) => updateSettings({ autoMove: on })}
      title="Move your piece automatically when there is no real choice: only one piece can move, or all movable pieces share a square."
    />
  )
}

const RANK_WORD = ['', '1st', '2nd', '3rd', '4th']

/** Banner over the board when a player gets all four pieces home. */
function FinishBanner({ name, color, rank }: { name: string; color: Color; rank: number }) {
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

/** Fixed confetti layout for the finish banner, so renders stay pure. */
const BURST = Array.from({ length: 28 }, (_, i) => {
  const unit = (seed: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453
    return x - Math.floor(x)
  }
  return { id: i, left: unit(i + 7) * 100, delay: unit(i + 77) * 0.5, drift: (unit(i + 177) - 0.5) * 80 }
})

/** True on touch-only devices, where keyboard hints make no sense. */
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches === true

/** "Your turn." for a default name, otherwise addresses the player by name. */
function turnOf(name: string): string {
  return name === 'You' ? 'Your turn.' : `${name}, your turn.`
}

export function GameScreen({ ludo }: GameScreenProps) {
  const { game, shownPlayers, rolling, busy, paused, role, humanTurn, autoRoll, celebration, notice, lastMove, offerEnd, endEarly, keepWatching, takeoverSeat, canUndo, canRedo, canPause, roll, pickToken, undo, redo, togglePause } = ludo
  const leaveOnline = useOnlineStore((s) => s.leave)
  const reconnect = useOnlineStore((s) => s.reconnect)
  const hostView = useHostView()
  const guestView = useGuestView()
  const online = role !== 'local'
  const isGuest = role === 'guest'
  const log = useGameStore((s) => s.log)
  const actions = useGameStore((s) => s.actions)
  const start = useGameStore((s) => s.start)
  const abort = useGameStore((s) => s.abort)
  const configs = useGameStore((s) => s.configs)
  const logOpen = useGameStore((s) => s.logOpen)
  const setLogOpen = useGameStore((s) => s.setLogOpen)

  const [pending, setPending] = useState<PendingAction>(null)
  const logRef = useRef<HTMLOListElement>(null)

  const gameOver = game.phase === 'gameOver'
  const inProgress = !gameOver && actions.length > 0
  const current = game.players[game.currentIndex]
  const elapsed = useGameClock(!paused && !gameOver)
  const toggleLog = () => setLogOpen(!logOpen)

  // Newest first, so the list starts at the top and scrolls back to it on each new entry.
  const newestFirst = [...log].reverse()
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0
  }, [log.length, logOpen])

  const clickable =
    humanTurn && game.phase === 'move' && !busy && !paused
      ? game.legalMoves.map((m) => ({ color: current.color, tokenId: m.tokenId }))
      : []

  const canRoll = humanTurn && game.phase === 'roll' && !busy && !paused

  // Online, leaving setup ends the session (host) or leaves it (guest).
  const doSettings = () => (online ? leaveOnline() : abort())
  const doNew = () => {
    if (isGuest) return
    // Hosts start from the session's current seats (a seat a bot took over stays a bot).
    if (role === 'host') useOnlineStore.getState().startHostedGame()
    else if (configs) start(configs)
  }
  const requestSettings = () => (inProgress || (online && !gameOver) ? setPending('settings') : doSettings())
  const requestNew = () => {
    if (isGuest) return
    if (inProgress) setPending('new')
    else doNew()
  }

  // Host: online players who dropped out of a game still in progress.
  const leftSeats = !gameOver && hostView
    ? hostView.seats.filter((s) => s.remote && s.joined && !s.connected && game.players.some((p) => p.color === s.color && p.remote && p.finishRank === null))
    : []
  const confirmPending = () => {
    if (pending === 'settings') doSettings()
    if (pending === 'new') doNew()
    setPending(null)
  }

  // Keyboard shortcuts. Ignored while typing, with modifier keys held, or while
  // the confirm dialog is open (it handles its own keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (pending || offerEnd) return

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      // Holding a key down should not flip pause or reopen dialogs repeatedly.
      if (e.repeat && key !== 'ArrowLeft' && key !== 'ArrowRight') return
      // With the win overlay up, only new game and settings make sense.
      if (gameOver && key !== 'n' && key !== 's') return

      switch (key) {
        case ' ':
          // Stop Space from also clicking whichever button has focus.
          e.preventDefault()
          if (canRoll) roll()
          return
        case '1':
        case '2':
        case '3':
        case '4': {
          const tokenId = Number(key) - 1
          if (clickable.some((c) => c.tokenId === tokenId)) {
            e.preventDefault()
            pickToken(tokenId)
          }
          return
        }
        case 'ArrowLeft':
          if (canUndo) {
            e.preventDefault()
            undo()
          }
          return
        case 'ArrowRight':
          if (canRedo) {
            e.preventDefault()
            redo()
          }
          return
        case 'p':
          e.preventDefault()
          togglePause()
          return
        case 'n':
          e.preventDefault()
          requestNew()
          return
        case 's':
          e.preventDefault()
          requestSettings()
          return
        case 'l':
          e.preventDefault()
          toggleLog()
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  let prompt: string
  if (gameOver) prompt = 'Game over'
  else if (paused && isGuest) prompt = 'The host paused the game.'
  else if (paused) prompt = IS_TOUCH ? 'Paused. Tap Resume to keep playing.' : 'Paused. Press P or Resume to keep playing.'
  else if (busy) prompt = 'Moving...'
  else if (celebration) prompt = celebration.name === 'You' ? 'You got all your pieces home!' : `${celebration.name} got all their pieces home!`
  else if (!humanTurn) prompt = `${current.name} is playing...`
  else if (game.phase === 'roll' && autoRoll) prompt = current.name === 'You' ? 'Your turn. Rolling...' : `${current.name}, your turn. Rolling...`
  else if (game.phase === 'roll') prompt = `${turnOf(current.name)} ${IS_TOUCH ? 'Tap your dice to roll.' : 'Press Space or tap your dice to roll.'}`
  else prompt = IS_TOUCH ? 'Tap a highlighted piece to move it.' : 'Choose a highlighted piece: press its number or click it.'

  // Only seated colours get a panel: a two-player game has no green or blue seat.
  const panel = (color: Color) => {
    const player = shownPlayers.find((p) => p.color === color)
    const seat = game.players.find((p) => p.color === color)
    if (!player || !seat) return null
    return (
      <PlayerPanel
        key={color}
        player={player}
        area={color}
        active={!gameOver && current.color === color}
        canRoll={canRoll && current.color === color}
        rolling={rolling}
        onRoll={roll}
        finished={seat.finishRank !== null}
      />
    )
  }

  return (
    <section className="game" aria-label="Ludo game">
      <header className="toolbar">
        <div className="toolbar-title">
          <h1 className="game-title">Ludo</h1>
          <span className={`clock${paused ? ' clock-paused' : ''}`} role="timer" aria-label={`Game time ${formatClock(elapsed)}${paused ? ', paused' : ''}`}>
            <Icon name="clock" size={16} />
            <span aria-hidden="true">{formatClock(elapsed)}</span>
          </span>
        </div>
        <div className="toolbar-actions">
          {!online && <ToolButton icon="undo" label="Undo" onClick={undo} disabled={!canUndo} shortcut="ArrowLeft" shortcutLabel="←" />}
          {!online && <ToolButton icon="redo" label="Redo" onClick={redo} disabled={!canRedo} shortcut="ArrowRight" shortcutLabel="→" />}
          {canPause && <ToolButton
            icon={paused ? 'play' : 'pause'}
            label={paused ? 'Resume' : 'Pause'}
            onClick={togglePause}
            disabled={gameOver}
            pressed={paused}
            shortcut="P"
            shortcutLabel="P"
          />}
          <AutoRollSwitch />
          <AutoMoveSwitch />
          <SoundSwitch />
          <ToolButton
            icon="gear"
            label={role === 'host' ? 'End online game' : isGuest ? 'Leave game' : 'Settings'}
            onClick={requestSettings}
            shortcut="S"
            shortcutLabel="S"
          />
          {!isGuest && <ToolButton icon="restart" label="New game" onClick={requestNew} shortcut="N" shortcutLabel="N" />}
        </div>
      </header>

      <p className="prompt" aria-live="polite">{prompt}</p>

      {isGuest && guestView?.status === 'lost' && (
        <div className="net-banner" role="alert">
          <span>The connection to the host dropped.</span>
          <button type="button" className="primary" onClick={reconnect}>Reconnect</button>
          <button type="button" onClick={leaveOnline}>Leave</button>
        </div>
      )}
      {notice && (
        <div key={notice.id} className={`notice notice-${notice.color}`} role="status">
          <Icon name="robot" />
          <span>{notice.text}</span>
        </div>
      )}
      {leftSeats.map((s) => (
        <div key={s.color} className="net-banner" role="alert">
          <span>{s.name} lost connection. They can rejoin with their link, or a bot can take over.</span>
          <button type="button" onClick={() => takeoverSeat(s.color)} disabled={busy}>Let a bot play</button>
        </div>
      ))}

      <div className="game-body">
        <div className={`table${paused ? ' table-paused' : ''}`}>
          {panel('red')}
          {panel('green')}
          {panel('yellow')}
          {panel('blue')}
          <Board
            players={shownPlayers}
            activeColor={current.color}
            clickable={clickable}
            onPick={pickToken}
            labelColor={humanTurn ? current.color : null}
            lastMove={lastMove}
          />
          {celebration && <FinishBanner key={celebration.color} {...celebration} />}
          {paused && (
            <div className="pause-veil" role="status">
              <p>{isGuest ? 'The host paused the game' : 'Game paused'}</p>
              {canPause && (
                <button type="button" className="primary" onClick={togglePause}>
                  <Icon name="play" /> <span>Resume</span>
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="side-panel">
          <section className="log-panel">
            <h2>
              <button
                type="button"
                className="log-toggle"
                aria-expanded={logOpen}
                aria-controls="game-log"
                aria-keyshortcuts="L"
                onClick={toggleLog}
              >
                <span className={`chevron${logOpen ? ' chevron-open' : ''}`} aria-hidden="true" />
                Game log
                <span className="log-count">{log.length}</span>
              </button>
            </h2>
            {logOpen && (
              <ol id="game-log" className="log" ref={logRef} aria-label="Game log, latest first">
                {newestFirst.length === 0 && <li className="log-empty">No moves yet.</li>}
                {newestFirst.map((entry) => (
                  <li key={entry.id}>{entry.text}</li>
                ))}
              </ol>
            )}
          </section>
          <section className="log-panel keys-panel">
            <h2>Keyboard</h2>
            <dl className="shortcuts">
              <dt><kbd>Space</kbd></dt><dd>Roll the dice</dd>
              <dt><kbd>1</kbd>–<kbd>4</kbd></dt><dd>Move that piece</dd>
              <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Undo / redo</dd>
              <dt><kbd>P</kbd></dt><dd>Pause / resume</dd>
              <dt><kbd>L</kbd></dt><dd>Show / hide game log</dd>
              <dt><kbd>N</kbd></dt><dd>New game</dd>
              <dt><kbd>S</kbd></dt><dd>Settings</dd>
            </dl>
          </section>
        </aside>
      </div>

      {pending && (
        <ConfirmDialog
          title={role === 'host' && pending === 'settings' ? 'End the online game?' : isGuest ? 'Leave this game?' : 'Abort the current game?'}
          message={
            role === 'host' && pending === 'settings'
              ? 'This ends the game for everyone and closes the invite link.'
              : isGuest
                ? 'You will leave the game. The host can let a bot take your seat.'
                : role === 'host'
                  ? 'This game is still in progress. A new game starts for everyone with the same seats.'
                  : 'This game is still in progress. Aborting discards it, and it cannot be recovered.'
          }
          confirmLabel={
            role === 'host' && pending === 'settings'
              ? 'End for everyone'
              : isGuest
                ? 'Leave'
                : pending === 'settings'
                  ? 'Abort and open settings'
                  : 'Abort and start new'
          }
          cancelLabel="Keep playing"
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}

      {offerEnd && !pending && (
        <ConfirmDialog
          title={game.players.filter((p) => p.kind === 'human').length > 1 ? 'All human players have finished' : 'You have finished'}
          message="Only bots are left. End the game now and rank the remaining bots by how far their pieces have travelled, or keep watching them play it out."
          confirmLabel="End game"
          cancelLabel="Keep watching"
          confirmClass="primary"
          onConfirm={endEarly}
          onCancel={keepWatching}
        />
      )}

      {gameOver && !busy && (
        <WinOverlay
          early={game.events.some((e) => e.type === 'gameOver' && e.early)}
          winners={game.winners}
          time={formatClock(elapsed)}
          names={Object.fromEntries(game.players.map((p) => [p.color, p.name]))}
          onNewGame={isGuest ? undefined : doNew}
          onSetup={doSettings}
          setupLabel={role === 'host' ? 'End online game' : isGuest ? 'Leave' : undefined}
          note={isGuest ? 'Waiting for the host to start another game...' : undefined}
        />
      )}

      <span className="sr-only">Playing as {COLOR_NAME[current.color]}</span>
    </section>
  )
}
