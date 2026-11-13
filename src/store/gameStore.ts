import { create } from 'zustand'
import { describeEvent } from '../game/describe'
import { createGame } from '../game/engine'
import { replay, undoIndex } from '../game/history'
import type { GameAction, GameState, PlayerConfig } from '../game/types'

/** Player preferences kept in the browser between visits. */
export interface Settings {
  /** Roll automatically for human players when their turn comes. */
  autoRoll: boolean
  /** Raise the odds of a six for players stuck in the base for a long time. */
  comebackDice: boolean
}

const SETTINGS_KEY = 'ludo:settings'
const DEFAULT_SETTINGS: Settings = { autoRoll: true, comebackDice: true }

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      autoRoll: typeof parsed.autoRoll === 'boolean' ? parsed.autoRoll : DEFAULT_SETTINGS.autoRoll,
      comebackDice: typeof parsed.comebackDice === 'boolean' ? parsed.comebackDice : DEFAULT_SETTINGS.comebackDice,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Storage blocked or full: the setting still applies for this visit.
  }
}

/** A game needs at least one human seat; bot-only games are not started. */
export function hasHuman(configs: PlayerConfig[]): boolean {
  return configs.some((c) => c.kind === 'human')
}

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
  settings: Settings

  start: (configs: PlayerConfig[]) => void
  /** Replaces the game with one received from an online host. */
  load: (initial: GameState, actions: GameAction[], paused: boolean) => void
  /** Adds a decision to the history. Clears the redo stack. */
  record: (action: GameAction) => void
  undo: () => void
  redo: () => void
  setPaused: (paused: boolean) => void
  setLogOpen: (open: boolean) => void
  updateSettings: (patch: Partial<Settings>) => void
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
  settings: loadSettings(),

  start: (configs) => {
    if (!hasHuman(configs)) return
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

  load: (initial, actions, paused) => {
    set((s) => ({
      configs: null,
      session: s.session + 1,
      initial,
      actions,
      redoStack: [],
      paused,
      ...derive(initial, actions),
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

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    saveSettings(settings)
    set({ settings })
  },

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
