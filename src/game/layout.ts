/**
 * Board geometry on a 15 x 15 grid. Pure data, so it is easy to test.
 *
 * The cross has three arms, each 3 cells wide and 6 cells long, with a 3 x 3
 * home triangle in the centre. The 52 loop squares run around the outside of
 * the cross, clockwise from the top-left corner of the top arm.
 */
import type { Color, TokenState } from './types'

export type Cell = readonly [col: number, row: number]

/** The 52 shared loop squares, indexed by absolute loop index. */
export const RING: readonly Cell[] = [
  [7, 0], [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],        // 0..6    green lane entry 0, start 2 (top arm)
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],           // 7..12
  [14, 7],                                                       // 13      yellow lane entry (start 15)
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],           // 14..19
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],           // 20..25
  [7, 14],                                                       // 26      blue lane entry (start 28)
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],           // 27..32
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],                // 33..38
  [0, 7],                                                        // 39      red lane entry (start 41)
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],                // 40..45
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],                // 46..51
]

/**
 * Home lane for each colour, ordered from the loop outwards toward the centre.
 * Lane step s sits at LANE[color][s]. Each lane runs along its arm's middle.
 */
export const LANE: Record<Color, readonly Cell[]> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
}

/** Top-left corner of each colour's 6 x 6 base box (corners of the board). */
export const YARD_ORIGIN: Record<Color, Cell> = {
  red: [0, 0],
  green: [9, 0],
  yellow: [9, 9],
  blue: [0, 9],
}

/** Local offsets (within a yard box) for up to four tokens, as cell centres. */
export const YARD_SLOTS: readonly (readonly [number, number])[] = [
  [1.5, 1.5],
  [4.5, 1.5],
  [1.5, 4.5],
  [4.5, 4.5],
]

/** Centre point of a grid cell, in grid units (cell width is 1). */
export function cellCentre(cell: Cell): [number, number] {
  return [cell[0] + 0.5, cell[1] + 0.5]
}

/** Lookup for every loop cell, for fast reverse mapping and tests. */
export function cellKey(cell: Cell): string {
  return `${cell[0]},${cell[1]}`
}

/** Yard token centre in grid units. */
export function yardSlotCentre(color: Color, slot: number): [number, number] {
  const [ox, oy] = YARD_ORIGIN[color]
  const [dx, dy] = YARD_SLOTS[slot]
  return [ox + dx, oy + dy]
}

/**
 * Each colour's home triangle, as the midpoint of its outer edge and the unit
 * vectors along that edge and inward toward the board centre.
 */
const HOME_FRAME: Record<Color, { base: [number, number]; along: [number, number]; inward: [number, number] }> = {
  green: { base: [7.5, 6], along: [1, 0], inward: [0, 1] },
  yellow: { base: [9, 7.5], along: [0, 1], inward: [-1, 0] },
  blue: { base: [7.5, 9], along: [-1, 0], inward: [0, -1] },
  red: { base: [6, 7.5], along: [0, -1], inward: [1, 0] },
}

/**
 * Neat arrangements for 1 to 4 finished tokens, as (along the outer edge,
 * depth toward the centre): one centred, two side by side, three in a row,
 * four as a pyramid.
 */
const HOME_LAYOUTS: readonly (readonly (readonly [along: number, depth: number])[])[] = [
  [[0, 0.5]],
  [[-0.25, 0.4], [0.25, 0.4]],
  [[-0.5, 0.3], [0, 0.3], [0.5, 0.3]],
  [[-0.5, 0.3], [0, 0.3], [0.5, 0.3], [0, 0.76]],
]

/** Radius of a finished token, small enough that four fit in one home triangle. */
export const HOME_TOKEN_RADIUS = 0.22

/**
 * Centre of finished token number `slot` (0-based) when `count` of the colour's
 * tokens are home, inside the colour's own home triangle.
 */
export function homeSlotCentre(color: Color, slot: number, count = 4): [number, number] {
  const { base, along, inward } = HOME_FRAME[color]
  const layout = HOME_LAYOUTS[Math.min(Math.max(count, 1), 4) - 1]
  const [a, d] = layout[Math.min(slot, layout.length - 1)]
  return [base[0] + along[0] * a + inward[0] * d, base[1] + along[1] * a + inward[1] * d]
}

/** Grid-unit centre of a token given its state and owner. */
export function tokenCentre(color: Color, tokenId: number, state: TokenState): [number, number] {
  switch (state.kind) {
    case 'yard':
      return yardSlotCentre(color, tokenId)
    case 'track':
      return cellCentre(RING[state.pos])
    case 'lane':
      return cellCentre(LANE[color][state.step])
    case 'home':
      return homeSlotCentre(color, tokenId)
  }
}


/** A token ready to draw: where it sits and how large it is. */
export interface PlacedToken {
  color: Color
  tokenId: number
  cx: number
  cy: number
  r: number
}

/** Full-size token radius, in grid units. */
export const TOKEN_RADIUS = 0.34

/**
 * Offsets for tokens that share one square, so each stays visible and clickable.
 * Index 0..count-1 within the group. Returns grid-unit offsets from the square centre.
 */
export function stackOffset(index: number, count: number): [number, number] {
  if (count <= 1) return [0, 0]
  if (count === 2) return index === 0 ? [-0.2, 0] : [0.2, 0]
  if (count === 3) return [[0, -0.2], [-0.2, 0.16], [0.2, 0.16]][index] as [number, number]
  return [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]][index % 4] as [number, number]
}

/**
 * Places every token on the board. Tokens that share a square are spread out
 * and drawn smaller. The result is ordered so that tokens listed later are drawn
 * on top. Callers that need a clickable token on top should sort it last.
 */
export function placeTokens(
  players: readonly { color: Color; tokens: readonly { id: number; state: TokenState }[] }[],
): PlacedToken[] {
  const raw = players.flatMap((p) => {
    // Finished tokens fill their colour's home slots in order, so there are no gaps.
    const homeIds = p.tokens.filter((t) => t.state.kind === 'home').map((t) => t.id)
    return p.tokens.map((t) => {
      const home = t.state.kind === 'home'
      const centre = home ? homeSlotCentre(p.color, homeIds.indexOf(t.id), homeIds.length) : tokenCentre(p.color, t.id, t.state)
      return { color: p.color, tokenId: t.id, state: t.state, centre, home }
    })
  })
  const groups = new Map<string, number>()
  for (const t of raw) {
    const key = `${t.centre[0]},${t.centre[1]}`
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  return raw.map((t) => {
    const key = `${t.centre[0]},${t.centre[1]}`
    const count = groups.get(key) ?? 1
    const index = seen.get(key) ?? 0
    seen.set(key, index + 1)
    if (t.home) {
      return { color: t.color, tokenId: t.tokenId, cx: t.centre[0], cy: t.centre[1], r: HOME_TOKEN_RADIUS }
    }
    const [dx, dy] = stackOffset(index, count)
    return {
      color: t.color,
      tokenId: t.tokenId,
      cx: t.centre[0] + dx,
      cy: t.centre[1] + dy,
      r: count > 1 ? 0.22 : TOKEN_RADIUS,
    }
  })
}
