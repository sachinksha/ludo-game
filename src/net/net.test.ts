import { describe, expect, it } from 'vitest'
import { createGame } from '../game/engine'
import type { GameAction, PlayerConfig } from '../game/types'
import { GuestSession, type GuestHandlers, type SeatStore } from './guestSession'
import { HostSession } from './hostSession'
import { INVITE_TTL_MS, formatRemaining, inviteUrl, parseInvite } from './invite'
import { MemoryNetwork } from './memoryNetwork'
import { parseGuestMessage, sanitizeName, type Snapshot } from './protocol'

/** Lets queued microtasks and zero-delay timers run. */
const flush = () => new Promise((r) => setTimeout(r, 0))

const SEATS: PlayerConfig[] = [
  { color: 'red', kind: 'human', name: 'Host' },
  { color: 'green', kind: 'human', remote: true },
  { color: 'yellow', kind: 'bot' },
  { color: 'blue', kind: 'human', remote: true },
]

function memoryStore(): SeatStore {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
}

function recorder() {
  const log = { syncs: [] as Snapshot[], actions: [] as { action: GameAction; seq: number }[], paused: [] as boolean[] }
  const handlers: GuestHandlers = {
    onSync: (s) => log.syncs.push(s),
    onAction: (action, seq) => log.actions.push({ action, seq }),
    onPaused: (p) => log.paused.push(p),
  }
  return { log, handlers }
}

async function setup(configs = SEATS) {
  const network = new MemoryNetwork()
  let clock = 1_000_000
  const host = new HostSession(await network.host(), configs, { baseUrl: 'https://ludo.test/', now: () => clock })
  const invite = parseInvite(new URL(host.getView().inviteUrl).hash)!
  const guest = async (name: string, store = memoryStore()) => {
    const { log, handlers } = recorder()
    const session = new GuestSession(network, invite, name, handlers, store)
    await session.connect()
    await flush()
    return { session, log, store }
  }
  return { network, host, invite, guest, advance: (ms: number) => (clock += ms) }
}

describe('protocol', () => {
  it('accepts well-formed guest messages and drops everything else', () => {
    expect(parseGuestMessage({ t: 'intent', seq: 3, action: 'move', tokenId: 2 })).toEqual({ t: 'intent', seq: 3, action: 'move', tokenId: 2 })
    expect(parseGuestMessage({ t: 'intent', seq: 3, action: 'move', tokenId: 9 })).toBeNull()
    expect(parseGuestMessage({ t: 'intent', seq: -1, action: 'roll' })).toBeNull()
    expect(parseGuestMessage({ t: 'hello', v: 1, token: 'x'.repeat(65), name: 'a' })).toBeNull()
    expect(parseGuestMessage({ t: 'cheat', value: 6 })).toBeNull()
    expect(parseGuestMessage('roll')).toBeNull()
    // Unknown extra fields are not passed through.
    expect(parseGuestMessage({ t: 'leave', admin: true })).toEqual({ t: 'leave' })
  })

  it('cleans names: control characters, spaces and length', () => {
    expect(sanitizeName('  Asha\u0000\u0007  K  ')).toBe('Asha K')
    expect(sanitizeName('A very long player name')).toBe('A very long') // cut at 12, then trimmed
    expect(sanitizeName('Abcdefghijklmnop')).toHaveLength(12)
    expect(sanitizeName('\u0001\u0002')).toBe('')
  })
})

describe('invite links', () => {
  it('round-trips host id, token and expiry through the URL fragment', () => {
    const url = inviteUrl('https://ludo.test/', { hostId: 'abc-123', token: 'tok_en', expiresAt: 42 })
    expect(url.startsWith('https://ludo.test/#')).toBe(true)
    expect(parseInvite(new URL(url).hash)).toEqual({ hostId: 'abc-123', token: 'tok_en', expiresAt: 42 })
    expect(parseInvite('#nothing=here')).toBeNull()
  })

  it('formats the time left as m:ss', () => {
    expect(formatRemaining(65_000)).toBe('1:05')
    expect(formatRemaining(-5)).toBe('0:00')
  })
})

describe('joining', () => {
  it('seats guests in order, using their names', async () => {
    const { host, guest } = await setup()
    const a = await guest('Asha')
    const b = await guest('Ben')
    expect(a.session.getView()).toMatchObject({ status: 'lobby', color: 'green' })
    expect(b.session.getView()).toMatchObject({ status: 'lobby', color: 'blue' })
    const seats = host.getView().seats
    expect(seats.find((s) => s.color === 'green')).toMatchObject({ name: 'Asha', joined: true, connected: true })
    expect(host.allJoined()).toBe(true)
    // Guests see the lobby too.
    expect(a.session.getView().seats.find((s) => s.color === 'blue')?.name).toBe('Ben')
  })

  it('makes clashing names unique', async () => {
    const { host, guest } = await setup()
    await guest('host')
    expect(host.getView().seats.find((s) => s.color === 'green')?.name).toBe('host 2')
  })

  it('rejects a wrong token, an expired link, and a full game', async () => {
    const { host, network, guest, advance } = await setup()
    const forged = new GuestSession(network, { ...parseInvite(new URL(host.getView().inviteUrl).hash)!, token: 'forged' }, 'Eve', recorder().handlers, memoryStore())
    await forged.connect()
    await flush()
    expect(forged.getView()).toMatchObject({ status: 'rejected', reason: 'invalid' })

    await guest('Asha')
    await guest('Ben')
    expect((await guest('Cara')).session.getView()).toMatchObject({ status: 'rejected', reason: 'full' })

    advance(INVITE_TTL_MS + 1)
    expect((await guest('Dev')).session.getView()).toMatchObject({ status: 'rejected', reason: 'expired' })
  })

  it('a fresh link replaces the old one and restarts the clock', async () => {
    const { host, guest, advance } = await setup()
    advance(INVITE_TTL_MS + 1)
    host.refreshInvite()
    // The old invite (captured in setup) no longer works.
    expect((await guest('Asha')).session.getView()).toMatchObject({ status: 'rejected', reason: 'invalid' })
  })

  it('frees a seat when a guest leaves the lobby', async () => {
    const { host, guest } = await setup()
    const a = await guest('Asha')
    a.session.leave()
    await flush()
    await flush()
    expect(host.getView().seats.find((s) => s.color === 'green')).toMatchObject({ joined: false, name: 'Friend 1' })
    expect((await guest('Ben')).session.getView().color).toBe('green')
  })

  it('reports an unreachable host', async () => {
    const network = new MemoryNetwork()
    const s = new GuestSession(network, { hostId: 'nobody', token: 't', expiresAt: 0 }, 'A', recorder().handlers, memoryStore())
    await s.connect()
    expect(s.getView().status).toBe('unreachable')
  })
})

describe('playing', () => {
  async function started() {
    const ctx = await setup()
    const a = await ctx.guest('Asha')
    const b = await ctx.guest('Ben')
    const initial = createGame(ctx.host.gameConfigs(), () => 0.5)
    ctx.host.startGame(initial)
    await flush()
    return { ...ctx, a, b, initial }
  }

  it('sends the game to every guest, then each action in order', async () => {
    const { host, a, b, initial } = await started()
    expect(a.log.syncs[0].initial).toEqual(initial)
    expect(b.session.getView().status).toBe('playing')
    host.announce({ type: 'roll', value: 6, actor: 'human' })
    host.announce({ type: 'move', tokenId: 0, actor: 'human' })
    await flush()
    expect(a.log.actions.map((x) => x.seq)).toEqual([0, 1])
    expect(b.log.actions[1].action).toEqual({ type: 'move', tokenId: 0, actor: 'human' })
  })

  it('refuses new players once the game has started', async () => {
    const ctx = await setup()
    await ctx.guest('Asha')
    ctx.host.startGame(createGame(ctx.host.gameConfigs(), () => 0.5))
    expect((await ctx.guest('Late')).session.getView()).toMatchObject({ status: 'rejected', reason: 'started' })
  })

  it('turns unclaimed online seats into bots at the start', async () => {
    const ctx = await setup()
    await ctx.guest('Asha')
    const configs = ctx.host.gameConfigs()
    expect(configs.find((c) => c.color === 'blue')).toEqual({ color: 'blue', kind: 'bot' })
    expect(configs.find((c) => c.color === 'green')).toEqual({ color: 'green', kind: 'human', remote: true, name: 'Asha' })
  })

  it('forwards intents tagged with the sender’s own seat only', async () => {
    const { host, a, b } = await started()
    const seen: string[] = []
    host.onIntent = (color, seq, intent) => seen.push(`${color}:${seq}:${intent.action}`)
    a.session.sendIntent(0, { action: 'roll' })
    b.session.sendIntent(4, { action: 'move', tokenId: 1 })
    await flush()
    expect(seen).toEqual(['green:0:roll', 'blue:4:move'])
  })

  it('lets a dropped guest reclaim the seat with its secret, after expiry and start', async () => {
    const { host, network, invite, a, advance } = await started()
    host.announce({ type: 'roll', value: 3, actor: 'human' })
    await flush()
    // The connection drops (no "leave"), like a closed laptop lid.
    ;(a.session as unknown as { channel: { close(): void } }).channel.close()
    await flush()
    await flush()
    expect(host.getView().seats.find((s) => s.color === 'green')).toMatchObject({ joined: true, connected: false })

    advance(INVITE_TTL_MS * 2)
    const { log, handlers } = recorder()
    const again = new GuestSession(network, invite, 'Asha', handlers, a.store)
    await again.connect()
    await flush()
    expect(again.getView()).toMatchObject({ status: 'playing', color: 'green' })
    expect(log.syncs[0].actions).toHaveLength(1)
  })

  it('a bot takeover closes the seat for good', async () => {
    const { host, a } = await started()
    host.announce({ type: 'takeover', color: 'green', bot: { persona: 'racer', weights: {} as never }, actor: 'human' })
    await flush()
    await flush()
    expect(host.getView().seats.find((s) => s.color === 'green')).toMatchObject({ kind: 'bot', remote: false })
    expect(a.session.getView().status).toBe('lost')
  })

  it('shares pause and resume, and a new game resets the action sequence', async () => {
    const { host, a, initial } = await started()
    host.setPaused(true)
    host.announce({ type: 'roll', value: 2, actor: 'human' })
    host.startGame(initial)
    host.announce({ type: 'roll', value: 5, actor: 'human' })
    await flush()
    expect(a.log.paused).toEqual([true])
    expect(a.log.syncs.map((s) => s.gameId)).toEqual([1, 2])
    expect(a.log.actions.map((x) => x.seq)).toEqual([0, 0])
  })

  it('ending the session tells every guest', async () => {
    const { host, a, b } = await started()
    host.end()
    await flush()
    expect(a.session.getView().status).toBe('ended')
    expect(b.session.getView().status).toBe('ended')
    expect(host.getView().ended).toBe(true)
  })
})
