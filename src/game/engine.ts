import { ENTRY_ROLL, buildMove, legalMovesFor } from './rules'
import {
  TOKENS_PER_PLAYER,
  type Color,
  type GameAction,
  type GameEvent,
  type GameState,
  type Move,
  type Player,
  type PlayerConfig,
} from './types'

/** Three consecutive sixes forfeit the turn (classic Ludo rule). */
export const MAX_SIX_STREAK = 3

/** Random source returning a number in [0, 1). Injectable for tests. */
export type Rng = () => number

export function rollDie(rng: Rng): number {
  return Math.min(6, Math.floor(rng() * 6) + 1)
}

/**
 * Display names. A custom name from setup wins. Otherwise the single human is
 * "You", other humans are "Player 1", "Player 2"..., and bots are "Bot 1"...
 */
export function displayNames(configs: PlayerConfig[]): string[] {
  const humans = configs.filter((c) => c.kind === 'human').length
  let bot = 0
  let player = 0
  return configs.map((c) => {
    if (c.kind === 'bot') {
      bot += 1
      return `Bot ${bot}`
    }
    player += 1
    const custom = c.name?.trim()
    if (custom) return custom
    return humans === 1 ? 'You' : `Player ${player}`
  })
}

/** Builds a fresh game with 2 or 4 seats. */
export function createGame(configs: PlayerConfig[]): GameState {
  if (configs.length !== 2 && configs.length !== 4) {
    throw new Error('Ludo supports 2 or 4 players')
  }
  const names = displayNames(configs)
  const players: Player[] = configs.map((c, i) => ({
    color: c.color,
    kind: c.kind,
    name: names[i],
    tokens: Array.from({ length: TOKENS_PER_PLAYER }, (_, id) => ({
      id,
      state: { kind: 'yard' as const },
    })),
    finishRank: null,
    lastRoll: null,
  }))

  return {
    players,
    currentIndex: 0,
    dice: null,
    phase: 'roll',
    legalMoves: [],
    winners: [],
    sixStreak: 0,
    actionSeq: 0,
    events: [],
  }
}

/** Next seat still playing, searching forward from `from`. */
function nextActiveIndex(players: Player[], from: number): number {
  for (let step = 1; step <= players.length; step++) {
    const idx = (from + step) % players.length
    if (players[idx].finishRank === null) return idx
  }
  return from
}

/** Hands the turn to the next unfinished seat and clears per-turn state. */
function passTurn(state: GameState): GameState {
  return {
    ...state,
    currentIndex: nextActiveIndex(state.players, state.currentIndex),
    dice: null,
    phase: 'roll',
    legalMoves: [],
    sixStreak: 0,
  }
}

/** Wraps a state transition, bumping the action counter and storing events. */
function commit(state: GameState, events: GameEvent[]): GameState {
  return { ...state, actionSeq: state.actionSeq + 1, events }
}

/**
 * Applies a roll with a known die value (phase 'roll' only). Handles the
 * three-sixes forfeit and the no-legal-move pass. Deterministic, so replaying
 * recorded rolls reproduces the same game.
 */
export function rollWithValue(state: GameState, value: number): GameState {
  if (state.phase !== 'roll') return state
  const seat = state.currentIndex
  const player = state.players[seat]
  const streak = value === ENTRY_ROLL ? state.sixStreak + 1 : 0
  const rollEvent: GameEvent = { type: 'roll', value, color: player.color }

  // Record the result on the seat before any other state change.
  const players = state.players.map((p, i) => (i === seat ? { ...p, lastRoll: value } : p))
  const rolled: GameState = { ...state, players, dice: value, sixStreak: streak }

  if (streak >= MAX_SIX_STREAK) {
    return commit(passTurn(rolled), [
      rollEvent,
      { type: 'turnPass', color: player.color, reason: 'threeSixes' },
    ])
  }

  const moves = legalMovesFor(players, players[seat], value)
  if (moves.length === 0) {
    return commit(passTurn(rolled), [
      rollEvent,
      { type: 'turnPass', color: player.color, reason: 'noMoves' },
    ])
  }

  return commit({ ...rolled, phase: 'move', legalMoves: moves }, [rollEvent])
}

/** Rolls with the injected random source (phase 'roll' only). */
export function rollDice(state: GameState, rng: Rng): GameState {
  if (state.phase !== 'roll') return state
  return rollWithValue(state, rollDie(rng))
}

/** Applies the chosen token's move. The tokenId must be among legalMoves. */
export function applyMove(state: GameState, tokenId: number): GameState {
  if (state.phase !== 'move') return state
  const move = state.legalMoves.find((m) => m.tokenId === tokenId)
  if (!move) return state
  return performMove(state, move)
}

/** Applies any recorded action to a state. */
export function applyAction(state: GameState, action: GameAction): GameState {
  return action.type === 'roll'
    ? rollWithValue(state, action.value)
    : applyMove(state, action.tokenId)
}

/**
 * Executes a move: moves the token, captures any opponent, records finishing
 * ranks and decides whether the same player rolls again (after a six, a
 * capture or a token reaching the centre) or the
 * turn passes. Declares the game over when one player remains unfinished.
 */
export function performMove(state: GameState, move: Move): GameState {
  const idx = state.currentIndex
  const mover = state.players[idx]
  const events: GameEvent[] = [{ type: 'move', move, color: mover.color }]

  const players: Player[] = state.players.map((p) => ({
    ...p,
    tokens: p.tokens.map((t) => ({ ...t })),
  }))

  // 1. Move the token.
  players[idx].tokens = players[idx].tokens.map((t) =>
    t.id === move.tokenId ? { ...t, state: move.to } : t,
  )

  // 2. Capture: the victim's token returns to its base.
  if (move.captured) {
    const victimIdx = players.findIndex((p) => p.color === move.captured!.color)
    players[victimIdx].tokens = players[victimIdx].tokens.map((t) =>
      t.id === move.captured!.tokenId ? { ...t, state: { kind: 'yard' as const } } : t,
    )
    events.push({ type: 'capture', color: mover.color, victim: move.captured.color })
  }

  // 3. Finish: every token of this seat reached the centre.
  let finishedNow = false
  const everyHome = players[idx].tokens.every((t) => t.state.kind === 'home')
  if (everyHome && players[idx].finishRank === null) {
    const rank = players.filter((p) => p.finishRank !== null).length + 1
    players[idx] = { ...players[idx], finishRank: rank }
    finishedNow = true
    events.push({ type: 'finish', color: mover.color, rank })
  }

  const base: GameState = { ...state, players, legalMoves: [], dice: null }

  // 4. Game over when at most one seat is still playing.
  const stillPlaying = players.filter((p) => p.finishRank === null)
  if (stillPlaying.length <= 1) {
    const winners: Color[] = players
      .filter((p) => p.finishRank !== null)
      .sort((a, b) => (a.finishRank ?? 0) - (b.finishRank ?? 0))
      .map((p) => p.color)
    winners.push(...stillPlaying.map((p) => p.color))
    events.push({ type: 'gameOver', winners })
    return commit({ ...base, phase: 'gameOver', winners, sixStreak: 0 }, events)
  }

  // 5. Extra roll on a six, a capture, or a token reaching the centre, unless
  //    that was the seat's last token. Otherwise the turn passes.
  const rolledSix = state.dice === ENTRY_ROLL
  const earnedBonus = rolledSix || move.captured !== null || move.finishes
  if (earnedBonus && !finishedNow) {
    return commit({ ...base, phase: 'roll' }, events)
  }
  return commit(passTurn(base), events)
}

/** Colours still in play (for UI). */
export function playersStillPlaying(state: GameState): Color[] {
  return state.players.filter((p) => p.finishRank === null).map((p) => p.color)
}

/** The move a token would make with the current dice, or null (UI preview). */
export function previewMove(state: GameState, tokenId: number): Move | null {
  if (state.dice === null) return null
  const player = state.players[state.currentIndex]
  const token = player.tokens.find((t) => t.id === tokenId)
  return token ? buildMove(state.players, player, token, state.dice) : null
}

/** Identifies the square a token occupies. All yard tokens share one spot. */
function spotKey(state: Move['from']): string {
  switch (state.kind) {
    case 'yard':
      return 'yard'
    case 'track':
      return `track:${state.pos}`
    case 'lane':
      return `lane:${state.step}`
    case 'home':
      return 'home'
  }
}

/**
 * The token ids that can be moved automatically, or null when the player has a
 * real choice. A move is automatic when it is the only legal one, or when every
 * legal move starts from the same spot (stacked tokens, or all from the yard on
 * a six). Those moves end up in the same place, so which token moves does not
 * matter, and the caller may pick any of them.
 */
export function autoMoveTokenIds(legalMoves: Move[]): number[] | null {
  if (legalMoves.length === 0) return null
  const first = spotKey(legalMoves[0].from)
  if (!legalMoves.every((m) => spotKey(m.from) === first)) return null
  return legalMoves.map((m) => m.tokenId)
}
