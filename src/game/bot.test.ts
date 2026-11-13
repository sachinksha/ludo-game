import { describe, expect, it } from 'vitest'
import { PERSONAS, PERSONA_WEIGHTS, chooseBotMove, createBotProfile, scoreMove } from './bot'
import { createGame, rollDice } from './engine'
import { stateAtProgress } from './rules'
import type { GameState, Persona, PlayerConfig } from './types'

const TWO: PlayerConfig[] = [
  { color: 'red', kind: 'bot' },
  { color: 'yellow', kind: 'human' },
]

function withTokens(state: GameState, states: GameState['players'][number]['tokens'][number]['state'][]): GameState {
  const players = state.players.map((p, i) =>
    i === state.currentIndex
      ? { ...p, tokens: states.map((s, id) => ({ id, state: s })) }
      : p,
  )
  return { ...state, players }
}

const fixedDie = (face: number) => () => (face - 1) / 6 + 0.01

describe('bot move choice', () => {
  it('prefers finishing a token over other options', () => {
    let g = createGame(TWO)
    g = withTokens(g, [
      { kind: 'lane', step: 3 }, // +2 finishes
      { kind: 'track', pos: 5 },
      { kind: 'yard' },
      { kind: 'yard' },
    ])
    g = rollDice(g, fixedDie(2))
    expect(chooseBotMove(g)?.tokenId).toBe(0)
  })

  it('prefers a capture over an ordinary advance', () => {
    let g = createGame(TWO)
    // Yellow human token sits on absolute 30 (unsafe).
    g = {
      ...g,
      players: g.players.map((p) =>
        p.color === 'yellow'
          ? { ...p, tokens: [{ id: 0, state: { kind: 'track' as const, pos: 30 } }, ...p.tokens.slice(1)] }
          : p,
      ),
    }
    g = withTokens(g, [
      { kind: 'track', pos: 26 }, // +4 captures on 30
      { kind: 'track', pos: 1 },  // +4 lands on an empty square
      { kind: 'yard' },
      { kind: 'yard' },
    ])
    g = rollDice(g, fixedDie(4))
    expect(chooseBotMove(g)?.tokenId).toBe(0)
  })

  it('scores a yard exit above a plain advance', () => {
    let g = createGame(TWO)
    g = withTokens(g, [{ kind: 'yard' }, stateAtProgress('red', 10), { kind: 'yard' }, { kind: 'yard' }])
    g = rollDice(g, fixedDie(6))
    const exit = g.legalMoves.find((m) => m.from.kind === 'yard')!
    const advance = g.legalMoves.find((m) => m.from.kind === 'track')!
    expect(scoreMove(g, exit)).toBeGreaterThan(scoreMove(g, advance))
  })

  it('returns null when there are no legal moves', () => {
    const g = createGame(TWO)
    expect(chooseBotMove(g)).toBeNull()
  })
})

describe('bot styles', () => {
  /** A game where red is a bot with the given style and fixed (unjittered) weights. */
  function asPersona(state: GameState, persona: Persona): GameState {
    const profile = { persona, weights: { ...PERSONA_WEIGHTS[persona] } }
    return { ...state, players: state.players.map((p, i) => (i === state.currentIndex ? { ...p, bot: profile } : p)) }
  }

  function withYellow(state: GameState, states: GameState['players'][number]['tokens'][number]['state'][]): GameState {
    return {
      ...state,
      players: state.players.map((p) => (p.color === 'yellow' ? { ...p, tokens: states.map((s, id) => ({ id, state: s })) } : p)),
    }
  }

  const noNoise = () => 0

  it.each(PERSONAS)('%s still takes a capture over a plain advance', (persona) => {
    let g = createGame(TWO)
    g = withYellow(g, [{ kind: 'track', pos: 30 }, { kind: 'yard' }, { kind: 'yard' }, { kind: 'yard' }])
    g = withTokens(g, [{ kind: 'track', pos: 26 }, { kind: 'track', pos: 1 }, { kind: 'yard' }, { kind: 'yard' }])
    g = asPersona(rollDice(g, fixedDie(4)), persona)
    expect(chooseBotMove(g, noNoise)?.tokenId).toBe(0)
  })

  it.each(PERSONAS)('%s still finishes a token over a plain advance', (persona) => {
    let g = createGame(TWO)
    g = withTokens(g, [{ kind: 'lane', step: 3 }, { kind: 'track', pos: 5 }, { kind: 'yard' }, { kind: 'yard' }])
    g = asPersona(rollDice(g, fixedDie(2)), persona)
    expect(chooseBotMove(g, noNoise)?.tokenId).toBe(0)
  })

  it('a guardian runs from a threat where a racer pushes its leader', () => {
    let g = createGame(TWO)
    // Red token 0 is just out of base, 2 squares ahead of a yellow token (in
    // range). Token 1 is far along and out of reach.
    const threatened = stateAtProgress('red', 5)
    const chaser = stateAtProgress('red', 3)
    g = withYellow(g, [chaser, { kind: 'yard' }, { kind: 'yard' }, { kind: 'yard' }])
    g = withTokens(g, [threatened, stateAtProgress('red', 40), { kind: 'yard' }, { kind: 'yard' }])
    g = rollDice(g, fixedDie(5))
    expect(chooseBotMove(asPersona(g, 'guardian'), noNoise)?.tokenId).toBe(0)
    expect(chooseBotMove(asPersona(g, 'racer'), noNoise)?.tokenId).toBe(1)
  })

  it('avoids landing right in front of an opponent when another move is safe', () => {
    let g = createGame(TWO)
    // Moving token 0 by 3 lands 1 square ahead of yellow; token 1 lands on a star.
    g = withYellow(g, [{ kind: 'track', pos: 7 }, { kind: 'yard' }, { kind: 'yard' }, { kind: 'yard' }])
    g = withTokens(g, [{ kind: 'track', pos: 5 }, { kind: 'track', pos: 20 }, { kind: 'yard' }, { kind: 'yard' }])
    g = asPersona(rollDice(g, fixedDie(3)), 'balanced')
    expect(chooseBotMove(g, noNoise)?.tokenId).toBe(1)
  })

  it('varies weights between profiles of the same style', () => {
    let i = 0
    const values = [0.1, 0.9]
    const a = createBotProfile(() => values[i++ % 2], 'hunter')
    const b = createBotProfile(() => 0.5, 'hunter')
    expect(a.weights).not.toEqual(b.weights)
    expect(b.weights.capture).toBeCloseTo(PERSONA_WEIGHTS.hunter.capture)
  })

  it('can pick differently in a close call depending on chance', () => {
    let g = createGame(TWO)
    // Two tokens one square apart with nothing else around: nearly equal moves.
    g = withTokens(g, [stateAtProgress('red', 12), stateAtProgress('red', 13), { kind: 'yard' }, { kind: 'yard' }])
    g = asPersona(rollDice(g, fixedDie(2)), 'balanced')
    const picks = new Set<number>()
    for (const u of [0, 0.999]) {
      let n = 0
      // Alternate high and low nudges between the two candidates.
      const rng = () => (n++ % 2 === 0 ? u : 1 - u)
      picks.add(chooseBotMove(g, rng)!.tokenId)
    }
    expect(picks.size).toBe(2)
  })
})
