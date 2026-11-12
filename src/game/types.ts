/** Shared domain types for the Ludo game engine. */

export type Color = 'red' | 'green' | 'yellow' | 'blue'

export type PlayerKind = 'human' | 'bot'

/** Number of tokens each player owns. */
export const TOKENS_PER_PLAYER = 4

/**
 * Token position:
 *  - 'yard'  : still in the starting base
 *  - 'track' : on the shared 52-square loop (absolute board index 0..51)
 *  - 'lane'  : on the player's private home lane (step 0..LANE_LENGTH-1)
 *  - 'home'  : reached the centre (finished)
 */
export type TokenState =
  | { kind: 'yard' }
  | { kind: 'track'; pos: number }
  | { kind: 'lane'; step: number }
  | { kind: 'home' }

export interface Token {
  id: number
  state: TokenState
}

export interface Player {
  color: Color
  kind: PlayerKind
  /** Display name shown on the player's panel, e.g. "You" or "Bot 1". */
  name: string
  tokens: Token[]
  finishRank: number | null
  /** This player's most recent dice result, or null before their first roll. */
  lastRoll: number | null
}

export type Phase = 'roll' | 'move' | 'gameOver'

export interface GameState {
  players: Player[]
  currentIndex: number
  /** Dice value for the move being made this turn (null when not waiting on a move). */
  dice: number | null
  phase: Phase
  /** Legal choices for the current player. Empty unless phase is 'move'. */
  legalMoves: Move[]
  winners: Color[]
  /** Consecutive sixes rolled this turn (three sixes forfeits the turn). */
  sixStreak: number
  /** Increments once for every applied roll or move. */
  actionSeq: number
  /** Events produced by the most recent roll or move, in order. */
  events: GameEvent[]
}

export interface Move {
  tokenId: number
  from: TokenState
  to: TokenState
  captured: { color: Color; tokenId: number } | null
  finishes: boolean
}

export type GameEvent =
  | { type: 'roll'; value: number; color: Color }
  | { type: 'move'; move: Move; color: Color }
  | { type: 'capture'; color: Color; victim: Color }
  | { type: 'finish'; color: Color; rank: number }
  | { type: 'turnPass'; color: Color; reason: 'noMoves' | 'threeSixes' }
  | { type: 'gameOver'; winners: Color[] }

/**
 * A recorded player decision. The full history is a list of these, so the game
 * can be rebuilt exactly, which is what makes undo and redo possible. Rolls
 * store their value, so replays reproduce the same dice.
 */
export type GameAction =
  | { type: 'roll'; value: number; actor: PlayerKind }
  | { type: 'move'; tokenId: number; actor: PlayerKind }

/** Longest player name allowed, so names never stretch the player panels. */
export const MAX_NAME_LENGTH = 12

/** A seat chosen on the setup screen. `name` is an optional display label for humans. */
export type PlayerConfig = { color: Color; kind: PlayerKind; name?: string }
