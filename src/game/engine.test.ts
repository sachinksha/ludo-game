import { describe, expect, it } from 'vitest'
import { FINISH_PROGRESS, LANE_ENTRY_INDEX, START_INDEX, TRACK_LENGTH, isSafeSquare, toAbsoluteIndex } from './board'
import { createBotProfile } from './bot'
import { describeEvent } from './describe'
import { COMEBACK_GRACE, MAX_SIX_STREAK, applyAction, applyMove, autoMoveTokenIds, createGame, endGame, rollDice, rollDie, rollFor, rollWithValue, sixChance } from './engine'
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

describe('stacked captures', () => {
  it('sends every opponent token on the landing square back to base', () => {
    let g = createGame(TWO)
    const square = 30 // unsafe
    g = setTokens(g, 1, [{ kind: 'track', pos: square }, { kind: 'track', pos: square }, yard, yard])
    g = setTokens(g, 0, [{ kind: 'track', pos: square - 4 }, yard, yard, yard])
    g = rollDice(g, die(4))
    g = applyMove(g, 0)
    expect(g.players[1].tokens.every((t) => t.state.kind === 'yard')).toBe(true)
    expect(g.events.filter((e) => e.type === 'capture')).toHaveLength(2)
  })
})

describe('comeback dice', () => {
  const stuck = () => createGame(TWO).players[0]

  it('counts rolls without a six while every token is in base, and resets on a six', () => {
    let g = createGame(TWO)
    g = rollWithValue(g, 3) // red, no move: turn passes
    expect(g.players[0].dryRolls).toBe(1)
    g = rollWithValue(g, 2) // yellow
    g = rollWithValue(g, 4) // red again
    expect(g.players[0].dryRolls).toBe(2)
    g = rollWithValue(g, 1) // yellow
    g = rollWithValue(g, 6) // red rolls a six
    expect(g.players[0].dryRolls).toBe(0)
  })

  it('does not count rolls while the player has a token on the board', () => {
    let g = createGame(TWO)
    g = setTokens(g, 0, [{ kind: 'track', pos: START_INDEX.red }, yard, yard, yard])
    g = rollWithValue(g, 3)
    expect(g.players[0].dryRolls).toBe(0)
  })

  it('keeps fair odds during the grace period and when switched off', () => {
    const p = { ...stuck(), dryRolls: COMEBACK_GRACE - 1 }
    expect(sixChance(p, true)).toBeCloseTo(1 / 6)
    expect(sixChance({ ...p, dryRolls: 20 }, false)).toBeCloseTo(1 / 6)
  })

  it('raises the odds of a six step by step after the grace period, up to a cap', () => {
    const at = (n: number) => sixChance({ ...stuck(), dryRolls: n }, true)
    expect(at(COMEBACK_GRACE)).toBeGreaterThan(1 / 6)
    expect(at(COMEBACK_GRACE + 1)).toBeGreaterThan(at(COMEBACK_GRACE))
    expect(at(100)).toBe(0.5)
  })

  it('gives no help once a token is on the board, however long the dry spell', () => {
    const p = { ...stuck(), dryRolls: 10, tokens: stuck().tokens.map((t, i) => (i === 0 ? { ...t, state: { kind: 'track' as const, pos: 5 } } : t)) }
    expect(sixChance(p, true)).toBeCloseTo(1 / 6)
  })

  it('rolls exactly like a fair die when no help applies', () => {
    const g = createGame(TWO)
    for (let face = 1; face <= 6; face++) expect(rollFor(g, die(face), true)).toBe(face)
  })

  it('still produces every face 1 to 5 when the odds are boosted', () => {
    let g = createGame(TWO)
    g = { ...g, players: g.players.map((p, i) => (i === 0 ? { ...p, dryRolls: 50 } : p)) }
    const faces = new Set<number>()
    for (let u = 0; u < 1; u += 0.01) faces.add(rollFor(g, () => u, true))
    expect([...faces].sort()).toEqual([1, 2, 3, 4, 5, 6])
    expect(rollFor(g, () => 0.49, true)).toBe(6)
  })
})

describe('ending early', () => {
  it('keeps finished places and ranks the rest by total progress', () => {
    const FOUR: PlayerConfig[] = [
      { color: 'red', kind: 'human' },
      { color: 'green', kind: 'bot' },
      { color: 'yellow', kind: 'bot' },
      { color: 'blue', kind: 'bot' },
    ]
    let g = createGame(FOUR)
    const home = { kind: 'home' as const }
    g = setTokens(g, 0, [home, home, home, home])
    g = { ...g, players: g.players.map((p, i) => (i === 0 ? { ...p, finishRank: 1 } : p)) }
    g = setTokens(g, 1, [{ kind: 'track', pos: toAbsoluteIndex('green', 5) }, yard, yard, yard])
    g = setTokens(g, 2, [{ kind: 'lane', step: 2 }, yard, yard, yard])
    g = setTokens(g, 3, [yard, yard, yard, yard])

    g = applyAction(g, { type: 'end', actor: 'human' })
    expect(g.phase).toBe('gameOver')
    expect(g.winners).toEqual(['red', 'yellow', 'green', 'blue'])
    expect(g.events).toEqual([{ type: 'gameOver', winners: g.winners, early: true }])
    expect(endGame(g)).toBe(g)
  })
})

describe('bot styles', () => {
  it('gives each bot a playing style and humans none', () => {
    const g = createGame([{ color: 'red', kind: 'human' }, { color: 'yellow', kind: 'bot' }])
    expect(g.players[0].bot).toBeNull()
    expect(['balanced', 'hunter', 'guardian', 'racer']).toContain(g.players[1].bot?.persona)
  })
})

describe('takeover', () => {
  const configs: PlayerConfig[] = [
    { color: 'red', kind: 'human', name: 'Host' },
    { color: 'green', kind: 'bot' },
    { color: 'yellow', kind: 'human', remote: true, name: 'Asha' },
    { color: 'blue', kind: 'human', remote: true },
  ]
  const bot = createBotProfile(() => 0.5)

  it('renames the seat to the next bot number and reports both names', () => {
    const g = applyAction(createGame(configs, () => 0.5), { type: 'takeover', color: 'yellow', bot, actor: 'human' })
    const seat = g.players.find((p) => p.color === 'yellow')!
    expect(seat).toMatchObject({ kind: 'bot', name: 'Bot 2', remote: false, bot })
    expect(g.events).toEqual([{ type: 'takeover', color: 'yellow', from: 'Asha', to: 'Bot 2' }])
    expect(describeEvent(g.events[0])).toBe('Asha left. Bot 2 now plays Yellow')
  })

  it('keeps bot names unique across several takeovers', () => {
    let g = createGame(configs, () => 0.5)
    g = applyAction(g, { type: 'takeover', color: 'yellow', bot, actor: 'human' })
    g = applyAction(g, { type: 'takeover', color: 'blue', bot, actor: 'human' })
    expect(g.players.map((p) => p.name)).toEqual(['Host', 'Bot 1', 'Bot 2', 'Bot 3'])
  })

  it('ignores a seat that is already a bot', () => {
    const g = createGame(configs, () => 0.5)
    expect(applyAction(g, { type: 'takeover', color: 'green', bot, actor: 'human' })).toBe(g)
  })
})
