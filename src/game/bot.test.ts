import { describe, expect, it } from 'vitest'
import { chooseBotMove, scoreMove } from './bot'
import { createGame, rollDice } from './engine'
import { stateAtProgress } from './rules'
import type { GameState, PlayerConfig } from './types'

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
