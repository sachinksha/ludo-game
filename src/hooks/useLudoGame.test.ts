import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { START_INDEX } from '../game/board'
import type { GameState, PlayerConfig, TokenState } from '../game/types'
import { useGameStore } from '../store/gameStore'
import { TIMING, useLudoGame } from './useLudoGame'

const CONFIG: PlayerConfig[] = [
  { color: 'red', kind: 'human' },
  { color: 'yellow', kind: 'bot' },
]

/** Random source that gives a die face of 3 (0.45 * 6 = 2.7, so 2 + 1). */
const THREE = () => 0.45

/** Puts the store into a game where red's tokens are in the given states (others stay in the yard). */
function seedRedTokens(states: Record<number, TokenState>): GameState {
  useGameStore.getState().start(CONFIG)
  const base = useGameStore.getState().game!
  const players = base.players.map((p, i) =>
    i !== 0 ? p : { ...p, tokens: p.tokens.map((t, id) => (states[id] ? { ...t, state: states[id] } : t)) },
  )
  const custom = { ...base, players }
  useGameStore.setState({ initial: custom, game: custom, actions: [], redoStack: [], log: [] })
  return custom
}

/** Red has exactly one token on the board, on its start square. */
const seedSingleTokenGame = () => seedRedTokens({ 0: { kind: 'track', pos: START_INDEX.red } })

beforeEach(() => {
  vi.useFakeTimers()
  useGameStore.getState().abort()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLudoGame: forced moves', () => {
  it('plays a forced single legal move without a click', () => {
    seedSingleTokenGame()
    const { result } = renderHook(() => useLudoGame(THREE))

    // The human rolls. Red's three yard tokens need a six, so the only legal move is token 0.
    act(() => result.current.roll())
    // Advance in steps. Each step lets React commit, so the effect that schedules
    // the forced move runs before the next timer. A single large advance would not.
    act(() => vi.advanceTimersByTime(TIMING.ROLL_MS + 10))
    act(() => vi.advanceTimersByTime(TIMING.SETTLE_MS + TIMING.AUTO_MOVE_MS + 10))
    act(() => vi.advanceTimersByTime(2000))

    const red = useGameStore.getState().game!.players[0]
    // Token 0 started on red's start square and advanced three squares.
    expect(red.tokens[0].state).toEqual({ kind: 'track', pos: START_INDEX.red + 3 })
    expect(useGameStore.getState().actions).toHaveLength(2)
  })

  it('waits for a click on a forced move when auto move is off', () => {
    useGameStore.getState().updateSettings({ autoMove: false })
    try {
      seedSingleTokenGame()
      const { result } = renderHook(() => useLudoGame(THREE))
      act(() => result.current.roll())
      act(() => vi.advanceTimersByTime(TIMING.ROLL_MS + 10))
      act(() => vi.advanceTimersByTime(TIMING.SETTLE_MS + TIMING.AUTO_MOVE_MS + 10))
      act(() => vi.advanceTimersByTime(2000))
      expect(useGameStore.getState().game!.phase).toBe('move')
      expect(result.current.humanTurn).toBe(true)
      expect(useGameStore.getState().actions).toHaveLength(1)

      act(() => result.current.pickToken(0))
      act(() => vi.advanceTimersByTime(2000))
      expect(useGameStore.getState().game!.players[0].tokens[0].state).toEqual({ kind: 'track', pos: START_INDEX.red + 3 })
    } finally {
      useGameStore.getState().updateSettings({ autoMove: true })
    }
  })

  it('does not auto-move when the human has a choice', () => {
    const base = seedSingleTokenGame()
    // Give red a second token on the board so there are two legal moves with a three.
    const players = base.players.map((p, i) =>
      i !== 0
        ? p
        : { ...p, tokens: p.tokens.map((t, id) => (id === 1 ? { ...t, state: { kind: 'track' as const, pos: 5 } } : t)) },
    )
    useGameStore.setState({ game: { ...base, players }, initial: { ...base, players } })

    const { result } = renderHook(() => useLudoGame(THREE))
    act(() => result.current.roll())
    act(() => {
      vi.advanceTimersByTime(TIMING.ROLL_MS + TIMING.SETTLE_MS + TIMING.AUTO_MOVE_MS + 2000)
    })

    expect(useGameStore.getState().game!.phase).toBe('move')
    expect(useGameStore.getState().actions).toHaveLength(1)
  })

  it('auto-moves one of several tokens stacked on the same square', () => {
    const pos = START_INDEX.red + 4
    seedRedTokens({ 0: { kind: 'track', pos }, 2: { kind: 'track', pos } })
    const { result } = renderHook(() => useLudoGame(THREE))

    act(() => result.current.roll())
    act(() => vi.advanceTimersByTime(TIMING.ROLL_MS + 10))
    act(() => vi.advanceTimersByTime(TIMING.SETTLE_MS + TIMING.AUTO_MOVE_MS + 10))
    act(() => vi.advanceTimersByTime(2000))

    const tokens = useGameStore.getState().game!.players[0].tokens
    const moved = tokens.filter((t) => t.state.kind === 'track' && t.state.pos === pos + 3)
    const stayed = tokens.filter((t) => t.state.kind === 'track' && t.state.pos === pos)
    expect(moved).toHaveLength(1)
    expect(stayed).toHaveLength(1)
    expect(useGameStore.getState().actions).toHaveLength(2)
  })
})

const FOUR: PlayerConfig[] = [
  { color: 'red', kind: 'human' },
  { color: 'green', kind: 'bot' },
  { color: 'yellow', kind: 'bot' },
  { color: 'blue', kind: 'bot' },
]

/** Starts a four-seat game and applies `edit` to its initial state. */
function seedFour(edit: (g: GameState) => GameState): void {
  useGameStore.getState().start(FOUR)
  const custom = edit(useGameStore.getState().game!)
  useGameStore.setState({ initial: custom, game: custom, actions: [], redoStack: [], log: [] })
}

const HOME: TokenState = { kind: 'home' }

describe('useLudoGame: auto roll', () => {
  it('rolls for a human by itself when auto roll is on', () => {
    useGameStore.getState().updateSettings({ autoRoll: true })
    useGameStore.getState().start(CONFIG)
    renderHook(() => useLudoGame(THREE))
    act(() => vi.advanceTimersByTime(TIMING.AUTO_ROLL_MS + 10))
    act(() => vi.advanceTimersByTime(TIMING.ROLL_MS + 10))
    expect(useGameStore.getState().actions[0]).toEqual({ type: 'roll', value: 3, actor: 'human' })
  })

  it('waits for the human to roll when auto roll is off', () => {
    useGameStore.getState().updateSettings({ autoRoll: false })
    useGameStore.getState().start(CONFIG)
    renderHook(() => useLudoGame(THREE))
    act(() => vi.advanceTimersByTime(5000))
    expect(useGameStore.getState().actions).toHaveLength(0)
    useGameStore.getState().updateSettings({ autoRoll: true })
  })

  it('still waits for the human to pick when there is a real choice', () => {
    useGameStore.getState().updateSettings({ autoRoll: true })
    seedRedTokens({ 0: { kind: 'track', pos: START_INDEX.red }, 1: { kind: 'track', pos: 5 } })
    renderHook(() => useLudoGame(THREE))
    act(() => vi.advanceTimersByTime(TIMING.AUTO_ROLL_MS + 10))
    act(() => vi.advanceTimersByTime(TIMING.ROLL_MS + 10))
    act(() => vi.advanceTimersByTime(5000))
    expect(useGameStore.getState().game!.phase).toBe('move')
    expect(useGameStore.getState().actions).toHaveLength(1)
  })
})

describe('useLudoGame: a player finishing', () => {
  it('celebrates a player who finishes while others play on', () => {
    useGameStore.getState().updateSettings({ autoRoll: true })
    seedFour((g) => ({
      ...g,
      players: g.players.map((p, i) =>
        i === 0 ? { ...p, tokens: p.tokens.map((t) => ({ ...t, state: t.id === 0 ? { kind: 'lane' as const, step: 3 } : HOME })) } : p,
      ),
    }))
    const TWO_FACE = () => 0.2 // floor(1.2) + 1 = 2: exactly reaches the centre
    const { result } = renderHook(() => useLudoGame(TWO_FACE))
    act(() => vi.advanceTimersByTime(TIMING.AUTO_ROLL_MS + 10))
    act(() => vi.advanceTimersByTime(TIMING.ROLL_MS + 10))
    act(() => vi.advanceTimersByTime(TIMING.SETTLE_MS + 10))
    act(() => vi.advanceTimersByTime(TIMING.AUTO_MOVE_MS + 10))
    act(() => vi.advanceTimersByTime(TIMING.STEP_MS * 2 + 10))
    expect(result.current.celebration).toEqual({ color: 'red', name: 'You', rank: 1 })
    act(() => vi.advanceTimersByTime(TIMING.CELEBRATE_MS + 10))
    expect(result.current.celebration).toBeNull()
  })
})

describe('useLudoGame: offering to end when every human is done', () => {
  const humanFinished = (g: GameState): GameState => ({
    ...g,
    currentIndex: 1,
    players: g.players.map((p, i) => (i === 0 ? { ...p, finishRank: 1, tokens: p.tokens.map((t) => ({ ...t, state: HOME })) } : p)),
  })

  it('offers to end, and holds the bots while the offer is open', () => {
    seedFour(humanFinished)
    const { result } = renderHook(() => useLudoGame(THREE))
    expect(result.current.offerEnd).toBe(true)
    act(() => vi.advanceTimersByTime(5000))
    expect(useGameStore.getState().actions).toHaveLength(0)
  })

  it('ends the game with the bots ranked when accepted', () => {
    seedFour(humanFinished)
    const { result } = renderHook(() => useLudoGame(THREE))
    act(() => result.current.endEarly())
    const g = useGameStore.getState().game!
    expect(g.phase).toBe('gameOver')
    expect(g.winners[0]).toBe('red')
    expect(g.winners).toHaveLength(4)
  })

  it('lets the bots play on when declined', () => {
    seedFour(humanFinished)
    const { result } = renderHook(() => useLudoGame(THREE))
    act(() => result.current.keepWatching())
    expect(result.current.offerEnd).toBe(false)
    act(() => vi.advanceTimersByTime(TIMING.BOT_ROLL_MS + TIMING.ROLL_MS + 10))
    expect(useGameStore.getState().actions.length).toBeGreaterThan(0)
  })
})

describe('useLudoGame: auto pause', () => {
  it('pauses when the window loses focus', () => {
    useGameStore.getState().start(CONFIG)
    renderHook(() => useLudoGame(THREE))
    act(() => window.dispatchEvent(new Event('blur')))
    expect(useGameStore.getState().paused).toBe(true)
  })

  it('pauses when the tab goes to the background, and stays paused on return', () => {
    useGameStore.getState().start(CONFIG)
    renderHook(() => useLudoGame(THREE))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(useGameStore.getState().paused).toBe(true)
    visibility.mockReturnValue('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(useGameStore.getState().paused).toBe(true)
    visibility.mockRestore()
  })

  it('stops bots from playing while paused this way', () => {
    seedFour((g) => ({ ...g, currentIndex: 1 }))
    renderHook(() => useLudoGame(THREE))
    act(() => window.dispatchEvent(new Event('blur')))
    act(() => vi.advanceTimersByTime(5000))
    expect(useGameStore.getState().actions).toHaveLength(0)
  })

  it('does not pause a finished game', () => {
    seedFour((g) => ({ ...g, phase: 'gameOver' }))
    renderHook(() => useLudoGame(THREE))
    act(() => window.dispatchEvent(new Event('blur')))
    expect(useGameStore.getState().paused).toBe(false)
  })
})
