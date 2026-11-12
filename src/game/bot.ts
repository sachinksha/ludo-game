import { isSafeSquare } from './board'
import { progressOf } from './rules'
import type { GameState, Move } from './types'

/**
 * Scores a candidate move. Higher is better. The weights make the bot prefer,
 * in order: finishing a token, capturing an opponent, bringing a token out of
 * the yard, landing on a safe square, and advancing the token furthest along.
 */
export function scoreMove(state: GameState, move: Move): number {
  const player = state.players[state.currentIndex]
  let score = 0

  if (move.finishes) score += 100

  if (move.captured) score += 60

  if (move.from.kind === 'yard') score += 40

  if (move.to.kind === 'track' && isSafeSquare(move.to.pos)) score += 15

  // Progress tiebreaker: advancing tokens that are already far along.
  const from = progressOf(player.color, move.from)
  const to = progressOf(player.color, move.to)
  score += Math.max(0, to - from) * 0.5 + Math.max(0, from) * 0.1

  return score
}

/**
 * Picks the bot's best legal move. Ties resolve to the lowest token id so
 * behaviour is deterministic and easy to test.
 */
export function chooseBotMove(state: GameState): Move | null {
  if (state.legalMoves.length === 0) return null
  let best: Move | null = null
  let bestScore = -Infinity
  for (const move of state.legalMoves) {
    const score = scoreMove(state, move)
    if (score > bestScore || (score === bestScore && best && move.tokenId < best.tokenId)) {
      best = move
      bestScore = score
    }
  }
  return best
}
