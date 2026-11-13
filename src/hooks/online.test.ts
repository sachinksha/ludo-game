/**
 * The game hook in online roles, over the in-memory network. The stores are
 * singletons, so each test drives one side through the stores and hook, and
 * the other side with a bare session object.
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '../game/engine'
import type { GameAction, PlayerConfig } from '../game/types'
import { GuestSession } from '../net/guestSession'
import { HostSession } from '../net/hostSession'
import { parseInvite } from '../net/invite'
import { MemoryNetwork } from '../net/memoryNetwork'
import type { Intent } from '../net/protocol'
import { useGameStore } from '../store/gameStore'
import { configureOnline, useOnlineStore } from '../store/onlineStore'
import { TIMING, useLudoGame } from './useLudoGame'

/** Die face 3, and bot/auto picks that are always the first option. */
const THREE = () => 0.45

/** Runs pending microtasks (network delivery) without touching fake timers. */
async function tick() {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

const memStore = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

let network: MemoryNetwork

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  network = new MemoryNetwork()
  configureOnline({ network, baseUrl: () => 'https://ludo.test/' })
  useGameStore.getState().updateSettings({ autoRoll: false })
})

afterEach(() => {
  // Unmount the hook before leaving, as the app does, so it never renders without a game.
  cleanup()
  act(() => useOnlineStore.getState().leave())
  useGameStore.getState().updateSettings({ autoRoll: true })
  vi.useRealTimers()
})

describe('hosting', () => {
  const SEATS: PlayerConfig[] = [
    { color: 'red', kind: 'human', remote: true },
    { color: 'yellow', kind: 'human', name: 'Host' },
  ]

  async function hostWithGuest() {
    await act(() => useOnlineStore.getState().startHosting(SEATS))
    const host = useOnlineStore.getState().host!
    const invite = parseInvite(new URL(host.getView().inviteUrl).hash)!
    const received: { action: GameAction; seq: number }[] = []
    const guest = new GuestSession(network, invite, 'Asha', { onSync: () => {}, onAction: (action, seq) => received.push({ action, seq }), onPaused: () => {} }, memStore())
    await act(async () => {
      await guest.connect()
      await tick()
    })
    act(() => useOnlineStore.getState().startHostedGame())
    await act(tick)
    return { host, guest, received }
  }

  it('plays a guest’s roll intent and broadcasts the result', async () => {
    const { guest, received } = await hostWithGuest()
    const { result } = renderHook(() => useLudoGame(THREE))
    expect(result.current.role).toBe('host')
    // Red (the guest) is first. The host device does not control it.
    expect(result.current.humanTurn).toBe(false)

    guest.sendIntent(0, { action: 'roll' })
    await act(tick)
    await act(async () => {
      vi.advanceTimersByTime(10)
      await tick()
    })
    expect(received).toEqual([{ action: { type: 'roll', value: 3, actor: 'human' }, seq: 0 }])
    act(() => vi.advanceTimersByTime(TIMING.ROLL_MS + 10))
    expect(useGameStore.getState().actions).toEqual([{ type: 'roll', value: 3, actor: 'human' }])
  })

  it('ignores a stale intent', async () => {
    const { guest, received } = await hostWithGuest()
    renderHook(() => useLudoGame(THREE))
    guest.sendIntent(7, { action: 'roll' })
    await act(tick)
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await tick()
    })
    expect(received).toEqual([])
    expect(useGameStore.getState().actions).toEqual([])
  })

  it('disables undo and keeps pause for the host only', async () => {
    await hostWithGuest()
    const { result } = renderHook(() => useLudoGame(THREE))
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canPause).toBe(true)
  })
})

describe('joining as a guest', () => {
  const SEATS: PlayerConfig[] = [
    { color: 'red', kind: 'human', name: 'Host' },
    { color: 'yellow', kind: 'human', remote: true },
  ]

  async function joined() {
    const host = new HostSession(await network.host(), SEATS, { baseUrl: 'https://ludo.test/' })
    const intents: { color: string; seq: number; intent: Intent }[] = []
    host.onIntent = (color, seq, intent) => intents.push({ color, seq, intent })
    act(() => useOnlineStore.getState().openInvite(parseInvite(new URL(host.getView().inviteUrl).hash)))
    await act(async () => {
      await useOnlineStore.getState().join('Asha')
      await tick()
    })
    const initial = createGame(host.gameConfigs(), THREE)
    act(() => host.startGame(initial))
    await act(tick)
    return { host, intents }
  }

  it('loads the host’s game and animates its actions', async () => {
    const { host } = await joined()
    const { result } = renderHook(() => useLudoGame(THREE))
    expect(result.current.role).toBe('guest')
    expect(result.current.isMine('yellow')).toBe(true)
    expect(result.current.isMine('red')).toBe(false)
    expect(result.current.canPause).toBe(false)

    act(() => host.announce({ type: 'roll', value: 6, actor: 'human' }))
    await act(tick)
    act(() => vi.advanceTimersByTime(10))
    expect(result.current.rolling).toBe(true)
    act(() => vi.advanceTimersByTime(TIMING.ROLL_MS + 10))
    expect(useGameStore.getState().actions).toEqual([{ type: 'roll', value: 6, actor: 'human' }])
    expect(useGameStore.getState().game!.phase).toBe('move')
  })

  it('sends an intent instead of rolling when it is this guest’s turn', async () => {
    const { host, intents } = await joined()
    const { result } = renderHook(() => useLudoGame(THREE))
    // Red rolls a 3 with nothing to move, so the turn passes to yellow (this guest).
    act(() => host.announce({ type: 'roll', value: 3, actor: 'human' }))
    await act(tick)
    act(() => vi.advanceTimersByTime(10))
    act(() => vi.advanceTimersByTime(TIMING.ROLL_MS + 10))
    act(() => vi.advanceTimersByTime(TIMING.SETTLE_MS + 10))
    expect(result.current.humanTurn).toBe(true)

    act(() => result.current.roll())
    act(() => result.current.roll()) // a double tap sends one intent
    await act(tick)
    expect(intents).toEqual([{ color: 'yellow', seq: 1, intent: { action: 'roll' } }])
    // Nothing changes locally until the host answers.
    expect(useGameStore.getState().actions).toHaveLength(1)
  })

  it('asks for a full copy when it notices a missing action', async () => {
    const { host } = await joined()
    renderHook(() => useLudoGame(THREE))
    const resync = vi.spyOn(useOnlineStore.getState().guest!, 'requestResync')
    // Skip seq 0 by announcing straight to the guests' handler path.
    ;(host as unknown as { snapshot: { actions: GameAction[] } }).snapshot.actions.push({ type: 'roll', value: 3, actor: 'human' })
    act(() => host.announce({ type: 'roll', value: 2, actor: 'human' }))
    await act(tick)
    expect(resync).toHaveBeenCalled()
  })

  it('returns to the join screen when the host ends the session', async () => {
    const { host } = await joined()
    expect(useGameStore.getState().game).not.toBeNull()
    act(() => host.end())
    await act(tick)
    expect(useGameStore.getState().game).toBeNull()
    expect(useOnlineStore.getState().guest!.getView().status).toBe('ended')
  })
})
