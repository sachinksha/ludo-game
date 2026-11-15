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
 * Index of the action the next undo removes (with everything after it), or
 * null if there is nothing to undo. Undo goes back one human decision at a
 * time: first the most recent move, returning to the same roll so a different
 * token can be chosen; then, on the next undo, the roll itself. Bot turns that
 * followed are removed with it, so the human is always back at their own
 * decision point.
 */
export function undoIndex(actions: GameAction[]): number | null {
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i]
    if (a.actor === 'human' && (a.type === 'roll' || a.type === 'move')) return i
  }
  return null
}
