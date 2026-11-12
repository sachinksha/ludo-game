import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { useGameStore } from './store/gameStore'

beforeEach(() => {
  // The store is a module singleton, so clear any game left by a previous test.
  useGameStore.getState().abort()
})

describe('App', () => {
  it('starts without any login or account step', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Ludo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign in|log in|log out/i })).not.toBeInTheDocument()
    expect(document.querySelector('input[type="password"]')).toBeNull()
  })

  it('goes from setup to a game where the human seat can tap to roll', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    // The human seat's dice are the roll button.
    expect(await screen.findByRole('button', { name: /tap to roll/i })).toBeEnabled()
    expect(screen.getByRole('img', { name: 'Ludo board' })).toBeInTheDocument()
  })

  it('returns to setup from settings when no moves have been made', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    fireEvent.click(await screen.findByRole('button', { name: /Settings/ }))
    expect(screen.getByRole('heading', { name: 'Ludo' })).toBeInTheDocument()
  })

  it('shows all four tokens per seat on the board', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid^="token-"]')).toHaveLength(16)
    })
  })

  it('lists the log newest first and disables undo before any move', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    const undo = await screen.findByRole('button', { name: /Undo/ })
    expect(undo).toBeDisabled()
    // The log is collapsed by default and opens from its toggle.
    const toggle = screen.getByRole('button', { name: /Game log/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: /Game log/ })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    const log = screen.getByRole('list', { name: /Game log/ })
    expect(within(log).getByText('No moves yet.')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'l' })
    expect(screen.queryByRole('list', { name: /Game log/ })).not.toBeInTheDocument()
  })

  it('supports keyboard shortcuts for pause and settings', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    await screen.findByRole('img', { name: 'Ludo board' })

    fireEvent.keyDown(window, { key: 'p' })
    expect(await screen.findByText('Game paused')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'P' })
    await waitFor(() => expect(screen.queryByText('Game paused')).not.toBeInTheDocument())

    fireEvent.keyDown(window, { key: 's' })
    expect(await screen.findByRole('button', { name: 'Start game' })).toBeInTheDocument()
  })

  it('shows a game clock and footer links to GitHub', async () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('href', 'https://github.com/sachinksha/ludo-game')
    expect(screen.getByRole('link', { name: '@sachinksha' })).toHaveAttribute('href', 'https://github.com/sachinksha')
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(await screen.findByRole('timer')).toHaveAccessibleName(/Game time 0:00/)
  })

  it('ignores shortcuts while typing a name on the setup screen', () => {
    render(<App />)
    const input = screen.getByLabelText('Red player name')
    fireEvent.keyDown(input, { key: 'n' })
    expect(screen.getByRole('button', { name: 'Start game' })).toBeInTheDocument()
  })
})
