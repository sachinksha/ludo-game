import { TRACK_LENGTH, isSafeSquare, toRelativeIndex } from './board'
import { opponentsOn, progressOf } from './rules'
import type { BotProfile, BotWeights, Color, GameState, Move, Persona, Player } from './types'

/** Opponent tokens a move sends home, as "color:id" keys. */
type Hits = ReadonlySet<string>
const NO_HITS: Hits = new Set()

/** Random source returning a number in [0, 1). */
type Rng = () => number

export const PERSONAS: readonly Persona[] = ['balanced', 'hunter', 'guardian', 'racer']

/** Short labels for the UI. */
export const PERSONA_LABEL: Record<Persona, string> = {
  balanced: 'Balanced',
  hunter: 'Hunter',
  guardian: 'Guardian',
  racer: 'Racer',
}

/**
 * Base weights per style. Every style values a capture and a finish highly, so
 * none of them passes up an obvious kill; they differ in what they do with the
 * ordinary moves in between.
 *
 * - balanced: a bit of everything.
 * - hunter:   chases opponents, values captures (especially of far-travelled
 *             tokens) and parks just behind opponents. Takes more risks.
 * - guardian: avoids squares opponents can reach, runs from threats, likes
 *             safe squares and getting tokens into the home lane.
 * - racer:    pushes its lead tokens home as fast as possible.
 */
export const PERSONA_WEIGHTS: Record<Persona, BotWeights> = {
  balanced: { finish: 90, capture: 70, captureProgress: 0.6, exit: 40, lane: 25, progress: 0.6, lead: 0.08, danger: 1.0, safe: 12, attack: 6, noise: 4 },
  hunter: { finish: 75, capture: 105, captureProgress: 0.9, exit: 45, lane: 15, progress: 0.5, lead: 0.05, danger: 0.6, safe: 8, attack: 14, noise: 5 },
  guardian: { finish: 90, capture: 65, captureProgress: 0.5, exit: 32, lane: 40, progress: 0.5, lead: 0.08, danger: 1.8, safe: 22, attack: 3, noise: 4 },
  racer: { finish: 120, capture: 55, captureProgress: 0.4, exit: 30, lane: 35, progress: 1.0, lead: 0.25, danger: 0.8, safe: 10, attack: 3, noise: 4 },
}

/** How far each weight may drift from its base, per game (±15%). */
const WEIGHT_JITTER = 0.15

/**
 * A random style with its weights nudged a little, so two bots with the same
 * style still play slightly differently, and the same bot differs from game to game.
 */
export function createBotProfile(rng: Rng, persona?: Persona): BotProfile {
  const chosen = persona ?? PERSONAS[Math.min(PERSONAS.length - 1, Math.floor(rng() * PERSONAS.length))]
  const base = PERSONA_WEIGHTS[chosen]
  const weights = Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, v * (1 - WEIGHT_JITTER + 2 * WEIGHT_JITTER * rng())]),
  ) as unknown as BotWeights
  return { persona: chosen, weights }
}

/** True if a token of `color` at loop square `from` can land on `to` with one die (1-6). */
function canReach(color: Color, from: number, to: number): boolean {
  const target = toRelativeIndex(color, to)
  const d = target - toRelativeIndex(color, from)
  // Past relative TRACK_LENGTH - 1 the token turns into its lane instead.
  return d >= 1 && d <= 6 && target < TRACK_LENGTH
}

/** Opponent tokens that could capture a token sitting on unsafe loop square `square`. */
function attackersOf(players: Player[], mover: Color, square: number, ignore: Hits): number {
  if (isSafeSquare(square)) return 0
  let count = 0
  for (const p of players) {
    if (p.color === mover) continue
    for (const t of p.tokens) {
      if (t.state.kind !== 'track') continue
      if (ignore.has(`${p.color}:${t.id}`)) continue
      if (canReach(p.color, t.state.pos, square)) count++
    }
  }
  return count
}

/** Opponent tokens on unsafe squares that a token on `square` could hit next turn. */
function targetsFrom(players: Player[], mover: Color, square: number, ignore: Hits): number {
  let count = 0
  for (const p of players) {
    if (p.color === mover) continue
    for (const t of p.tokens) {
      if (t.state.kind !== 'track' || isSafeSquare(t.state.pos)) continue
      if (ignore.has(`${p.color}:${t.id}`)) continue
      if (canReach(mover, square, t.state.pos)) count++
    }
  }
  return count
}

/** Rough chance of being hit, given how many opponents are in range. */
function risk(attackers: number): number {
  return 1 - 0.7 ** attackers
}

/** What a token at this progress is worth losing: further along hurts more. */
function stake(progress: number): number {
  return 12 + Math.max(0, progress) * 0.6
}

/**
 * Scores a candidate move for the current player. Higher is better. Without a
 * bot profile (humans, tests) the balanced weights are used. `rng` adds a
 * small random nudge so near-equal moves are not always resolved the same way.
 */
export function scoreMove(state: GameState, move: Move, rng: Rng = () => 0): number {
  const player = state.players[state.currentIndex]
  const w = player.bot?.weights ?? PERSONA_WEIGHTS.balanced
  const color = player.color
  const from = progressOf(color, move.from)
  const to = progressOf(color, move.to)
  let score = 0

  if (move.finishes) score += w.finish

  // Captures: every opponent token on the landing square goes home.
  const victims = move.captured && move.to.kind === 'track' ? opponentsOn(state.players, color, move.to.pos) : []
  const hits: Hits = victims.length ? new Set(victims.map((v) => `${v.color}:${v.tokenId}`)) : NO_HITS
  for (const v of victims) {
    const victim = state.players.find((p) => p.color === v.color)!
    const token = victim.tokens.find((t) => t.id === v.tokenId)!
    score += w.capture + w.captureProgress * Math.max(0, progressOf(victim.color, token.state))
  }

  if (move.from.kind === 'yard') score += w.exit
  if (move.from.kind === 'track' && move.to.kind !== 'track') score += w.lane

  score += w.progress * (to - Math.max(0, from))
  score += w.lead * Math.max(0, from)

  // Escaping: leaving an unsafe square that opponents can reach.
  if (move.from.kind === 'track') {
    score += w.danger * risk(attackersOf(state.players, color, move.from.pos, NO_HITS)) * stake(from)
  }

  if (move.to.kind === 'track') {
    // Exposure: landing where opponents can reach.
    score -= w.danger * risk(attackersOf(state.players, color, move.to.pos, hits)) * stake(to)
    if (isSafeSquare(move.to.pos)) score += w.safe
    // Pressure: landing just behind opponents.
    score += w.attack * Math.min(2, targetsFrom(state.players, color, move.to.pos, hits))
  }

  return score + rng() * w.noise
}

/**
 * Picks the bot's move: the highest score, with a small random nudge from
 * `rng` so the same position does not always produce the same choice. Exact
 * ties resolve to the lowest token id.
 */
export function chooseBotMove(state: GameState, rng: Rng = Math.random): Move | null {
  if (state.legalMoves.length === 0) return null
  let best: Move | null = null
  let bestScore = -Infinity
  for (const move of state.legalMoves) {
    const score = scoreMove(state, move, rng)
    if (score > bestScore || (score === bestScore && best && move.tokenId < best.tokenId)) {
      best = move
      bestScore = score
    }
  }
  return best
}
