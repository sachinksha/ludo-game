import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DicePool } from './DicePool'

const base = { selectedDie: 6, usable: () => true, interactive: true, onSelect: () => {} }

describe('DicePool', () => {
  it('shows nothing for a lone ordinary roll', () => {
    const { container } = render(<DicePool {...base} pool={[3]} banking={false} selectedDie={3} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows banked sixes while rolling', () => {
    render(<DicePool {...base} pool={[6, 6]} banking />)
    expect(screen.getByRole('group', { name: 'Banked dice' })).toBeInTheDocument()
  })

  it('keeps the last banked die on screen after the others are used', () => {
    // Rolled 6 then 3, used the 3 first: the 6 is still to play.
    render(<DicePool {...base} pool={[6]} banking={false} continuing />)
    expect(screen.getByRole('button', { name: 'Use the 6' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lets the player choose between dice', () => {
    const onSelect = vi.fn()
    render(<DicePool {...base} pool={[6, 3]} banking={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use the 3' }))
    expect(onSelect).toHaveBeenCalledWith(3)
  })
})
