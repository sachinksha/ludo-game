import { describe, expect, it } from 'vitest'
import { FINISH_PROGRESS, LANE_ENTRY_INDEX, START_INDEX, TRACK_LENGTH, isSafeSquare, toAbsoluteIndex } from './board'
import { MAX_SIX_STREAK, applyAction, applyMove, autoMoveTokenIds, createGame, rollDice, rollDie, rollWithValue } from './engine'
import { destinationFor, legalMovesFor, progressOf } from './rules'
import type { GameState, PlayerConfig, TokenState } from './types'

/** Random source that always produces the given die face (1..6). */
const die = (face: number) => () => (face - 1) / 6 + 0.01

const TWO: PlayerConfig[] = [
  { color: 'red', kind: 'human' },
  { color: 'yellow', kind: 'human' },
]

/** Replaces one seat's tokens with the given states (ids 0..3). */
function setTokens(state: GameState, seat: number, states: TokenState[]): GameState {
  const players = state.players.map((p, i) =>
    i !== seat ? p : { ...p, tokens: states.map((s, id) => ({ id, state: s })) },
  )
  return { ...state, players }
}

const yard = { kind: 'yard' as const }

describe('dice', () => {
  it('maps the random source onto faces 1 to 6', () => {
    expect(rollDie(() => 0)).toBe(1)
    expect(rollDie(() => 0.999)).toBe(6)
    expect(rollDie(() => 1)).toBe(6) // guard against an out-of-range source
  })
})

describe('createGame', () => {
  it('accepts 2 or 4 players only', () => {
    expect(() => createGame(TWO)).not.toThrow()
    expect(() => createGame([{ color: 'red', kind: 'human' }])).toThrow()
    expect(() =>
      createGame([
        { color: 'red', kind: 'human' },
        { color: 'green', kind: 'human' },
        { color: 'yellow', kind: 'human' },
      ]),
    ).toThrow()
  })

  it('starts every token in its base with red to roll', () => {
    const g = createGame(TWO)
    expect(g.phase).toBe('roll')
    expect(g.currentIndex).toBe(0)
    for (const p of g.players) {
      expect(p.tokens).toHaveLength(4)
      expect(p.tokens.every((t) => t.state.kind === 'yard')).toBe(true)
      expect(p.lastRoll).toBeNull()
    }
  })

  it('names the single human "You" and numbers the bots', () => {
    const g = createGame([
      { color: 'red', kind: 'human' },
      { color: 'green', kind: 'bot' },
      { color: 'yellow', kind: 'bot' },
      { color: 'blue', kind: 'bot' },
    ])
    expect(g.players.map((p) => p.name)).toEqual(['You', 'Bot 1', 'Bot 2', 'Bot 3'])
  })

  it('uses custom names from setup and trims them', () => {
    const g = createGame([
      { color: 'red', kind: 'human', name: '  Asha ' },
      { color: 'yellow', kind: 'human' },
    ])
    expect(g.players.map((p) => p.name)).toEqual(['Asha', 'Player 2'])
  })
})

describe('destinationFor', () => {
  it('only lets a base token out on a six, onto its own start square', () => {
    expect(destinationFor('green', yard, 5)).toBeNull()
    expect(destinationFor('green', yard, 6)).toEqual({
      kind: 'track',
      pos: START_INDEX.green,
    })
  })

  it('moves along the loop and wraps the absolute index around 52 squares', () => {
    const mid = { kind: 'track' as const, pos: toAbsoluteIndex('red', 10) }
    expect(destinationFor('red', mid, 3)).toEqual({ kind: 'track', pos: toAbsoluteIndex('red', 13) })
  })

  it('enters the home lane after the loop', () => {
    // Red's last loop square is relative 50. One step later it turns into the lane.
    const last = { kind: 'track' as const, pos: toAbsoluteIndex('red', 50) }
    expect(destinationFor('red', last, 1)).toEqual({ kind: 'lane', step: 0 })
    expect(destinationFor('red', last, 2)).toEqual({ kind: 'lane', step: 1 })
  })

  it('requires an exact roll to reach the centre and rejects overshoot', () => {
    expect(progressOf('red', { kind: 'lane', step: 0 })).toBe(TRACK_LENGTH)
    const oneShort = { kind: 'lane' as const, step: 3 }
    expect(destinationFor('red', oneShort, 2)).toEqual({ kind: 'home' })
    expect(destinationFor('red', oneShort, 3)).toBeNull()
    expect(destinationFor('red', { kind: 'home' }, 1)).toBeNull()
    expect(progressOf('red', { kind: 'home' })).toBe(FINISH_PROGRESS)
  })
})

describe('captures', () => {
  it('sends an opponent on an unsafe square back to its base', () => {
    let g = createGame(TWO)
    const target = toAbsoluteIndex('red', 30)
    expect(isSafeSquare(target)).toBe(false)
    g = setTokens(g, 1, [{ kind: 'track', pos: target }, yard, yard, yard])
    g = setTokens(g, 0, [{ kind: 'track', pos: toAbsoluteIndex('red', 26) }, yard, yard, yard])
    g = rollDice(g, die(4))
    g = applyMove(g, 0)
    expect(g.players[1].tokens[0].state).toEqual(yard)
    expect(g.events.some((e) => e.type === 'capture')).toBe(true)
  })

  it('never captures on a safe square', () => {
    let g = createGame(TWO)
    // Relative 21 for red is absolute 10, a safe star square.
    const safe = toAbsoluteIndex('red', 21)
    expect(isSafeSquare(safe)).toBe(true)
    g = setTokens(g, 1, [{ kind: 'track', pos: safe }, yard, yard, yard])
    g = setTokens(g, 0, [{ kind: 'track', pos: toAbsoluteIndex('red', 17) }, yard, yard, yard])
    g = rollDice(g, die(4))
    g = applyMove(g, 0)
    expect(g.players[1].tokens[0].state).toEqual({ kind: 'track', pos: safe })
    expect(g.events.some((e) => e.type === 'capture')).toBe(false)
  })
})

describe('safe squares and starts', () => {
  it('starts each colour two squares past the arrow where its lane begins', () => {
    for (const color of ['red', 'green', 'yellow', 'blue'] as const) {
      expect(START_INDEX[color]).toBe((LANE_ENTRY_INDEX[color] + 2) % 52)
      // A token's last loop square is the arrow square.
      expect(toAbsoluteIndex(color, TRACK_LENGTH - 1)).toBe(LANE_ENTRY_INDEX[color])
    }
  })

  it('makes start squares and stars safe, but not the arrow squares', () => {
    for (const i of [2, 15, 28, 41, 10, 23, 36, 49]) expect(isSafeSquare(i)).toBe(true)
    for (const i of [0, 13, 26, 39]) expect(isSafeSquare(i)).toBe(false)
  })

  it('never captures a token sitting on an opponent start square', () => {
    let g = createGame(TWO)
    g = setTokens(g, 1, [{ kind: 'track', pos: START_INDEX.yellow }, yard, yard, yard])
    g = setTokens(g, 0, [{ kind: 'track', pos: START_INDEX.yellow - 3 }, yard, yard, yard])
    g = rollDice(g, die(3))
    g = applyMove(g, 0)
    expect(g.players[1].tokens[0].state).toEqual({ kind: 'track', pos: START_INDEX.yellow })
    expect(g.currentIndex).toBe(1)
  })
})

describe('extra rolls', () => {
  it('gives another roll after capturing, even without a six', () => {
    let g = createGame(TWO)
    const target = toAbsoluteIndex('red', 30)
    g = setTokens(g, 1, [{ kind: 'track', pos: target }, yard, yard, yard])
    g = setTokens(g, 0, [{ kind: 'track', pos: toAbsoluteIndex('red', 26) }, yard, yard, yard])
    g = rollDice(g, die(4))
    g = applyMove(g, 0)
    expect(g.events.some((e) => e.type === 'capture')).toBe(true)
    expect(g.currentIndex).toBe(0)
    expect(g.phase).toBe('roll')
  })

  it('gives another roll when a token reaches the centre', () => {
    let g = createGame(TWO)
    g = setTokens(g, 0, [{ kind: 'lane', step: 3 }, { kind: 'track', pos: toAbsoluteIndex('red', 5) }, yard, yard])
    g = rollDice(g, die(2))
    g = applyMove(g, 0)
    expect(g.players[0].tokens[0].state).toEqual({ kind: 'home' })
    expect(g.currentIndex).toBe(0)
    expect(g.phase).toBe('roll')
  })

  it('passes the turn when the seat finishes with its last token', () => {
    let g = createGame([
      { color: 'red', kind: 'human' },
      { color: 'green', kind: 'bot' },
      { color: 'yellow', kind: 'bot' },
      { color: 'blue', kind: 'bot' },
    ])
    g = setTokens(g, 0, [{ kind: 'lane', step: 3 }, { kind: 'home' }, { kind: 'home' }, { kind: 'home' }])
    g = rollDice(g, die(2))
    g = applyMove(g, 0)
    expect(g.players[0].finishRank).toBe(1)
    expect(g.phase).toBe('roll')
    expect(g.currentIndex).toBe(1)
  })

  it('passes the turn after a plain move without a six or capture', () => {
    let g = createGame(TWO)
    g = setTokens(g, 0, [{ kind: 'track', pos: toAbsoluteIndex('red', 5) }, yard, yard, yard])
    g = rollDice(g, die(4))
    g = applyMove(g, 0)
    expect(g.currentIndex).toBe(1)
  })
})

describe('autoMoveTokenIds', () => {
  it('returns the single legal move', () => {
    let g = createGame(TWO)
    g = setTokens(g, 0, [{ kind: 'track', pos: toAbsoluteIndex('red', 5) }, yard, yard, yard])
    g = rollDice(g, die(3))
    expect(autoMoveTokenIds(g.legalMoves)).toEqual([0])
  })

  it('treats every yard token as the same spot on a six', () => {
    const g = rollDice(createGame(TWO), die(6))
    expect(autoMoveTokenIds(g.legalMoves)).toEqual([0, 1, 2, 3])
  })

  it('groups tokens stacked on one square when they are the only movers', () => {
    let g = createGame(TWO)
    const pos = toAbsoluteIndex('red', 8)
    g = setTokens(g, 0, [{ kind: 'track', pos }, { kind: 'track', pos }, yard, yard])
    g = rollDice(g, die(2))
    expect(autoMoveTokenIds(g.legalMoves)).toEqual([0, 1])
  })

  it('leaves a real choice to the player', () => {
    let g = createGame(TWO)
    g = setTokens(g, 0, [{ kind: 'track', pos: toAbsoluteIndex('red', 8) }, { kind: 'track', pos: toAbsoluteIndex('red', 12) }, yard, yard])
    g = rollDice(g, die(2))
    expect(autoMoveTokenIds(g.legalMoves)).toBeNull()
    // A six adds yard tokens to the choice, so it is no longer automatic.
    const six = rollWithValue(setTokens(createGame(TWO), 0, [{ kind: 'track', pos: toAbsoluteIndex('red', 8) }, yard, yard, yard]), 6)
    expect(autoMoveTokenIds(six.legalMoves)).toBeNull()
  })
})

describe('turn flow', () => {
  it('passes the turn when no token can move', () => {
    let g = createGame(TWO)
    g = rollDice(g, die(3)) // every token in its base, needs a six
    expect(g.phase).toBe('roll')
    expect(g.currentIndex).toBe(1)
    expect(g.events[0]).toMatchObject({ type: 'roll', value: 3 })
    expect(g.events[1]).toMatchObject({ type: 'turnPass', reason: 'noMoves' })
  })

  it('records the roll on the player even when the turn passes', () => {
    const g = rollWithValue(createGame(TWO), 3)
    expect(g.players[0].lastRoll).toBe(3)
    expect(g.players[1].lastRoll).toBeNull()
  })

  it('gives an extra roll after moving on a six', () => {
    let g = createGame(TWO)
    g = rollDice(g, die(6))
    expect(g.phase).toBe('move')
    g = applyMove(g, 0)
    expect(g.currentIndex).toBe(0)
    expect(g.phase).toBe('roll')
  })

  it('forfeits the turn after three consecutive sixes', () => {
    let g = createGame(TWO)
    for (let i = 0; i < MAX_SIX_STREAK; i++) {
      expect(g.currentIndex).toBe(0)
      g = rollDice(g, die(6))
      if (g.phase === 'move') g = applyMove(g, 0)
    }
    expect(g.events.some((e) => e.type === 'turnPass' && e.reason === 'threeSixes')).toBe(true)
    expect(g.currentIndex).toBe(1)
  })

  it('ignores actions that are invalid for the current phase', () => {
    const g = createGame(TWO)
    expect(applyMove(g, 0)).toBe(g)
    const moved = rollDice(g, die(6))
    expect(rollDice(moved, die(2))).toBe(moved)
  })

  it('lists every legal move for a six', () => {
    const g = createGame(TWO)
    expect(legalMovesFor(g.players, g.players[0], 6)).toHaveLength(4)
  })

  it('replays a recorded roll exactly', () => {
    const a = applyAction(createGame(TWO), { type: 'roll', value: 6, actor: 'human' })
    const b = rollWithValue(createGame(TWO), 6)
    expect(a).toEqual(b)
  })
})

describe('finishing and game over', () => {
  it('ranks a seat as finished when all its tokens reach home, and ends the game', () => {
    let g = createGame(TWO)
    g = setTokens(g, 0, [{ kind: 'lane', step: 3 }, { kind: 'home' }, { kind: 'home' }, { kind: 'home' }])
    g = rollDice(g, die(2))
    g = applyMove(g, 0)
    expect(g.players[0].finishRank).toBe(1)
    expect(g.phase).toBe('gameOver')
    expect(g.winners).toEqual(['red', 'yellow'])
  })

  it('rolls a valid face for every random source value', () => {
    for (let i = 0; i < 100; i++) {
      const face = rollDie(() => i / 100)
      expect(face).toBeGreaterThanOrEqual(1)
      expect(face).toBeLessThanOrEqual(6)
    }
  })
})
