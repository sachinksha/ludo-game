/** Shared domain types for the Ludo game engine. */

export type Color = 'red' | 'green' | 'yellow' | 'blue'

export type PlayerKind = 'human' | 'bot'

/**
 * Optional house rules, chosen at setup and fixed for the game. They live in
 * the game state, so replays, saved games and online guests all play by the
 * same rules. Settings only choose the defaults for the next game.
 */
export interface HouseRules {
  /**
   * After a 6, roll again straight away (before moving) until a roll isn't a
   * 6, then use the banked dice one at a time, in any order. Three sixes in a
   * row still forfeit the turn. A capture or a piece reaching the centre earns
   * a bonus roll straight away, whose die joins the dice still banked.
   */
  rollSixesFirst: boolean
}

export const NO_HOUSE_RULES: HouseRules = { rollSixesFirst: false }
export const HOUSE_RULE_KEYS: readonly (keyof HouseRules)[] = ['rollSixesFirst']

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
  /**
   * Consecutive rolls this player made while stuck (no token on the board, at
   * least one in the base) without rolling a six. Drives the optional
   * comeback dice, and resets as soon as a six comes up or a token is out.
   */
  dryRolls: number
  /** Playing style for bots, chosen at random each game. Null for humans. */
  bot: BotProfile | null
  /** A human playing from another device in an online game. */
  remote: boolean
}

/** Bot playing styles. Every style still takes a good capture or finish when one is there. */
export type Persona = 'balanced' | 'hunter' | 'guardian' | 'racer'

/** Weights a bot applies to each feature of a candidate move. */
export interface BotWeights {
  /** A token reaches the centre. */
  finish: number
  /** Flat value of sending an opponent token home. */
  capture: number
  /** Extra capture value per square the victim had travelled. */
  captureProgress: number
  /** Bringing a token out of the base. */
  exit: number
  /** Moving a token off the shared loop into its (safe) home lane. */
  lane: number
  /** Value per square advanced. */
  progress: number
  /** Preference for advancing tokens that are already far along. */
  lead: number
  /** How much the bot fears leaving tokens where opponents can hit them. */
  danger: number
  /** Landing on a star or start square. */
  safe: number
  /** Landing just behind opponent tokens, ready to capture next turn. */
  attack: number
  /** Size of the random nudge added to each move's score. */
  noise: number
}

export interface BotProfile {
  persona: Persona
  weights: BotWeights
}

export type Phase = 'roll' | 'move' | 'gameOver'

export interface GameState {
  players: Player[]
  currentIndex: number
  /** The most recent roll this turn, for display (null when the turn has moved on). */
  dice: number | null
  /**
   * Dice rolled this turn and not used yet. Normally one die. With the
   * roll-sixes-first house rule, sixes are banked here first and moves then
   * use them in any order.
   */
  pool: number[]
  /** House rules for this game, fixed at setup. */
  rules: HouseRules
  phase: Phase
  /** Legal choices for the current player, grouped by die (pool order), then token. Empty unless phase is 'move'. */
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
  /** The die this move uses. With several dice in the pool, moves are listed for each. */
  die: number
  tokenId: number
  from: TokenState
  to: TokenState
  /** The first opponent token hit, or null. A stack on that square is captured whole. */
  captured: { color: Color; tokenId: number } | null
  finishes: boolean
}

export type GameEvent =
  | { type: 'roll'; value: number; color: Color }
  | { type: 'move'; move: Move; color: Color }
  | { type: 'capture'; color: Color; victim: Color }
  | { type: 'finish'; color: Color; rank: number }
  /** `unused` lists banked dice that were lost (no piece could use them, or three sixes). */
  | { type: 'turnPass'; color: Color; reason: 'noMoves' | 'threeSixes'; unused?: number[] }
  | { type: 'gameOver'; winners: Color[]; early?: boolean }
  /** A bot took a seat. Names are kept so every screen can explain the change. */
  | { type: 'takeover'; color: Color; from: string; to: string }

/**
 * A recorded player decision. The full history is a list of these, so the game
 * can be rebuilt exactly, which is what makes undo and redo possible. Rolls
 * store their value, so replays reproduce the same dice.
 */
export type GameAction =
  | { type: 'roll'; value: number; actor: PlayerKind }
  /** `die` picks which banked die the move uses. Optional: the first die that allows it otherwise. */
  | { type: 'move'; tokenId: number; actor: PlayerKind; die?: number }
  /** Ends the game early, ranking unfinished seats by progress. */
  | { type: 'end'; actor: PlayerKind }
  /**
   * A bot takes over a seat (an online player who left). The profile is part
   * of the action, so replays give the bot the same style.
   */
  | { type: 'takeover'; color: Color; bot: BotProfile; actor: PlayerKind }

/** Longest player name allowed, so names never stretch the player panels. */
export const MAX_NAME_LENGTH = 12

/**
 * A seat chosen on the setup screen. `name` is an optional display label for
 * humans. `remote` marks a human seat played from another device (online).
 */
export type PlayerConfig = { color: Color; kind: PlayerKind; name?: string; remote?: boolean }
