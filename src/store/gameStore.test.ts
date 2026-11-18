import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '../game/engine'
import { ALL_HOUSE_RULES, NO_HOUSE_RULES, type PlayerConfig } from '../game/types'
import { DEFAULT_SETTINGS, LAST_SETUP_KEY, SAVED_GAME_KEY, SAVE_VERSION, loadSavedGame, migrateSave, useGameStore } from './gameStore'

const TWO: PlayerConfig[] = [
  { color: 'red', kind: 'human' },
  { color: 'yellow', kind: 'bot' },
]

const store = () => useGameStore.getState()

beforeEach(() => {
  store().abort()
  // Most history tests use classic dice; the house rule has its own tests.
  useGameStore.setState({ newGameRules: NO_HOUSE_RULES })
})

afterEach(() => {
  store().updateSettings({ ...DEFAULT_SETTINGS })
  useGameStore.setState({ newGameRules: ALL_HOUSE_RULES })
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

  it('undo goes back one step: the move first (same roll), then the roll', () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 6, actor: 'human' })
    store().record({ type: 'move', tokenId: 0, actor: 'human' })
    expect(store().game?.players[0].tokens[0].state.kind).toBe('track')

    store().undo()
    expect(store().actions).toHaveLength(1)
    expect(store().game?.phase).toBe('move')
    expect(store().game?.players[0].tokens.every((t) => t.state.kind === 'yard')).toBe(true)

    store().undo()
    expect(store().actions).toHaveLength(0)
    expect(store().game?.phase).toBe('roll')
  })

  it('undo removes the bot turns that followed the human decision', () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 3, actor: 'human' }) // no move: yellow's turn
    store().record({ type: 'roll', value: 2, actor: 'bot' })
    store().undo()
    expect(store().actions).toHaveLength(0)
  })

  it('ignores an action that is not legal here', () => {
    store().start(TWO)
    store().record({ type: 'move', tokenId: 0, actor: 'human' })
    expect(store().actions).toHaveLength(0)
  })

  it('redo restores exactly what was undone', () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 6, actor: 'human' })
    store().record({ type: 'move', tokenId: 0, actor: 'human' })
    const before = store().game
    store().undo()
    store().undo()
    store().redo()
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

describe('game store: rules for starting', () => {
  it('will not start a game without a human seat', () => {
    store().start([
      { color: 'red', kind: 'bot' },
      { color: 'yellow', kind: 'bot' },
    ])
    expect(store().game).toBeNull()
  })
})

describe('game store: settings', () => {
  it('turns auto move on by default and saves it alongside the rest', () => {
    expect(store().settings.autoMove).toBe(true)
    store().updateSettings({ autoMove: false })
    expect(JSON.parse(window.localStorage.getItem('ludo:settings')!)).toMatchObject({ autoMove: false })
    store().updateSettings({ autoMove: true })
  })

  it('has the documented defaults', () => {
    store().updateSettings({ ...DEFAULT_SETTINGS })
    expect(store().settings).toEqual({
      autoRoll: false,
      autoMove: true,
      undo: false,
      sound: true,
      soundTheme: 'tabla',
      volume: 0.8,
      theme: 'system',
    })
  })

  it('starts new games with every house rule, and a game keeps the rules it started with', () => {
    useGameStore.setState({ newGameRules: ALL_HOUSE_RULES })
    store().start(TWO)
    expect(store().game?.rules).toEqual({ rollSixesFirst: true })
    useGameStore.setState({ newGameRules: NO_HOUSE_RULES })
    expect(store().game?.rules).toEqual({ rollSixesFirst: true })
  })

  it('saves every change', () => {
    store().updateSettings({ volume: 0.3, soundTheme: 'sitar' })
    expect(JSON.parse(window.localStorage.getItem('ludo:settings')!)).toMatchObject({ volume: 0.3, soundTheme: 'sitar' })
  })
})

describe('game store: saved games', () => {
  it('saves a local game after every action, and clears the save when it ends', () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 3, actor: 'human' })
    const saved = JSON.parse(window.localStorage.getItem(SAVED_GAME_KEY)!)
    expect(saved).toMatchObject({ v: SAVE_VERSION, configs: TWO })
    expect(saved.actions).toHaveLength(1)
    store().abort()
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).toBeNull()
  })

  it('reads back a saved game that replays cleanly', () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 6, actor: 'human' })
    const loaded = loadSavedGame()
    expect(loaded?.actions).toEqual([{ type: 'roll', value: 6, actor: 'human' }])
  })

  it('rejects a save that no longer replays, or from an unknown version', () => {
    const initial = createGame(TWO)
    window.localStorage.setItem(SAVED_GAME_KEY, JSON.stringify({ v: SAVE_VERSION, configs: TWO, initial, actions: [{ type: 'move', tokenId: 0, actor: 'human' }] }))
    expect(loadSavedGame()).toBeNull()
    window.localStorage.setItem(SAVED_GAME_KEY, JSON.stringify({ v: 99, configs: TWO, initial, actions: [] }))
    expect(loadSavedGame()).toBeNull()
    expect(migrateSave({ v: 'x' })).toBeNull()
  })

  it('never saves an online (hosted) game', () => {
    store().start([{ color: 'red', kind: 'human' }, { color: 'yellow', kind: 'human', remote: true }])
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).toBeNull()
  })

  it('remembers the last setup between visits', () => {
    store().start(TWO)
    expect(JSON.parse(window.localStorage.getItem(LAST_SETUP_KEY)!)).toEqual(TWO)
  })

  it('resumes a saved game paused on the next visit', async () => {
    store().start(TWO)
    store().record({ type: 'roll', value: 6, actor: 'human' })
    vi.resetModules()
    const fresh = (await import('./gameStore')).useGameStore.getState()
    expect(fresh.paused).toBe(true)
    expect(fresh.actions).toHaveLength(1)
    expect(fresh.game?.phase).toBe('move')
    expect(fresh.configs).toEqual(TWO)
  })

  it('falls back to defaults for unknown or bad saved settings', async () => {
    window.localStorage.setItem('ludo:settings', JSON.stringify({ volume: 7, soundTheme: 'kazoo', theme: 'purple', autoRoll: false, comebackDice: false, houseRules: { rollSixesFirst: false } }))
    vi.resetModules()
    const fresh = (await import('./gameStore')).useGameStore.getState()
    expect(fresh.settings).toMatchObject({ volume: 0.8, soundTheme: 'tabla', theme: 'system', autoRoll: false })
    // Settings saved before the house rules were always on: the old keys are ignored.
    expect(fresh.settings).not.toHaveProperty('houseRules')
    expect(fresh.settings).not.toHaveProperty('comebackDice')
    expect(fresh.newGameRules).toEqual({ rollSixesFirst: true })
  })
})
