import type { Color } from './types'

/** Total squares on the shared loop. */
export const LOOP_LENGTH = 52

/**
 * Each colour walks 51 loop squares: from its own start square up to, but not
 * including, the square just before it. It then turns into its home lane.
 */
export const TRACK_LENGTH = 51

/** Squares on each colour's private home lane (excluding the centre). */
export const LANE_LENGTH = 5

/** Progress value at which a token has reached the centre. */
export const FINISH_PROGRESS = TRACK_LENGTH + LANE_LENGTH

/**
 * Absolute loop index where each colour turns off the loop into its home lane.
 * These squares carry the arrow marker. Red on the left arm, green on top,
 * yellow on the right and blue at the bottom.
 */
export const LANE_ENTRY_INDEX: Record<Color, number> = {
  red: 39,
  green: 0,
  yellow: 13,
  blue: 26,
}

/**
 * Absolute loop index where each colour enters the board on a six: two squares
 * past its lane entry, so a token walks 51 squares and ends on the arrow square.
 */
export const START_INDEX: Record<Color, number> = {
  red: 41,
  green: 2,
  yellow: 15,
  blue: 28,
}

/** Star squares, eight squares past each start. */
export const STAR_INDICES: readonly number[] = [10, 23, 36, 49]

/** Squares where tokens cannot be captured: starting squares plus stars. */
export const SAFE_INDICES: ReadonlySet<number> = new Set([
  ...Object.values(START_INDEX),
  ...STAR_INDICES,
])

export const COLOR_ORDER: readonly Color[] = ['red', 'green', 'yellow', 'blue']

/**
 * Converts distance travelled from a colour's start square (0..51) into an
 * absolute loop index (0..51).
 */
export function toAbsoluteIndex(color: Color, relative: number): number {
  return (START_INDEX[color] + relative) % LOOP_LENGTH
}

/** Converts an absolute loop index into distance from the colour's start. */
export function toRelativeIndex(color: Color, absolute: number): number {
  return (absolute - START_INDEX[color] + LOOP_LENGTH) % LOOP_LENGTH
}

export function isSafeSquare(absolute: number): boolean {
  return SAFE_INDICES.has(absolute)
}
