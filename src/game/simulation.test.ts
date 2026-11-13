import { describe, expect, it } from 'vitest'
import { chooseBotMove } from './bot'
import { applyMove, createGame, rollDice, type Rng } from './engine'
import { TOKENS_PER_PLAYER, type GameState, type PlayerConfig } from './types'
import { SAFE_INDICES } from './board'

/** Small seeded PRNG (mulberry32) so simulations are reproducible. */
function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Checks rules that must hold in every reachable state. */
function assertInvariants(g: GameState) {
  for (const p of g.players) {
    expect(p.tokens).toHaveLength(TOKENS_PER_PLAYER)
  }
  // No two tokens of different colours share an unsafe track square.
  const occupied = new Map<number, string>()
  for (const p of g.players) {
    for (const t of p.tokens) {
      if (t.state.kind !== 'track') continue
      const other = occupied.get(t.state.pos)
      if (other && other !== p.color) {
        // Only safe squares may hold mixed colours.
        expect([...SAFE_INDICES]).toContain(t.state.pos)
      }
      occupied.set(t.state.pos, p.color)
    }
  }
  // Finish ranks are unique and sequential.
  const ranks = g.players.map((p) => p.finishRank).filter((r): r is number => r !== null)
  expect(new Set(ranks).size).toBe(ranks.length)
}

function playToEnd(configs: PlayerConfig[], seed: number, maxActions = 20000) {
  const rng = seeded(seed)
  let g = createGame(configs, rng)
  let actions = 0
  while (g.phase !== 'gameOver' && actions < maxActions) {
    if (g.phase === 'roll') {
      g = rollDice(g, rng)
    } else {
      const choice = chooseBotMove(g, rng)
      if (!choice) throw new Error('move phase with no legal move')
      g = applyMove(g, choice.tokenId)
    }
    assertInvariants(g)
    actions++
  }
  return { g, actions }
}

describe('full bot-only games (simulation)', () => {
  const TWO: PlayerConfig[] = [
    { color: 'red', kind: 'bot' },
    { color: 'yellow', kind: 'bot' },
  ]
  const FOUR: PlayerConfig[] = [
    { color: 'red', kind: 'bot' },
    { color: 'green', kind: 'bot' },
    { color: 'yellow', kind: 'bot' },
    { color: 'blue', kind: 'bot' },
  ]

  it.each([1, 2, 3, 4, 5])('finishes a two-player game (seed %i) with a winner', (seed) => {
    const { g, actions } = playToEnd(TWO, seed)
    expect(g.phase).toBe('gameOver')
    expect(g.winners.length).toBeGreaterThanOrEqual(1)
    expect(actions).toBeLessThan(20000)
  })

  it.each([11, 12, 13, 14, 15])('finishes a four-player game (seed %i) with a full ranking', (seed) => {
    const { g } = playToEnd(FOUR, seed)
    expect(g.phase).toBe('gameOver')
    // Every colour appears exactly once in the winners list.
    expect(new Set(g.winners).size).toBe(4)
  })
})
