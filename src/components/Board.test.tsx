import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createGame } from '../game/engine'
import { placeTokens, stackOffset, TOKEN_RADIUS, tokenCentre } from '../game/layout'
import type { GameState, Player } from '../game/types'
import { Board } from './Board'

/** Two red tokens and one yellow token all on the same loop square. */
function stackedGame(): GameState {
  const base = createGame([
    { color: 'red', kind: 'human' },
    { color: 'yellow', kind: 'bot' },
  ])
  const sharedSquare = { kind: 'track' as const, pos: 5 }
  const players: Player[] = base.players.map((p) => {
    if (p.color === 'red') {
      return { ...p, tokens: p.tokens.map((t, id) => (id < 2 ? { ...t, state: sharedSquare } : t)) }
    }
    return { ...p, tokens: p.tokens.map((t, id) => (id === 0 ? { ...t, state: sharedSquare } : t)) }
  })
  return { ...base, players }
}

describe('stacked tokens', () => {
  it('spreads tokens that share a square so each has its own position', () => {
    const placed = placeTokens(stackedGame().players)
    const shared = tokenCentre('red', 0, { kind: 'track', pos: 5 })
    const onSquare = placed.filter((t) => t.cx - shared[0] < 0.5 && t.cy - shared[1] < 0.5 && Math.abs(t.cx - shared[0]) <= 0.25 && Math.abs(t.cy - shared[1]) <= 0.25)
    expect(onSquare).toHaveLength(3)
    const positions = new Set(onSquare.map((t) => `${t.cx.toFixed(3)},${t.cy.toFixed(3)}`))
    expect(positions.size).toBe(3)
    expect(onSquare.every((t) => t.r < TOKEN_RADIUS)).toBe(true)
  })

  it('leaves a lone token at full size and centred', () => {
    const placed = placeTokens(createGame([{ color: 'red', kind: 'human' }, { color: 'yellow', kind: 'bot' }]).players)
    expect(placed.every((t) => t.r === TOKEN_RADIUS)).toBe(true)
    expect(stackOffset(0, 1)).toEqual([0, 0])
  })

  it('draws a clickable token above an opponent token on the same square', () => {
    const game = stackedGame()
    render(<Board players={game.players} activeColor="red" clickable={[{ color: 'red', tokenId: 0 }]} onPick={() => {}} />)
    const yellow = screen.getByTestId('token-yellow-0')
    const red = screen.getByTestId('token-red-0')
    // A later sibling in the SVG is drawn on top, so the clickable red token must come after yellow.
    const order = Array.from(document.querySelectorAll('[data-testid^="token-"]'))
    expect(order.indexOf(red)).toBeGreaterThan(order.indexOf(yellow))
  })

  it('selects the token the player taps, even when tokens share a square', () => {
    const onPick = vi.fn()
    const game = stackedGame()
    render(
      <Board
        players={game.players}
        activeColor="red"
        clickable={[
          { color: 'red', tokenId: 0 },
          { color: 'red', tokenId: 1 },
        ]}
        onPick={onPick}
      />,
    )
    fireEvent.click(screen.getByTestId('token-red-1'))
    expect(onPick).toHaveBeenLastCalledWith(1)
    fireEvent.click(screen.getByTestId('token-red-0'))
    expect(onPick).toHaveBeenLastCalledWith(0)
    expect(onPick).toHaveBeenCalledTimes(2)
  })

  it('does not select a token that is not clickable', () => {
    const onPick = vi.fn()
    const game = stackedGame()
    render(<Board players={game.players} activeColor="red" clickable={[{ color: 'red', tokenId: 0 }]} onPick={onPick} />)
    fireEvent.click(screen.getByTestId('token-yellow-0'))
    expect(onPick).not.toHaveBeenCalled()
  })
})
