import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { DEFAULT_SETTINGS, useGameStore } from './store/gameStore'

beforeEach(() => {
  // The store is a module singleton, so clear any game left by a previous test.
  useGameStore.getState().abort()
  // Setup prefills the previous game's seats; start each test from the defaults.
  useGameStore.setState({ lastConfigs: null })
  // Rolls by hand, so tests control when things happen.
  useGameStore.getState().updateSettings({ autoRoll: false })
})

afterEach(() => {
  useGameStore.getState().updateSettings({ ...DEFAULT_SETTINGS })
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

  it('starts a two-player game with a panel for each seat only', async () => {
    render(<App />)
    fireEvent.click(screen.getByLabelText('2 players'))
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(await screen.findByRole('region', { name: /\(Red\)/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /\(Yellow\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /\(Green\)/ })).toBeNull()
    expect(screen.queryByRole('region', { name: /\(Blue\)/ })).toBeNull()
  })

  it('returns to setup from the Game menu when no moves have been made', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Game' }))
    const menu = screen.getByRole('dialog', { name: 'Game' })
    fireEvent.click(within(menu).getByRole('button', { name: /Set up a new game/ }))
    expect(await screen.findByRole('button', { name: 'Start game' })).toBeInTheDocument()
  })

  it('asks before restarting a game in progress, then starts it again from the beginning', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    await screen.findByRole('img', { name: 'Ludo board' })
    act(() => useGameStore.getState().record({ type: 'roll', value: 3, actor: 'human' }))
    fireEvent.keyDown(window, { key: 'g' })
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Game' })).getByRole('button', { name: /^Restart/ }))
    expect(await screen.findByRole('alertdialog', { name: 'Restart this game?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect(useGameStore.getState().actions).toHaveLength(0))
    expect(useGameStore.getState().game).not.toBeNull()
  })

  it('pauses a local game while Settings is open and resumes when it closes', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(useGameStore.getState().paused).toBe(true)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(useGameStore.getState().paused).toBe(false))
  })

  it('has no house rule switches on setup: every game plays by the house rules', () => {
    render(<App />)
    expect(screen.queryByRole('group', { name: 'House rules' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(useGameStore.getState().game?.rules).toEqual({ rollSixesFirst: true })
  })

  it('explains the house rules as the rules of the game, and notes any an older saved game lacks', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    await screen.findByRole('img', { name: 'Ludo board' })
    fireEvent.keyDown(window, { key: '?' })
    const sheet = screen.getByRole('dialog', { name: 'How to play' })
    expect(sheet).toHaveTextContent('keep going until you roll something else')
    expect(within(sheet).queryByRole('heading', { name: 'House rules' })).toBeNull()
    expect(sheet.querySelector('.rules-note')).toBeNull()
    const g = useGameStore.getState().game!
    act(() => useGameStore.setState({ game: { ...g, rules: { rollSixesFirst: false } } }))
    expect(sheet.querySelector('.rules-note')).toHaveTextContent('without: rolling all your sixes first.')
  })

  it('shows all four tokens per seat on the board', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid^="token-"]')).toHaveLength(16)
    })
  })

  it('hides undo until it is turned on in Settings, and lists the log newest first', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    await screen.findByRole('img', { name: 'Ludo board' })
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    act(() => useGameStore.getState().updateSettings({ undo: true }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
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

  it('supports keyboard shortcuts for pause and Settings', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    await screen.findByRole('img', { name: 'Ludo board' })

    fireEvent.keyDown(window, { key: 'p' })
    expect(await screen.findByText('Game paused')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'P' })
    await waitFor(() => expect(screen.queryByText('Game paused')).not.toBeInTheDocument())

    fireEvent.keyDown(window, { key: 's' })
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
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
