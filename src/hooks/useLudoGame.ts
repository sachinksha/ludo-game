import { useCallback, useEffect, useRef, useState } from 'react'
import { playSound } from '../audio/sfx'
import { chooseBotMove, createBotProfile } from '../game/bot'
import { autoMoveTokenIds, rollFor, secureRandom, type Rng } from '../game/engine'
import { undoIndex } from '../game/history'
import { pathSteps } from '../game/rules'
import type { Color, GameAction, GameEvent, GameState, Player, TokenState } from '../game/types'
import { useGameStore } from '../store/gameStore'
import { useOnlineStore, type Role } from '../store/onlineStore'
import { useGuestView } from './useOnline'

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
  /** Delay before a human's dice roll by themselves when auto roll is on. */
  AUTO_ROLL_MS: 650,
  /** How long play holds while a player's finish is celebrated. */
  CELEBRATE_MS: 2200,
} as const

/** A player who just got all four tokens home, shown in a banner. */
export interface Celebration {
  color: Color
  name: string
  rank: number
}

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
  // A player finishing and the game ending often happen together: one fanfare.
  const fanfare = events.some((e) => e.type === 'finish' || e.type === 'gameOver')
  for (const e of events) {
    if (e.type === 'capture') playSound('capture')
    if (e.type === 'move' && e.move.finishes && !fanfare) playSound('finish')
    if (e.type === 'turnPass') playSound('pass')
  }
  if (fanfare) playSound('win')
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
  /** local, host or guest. */
  role: Role
  /** The seat to play is controlled from this device (a local human, or this guest's seat). */
  humanTurn: boolean
  /** True for seats played from this device. */
  isMine: (color: Color) => boolean
  /** Dice roll by themselves for humans. */
  autoRoll: boolean
  /** A player who just finished, while their banner is up. */
  celebration: Celebration | null
  /** Every human has finished but bots are still playing: offer to end the game. */
  offerEnd: boolean
  /** Ends the game now, ranking the remaining bots by progress. */
  endEarly: () => void
  /** Declines the end offer and lets the bots play on. */
  keepWatching: () => void
  /** Host: hands an online seat (a player who left) to a bot. */
  takeoverSeat: (color: Color) => void
  canUndo: boolean
  canRedo: boolean
  /** Pausing is possible from this device (not for online guests). */
  canPause: boolean
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
 * Every action follows one path: decide it, announce it (when hosting online),
 * animate it, then record it. Online guests skip the deciding: they animate the
 * actions the host announces, and send intents for their own seat.
 *
 * @param rng Random source for dice and bot choices. Injectable for tests.
 */
export function useLudoGame(rng: Rng = secureRandom): LudoController {
  const game = useGameStore((s) => s.game)
  const paused = useGameStore((s) => s.paused)
  const autoRoll = useGameStore((s) => s.settings.autoRoll)
  const actions = useGameStore((s) => s.actions)
  const redoStack = useGameStore((s) => s.redoStack)
  const role = useOnlineStore((s) => s.role)
  const inbox = useOnlineStore((s) => s.inbox)
  const guestColor = useGuestView()?.color ?? null
  if (!game) throw new Error('useLudoGame requires an active game')

  // Animation-only state: what the board shows while an action plays out.
  const [shownPlayers, setShownPlayers] = useState<Player[]>(() => game.players)
  const [rolling, setRolling] = useState(false)
  const [busy, setBusy] = useState(false)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [endDeclined, setEndDeclined] = useState(false)

  // Refs let scheduled callbacks read the latest values without stale closures.
  const busyRef = useRef(false)
  const timers = useRef<number[]>([])
  /** Guest: the action count at which an intent was last sent, to avoid repeats. */
  const intentSentAt = useRef(-1)

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

  /** Which seats this device plays. */
  const isMine = useCallback(
    (color: Color) => {
      const p = game.players.find((x) => x.color === color)
      if (!p || p.kind !== 'human') return false
      if (role === 'guest') return color === guestColor
      return !p.remote
    },
    [game.players, role, guestColor],
  )

  /**
   * Shows the settled state after an action, plays its sounds, and releases the
   * busy lock. A player finishing (without ending the game) gets a banner, and
   * play holds a moment so it registers.
   */
  const settle = useCallback(() => {
    const next = useGameStore.getState().game!
    setShownPlayers(next.players)
    playOutcomeSounds(next.events)
    const finish = next.events.find((e) => e.type === 'finish')
    if (finish && finish.type === 'finish' && next.phase !== 'gameOver') {
      const player = next.players.find((p) => p.color === finish.color)!
      setCelebration({ color: finish.color, name: player.name, rank: finish.rank })
      later(() => {
        setCelebration(null)
        setBusyBoth(false)
      }, TIMING.CELEBRATE_MS)
      return
    }
    later(() => setBusyBoth(false), TIMING.SETTLE_MS)
  }, [later, setBusyBoth])

  /**
   * Plays an action on screen, then records it: a dice tumble for a roll, a
   * square-by-square walk for a move, and straight to the result otherwise.
   * Returns false if the action does not fit the current state.
   */
  const animate = useCallback(
    (action: GameAction): boolean => {
      const { game: g, record } = useGameStore.getState()
      if (!g) return false
      setBusyBoth(true)

      if (action.type === 'roll') {
        setRolling(true)
        playSound('roll')
        later(() => {
          setRolling(false)
          record(action)
          settle()
        }, TIMING.ROLL_MS)
        return true
      }

      if (action.type === 'move') {
        const move = g.legalMoves.find((m) => m.tokenId === action.tokenId)
        if (g.phase !== 'move' || !move) {
          setBusyBoth(false)
          return false
        }
        const mover = g.players[g.currentIndex]
        const steps = pathSteps(mover.color, move.from, move.to)
        steps.forEach((state, i) => {
          later(() => {
            setShownPlayers((prev) => withTokenState(prev, mover.color, action.tokenId, state))
            playSound('move')
          }, i * TIMING.STEP_MS)
        })
        later(() => {
          record(action)
          settle()
        }, steps.length * TIMING.STEP_MS)
        return true
      }

      record(action)
      settle()
      return true
    },
    [later, setBusyBoth, settle],
  )

  /** Host or local: an action decided on this device. Hosts tell the guests first. */
  const submit = useCallback(
    (action: GameAction) => {
      useOnlineStore.getState().host?.announce(action)
      animate(action)
    },
    [animate],
  )

  /** Rolls for whoever's turn it is (not used by guests). */
  const performRoll = useCallback(() => {
    const { game: g, paused: isPaused, settings } = useGameStore.getState()
    if (busyRef.current || isPaused || !g || g.phase !== 'roll') return
    const seat = g.players[g.currentIndex]
    submit({ type: 'roll', value: rollFor(g, rng, settings.comebackDice), actor: seat.kind })
  }, [rng, submit])

  /** Moves a token for whoever's turn it is (not used by guests). */
  const playMove = useCallback(
    (tokenId: number) => {
      const { game: g, paused: isPaused } = useGameStore.getState()
      if (busyRef.current || isPaused || !g || g.phase !== 'move') return
      if (!g.legalMoves.some((m) => m.tokenId === tokenId)) return
      submit({ type: 'move', tokenId, actor: g.players[g.currentIndex].kind })
    },
    [submit],
  )

  /** Guest: asks the host to act for this guest's seat, once per game position. */
  const sendIntent = useCallback((intent: { action: 'roll' } | { action: 'move'; tokenId: number }) => {
    const { guest } = useOnlineStore.getState()
    const seq = useGameStore.getState().actions.length
    if (!guest || busyRef.current || intentSentAt.current === seq) return
    intentSentAt.current = seq
    guest.sendIntent(seq, intent)
  }, [])

  /** UI: roll for this device's seat. */
  const roll = useCallback(() => {
    const g = useGameStore.getState().game
    if (!g || g.phase !== 'roll' || !isMine(g.players[g.currentIndex].color)) return
    if (role === 'guest') sendIntent({ action: 'roll' })
    else performRoll()
  }, [isMine, role, sendIntent, performRoll])

  /** UI: move a token for this device's seat. */
  const pickToken = useCallback(
    (tokenId: number) => {
      const g = useGameStore.getState().game
      if (!g || g.phase !== 'move' || !isMine(g.players[g.currentIndex].color)) return
      if (!g.legalMoves.some((m) => m.tokenId === tokenId)) return
      if (role === 'guest') sendIntent({ action: 'move', tokenId })
      else playMove(tokenId)
    },
    [isMine, role, sendIntent, playMove],
  )

  // Every human has finished while two or more bots play on. Guests never decide this.
  const humans = game.players.filter((p) => p.kind === 'human')
  const humansDone = humans.length > 0 && humans.every((p) => p.finishRank !== null)
  const offerEnd = role !== 'guest' && humansDone && !endDeclined && !busy && game.phase !== 'gameOver'

  /** Guest: play the host's actions in order, one at a time. */
  useEffect(() => {
    if (role !== 'guest' || busy || inbox.length === 0) return
    // Like every scheduled action, run it from a timer rather than during the effect.
    const id = window.setTimeout(() => {
      const item = useOnlineStore.getState().shiftInbox()
      if (item?.kind !== 'action') return
      if (!animate(item.action)) useOnlineStore.getState().guest?.requestResync()
    }, 0)
    return () => window.clearTimeout(id)
  }, [role, busy, inbox, animate])

  /** Each action is scheduled from here: bot turns, auto rolls, forced moves, guest intents. */
  useEffect(() => {
    if (busy || paused || offerEnd || game.phase === 'gameOver') return
    const seat = game.players[game.currentIndex]

    if (role === 'guest') {
      // Guests only auto-roll for themselves; the host does everything else.
      if (game.phase !== 'roll' || !autoRoll || !isMine(seat.color) || inbox.length > 0) return
      const id = window.setTimeout(() => sendIntent({ action: 'roll' }), TIMING.AUTO_ROLL_MS)
      return () => window.clearTimeout(id)
    }

    // Host: act on a guest's intent if it is for the current seat and position.
    if (seat.remote && inbox.length > 0) {
      const id = window.setTimeout(() => {
        const { inbox: pending, clearInbox } = useOnlineStore.getState()
        const intent = pending.find((i) => i.kind === 'intent' && i.color === seat.color && i.seq === actions.length)
        clearInbox() // anything else is stale
        if (intent?.kind !== 'intent') return
        if (intent.intent.action === 'roll' && game.phase === 'roll') performRoll()
        if (intent.intent.action === 'move' && game.phase === 'move') playMove(intent.intent.tokenId)
      }, 0)
      return () => window.clearTimeout(id)
    }

    if (game.phase === 'roll') {
      if (seat.kind === 'human' && (seat.remote || !autoRoll)) return
      const delay = seat.kind === 'bot' ? TIMING.BOT_ROLL_MS : TIMING.AUTO_ROLL_MS
      const id = window.setTimeout(performRoll, delay)
      return () => window.clearTimeout(id)
    }

    // Move phase. When there is no real choice (one legal move, or every legal
    // move starts from the same spot), play it without a click. Any token in the
    // group gives the same result, so pick one at random.
    const autoIds = autoMoveTokenIds(game.legalMoves)
    if (autoIds) {
      const id = window.setTimeout(() => {
        const pick = autoIds[Math.min(autoIds.length - 1, Math.floor(rng() * autoIds.length))]
        playMove(pick)
      }, TIMING.AUTO_MOVE_MS)
      return () => window.clearTimeout(id)
    }

    if (seat.kind === 'bot') {
      const id = window.setTimeout(() => {
        const choice = chooseBotMove(useGameStore.getState().game!, rng)
        if (choice) playMove(choice.tokenId)
      }, TIMING.BOT_MOVE_MS)
      return () => window.clearTimeout(id)
    }
  }, [game, actions, busy, paused, offerEnd, autoRoll, role, inbox, isMine, performRoll, playMove, sendIntent, rng])

  const endEarly = useCallback(() => {
    if (busyRef.current || role === 'guest') return
    submit({ type: 'end', actor: 'human' })
  }, [role, submit])

  const keepWatching = useCallback(() => setEndDeclined(true), [])

  const takeoverSeat = useCallback(
    (color: Color) => {
      if (busyRef.current || role !== 'host') return
      submit({ type: 'takeover', color, bot: createBotProfile(rng), actor: 'human' })
    },
    [role, rng, submit],
  )

  const undo = useCallback(() => {
    if (busyRef.current || role !== 'local') return
    useGameStore.getState().undo()
    setShownPlayers(useGameStore.getState().game!.players)
    setRolling(false)
  }, [role])

  const redo = useCallback(() => {
    if (busyRef.current || role !== 'local') return
    useGameStore.getState().redo()
    setShownPlayers(useGameStore.getState().game!.players)
    setRolling(false)
  }, [role])

  // Local games pause when the player looks away: the tab goes to the
  // background or the window loses focus. Resuming is left to the player.
  // Online games do not, since one player switching tabs would stop everyone.
  useEffect(() => {
    if (role !== 'local') return
    const pauseIfPlaying = () => {
      const { game: g, paused: isPaused, setPaused } = useGameStore.getState()
      if (g && g.phase !== 'gameOver' && !isPaused) setPaused(true)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pauseIfPlaying()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', pauseIfPlaying)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', pauseIfPlaying)
    }
  }, [role])

  const togglePause = useCallback(() => {
    if (role === 'guest') return
    useGameStore.getState().setPaused(!useGameStore.getState().paused)
  }, [role])

  const seat = game.players[game.currentIndex]
  const local = role === 'local'
  return {
    game,
    shownPlayers,
    rolling,
    busy,
    paused,
    role,
    humanTurn: isMine(seat.color) && game.phase !== 'gameOver',
    isMine,
    autoRoll,
    celebration,
    offerEnd,
    endEarly,
    keepWatching,
    takeoverSeat,
    canUndo: local && !busy && !paused && undoIndex(actions) !== null,
    canRedo: local && !busy && !paused && redoStack.length > 0,
    canPause: role !== 'guest',
    roll,
    pickToken,
    undo,
    redo,
    togglePause,
  }
}
