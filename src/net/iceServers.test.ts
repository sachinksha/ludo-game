import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_STUN, ICE_ENDPOINT, hasRelay, loadIceServers, parseIceResponse } from './iceServers'

const turn = { urls: 'turn:relay.example:3478', username: 'u', credential: 'c' }

function respond(body: unknown, ok = true) {
  return vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response))
}

describe('parseIceResponse', () => {
  it('reads our endpoint shape and a bare array', () => {
    expect(parseIceResponse({ iceServers: [turn] })).toEqual([turn])
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

describe('loadIceServers', () => {
  it('adds relays from the endpoint', async () => {
    const fetchFn = respond({ iceServers: [turn] })
    const servers = await loadIceServers(fetchFn as unknown as typeof fetch)
    expect(fetchFn).toHaveBeenCalledWith(ICE_ENDPOINT, expect.anything())
    expect(servers).toEqual([...DEFAULT_STUN, turn])
    expect(hasRelay(servers)).toBe(true)
  })

  it('uses STUN only when the endpoint is missing or unconfigured', async () => {
    const missing = await loadIceServers(respond('<html>', false) as unknown as typeof fetch)
    const empty = await loadIceServers(respond({ iceServers: [] }) as unknown as typeof fetch)
    expect(missing).toEqual(DEFAULT_STUN)
    expect(empty).toEqual(DEFAULT_STUN)
    expect(hasRelay(empty)).toBe(false)
  })

  it('uses STUN only when the request fails', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new Error('offline')))
    expect(await loadIceServers(fetchFn as unknown as typeof fetch)).toEqual(DEFAULT_STUN)
  })
})
