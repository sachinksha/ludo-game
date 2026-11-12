import { beforeEach, describe, expect, it } from 'vitest'
import type { PlayerConfig } from '../game/types'
import { useGameStore } from './gameStore'

const TWO: PlayerConfig[] = [
  { color: 'red', kind: 'human' },
  { color: 'yellow', kind: 'bot' },
]

const store = () => useGameStore.getState()

beforeEach(() => {
  store().abort()
})

describe('game store: history', () => {
  it('starts a game with an empty history and red to roll', () => {
    store().start(TWO)
    expect(store().game?.phase).toBe('roll')
    expect(store().actions).toHaveLength(0)
  })

  it('records a human roll and moves to the move phase', () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 6, actor: 'human' })
    expect(store().game?.phase).toBe('move')
    expect(store().game?.legalMoves).toHaveLength(4)
  })

  it('undo rewinds to the decision point before the human roll', () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 6, actor: 'human' })
    store().record({ type: 'move', tokenId: 0, actor: 'human' })
    expect(store().game?.players[0].tokens[0].state.kind).toBe('track')

    store().undo()
    expect(store().actions).toHaveLength(0)
    expect(store().game?.phase).toBe('roll')
    expect(store().game?.players[0].tokens.every((t) => t.state.kind === 'yard')).toBe(true)
  })

  it('redo restores exactly what was undone', () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 6, actor: 'human' })
    store().record({ type: 'move', tokenId: 0, actor: 'human' })
    const before = store().game
    store().undo()
    store().redo()
    expect(store().game?.players).toEqual(before?.players)
    expect(store().actions).toHaveLength(2)
  })

  it('a new action clears the redo stack', () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 6, actor: 'human' })
    store().undo()
    expect(store().redoStack).toHaveLength(1)
    store().record({ type: 'roll', value: 1, actor: 'human' })
    expect(store().redoStack).toHaveLength(0)
  })

  it('undo does nothing before any human action', () => {
    store().start(TWO)
    store().undo()
    expect(store().game?.phase).toBe('roll')
    expect(store().actions).toHaveLength(0)
  })

  it('keeps a log entry for each event, oldest first in the store', () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 3, actor: 'human' })
    expect(store().log.map((l) => l.text)).toEqual(['Red rolled a 3', 'Red has no legal move'])
  })
})

describe('game store: session', () => {
  it('abort returns to setup and clears history', () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 6, actor: 'human' })
    store().abort()
    expect(store().game).toBeNull()
    expect(store().actions).toHaveLength(0)
    expect(store().configs).toBeNull()
    // The last seats are remembered so setup can prefill them.
    expect(store().lastConfigs).toEqual(TWO)
  })

  it('starting a new game bumps the session so the UI can remount', () => {
    store().start(TWO)
    const first = store().session
    store().start(TWO)
    expect(store().session).toBe(first + 1)
  })

  it('tracks the paused flag', () => {
    store().start(TWO)
    store().setPaused(true)
    expect(store().paused).toBe(true)
    store().setPaused(false)
    expect(store().paused).toBe(false)
  })
})
