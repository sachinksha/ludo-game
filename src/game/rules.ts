import {
  FINISH_PROGRESS,
  LANE_LENGTH,
  TRACK_LENGTH,
  isSafeSquare,
  toAbsoluteIndex,
  toRelativeIndex,
} from './board'
import type { Color, Move, Player, Token, TokenState } from './types'

/** A six is required to bring a token out of the yard. */
export const ENTRY_ROLL = 6

/**
 * Distance a token has travelled from its own start square.
 * Yard tokens are -1 (not yet on the board). Lane squares continue beyond the
 * track; home is FINISH_PROGRESS.
 */
export function progressOf(color: Color, state: TokenState): number {
  switch (state.kind) {
    case 'yard':
      return -1
    case 'track':
      return toRelativeIndex(color, state.pos)
    case 'lane':
      return TRACK_LENGTH + state.step
    case 'home':
      return FINISH_PROGRESS
  }
}

/**
 * Where a token lands after moving `dice` squares, or null when the move is not
 * legal (yard token without a six, or an overshoot past the centre).
 */
export function destinationFor(
  color: Color,
  state: TokenState,
  dice: number,
): TokenState | null {
  if (state.kind === 'home') return null

  if (state.kind === 'yard') {
    if (dice !== ENTRY_ROLL) return null
    return { kind: 'track', pos: toAbsoluteIndex(color, 0) }
  }

  const target = progressOf(color, state) + dice
  if (target > FINISH_PROGRESS) return null
  if (target === FINISH_PROGRESS) return { kind: 'home' }
  if (target >= TRACK_LENGTH) {
    return { kind: 'lane', step: target - TRACK_LENGTH }
  }
  return { kind: 'track', pos: toAbsoluteIndex(color, target) }
}

/** Opponent tokens sitting on an unsafe track square (capturable). */
export function opponentsOn(
  players: Player[],
  mover: Color,
  absolute: number,
): { color: Color; tokenId: number }[] {
  if (isSafeSquare(absolute)) return []
  const hits: { color: Color; tokenId: number }[] = []
  for (const p of players) {
    if (p.color === mover) continue
    for (const t of p.tokens) {
      if (t.state.kind === 'track' && t.state.pos === absolute) {
        hits.push({ color: p.color, tokenId: t.id })
      }
    }
  }
  return hits
}

/** Builds the Move for one token with `dice`, or null if illegal. */
export function buildMove(
  players: Player[],
  player: Player,
  token: Token,
  dice: number,
): Move | null {
  const to = destinationFor(player.color, token.state, dice)
  if (!to) return null

  let captured: Move['captured'] = null
  if (to.kind === 'track') {
    const hits = opponentsOn(players, player.color, to.pos)
    if (hits.length > 0) captured = hits[0]
  }

  return {
    tokenId: token.id,
    from: token.state,
    to,
    captured,
    finishes: to.kind === 'home',
  }
}

/** Every legal move for a player with the given dice value. */
export function legalMovesFor(
  players: Player[],
  player: Player,
  dice: number,
): Move[] {
  const moves: Move[] = []
  for (const token of player.tokens) {
    const move = buildMove(players, player, token, dice)
    if (move) moves.push(move)
  }
  return moves
}

/** Lane steps are 0..LANE_LENGTH-1; FINISH_PROGRESS is the centre. */
export const MAX_LANE_STEP = LANE_LENGTH - 1

/** The token state reached after `progress` squares from the colour's start. */
export function stateAtProgress(color: Color, progress: number): TokenState {
  if (progress < 0) return { kind: 'yard' }
  if (progress >= FINISH_PROGRESS) return { kind: 'home' }
  if (progress >= TRACK_LENGTH) return { kind: 'lane', step: progress - TRACK_LENGTH }
  return { kind: 'track', pos: toAbsoluteIndex(color, progress) }
}

/**
 * Every intermediate state a token passes through when moving from `from` to
 * `to`, one square at a time. Used to animate moves step by step. The final
 * element is always `to`. A yard token entering the board is a single step.
 */
export function pathSteps(color: Color, from: TokenState, to: TokenState): TokenState[] {
  if (from.kind === 'yard') return [to]
  const start = progressOf(color, from)
  const end = progressOf(color, to)
  const steps: TokenState[] = []
  for (let p = start + 1; p <= end; p++) steps.push(stateAtProgress(color, p))
  return steps
}
