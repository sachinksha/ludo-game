import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WinOverlay } from './WinOverlay'

describe('WinOverlay', () => {
  it('announces the champion and lists standings', () => {
    render(<WinOverlay winners={['green', 'red']} onNewGame={() => {}} onSetup={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Green wins!' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('offers play again and change setup actions', () => {
    const onNewGame = vi.fn()
    const onSetup = vi.fn()
    render(<WinOverlay winners={['blue']} onNewGame={onNewGame} onSetup={onSetup} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change setup' }))
    expect(onNewGame).toHaveBeenCalledOnce()
    expect(onSetup).toHaveBeenCalledOnce()
  })
})
