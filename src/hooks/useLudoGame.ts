import { useCallback, useEffect, useRef, useState } from 'react'
import { playSound } from '../audio/sfx'
import { chooseBotMove } from '../game/bot'
import { autoMoveTokenIds, rollDie, type Rng } from '../game/engine'
import { undoIndex } from '../game/history'
import { pathSteps } from '../game/rules'
import type { Color, GameEvent, GameState, Player, TokenState } from '../game/types'
import { useGameStore } from '../store/gameStore'

/** Timing constants, in milliseconds. */
export const TIMING = {
  /** Length of the dice tumble before the result is shown. */
  ROLL_MS: 600,
  /** Delay between each square a token steps through. */
  STEP_MS: 140,
  /** Pause after an action settles before the next one can start. */
  SETTLE_MS: 250,
  /** Bot thinking delays. */
  BOT_ROLL_MS: 700,
  BOT_MOVE_MS: 600,
  /** Delay before a forced (or equivalent) move is played automatically. */
  AUTO_MOVE_MS: 450,
} as const

/** Returns a copy of `players` with one token's state replaced. */
function withTokenState(
  players: Player[],
  color: Color,
  tokenId: number,
  state: TokenState,
): Player[] {
  return players.map((p) =>
    p.color !== color
      ? p
      : { ...p, tokens: p.tokens.map((t) => (t.id === tokenId ? { ...t, state } : t)) },
  )
}

/** Plays the sound effects that correspond to a settled action's events. */
function playOutcomeSounds(events: GameEvent[]): void {
  for (const e of events) {
    if (e.type === 'capture') playSound('capture')
    if (e.type === 'finish') playSound('finish')
    if (e.type === 'gameOver') playSound('win')
    if (e.type === 'turnPass') playSound('pass')
  }
}

export interface LudoController {
  game: GameState
  /** Players as currently drawn. Lags `game` while a move is animating. */
  shownPlayers: Player[]
  /** True while the dice are tumbling. */
  rolling: boolean
  /** True while a roll or move is animating or settling. */
  busy: boolean
  paused: boolean
  /** Whether the seat to play is controlled by a human. */
  humanTurn: boolean
  canUndo: boolean
  canRedo: boolean
  roll: () => void
  pickToken: (tokenId: number) => void
  undo: () => void
  redo: () => void
  togglePause: () => void
}

/**
 * Connects the store and the rules to the UI. Owns the timing: dice tumble,
 * step-by-step token animation, bot turns, and automatic moves. All game state
 * lives in the zustand store, so this hook only schedules actions.
 *
 * @param rng Random source for dice. Injectable so tests can force results.
 */
export function useLudoGame(rng: Rng = Math.random): LudoController {
  const game = useGameStore((s) => s.game)
  const paused = useGameStore((s) => s.paused)
  const actions = useGameStore((s) => s.actions)
  const redoStack = useGameStore((s) => s.redoStack)
  if (!game) throw new Error('useLudoGame requires an active game')

  // Animation-only state: what the board shows while an action plays out.
  const [shownPlayers, setShownPlayers] = useState<Player[]>(() => game.players)
  const [rolling, setRolling] = useState(false)
  const [busy, setBusy] = useState(false)

  // Refs let scheduled callbacks read the latest values without stale closures.
  const busyRef = useRef(false)
  const timers = useRef<number[]>([])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  const setBusyBoth = useCallback((value: boolean) => {
    busyRef.current = value
    setBusy(value)
  }, [])

  /** Rolls for whoever's turn it is. Bots and humans share this path. */
  const performRoll = useCallback(() => {
    const { game: g, paused: isPaused, record } = useGameStore.getState()
    if (busyRef.current || isPaused || !g || g.phase !== 'roll') return
    const seat = g.players[g.currentIndex]
    const value = rollDie(rng)

    setBusyBoth(true)
    setRolling(true)
    playSound('roll')

    later(() => {
      setRolling(false)
      record({ type: 'roll', value, actor: seat.kind })
      const next = useGameStore.getState().game!
      setShownPlayers(next.players)
      playOutcomeSounds(next.events)
      later(() => setBusyBoth(false), TIMING.SETTLE_MS)
    }, TIMING.ROLL_MS)
  }, [rng, later, setBusyBoth])

  /** Animates and records the move for `tokenId`. */
  const pickToken = useCallback(
    (tokenId: number) => {
      const { game: g, paused: isPaused, record } = useGameStore.getState()
      if (busyRef.current || isPaused || !g || g.phase !== 'move') return
      const move = g.legalMoves.find((m) => m.tokenId === tokenId)
      if (!move) return

      const mover = g.players[g.currentIndex]
      const steps = pathSteps(mover.color, move.from, move.to)

      setBusyBoth(true)
      steps.forEach((state, i) => {
        later(() => {
          setShownPlayers((prev) => withTokenState(prev, mover.color, tokenId, state))
          playSound('move')
        }, i * TIMING.STEP_MS)
      })

      later(() => {
        record({ type: 'move', tokenId, actor: mover.kind })
        const next = useGameStore.getState().game!
        setShownPlayers(next.players)
        playOutcomeSounds(next.events)
        later(() => setBusyBoth(false), TIMING.SETTLE_MS)
      }, steps.length * TIMING.STEP_MS)
    },
    [later, setBusyBoth],
  )

  const roll = useCallback(() => {
    const g = useGameStore.getState().game
    if (!g || g.players[g.currentIndex].kind !== 'human') return
    performRoll()
  }, [performRoll])

  /** Each action is scheduled from here: bot turns, forced single moves. */
  useEffect(() => {
    if (busy || paused || game.phase === 'gameOver') return
    const seat = game.players[game.currentIndex]

    if (game.phase === 'roll') {
      if (seat.kind !== 'bot') return
      const id = window.setTimeout(performRoll, TIMING.BOT_ROLL_MS)
      return () => window.clearTimeout(id)
    }

    // Move phase. When there is no real choice (one legal move, or every legal
    // move starts from the same spot), play it without a click. Any token in the
    // group gives the same result, so pick one at random.
    const autoIds = autoMoveTokenIds(game.legalMoves)
    if (autoIds) {
      const id = window.setTimeout(() => {
        const pick = autoIds[Math.min(autoIds.length - 1, Math.floor(rng() * autoIds.length))]
        pickToken(pick)
      }, TIMING.AUTO_MOVE_MS)
      return () => window.clearTimeout(id)
    }

    if (seat.kind === 'bot') {
      const id = window.setTimeout(() => {
        const choice = chooseBotMove(useGameStore.getState().game!)
        if (choice) pickToken(choice.tokenId)
      }, TIMING.BOT_MOVE_MS)
      return () => window.clearTimeout(id)
    }
  }, [game, busy, paused, performRoll, pickToken, rng])

  const undo = useCallback(() => {
    if (busyRef.current) return
    useGameStore.getState().undo()
    setShownPlayers(useGameStore.getState().game!.players)
    setRolling(false)
  }, [])

  const redo = useCallback(() => {
    if (busyRef.current) return
    useGameStore.getState().redo()
    setShownPlayers(useGameStore.getState().game!.players)
    setRolling(false)
  }, [])

  const togglePause = useCallback(() => {
    useGameStore.getState().setPaused(!useGameStore.getState().paused)
  }, [])

  const seat = game.players[game.currentIndex]
  return {
    game,
    shownPlayers,
    rolling,
    busy,
    paused,
    humanTurn: seat.kind === 'human' && game.phase !== 'gameOver',
    canUndo: !busy && !paused && undoIndex(actions) !== null,
    canRedo: !busy && !paused && redoStack.length > 0,
    roll,
    pickToken,
    undo,
    redo,
    togglePause,
  }
}
