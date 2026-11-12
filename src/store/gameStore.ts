import { create } from 'zustand'
import { describeEvent } from '../game/describe'
import { createGame } from '../game/engine'
import { replay, undoIndex } from '../game/history'
import type { GameAction, GameState, PlayerConfig } from '../game/types'

export interface LogEntry {
  id: string
  text: string
}

export interface GameStoreState {
  /** Seats chosen on the setup screen, or null before a game starts. */
  configs: PlayerConfig[] | null
  /** The most recent seats used, kept after abort so setup can prefill them. */
  lastConfigs: PlayerConfig[] | null
  /** Increments on every new game, so the UI can remount cleanly. */
  session: number
  /** The starting position of the current game. */
  initial: GameState | null
  /** Every decision made so far, oldest first. The source of truth. */
  actions: GameAction[]
  /** Undone action groups, most recent first. Redo replays the top group. */
  redoStack: GameAction[][]
  /** Current game, derived from `initial` and `actions`. */
  game: GameState | null
  /** Chronological log of events, derived from `actions`. */
  log: LogEntry[]
  paused: boolean
  /** Whether the game log is expanded. Hidden by default; kept across games. */
  logOpen: boolean

  start: (configs: PlayerConfig[]) => void
  /** Adds a decision to the history. Clears the redo stack. */
  record: (action: GameAction) => void
  undo: () => void
  redo: () => void
  setPaused: (paused: boolean) => void
  setLogOpen: (open: boolean) => void
  /** Discards the current game and returns to setup. */
  abort: () => void
}

/** Rebuilds the derived game and log from the initial state and action list. */
function derive(initial: GameState | null, actions: GameAction[]) {
  if (!initial) return { game: null, log: [] as LogEntry[] }
  const { state, eventsPerAction } = replay(initial, actions)
  const log: LogEntry[] = []
  eventsPerAction.forEach((events, i) => {
    events.forEach((event, j) => {
      const text = describeEvent(event)
      if (text !== null) log.push({ id: `${i}-${j}`, text })
    })
  })
  return { game: state, log }
}

export const useGameStore = create<GameStoreState>()((set, get) => ({
  configs: null,
  lastConfigs: null,
  session: 0,
  initial: null,
  actions: [],
  redoStack: [],
  game: null,
  log: [],
  paused: false,
  logOpen: false,

  start: (configs) => {
    const initial = createGame(configs)
    set((s) => ({
      configs,
      lastConfigs: configs,
      session: s.session + 1,
      initial,
      actions: [],
      redoStack: [],
      paused: false,
      ...derive(initial, []),
    }))
  },

  record: (action) => {
    const { initial, actions } = get()
    const next = [...actions, action]
    set({ actions: next, redoStack: [], ...derive(initial, next) })
  },

  undo: () => {
    const { initial, actions, redoStack } = get()
    const j = undoIndex(actions)
    if (!initial || j === null) return
    const kept = actions.slice(0, j)
    const removed = actions.slice(j)
    set({
      actions: kept,
      redoStack: [removed, ...redoStack],
      ...derive(initial, kept),
    })
  },

  redo: () => {
    const { initial, actions, redoStack } = get()
    if (!initial || redoStack.length === 0) return
    const [group, ...rest] = redoStack
    const next = [...actions, ...group]
    set({ actions: next, redoStack: rest, ...derive(initial, next) })
  },

  setPaused: (paused) => set({ paused }),

  setLogOpen: (logOpen) => set({ logOpen }),

  abort: () =>
    set((s) => ({
      configs: null,
      session: s.session + 1,
      initial: null,
      actions: [],
      redoStack: [],
      game: null,
      log: [],
      paused: false,
    })),
}))
