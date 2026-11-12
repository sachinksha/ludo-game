import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SetupScreen } from './SetupScreen'

describe('SetupScreen', () => {
  it('offers a four-seat game by default with one human seat', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(onStart).toHaveBeenCalledWith([
      { color: 'red', kind: 'human' },
      { color: 'green', kind: 'bot' },
      { color: 'yellow', kind: 'bot' },
      { color: 'blue', kind: 'bot' },
    ])
  })

  it('switches to two players and lets a seat be toggled to bot or human', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByLabelText('2 players'))
    fireEvent.click(screen.getByRole('button', { name: /Red seat: Human/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(onStart).toHaveBeenCalledWith([
      { color: 'red', kind: 'bot' },
      { color: 'yellow', kind: 'bot' },
    ])
  })

  it('passes a custom human name to the game', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.change(screen.getByLabelText('Red player name'), { target: { value: '  Asha ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(onStart.mock.calls[0][0][0]).toEqual({ color: 'red', kind: 'human', name: 'Asha' })
  })

  it('limits name length and blocks blank or duplicate names', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    const red = screen.getByLabelText('Red player name')
    expect(red).toHaveAttribute('maxLength', '12')

    fireEvent.change(red, { target: { value: '   ' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Name cannot be blank.')
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled()

    fireEvent.change(red, { target: { value: 'Bot 2' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Name is already taken.')
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled()
  })

  it('prefills seats and names from the previous game', () => {
    const onStart = vi.fn()
    render(
      <SetupScreen
        onStart={onStart}
        initial={[
          { color: 'red', kind: 'human', name: 'Asha' },
          { color: 'yellow', kind: 'human', name: 'Ben' },
        ]}
      />,
    )
    expect(screen.getByLabelText('Red player name')).toHaveValue('Asha')
    expect(screen.getByLabelText('Yellow player name')).toHaveValue('Ben')
  })
})
