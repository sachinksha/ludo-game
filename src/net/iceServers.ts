/**
 * ICE servers: how two browsers find a network path to each other.
 *
 * - STUN tells a browser its public address. Enough when at least one side
 *   has a friendly NAT (two browsers on one machine, often one Wi-Fi).
 * - TURN relays traffic when no direct path exists. Mobile data (carrier-grade
 *   NAT), many offices and some routers need it. Without TURN, a phone on 4G/5G
 *   usually cannot reach a laptop on Wi-Fi.
 *
 * PeerJS used to ship a free TURN relay (turn.peerjs.com), but its hostnames no
 * longer resolve. TURN credentials now come from our own endpoint, /api/turn
 * (api/turn.ts), which keeps the provider's API key on the server. If the
 * endpoint is missing (a static host without functions), unconfigured or slow,
 * play continues with STUN only.
 */

export const DEFAULT_STUN: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

/** Same-origin endpoint served by api/turn.ts (and by the Vite dev server). */
export const ICE_ENDPOINT = '/api/turn'

/** Give up on the endpoint after this long and continue with STUN only. */
export const ICE_FETCH_TIMEOUT_MS = 5000

function isIceServer(value: unknown): value is RTCIceServer {
  if (typeof value !== 'object' || value === null) return false
  const { urls, username, credential } = value as Record<string, unknown>
  const urlsOk =
    typeof urls === 'string' || (Array.isArray(urls) && urls.length > 0 && urls.every((u) => typeof u === 'string'))
  return urlsOk && (username === undefined || typeof username === 'string') &&
    (credential === undefined || typeof credential === 'string')
}

/**
 * Reads ICE servers from a JSON response: `[...]` or `{ iceServers: [...] | {...} }`.
 * Invalid entries are dropped and unknown fields removed. Treat the response
 * as untrusted input, even from our own endpoint.
 */
export function parseIceResponse(body: unknown): RTCIceServer[] {
  let list: unknown = body
  if (typeof body === 'object' && body !== null && !Array.isArray(body) && 'iceServers' in body) {
    list = (body as { iceServers: unknown }).iceServers
  }
  if (!Array.isArray(list)) list = [list]
  return (list as unknown[]).filter(isIceServer).map(({ urls, username, credential }) => ({
    urls,
    ...(username !== undefined && { username }),
    ...(credential !== undefined && { credential }),
  }))
}

/** True when any server can relay (a turn: or turns: URL). */
export function hasRelay(servers: RTCIceServer[]): boolean {
  return servers.some((s) => [s.urls].flat().some((u) => /^turns?:/.test(u)))
}

/** Builds the ICE server list. Never rejects. */
export async function loadIceServers(
  fetchFn: typeof fetch = (...args) => fetch(...args),
  endpoint: string = ICE_ENDPOINT,
): Promise<RTCIceServer[]> {
  const servers = [...DEFAULT_STUN]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ICE_FETCH_TIMEOUT_MS)
  try {
    const res = await fetchFn(endpoint, { signal: controller.signal })
    if (res.ok) servers.push(...parseIceResponse(await res.json()))
  } catch {
    // No endpoint (static host), offline, or not JSON: STUN only.
  } finally {
    clearTimeout(timer)
  }
  return servers
}
