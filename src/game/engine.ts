import { createBotProfile } from './bot'
import { ENTRY_ROLL, buildMove, legalMovesForPool, opponentsOn, playersAfterMove, progressOf } from './rules'
import {
  NO_HOUSE_RULES,
  TOKENS_PER_PLAYER,
  type BotProfile,
  type Color,
  type GameAction,
  type GameEvent,
  type GameState,
  type HouseRules,
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
export const BASE_SIX_CHANCE = 1 / 6
/** Stuck rolls allowed at fair odds before comeback dice start helping. */
export const COMEBACK_GRACE = 3
/** Extra chance of a six for each stuck roll past the grace period. */
export const COMEBACK_STEP = 0.06
/** Comeback dice never make a six more likely than this. */
export const COMEBACK_CAP = 0.5

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
export function createGame(configs: PlayerConfig[], rng: Rng = secureRandom, rules: HouseRules = NO_HOUSE_RULES): GameState {
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
    pool: [],
    rules: { ...rules },
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
    pool: [],
    phase: 'roll',
    legalMoves: [],
    sixStreak: 0,
  }
}

/** The game's house rules. Saves from before house rules have none (all off). */
export function rulesOf(state: GameState): HouseRules {
  return state.rules ?? NO_HOUSE_RULES
}

/** Wraps a state transition, bumping the action counter and storing events. */
function commit(state: GameState, events: GameEvent[]): GameState {
  return { ...state, actionSeq: state.actionSeq + 1, events }
}

/**
 * Applies a roll with a known die value (phase 'roll' only). The die goes into
 * the turn's pool. Handles the three-sixes forfeit and the no-legal-move pass.
 * Deterministic, so replaying recorded rolls reproduces the same game.
 *
 * With the roll-sixes-first house rule a 6 is banked and the player rolls
 * again straight away; moving starts after the first roll that isn't a 6,
 * using every banked die in any order. Three sixes in a row still forfeit the
 * turn, and every banked die goes with it.
 */
export function rollWithValue(state: GameState, value: number): GameState {
  if (state.phase !== 'roll' || !Number.isInteger(value) || value < 1 || value > 6) return state
  const seat = state.currentIndex
  const player = state.players[seat]
  const rules = rulesOf(state)
  const streak = value === ENTRY_ROLL ? state.sixStreak + 1 : 0
  const rollEvent: GameEvent = { type: 'roll', value, color: player.color }

  // Record the result on the seat before any other state change.
  const dryRolls = isStuck(player) && value !== ENTRY_ROLL ? player.dryRolls + 1 : 0
  const players = state.players.map((p, i) => (i === seat ? { ...p, lastRoll: value, dryRolls } : p))
  const pool = [...(state.pool ?? []), value]
  const rolled: GameState = { ...state, players, dice: value, sixStreak: streak, pool }

  if (streak >= MAX_SIX_STREAK) {
    const lost = pool.length > 1 ? { unused: pool } : {}
    return commit(passTurn(rolled), [rollEvent, { type: 'turnPass', color: player.color, reason: 'threeSixes', ...lost }])
  }

  // House rule: bank the 6 and roll again before anything moves.
  if (rules.rollSixesFirst && value === ENTRY_ROLL) return commit(rolled, [rollEvent])

  const moves = legalMovesForPool(players, players[seat], pool)
  if (moves.length === 0) {
    const lost = pool.length > 1 ? { unused: pool } : {}
    return commit(passTurn(rolled), [rollEvent, { type: 'turnPass', color: player.color, reason: 'noMoves', ...lost }])
  }

  return commit({ ...rolled, phase: 'move', legalMoves: moves }, [rollEvent])
}

/** Rolls with the injected random source (phase 'roll' only). */
export function rollDice(state: GameState, rng: Rng): GameState {
  if (state.phase !== 'roll') return state
  return rollWithValue(state, rollDie(rng))
}

/**
 * Applies the chosen token's move with die `die` (the first banked die that
 * moves this token, when left out). Ignored unless it is among legalMoves.
 */
export function applyMove(state: GameState, tokenId: number, die?: number): GameState {
  if (state.phase !== 'move') return state
  const move = state.legalMoves.find((m) => m.tokenId === tokenId && (die === undefined || m.die === die))
  if (!move) return state
  return performMove(state, move)
}

/** Applies any recorded action to a state. */
export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'roll':
      return rollWithValue(state, action.value)
    case 'move':
      return applyMove(state, action.tokenId, action.die)
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
  // The new bot is named like the others ("Bot N", numbered after the existing
  // bots), so nobody mistakes it for the person who left. Derived from state,
  // so every replica and every replay picks the same name.
  const name = `Bot ${state.players.filter((p) => p.kind === 'bot').length + 1}`
  const players = state.players.map((p) =>
    p.color === color ? { ...p, kind: 'bot' as const, bot, remote: false, name } : p,
  )
  return commit({ ...state, players }, [{ type: 'takeover', color, from: seat.name, to: name }])
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
 * ranks and decides what happens next. Declares the game over when one player
 * remains unfinished.
 *
 * Classic: a six, a capture or a token reaching the centre (not the last one)
 * earns another roll; otherwise the turn passes.
 *
 * Roll sixes first: the sixes were already rolled, so using one earns
 * nothing. A capture or a token reaching the centre earns a roll straight
 * away, and its die joins any dice still banked. Otherwise the next banked die
 * is used; dice no token can use are lost and the turn passes. Finishing (the
 * last token home) always ends the turn, losing any dice left.
 */
export function performMove(state: GameState, move: Move): GameState {
  const idx = state.currentIndex
  const mover = state.players[idx]
  const rules = rulesOf(state)
  const events: GameEvent[] = [{ type: 'move', move, color: mover.color }]

  // Use up the move's die.
  const pool = [...(state.pool ?? [])]
  const at = pool.indexOf(move.die)
  if (at >= 0) pool.splice(at, 1)

  // Move the token; every opponent on the landing square (a whole stack) goes back to base.
  const players = playersAfterMove(state.players, mover.color, move)
  if (move.captured && move.to.kind === 'track') {
    for (const hit of opponentsOn(state.players, mover.color, move.to.pos)) {
      events.push({ type: 'capture', color: mover.color, victim: hit.color })
    }
  }

  // Finish: every token of this seat reached the centre.
  let finishedNow = false
  const everyHome = players[idx].tokens.every((t) => t.state.kind === 'home')
  if (everyHome && players[idx].finishRank === null) {
    const rank = players.filter((p) => p.finishRank !== null).length + 1
    players[idx] = { ...players[idx], finishRank: rank }
    finishedNow = true
    events.push({ type: 'finish', color: mover.color, rank })
  }

  const base: GameState = { ...state, players, legalMoves: [], pool, dice: null }

  // Game over when at most one seat is still playing.
  const stillPlaying = players.filter((p) => p.finishRank === null)
  if (stillPlaying.length <= 1) {
    const winners: Color[] = players
      .filter((p) => p.finishRank !== null)
      .sort((a, b) => (a.finishRank ?? 0) - (b.finishRank ?? 0))
      .map((p) => p.color)
    winners.push(...stillPlaying.map((p) => p.color))
    events.push({ type: 'gameOver', winners })
    return commit({ ...base, phase: 'gameOver', winners, sixStreak: 0, pool: [] }, events)
  }

  // A seat that just finished is done: leftover dice and bonus rolls are lost.
  if (finishedNow) return commit(passTurn(base), events)

  const earnedRoll = move.captured !== null || move.finishes

  if (rules.rollSixesFirst) {
    // Bonus roll straight away; the new die joins whatever is still banked.
    if (earnedRoll) return commit({ ...base, phase: 'roll' }, events)
    if (pool.length > 0) {
      const next = legalMovesForPool(players, players[idx], pool)
      if (next.length > 0) return commit({ ...base, phase: 'move', legalMoves: next, dice: state.dice }, events)
      events.push({ type: 'turnPass', color: mover.color, reason: 'noMoves', unused: pool })
    }
    return commit(passTurn(base), events)
  }

  // Classic: another roll after a six, a capture or a token reaching the centre.
  if (earnedRoll || move.die === ENTRY_ROLL) return commit({ ...base, phase: 'roll' }, events)
  return commit(passTurn(base), events)
}

/** Colours still in play (for UI). */
export function playersStillPlaying(state: GameState): Color[] {
  return state.players.filter((p) => p.finishRank === null).map((p) => p.color)
}

/** The move a token would make with `die` (default: the first banked die), or null (UI preview). */
export function previewMove(state: GameState, tokenId: number, die: number | undefined = state.pool?.[0]): Move | null {
  if (die === undefined) return null
  const player = state.players[state.currentIndex]
  const token = player.tokens.find((t) => t.id === tokenId)
  return token ? buildMove(state.players, player, token, die) : null
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
  // With different banked dice the order is a real decision.
  if (new Set(legalMoves.map((m) => m.die)).size > 1) return null
  const first = spotKey(legalMoves[0].from)
  if (!legalMoves.every((m) => spotKey(m.from) === first)) return null
  return legalMoves.map((m) => m.tokenId)
}
