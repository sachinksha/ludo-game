import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_STUN, hasRelay, loadIceServers, parseIceResponse, staticTurn } from './iceServers'

const turn = { urls: 'turn:relay.example:3478', username: 'u', credential: 'c' }

function okResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}

describe('parseIceResponse', () => {
  it('reads a bare array (Metered)', () => {
    expect(parseIceResponse([turn])).toEqual([turn])
  })

  it('reads { iceServers: object } (Cloudflare)', () => {
    expect(parseIceResponse({ iceServers: { urls: ['turn:a', 'stun:b'], username: 'x', credential: 'y' } })).toEqual([
      { urls: ['turn:a', 'stun:b'], username: 'x', credential: 'y' },
    ])
  })

  it('drops invalid entries and unknown fields', () => {
    expect(parseIceResponse([{ urls: 5 }, null, { urls: [] }, { ...turn, extra: 1 }])).toEqual([turn])
    expect(parseIceResponse('nope')).toEqual([])
  })
})

describe('staticTurn', () => {
  it('builds one server from comma-separated turn URLs', () => {
    expect(
      staticTurn({ VITE_TURN_URLS: 'turn:a:80, turns:a:443 ,http://bad', VITE_TURN_USERNAME: 'u', VITE_TURN_CREDENTIAL: 'c' }),
    ).toEqual([{ urls: ['turn:a:80', 'turns:a:443'], username: 'u', credential: 'c' }])
  })

  it('is empty when not configured', () => {
    expect(staticTurn({})).toEqual([])
  })
})

describe('loadIceServers', () => {
  it('uses STUN only with no configuration', async () => {
    const servers = await loadIceServers({}, vi.fn())
    expect(servers).toEqual(DEFAULT_STUN)
    expect(hasRelay(servers)).toBe(false)
  })

  it('adds servers from the credentials URL', async () => {
    const fetchFn = vi.fn(() => okResponse([turn]))
    const servers = await loadIceServers({ VITE_ICE_SERVERS_URL: 'https://x/creds' }, fetchFn as unknown as typeof fetch)
    expect(fetchFn).toHaveBeenCalledWith('https://x/creds', expect.anything())
    expect(servers).toEqual([...DEFAULT_STUN, turn])
    expect(hasRelay(servers)).toBe(true)
  })

  it('falls back to STUN when the credentials URL fails', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new Error('offline')))
    const servers = await loadIceServers({ VITE_ICE_SERVERS_URL: 'https://x' }, fetchFn as unknown as typeof fetch)
    expect(servers).toEqual(DEFAULT_STUN)
  })
})
