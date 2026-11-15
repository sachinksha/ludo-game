import { useRef, useState } from 'react'
import { HOUSE_RULE_KEYS, type Color } from '../game/types'
import { formatClock, useGameClock } from '../hooks/useGameClock'
import type { LudoController } from '../hooks/useLudoGame'
import { useGuestView, useHostView } from '../hooks/useOnline'
import { IS_TOUCH, useShortcuts } from '../hooks/useShortcuts'
import { useGameStore } from '../store/gameStore'
import { useOnlineStore } from '../store/onlineStore'
import { Board } from './Board'
import { COLOR_HEX } from './colors'
import { ConfirmDialog } from './ConfirmDialog'
import { DicePool } from './DicePool'
import { FinishBanner } from './FinishBanner'
import { GameLog, KeyboardHelp } from './GameLog'
import { GameMenu } from './GameMenu'
import { HOUSE_RULE_TEXT } from './houseRuleText'
import { Icon } from './Icons'
import { PlayerPanel } from './PlayerPanel'
import { RulesSheet } from './RulesSheet'
import { SettingsSheet } from './SettingsSheet'
import { ToolButton } from './Toolbar'
import { WinOverlay } from './WinOverlay'

interface GameScreenProps {
  ludo: LudoController
}

/** A confirmation waiting on screen: leave for setup, or restart. */
type PendingAction = 'setup' | 'restart' | null
/** The sheet open over the game, if any. */
type OpenSheet = 'rules' | 'settings' | 'game' | null

/** "Your turn." for a default name, otherwise addresses the player by name. */
function turnOf(name: string): string {
  return name === 'You' ? 'Your turn.' : `${name}, your turn.`
}

export function GameScreen({ ludo }: GameScreenProps) {
  const { game, shownPlayers, rolling, busy, paused, role, humanTurn, autoRoll, pool, selectedDie, usableDice, selectDie, pickable, celebration, notice, lastMove, offerEnd, endEarly, keepWatching, takeoverSeat, canUndo, canRedo, canPause, roll, pickToken, undo, redo, togglePause } = ludo
  const leaveOnline = useOnlineStore((s) => s.leave)
  const reconnect = useOnlineStore((s) => s.reconnect)
  const hostView = useHostView()
  const guestView = useGuestView()
  const online = role !== 'local'
  const isGuest = role === 'guest'
  const actions = useGameStore((s) => s.actions)
  const latestLog = useGameStore((s) => s.log.at(-1)?.text ?? '')
  const start = useGameStore((s) => s.start)
  const abort = useGameStore((s) => s.abort)
  const configs = useGameStore((s) => s.configs)
  const logOpen = useGameStore((s) => s.logOpen)
  const setLogOpen = useGameStore((s) => s.setLogOpen)
  const undoOn = useGameStore((s) => s.settings.undo) && !online

  const [pending, setPending] = useState<PendingAction>(null)
  const [sheet, setSheet] = useState<OpenSheet>(null)
  /** True when opening a sheet paused the game, so closing it resumes it. */
  const pausedForSheet = useRef(false)

  const gameOver = game.phase === 'gameOver'
  const inProgress = !gameOver && actions.length > 0
  const current = game.players[game.currentIndex]
  const elapsed = useGameClock(!paused && !gameOver)
  const canRoll = humanTurn && game.phase === 'roll' && !busy && !paused
  const canPick = humanTurn && game.phase === 'move' && !busy && !paused
  const clickable = canPick ? pickable.map((tokenId) => ({ color: current.color, tokenId })) : []
  /** Still rolling with sixes banked (roll sixes first). */
  const banking = game.phase === 'roll' && pool.length > 0

  // Online, leaving ends the session (host) or leaves it (guest). Locally, back to setup.
  const doSetup = () => (online ? leaveOnline() : abort())
  /** Restart: same players, seats and house rules, from the beginning. */
  const doRestart = () => {
    if (isGuest) return
    // Hosts restart from the session's current seats (a seat a bot took over stays a bot).
    if (role === 'host') useOnlineStore.getState().startHostedGame()
    else if (configs) start(configs)
  }
  const requestSetup = () => (inProgress || (online && !gameOver) ? setPending('setup') : doSetup())
  const requestRestart = () => {
    if (isGuest) return
    if (inProgress) setPending('restart')
    else doRestart()
  }
  const confirmPending = () => {
    if (pending === 'setup') doSetup()
    if (pending === 'restart') doRestart()
    setPending(null)
  }

  // Reading the rules or changing settings mid-game shouldn't cost a turn: a
  // local game pauses while a sheet is open. Online games never pause for one player.
  const openSheet = (which: Exclude<OpenSheet, null>) => {
    if (role === 'local' && !paused && !gameOver) {
      pausedForSheet.current = true
      togglePause()
    }
    setSheet(which)
  }
  const closeSheet = () => {
    setSheet(null)
    if (pausedForSheet.current) {
      pausedForSheet.current = false
      if (useGameStore.getState().paused) togglePause()
    }
  }
  /** From the Game menu: close it, then ask before ending or restarting the game. */
  const fromMenu = (action: () => void) => () => {
    closeSheet()
    action()
  }

  // Host: online players who dropped out of a game still in progress.
  const leftSeats = !gameOver && hostView
    ? hostView.seats.filter((s) => s.remote && s.joined && !s.connected && game.players.some((p) => p.color === s.color && p.remote && p.finishRank === null))
    : []

  useShortcuts(
    {
      ' ': () => {
        if (canRoll) roll()
      },
      ...Object.fromEntries(
        [1, 2, 3, 4].map((n) => [
          String(n),
          () => {
            if (!pickable.includes(n - 1) || !canPick) return false
            pickToken(n - 1)
          },
        ]),
      ),
      // Switch to the next die that can move something.
      d: () => {
        if (!canPick || usableDice.length < 2) return false
        selectDie(usableDice[(usableDice.indexOf(selectedDie ?? usableDice[0]) + 1) % usableDice.length])
      },
      ...(undoOn
        ? {
            'mod+z': () => (canUndo ? void undo() : false),
            'mod+y': () => (canRedo ? void redo() : false),
            'mod+shift+z': () => (canRedo ? void redo() : false),
          }
        : {}),
      p: () => {
        if (canPause) togglePause()
      },
      l: () => setLogOpen(!logOpen),
      '?': () => openSheet('rules'),
      s: () => openSheet('settings'),
      g: () => openSheet('game'),
      n: requestRestart,
    },
    !pending && !offerEnd && !gameOver && !sheet,
  )
  // With the win overlay up, only restart and back to setup make sense.
  useShortcuts({ n: doRestart, s: doSetup }, gameOver && !busy && !sheet)

  const lost = game.events.find((e) => e.type === 'turnPass' && e.unused)
  let prompt: string
  if (gameOver) prompt = 'Game over'
  else if (paused && isGuest) prompt = 'The host paused the game.'
  else if (paused) prompt = IS_TOUCH ? 'Paused. Tap Resume to keep playing.' : 'Paused. Press P or Resume to keep playing.'
  else if (busy) prompt = 'Moving...'
  else if (celebration) prompt = celebration.name === 'You' ? 'You got all your pieces home!' : `${celebration.name} got all their pieces home!`
  else if (lost?.type === 'turnPass' && game.phase === 'roll' && lost.reason === 'noMoves') {
    const who = game.players.find((p) => p.color === lost.color)!
    prompt = `${who.name === 'You' ? 'You' : who.name} couldn't use the ${lost.unused!.join(', ')}. ${humanTurn ? turnOf(current.name) : `${current.name} is playing...`}`
  } else if (!humanTurn) prompt = `${current.name} is playing...`
  else if (banking) prompt = `${turnOf(current.name)} Banked ${pool.join(', ')}: roll again before moving${autoRoll ? '...' : '.'}`
  else if (game.phase === 'roll' && autoRoll) prompt = `${turnOf(current.name)} Rolling...`
  else if (game.phase === 'roll') prompt = `${turnOf(current.name)} ${IS_TOUCH ? 'Tap your dice to roll.' : 'Press Space or tap your dice to roll.'}`
  // On touch screens the dice row already shows the dice; a short prompt keeps the bar one height.
  else if (IS_TOUCH) prompt = usableDice.length > 1 ? 'Tap a piece, or a die to switch.' : 'Tap a highlighted piece to move it.'
  else if (pool.length > 1) prompt = `Using the ${selectedDie}: pick a highlighted piece (1–4).`
  else prompt = 'Choose a highlighted piece: press its number or click it.'

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
          {undoOn && <ToolButton icon="undo" label="Undo" onClick={undo} disabled={!canUndo} shortcut="Control+Z" shortcutLabel="Ctrl+Z" />}
          {undoOn && <ToolButton icon="redo" label="Redo" onClick={redo} disabled={!canRedo} shortcut="Control+Y" shortcutLabel="Ctrl+Y" />}
          {canPause && (
            <ToolButton icon={paused ? 'play' : 'pause'} label={paused ? 'Resume' : 'Pause'} onClick={togglePause} disabled={gameOver} pressed={paused} shortcut="P" shortcutLabel="P" />
          )}
          <ToolButton icon="book" label="Rules" onClick={() => openSheet('rules')} shortcut="?" shortcutLabel="?" />
          <ToolButton icon="gear" label="Settings" onClick={() => openSheet('settings')} shortcut="S" shortcutLabel="S" />
          <ToolButton icon="flag" label="Game" onClick={() => openSheet('game')} shortcut="G" shortcutLabel="G" />
        </div>
      </header>

      <div className="turn-bar" style={{ ['--arm' as string]: COLOR_HEX[current.color] }}>
        <p className="prompt" aria-live="polite">{prompt}</p>
        <DicePool
          pool={pool}
          banking={banking}
          selectedDie={selectedDie}
          usable={(d) => usableDice.includes(d)}
          interactive={canPick}
          keyHint={!IS_TOUCH}
          onSelect={selectDie}
        />
      </div>

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
          {paused && !sheet && (
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
          <GameLog />
          <KeyboardHelp undo={undoOn} />
        </aside>
      </div>

      {/* Reads out each new log line (captures, bot moves) for screen reader users. */}
      <p className="sr-only" aria-live="polite" data-testid="announcer">{latestLog}</p>

      <RulesSheet open={sheet === 'rules'} onClose={closeSheet} />
      <SettingsSheet open={sheet === 'settings'} onClose={closeSheet} />
      <GameMenu
        open={sheet === 'game'}
        onClose={closeSheet}
        role={role}
        canRestart={configs !== null || role === 'host'}
        rulesText={HOUSE_RULE_KEYS.filter((k) => game.rules?.[k]).map((k) => HOUSE_RULE_TEXT[k].title).join(', ') || 'none'}
        onRestart={fromMenu(requestRestart)}
        onLeave={fromMenu(requestSetup)}
      />

      {pending && (
        <ConfirmDialog
          title={
            role === 'host' && pending === 'setup'
              ? 'End the online game?'
              : isGuest
                ? 'Leave this game?'
                : pending === 'restart'
                  ? 'Restart this game?'
                  : 'Leave this game for setup?'
          }
          message={
            role === 'host' && pending === 'setup'
              ? 'This ends the game for everyone and closes the invite link.'
              : isGuest
                ? 'You will leave the game. The host can let a bot take your seat.'
                : pending === 'restart'
                  ? role === 'host'
                    ? 'The game starts again from the beginning for everyone, with the same seats and house rules.'
                    : 'The game starts again from the beginning, with the same players and house rules. This game is discarded.'
                  : 'This game is still in progress and will be discarded. Setup opens with the same players, ready to change.'
          }
          confirmLabel={
            role === 'host' && pending === 'setup'
              ? 'End for everyone'
              : isGuest
                ? 'Leave'
                : pending === 'setup'
                  ? 'Discard and set up'
                  : 'Restart'
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
          onNewGame={isGuest || (!configs && role !== 'host') ? undefined : doRestart}
          onSetup={doSetup}
          setupLabel={role === 'host' ? 'End online game' : isGuest ? 'Leave' : 'Set up a new game'}
          note={isGuest ? 'Waiting for the host to start another game...' : undefined}
        />
      )}
    </section>
  )
}
