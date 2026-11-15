/**
 * "Roll all your sixes first", one test per edge case, each written as the
 * rule's own example. The rule as agreed:
 *  - After a 6, roll again straight away; keep going until a roll isn't a 6.
 *  - Three sixes in a row forfeit the turn, and every banked die with it.
 *  - Then use the dice one at a time, in any order. Dice no token can use are lost.
 *  - Using a 6 earns nothing more (the bonus rolls already happened).
 *  - A capture or a token reaching the centre earns a roll straight away; its
 *    die joins the dice still banked.
 *  - Finishing (the last token home) ends the turn; leftover dice are lost.
 */
import { describe, expect, it } from 'vitest'
import { toAbsoluteIndex } from './board'
import { chooseBotMove, scoreMove } from './bot'
import { describeEvent } from './describe'
import { applyAction, applyMove, autoMoveTokenIds, createGame, rollWithValue, secureRandom } from './engine'
import { replay } from './history'
import { legalMovesForPool, playersAfterMove } from './rules'
import type { GameAction, GameState, PlayerConfig, TokenState } from './types'

const RULES = { rollSixesFirst: true }
const TWO: PlayerConfig[] = [
  { color: 'red', kind: 'human' },
  { color: 'yellow', kind: 'human' },
]
const FOUR: PlayerConfig[] = [
  { color: 'red', kind: 'human' },
  { color: 'green', kind: 'bot' },
  { color: 'yellow', kind: 'bot' },
  { color: 'blue', kind: 'bot' },
]
const yard: TokenState = { kind: 'yard' }
const home: TokenState = { kind: 'home' }
const track = (color: 'red' | 'yellow', rel: number): TokenState => ({ kind: 'track', pos: toAbsoluteIndex(color, rel) })

function setTokens(state: GameState, seat: number, states: TokenState[]): GameState {
  const players = state.players.map((p, i) => (i !== seat ? p : { ...p, tokens: states.map((s, id) => ({ id, state: s })) }))
  return { ...state, players }
}

const rolls = (g: GameState, ...values: number[]) => values.reduce(rollWithValue, g)

describe('roll all your sixes first', () => {
  it('banks a 6 and keeps rolling before anything moves', () => {
    let g = createGame(TWO, secureRandom, RULES)
    g = rollWithValue(g, 6)
    expect(g.phase).toBe('roll')
    expect(g.pool).toEqual([6])
    expect(g.currentIndex).toBe(0)
    g = rollWithValue(g, 6)
    expect(g.pool).toEqual([6, 6])
    g = rollWithValue(g, 3)
    expect(g.phase).toBe('move')
    expect(g.pool).toEqual([6, 6, 3])
    // Moves are listed per distinct die: only the 6 can bring a token out.
    expect(new Set(g.legalMoves.map((m) => m.die))).toEqual(new Set([6]))
  })

  it('forfeits the whole turn on three sixes, losing every banked die', () => {
    let g = createGame(TWO, secureRandom, RULES)
    g = rolls(g, 6, 6, 6)
    expect(g.currentIndex).toBe(1)
    expect(g.pool).toEqual([])
    expect(g.players[0].tokens.every((t) => t.state.kind === 'yard')).toBe(true)
    expect(g.events.at(-1)).toEqual({ type: 'turnPass', color: 'red', reason: 'threeSixes', unused: [6, 6, 6] })
  })

  it('lets the player use the dice in any order, one move per die', () => {
    let g = setTokens(createGame(TWO, secureRandom, RULES), 0, [track('red', 10), yard, yard, yard])
    g = rolls(g, 6, 3)
    // Use the 3 first on the token already out, then the 6 to bring another out.
    g = applyMove(g, 0, 3)
    expect(g.players[0].tokens[0].state).toEqual(track('red', 13))
    expect(g.phase).toBe('move')
    expect(g.pool).toEqual([6])
    g = applyMove(g, 1, 6)
    expect(g.players[0].tokens[1].state).toEqual(track('red', 0))
    // No extra roll after using the 6: the bonus roll already happened.
    expect(g.currentIndex).toBe(1)
    expect(g.phase).toBe('roll')
  })

  it('refuses a die that is not banked', () => {
    let g = setTokens(createGame(TWO, secureRandom, RULES), 0, [track('red', 10), yard, yard, yard])
    g = rolls(g, 6, 3)
    expect(applyMove(g, 0, 5)).toBe(g)
  })

  it('loses a die no token can use, and the turn passes', () => {
    // Red's only token on the board needs exactly 3 to reach the centre: a 6 overshoots.
    let g = setTokens(createGame(FOUR, secureRandom, RULES), 0, [{ kind: 'lane', step: 2 }, home, home, home])
    g = rolls(g, 6, 1)
    expect(g.legalMoves.map((m) => m.die)).toEqual([1])
    g = applyMove(g, 0, 1)
    expect(g.currentIndex).toBe(1)
    expect(g.events.at(-1)).toEqual({ type: 'turnPass', color: 'red', reason: 'noMoves', unused: [6] })
    expect(describeEvent(g.events.at(-1)!)).toBe("Red can't use the 6")
  })

  it('gives a bonus roll straight away after a capture, keeping the dice still banked', () => {
    let g = setTokens(createGame(TWO, secureRandom, RULES), 0, [track('red', 20), yard, yard, yard])
    g = setTokens(g, 1, [track('red', 24), yard, yard, yard])
    g = rolls(g, 6, 4)
    g = applyMove(g, 0, 4) // captures yellow
    expect(g.events.some((e) => e.type === 'capture')).toBe(true)
    expect(g.phase).toBe('roll')
    expect(g.currentIndex).toBe(0)
    expect(g.pool).toEqual([6])
    g = rollWithValue(g, 2)
    expect(g.phase).toBe('move')
    expect(g.pool).toEqual([6, 2])
  })

  it('gives a bonus roll when a token reaches the centre with dice left', () => {
    let g = setTokens(createGame(TWO, secureRandom, RULES), 0, [{ kind: 'lane', step: 3 }, track('red', 5), yard, yard])
    g = rolls(g, 6, 2)
    g = applyMove(g, 0, 2)
    expect(g.players[0].tokens[0].state).toEqual(home)
    expect(g.phase).toBe('roll')
    expect(g.pool).toEqual([6])
  })

  it('ends the turn when the last token reaches the centre, losing leftover dice', () => {
    let g = setTokens(createGame(FOUR, secureRandom, RULES), 0, [{ kind: 'lane', step: 3 }, home, home, home])
    g = rolls(g, 6, 2)
    g = applyMove(g, 0, 2)
    expect(g.players[0].finishRank).toBe(1)
    expect(g.currentIndex).toBe(1)
    expect(g.pool).toEqual([])
  })

  it('keeps classic play when the rule is off: a 6 moves at once and earns another roll', () => {
    let g = setTokens(createGame(TWO), 0, [track('red', 10), yard, yard, yard])
    g = rollWithValue(g, 6)
    expect(g.phase).toBe('move')
    expect(g.pool).toEqual([6])
    g = applyMove(g, 0)
    expect(g.phase).toBe('roll')
    expect(g.currentIndex).toBe(0)
  })

  it('does not auto-move when banked dice differ, since the order is a choice', () => {
    let g = setTokens(createGame(TWO, secureRandom, RULES), 0, [track('red', 10), yard, yard, yard])
    g = rolls(g, 6, 3)
    expect(autoMoveTokenIds(g.legalMoves)).toBeNull()
  })

  it('replays a banked turn exactly from the action log', () => {
    const initial = setTokens(createGame(TWO, secureRandom, RULES), 0, [track('red', 10), yard, yard, yard])
    const actions: GameAction[] = [
      { type: 'roll', value: 6, actor: 'human' },
      { type: 'roll', value: 3, actor: 'human' },
      { type: 'move', tokenId: 0, die: 3, actor: 'human' },
      { type: 'move', tokenId: 1, die: 6, actor: 'human' },
    ]
    let direct = initial
    for (const a of actions) direct = applyAction(direct, a)
    expect(replay(initial, actions).state).toEqual(direct)
    expect(direct.players[0].tokens[1].state).toEqual(track('red', 0))
  })
})

describe('bots with banked dice', () => {
  /** Best total score over every order of two moves (exhaustive). */
  function bestPlan(g: GameState): number {
    let best = -Infinity
    for (const m1 of g.legalMoves) {
      const players = playersAfterMove(g.players, g.players[g.currentIndex].color, m1)
      const pool = [...g.pool]
      pool.splice(pool.indexOf(m1.die), 1)
      const done = players[g.currentIndex].tokens.every((t) => t.state.kind === 'home')
      const next = done ? [] : legalMovesForPool(players, players[g.currentIndex], pool)
      const after: GameState = { ...g, players, pool, legalMoves: next }
      const follow = next.length === 0 ? 0 : Math.max(...next.map((m2) => scoreMove(after, m2)))
      best = Math.max(best, scoreMove(g, m1) + follow)
    }
    return best
  }

  it('starts an optimal two-dice plan', () => {
    // Positions from seeded play: red, with two different dice banked.
    let checked = 0
    for (let seed = 1; seed <= 40 && checked < 25; seed++) {
      let s = seed
      const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647)
      let g = createGame(FOUR.map((c) => ({ ...c, kind: 'bot' as const })), rng, RULES)
      for (let i = 0; i < 400 && g.phase !== 'gameOver'; i++) {
        if (g.phase === 'roll') g = rollWithValue(g, Math.min(6, Math.floor(rng() * 6) + 1))
        else {
          if (g.pool.length === 2 && new Set(g.legalMoves.map((m) => m.die)).size === 2) {
            const choice = chooseBotMove(g, () => 0)!
            const players = playersAfterMove(g.players, g.players[g.currentIndex].color, choice)
            const pool = [...g.pool]
            pool.splice(pool.indexOf(choice.die), 1)
            const next = legalMovesForPool(players, players[g.currentIndex], pool)
            const after: GameState = { ...g, players, pool, legalMoves: next }
            const total = scoreMove(g, choice) + (next.length ? Math.max(...next.map((m) => scoreMove(after, m))) : 0)
            expect(total).toBeCloseTo(bestPlan(g), 6)
            checked++
          }
          const m = chooseBotMove(g, rng)!
          g = applyMove(g, m.tokenId, m.die)
        }
      }
    }
    expect(checked).toBeGreaterThan(5)
  })
})
