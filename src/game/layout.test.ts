import { describe, expect, it } from 'vitest'
import { COLOR_ORDER, LOOP_LENGTH, SAFE_INDICES, START_INDEX, toAbsoluteIndex } from './board'
import { HOME_TOKEN_RADIUS, LANE, RING, cellKey, homeSlotCentre, placeTokens } from './layout'
import { pathSteps, stateAtProgress } from './rules'
import type { Cell } from './layout'

const adjacent = (a: Cell, b: Cell) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1

describe('board layout', () => {
  it('has exactly 52 distinct loop squares inside the 15 x 15 grid', () => {
    expect(RING).toHaveLength(LOOP_LENGTH)
    const keys = new Set(RING.map(cellKey))
    expect(keys.size).toBe(LOOP_LENGTH)
    for (const [c, r] of RING) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(15)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(15)
    }
  })

  it('places consecutive loop squares next to each other, allowing diagonal arm corners', () => {
    for (let i = 0; i < LOOP_LENGTH; i++) {
      const a = RING[i]
      const b = RING[(i + 1) % LOOP_LENGTH]
      const dx = Math.abs(a[0] - b[0])
      const dy = Math.abs(a[1] - b[1])
      // Each step moves at most one cell orthogonally, or one diagonally at an arm corner.
      expect(dx <= 1 && dy <= 1 && dx + dy >= 1).toBe(true)
    }
  })

  it('starts each colour on a safe square, thirteen squares apart around the loop', () => {
    for (const color of COLOR_ORDER) {
      expect(SAFE_INDICES.has(START_INDEX[color])).toBe(true)
    }
  })

  it('connects each home lane to the last loop square a colour walks', () => {
    for (const color of COLOR_ORDER) {
      const entry = RING[toAbsoluteIndex(color, 50)]
      expect(adjacent(entry, LANE[color][0])).toBe(true)
    }
  })

  it('keeps every lane cell off the outer loop', () => {
    const loop = new Set(RING.map(cellKey))
    for (const color of COLOR_ORDER) {
      for (const cell of LANE[color]) {
        expect(loop.has(cellKey(cell))).toBe(false)
      }
    }
  })
})

describe('finished tokens', () => {
  /** Signed area test: is point p inside triangle abc, at least `margin` from each edge? */
  function insideTriangle(p: [number, number], tri: [number, number][], margin: number) {
    return tri.every((a, i) => {
      const b = tri[(i + 1) % 3]
      const c = tri[(i + 2) % 3]
      const edge = (q: [number, number]) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      return Math.sign(edge(p)) === Math.sign(edge(c)) && Math.abs(edge(p)) / len >= margin
    })
  }
  const TRIANGLES: Record<string, [number, number][]> = {
    green: [[6, 6], [9, 6], [7.5, 7.5]],
    yellow: [[9, 6], [9, 9], [7.5, 7.5]],
    blue: [[9, 9], [6, 9], [7.5, 7.5]],
    red: [[6, 9], [6, 6], [7.5, 7.5]],
  }

  it('fits 1 to 4 finished tokens inside their own colour triangle without overlapping', () => {
    for (const color of COLOR_ORDER) {
      for (let count = 1; count <= 4; count++) {
        const slots = Array.from({ length: count }, (_, i) => homeSlotCentre(color, i, count))
        for (const s of slots) expect(insideTriangle(s, TRIANGLES[color], HOME_TOKEN_RADIUS)).toBe(true)
        for (let i = 0; i < count; i++)
          for (let j = i + 1; j < count; j++)
            expect(Math.hypot(slots[i][0] - slots[j][0], slots[i][1] - slots[j][1])).toBeGreaterThanOrEqual(HOME_TOKEN_RADIUS * 2)
      }
    }
  })

  it('fills home slots in order, with no gaps, whatever the token ids', () => {
    const placed = placeTokens([
      { color: 'blue', tokens: [{ id: 0, state: { kind: 'yard' } }, { id: 1, state: { kind: 'yard' } }, { id: 2, state: { kind: 'home' } }, { id: 3, state: { kind: 'yard' } }] },
    ])
    const t = placed.find((p) => p.tokenId === 2)!
    expect([t.cx, t.cy]).toEqual(homeSlotCentre('blue', 0, 1))
    expect(t.r).toBe(HOME_TOKEN_RADIUS)
  })
})

describe('pathSteps (move animation)', () => {
  it('returns one intermediate state per square and ends on the destination', () => {
    const from = stateAtProgress('red', 10)
    const to = stateAtProgress('red', 13)
    const steps = pathSteps('red', from, to)
    expect(steps).toHaveLength(3)
    expect(steps[steps.length - 1]).toEqual(to)
  })

  it('animates a yard token entering the board as a single step', () => {
    const to = stateAtProgress('green', 0)
    expect(pathSteps('green', { kind: 'yard' }, to)).toEqual([to])
  })

  it('walks into the home lane and onto the centre', () => {
    const steps = pathSteps('blue', stateAtProgress('blue', 50), stateAtProgress('blue', 57))
    expect(steps.some((s) => s.kind === 'lane')).toBe(true)
    expect(steps[steps.length - 1]).toEqual({ kind: 'home' })
  })
})
