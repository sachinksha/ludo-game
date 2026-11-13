import { createBotProfile } from './bot'
import { ENTRY_ROLL, buildMove, legalMovesFor, opponentsOn, progressOf } from './rules'
import {
  TOKENS_PER_PLAYER,
  type BotProfile,
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
 * Uniform random number in [0, 1) from the browser's cryptographic generator,
 * falling back to Math.random where it is unavailable. Math.random is already
 * fair for dice; this just removes any doubt about its quality.
 */
export const secureRandom: Rng = () => {
  const c = globalThis.crypto
  if (!c?.getRandomValues) return Math.random()
  const buf = new Uint32Array(1)
  c.getRandomValues(buf)
  return buf[0] / 4294967296
}

/** Fair odds of a six. */
const BASE_SIX_CHANCE = 1 / 6
/** Stuck rolls allowed at fair odds before comeback dice start helping. */
export const COMEBACK_GRACE = 3
/** Extra chance of a six for each stuck roll past the grace period. */
const COMEBACK_STEP = 0.06
/** Comeback dice never make a six more likely than this. */
const COMEBACK_CAP = 0.5

/**
 * True when a player has nothing on the board: every unfinished token is in
 * the base, so only a six lets them play.
 */
export function isStuck(player: Player): boolean {
  return (
    player.tokens.some((t) => t.state.kind === 'yard') &&
    player.tokens.every((t) => t.state.kind === 'yard' || t.state.kind === 'home')
  )
}

/**
 * Chance of rolling a six for this player. Fair (1/6) unless comeback dice are
 * on and the player has been stuck in the base for more than COMEBACK_GRACE
 * rolls; then it rises by COMEBACK_STEP per extra roll, up to COMEBACK_CAP.
 */
export function sixChance(player: Player, comeback: boolean): number {
  if (!comeback || !isStuck(player) || player.dryRolls < COMEBACK_GRACE) return BASE_SIX_CHANCE
  return Math.min(COMEBACK_CAP, BASE_SIX_CHANCE + (player.dryRolls - COMEBACK_GRACE + 1) * COMEBACK_STEP)
}

/**
 * Rolls the die for the player whose turn it is. With fair odds this is exactly
 * rollDie. With boosted odds, a six comes up with chance `p` and the other
 * faces share the rest evenly.
 */
export function rollFor(state: GameState, rng: Rng, comeback: boolean): number {
  const p = sixChance(state.players[state.currentIndex], comeback)
  if (p === BASE_SIX_CHANCE) return rollDie(rng)
  const u = rng()
  if (u < p) return ENTRY_ROLL
  return Math.min(5, Math.floor(((u - p) / (1 - p)) * 5) + 1)
}

/**
 * Display names. A custom name wins. Otherwise bots are "Bot 1", "Bot 2"...,
 * online seats are "Friend 1"..., and local humans are "Player 1"... A single
 * local human is "You", or "Host" in an online game (where "You" would be
 * wrong on everyone else's screen).
 */
export function displayNames(configs: PlayerConfig[]): string[] {
  const local = configs.filter((c) => c.kind === 'human' && !c.remote).length
  const online = configs.some((c) => c.remote)
  let bot = 0
  let player = 0
  let friend = 0
  return configs.map((c) => {
    if (c.kind === 'bot') {
      bot += 1
      return `Bot ${bot}`
    }
    const custom = c.name?.trim()
    if (c.remote) {
      friend += 1
      return custom || `Friend ${friend}`
    }
    player += 1
    if (custom) return custom
    if (local === 1) return online ? 'Host' : 'You'
    return `Player ${player}`
  })
}

/**
 * Builds a fresh game with 2 or 4 seats. Each bot gets a random playing style
 * from `rng`.
 */
export function createGame(configs: PlayerConfig[], rng: Rng = secureRandom): GameState {
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
    dryRolls: 0,
    bot: c.kind === 'bot' ? createBotProfile(rng) : null,
    remote: c.kind === 'human' && c.remote === true,
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
  const dryRolls = isStuck(player) && value !== ENTRY_ROLL ? player.dryRolls + 1 : 0
  const players = state.players.map((p, i) => (i === seat ? { ...p, lastRoll: value, dryRolls } : p))
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
  switch (action.type) {
    case 'roll':
      return rollWithValue(state, action.value)
    case 'move':
      return applyMove(state, action.tokenId)
    case 'end':
      return endGame(state)
    case 'takeover':
      return takeover(state, action.color, action.bot)
  }
}

/**
 * Hands a human seat to a bot, mid-game. Used when an online player leaves.
 * If it is that seat's turn, the bot simply plays from the current phase.
 */
export function takeover(state: GameState, color: Color, bot: BotProfile): GameState {
  const seat = state.players.find((p) => p.color === color)
  if (!seat || seat.kind === 'bot' || state.phase === 'gameOver') return state
  const players = state.players.map((p) =>
    p.color === color ? { ...p, kind: 'bot' as const, bot, remote: false } : p,
  )
  return commit({ ...state, players }, [{ type: 'takeover', color }])
}

/** Total squares travelled by a player's tokens (base tokens count as zero). */
export function totalProgress(player: Player): number {
  return player.tokens.reduce((sum, t) => sum + Math.max(0, progressOf(player.color, t.state)), 0)
}

/**
 * Ends the game now. Seats that already finished keep their places; the rest
 * are ranked by total progress, with seat order breaking ties.
 */
export function endGame(state: GameState): GameState {
  if (state.phase === 'gameOver') return state
  const finished = state.players
    .filter((p) => p.finishRank !== null)
    .sort((a, b) => (a.finishRank ?? 0) - (b.finishRank ?? 0))
  const rest = state.players
    .map((p, seat) => ({ p, seat, total: totalProgress(p) }))
    .filter(({ p }) => p.finishRank === null)
    .sort((a, b) => b.total - a.total || a.seat - b.seat)
    .map(({ p }) => p)
  const order = [...finished, ...rest]
  const players = state.players.map((p) => ({ ...p, finishRank: order.indexOf(p) + 1 }))
  const winners = order.map((p) => p.color)
  return commit(
    { ...state, players, phase: 'gameOver', winners, dice: null, legalMoves: [], sixStreak: 0 },
    [{ type: 'gameOver', winners, early: true }],
  )
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

  // 2. Capture: every opponent token on the landing square returns to its
  //    base, including a stack of two or more.
  if (move.captured && move.to.kind === 'track') {
    for (const hit of opponentsOn(state.players, mover.color, move.to.pos)) {
      const victimIdx = players.findIndex((p) => p.color === hit.color)
      players[victimIdx].tokens = players[victimIdx].tokens.map((t) =>
        t.id === hit.tokenId ? { ...t, state: { kind: 'yard' as const } } : t,
      )
      events.push({ type: 'capture', color: mover.color, victim: hit.color })
    }
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
