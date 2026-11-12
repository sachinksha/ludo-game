import { useEffect, useRef, useState } from 'react'
import { isMuted, setMuted } from '../audio/sfx'
import { formatClock, useGameClock } from '../hooks/useGameClock'
import type { LudoController } from '../hooks/useLudoGame'
import { useGameStore } from '../store/gameStore'
import { COLOR_NAME } from './colors'
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

/** Sound on/off as a labelled switch with a speaker logo. */
function SoundSwitch() {
  const [muted, setMutedState] = useState(isMuted())
  const on = !muted
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="tool sound-switch"
      onClick={() => {
        setMuted(on)
        setMutedState(on)
      }}
    >
      <Icon name="speaker" />
      <span className="tool-label">Sound</span>
      <span className={`switch-track${on ? ' switch-on' : ''}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  )
}

/** True on touch-only devices, where keyboard hints make no sense. */
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches === true

/** "Your turn." for a default name, otherwise addresses the player by name. */
function turnOf(name: string): string {
  return name === 'You' ? 'Your turn.' : `${name}, your turn.`
}

export function GameScreen({ ludo }: GameScreenProps) {
  const { game, shownPlayers, rolling, busy, paused, humanTurn, canUndo, canRedo, roll, pickToken, undo, redo, togglePause } = ludo
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

  const doSettings = () => abort()
  const doNew = () => {
    if (configs) start(configs)
  }
  const requestSettings = () => (inProgress ? setPending('settings') : doSettings())
  const requestNew = () => (inProgress ? setPending('new') : doNew())
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
      if (pending) return

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
  else if (paused) prompt = IS_TOUCH ? 'Paused. Tap Resume to keep playing.' : 'Paused. Press P or Resume to keep playing.'
  else if (busy) prompt = 'Moving...'
  else if (!humanTurn) prompt = `${current.name} is playing...`
  else if (game.phase === 'roll') prompt = `${turnOf(current.name)} ${IS_TOUCH ? 'Tap your dice to roll.' : 'Press Space or tap your dice to roll.'}`
  else prompt = IS_TOUCH ? 'Tap a highlighted piece to move it.' : 'Choose a highlighted piece: press its number or click it.'

  const panel = (color: Color) => {
    const player = shownPlayers.find((p) => p.color === color)!
    const seat = game.players.find((p) => p.color === color)!
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
          <ToolButton icon="undo" label="Undo" onClick={undo} disabled={!canUndo} shortcut="ArrowLeft" shortcutLabel="←" />
          <ToolButton icon="redo" label="Redo" onClick={redo} disabled={!canRedo} shortcut="ArrowRight" shortcutLabel="→" />
          <ToolButton
            icon={paused ? 'play' : 'pause'}
            label={paused ? 'Resume' : 'Pause'}
            onClick={togglePause}
            disabled={gameOver}
            pressed={paused}
            shortcut="P"
            shortcutLabel="P"
          />
          <SoundSwitch />
          <ToolButton icon="gear" label="Settings" onClick={requestSettings} shortcut="S" shortcutLabel="S" />
          <ToolButton icon="restart" label="New game" onClick={requestNew} shortcut="N" shortcutLabel="N" />
        </div>
      </header>

      <p className="prompt" aria-live="polite">{prompt}</p>

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
          />
          {paused && (
            <div className="pause-veil" role="status">
              <p>Game paused</p>
              <button type="button" className="primary" onClick={togglePause}>
                <Icon name="play" /> <span>Resume</span>
              </button>
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
          title="Abort the current game?"
          message="This game is still in progress. Aborting discards it, and it cannot be recovered."
          confirmLabel={pending === 'settings' ? 'Abort and open settings' : 'Abort and start new'}
          cancelLabel="Keep playing"
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}

      {gameOver && !busy && (
        <WinOverlay
          winners={game.winners}
          time={formatClock(elapsed)}
          names={Object.fromEntries(game.players.map((p) => [p.color, p.name]))}
          onNewGame={doNew}
          onSetup={doSettings}
        />
      )}

      <span className="sr-only">Playing as {COLOR_NAME[current.color]}</span>
    </section>
  )
}
