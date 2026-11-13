import { describe, expect, it, vi } from 'vitest'
import { iceServersFromEnv } from './turn.ts'

function respond(body: unknown, ok = true) {
  return vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response))
}

describe('iceServersFromEnv', () => {
  it('returns nothing when unconfigured', async () => {
    expect(await iceServersFromEnv({}, vi.fn())).toEqual([])
  })

  it('builds static credentials from TURN_URLS', async () => {
    expect(
      await iceServersFromEnv({ TURN_URLS: 'turn:a:80, turns:a:443 ,http://bad', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'c' }),
    ).toEqual([{ urls: ['turn:a:80', 'turns:a:443'], username: 'u', credential: 'c' }])
  })

  it('fetches from the provider URL and unwraps both response shapes', async () => {
    const relay = { urls: 'turn:r', username: 'u', credential: 'c' }
    const metered = respond([relay])
    expect(await iceServersFromEnv({ TURN_CREDENTIALS_URL: 'https://p/x?apiKey=k' }, metered as unknown as typeof fetch))
      .toEqual([relay])
    expect(metered).toHaveBeenCalledWith('https://p/x?apiKey=k', expect.anything())
    const cloudflare = respond({ iceServers: relay })
    expect(await iceServersFromEnv({ TURN_CREDENTIALS_URL: 'https://p' }, cloudflare as unknown as typeof fetch))
      .toEqual([relay])
  })

  it('swallows provider failures', async () => {
    const down = vi.fn(() => Promise.reject(new Error('boom')))
    expect(await iceServersFromEnv({ TURN_CREDENTIALS_URL: 'https://p' }, down as unknown as typeof fetch)).toEqual([])
    expect(await iceServersFromEnv({ TURN_CREDENTIALS_URL: 'https://p' }, respond({}, false) as unknown as typeof fetch))
      .toEqual([])
  })
})
