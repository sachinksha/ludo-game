import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SetupScreen } from './SetupScreen'

describe('SetupScreen', () => {
  it('offers a four-seat game by default with one human seat', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(onStart).toHaveBeenCalledWith(
      [
        { color: 'red', kind: 'human' },
        { color: 'green', kind: 'bot' },
        { color: 'yellow', kind: 'bot' },
        { color: 'blue', kind: 'bot' },
      ],
      false,
    )
  })

  it('switches to two players and lets a seat be toggled to bot or human', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByLabelText('2 players'))
    fireEvent.click(screen.getByRole('button', { name: /Yellow seat: Bot/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(onStart).toHaveBeenCalledWith(
      [
        { color: 'red', kind: 'human' },
        { color: 'yellow', kind: 'human' },
      ],
      false,
    )
  })

  it('will not start a game with only bots', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByLabelText('2 players'))
    fireEvent.click(screen.getByRole('button', { name: /Red seat: Human/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('At least one seat must be a human player.')
    const startButton = screen.getByRole('button', { name: 'Start game' })
    expect(startButton).toBeDisabled()
    fireEvent.click(startButton)
    expect(onStart).not.toHaveBeenCalled()
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

  it('lets two players pick their colours, replacing the older pick', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByLabelText('2 players'))
    expect(screen.getByRole('button', { name: 'Red', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yellow', pressed: true })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Blue', pressed: false })) // replaces red
    expect(screen.getByRole('button', { name: 'Red', pressed: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Yellow seat: Bot/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    // Seats come in turn order (clockwise from red), not pick order.
    expect(onStart).toHaveBeenCalledWith(
      [
        { color: 'yellow', kind: 'human' },
        { color: 'blue', kind: 'bot' },
      ],
      false,
    )
  })

  it('asks for an online friend seat before creating an invite link', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByLabelText('Online (invite link)'))
    expect(screen.getByRole('alert')).toHaveTextContent('Set at least one seat to Online friend.')
    expect(screen.getByRole('button', { name: 'Create invite link' })).toBeDisabled()

    // Bot -> Online friend.
    fireEvent.click(screen.getByRole('button', { name: /Green seat: Bot/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }))
    expect(onStart).toHaveBeenCalledWith(
      [
        { color: 'red', kind: 'human' },
        { color: 'green', kind: 'human', remote: true },
        { color: 'yellow', kind: 'bot' },
        { color: 'blue', kind: 'bot' },
      ],
      true,
    )
  })

  it('needs a human seat on this device to host', () => {
    render(<SetupScreen onStart={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Online (invite link)'))
    fireEvent.click(screen.getByRole('button', { name: /Red seat: Human/ })) // -> Bot
    fireEvent.click(screen.getByRole('button', { name: /Red seat: Bot/ })) // -> Online friend
    expect(screen.getByRole('alert')).toHaveTextContent('You need a Human seat on this device to host.')
  })
})
