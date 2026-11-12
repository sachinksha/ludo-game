/**
 * Pure helpers for the action history that powers undo, redo and the game log.
 *
 * The game is never mutated in place. Instead the full list of recorded
 * actions is replayed from the initial state whenever needed, which keeps undo
 * and redo exact: replays use the stored dice values, so they reproduce the same
 * game.
 */
import { applyAction } from './engine'
import type { GameAction, GameEvent, GameState } from './types'

export interface Replay {
  /** The state after every action has been applied. */
  state: GameState
  /** Events produced by each action, index-aligned with the action list. */
  eventsPerAction: GameEvent[][]
}

export function replay(initial: GameState, actions: GameAction[]): Replay {
  let state = initial
  const eventsPerAction: GameEvent[][] = []
  for (const action of actions) {
    state = applyAction(state, action)
    eventsPerAction.push(state.events)
  }
  return { state, eventsPerAction }
}

/**
 * Index of the human roll that the next undo rewinds to, or null if there is
 * nothing to undo. Undo removes that roll and everything after it, including
 * the human's move and any bot turns, so the human gets back to the same
 * decision point.
 */
export function undoIndex(actions: GameAction[]): number | null {
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i]
    if (a.type === 'roll' && a.actor === 'human') return i
  }
  return null
}
