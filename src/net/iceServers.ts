/**
 * ICE servers: how two browsers find a network path to each other.
 *
 * - STUN tells a browser its public address. Enough when at least one side
 *   has a friendly NAT (home Wi-Fi to home Wi-Fi often works).
 * - TURN relays traffic when no direct path exists. Mobile data (carrier-grade
 *   NAT), many offices and some routers need it. Without TURN, a phone on 4G/5G
 *   usually cannot reach a laptop on Wi-Fi.
 *
 * PeerJS used to ship a free TURN relay (turn.peerjs.com), but its hostnames no
 * longer resolve, so TURN is configured at build time instead. Free options:
 *
 *   VITE_ICE_SERVERS_URL   URL returning ICE servers as JSON, fetched when a
 *                          player hosts or joins. Metered's free TURN plan gives
 *                          one: https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>
 *                          Accepts `[...]` or `{ iceServers: [...] | {...} }`.
 *   VITE_TURN_URLS         Static alternative: comma-separated turn:/turns: URLs,
 *   VITE_TURN_USERNAME     with their username
 *   VITE_TURN_CREDENTIAL   and credential.
 *
 * Anything set with VITE_ is compiled into the public bundle, so use TURN
 * credentials meant for browsers (scoped or rate-limited), never a master secret.
 */

export const DEFAULT_STUN: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

/** Give up on the credentials URL after this long and continue with STUN only. */
export const ICE_FETCH_TIMEOUT_MS = 4000

export interface IceEnv {
  VITE_ICE_SERVERS_URL?: string
  VITE_TURN_URLS?: string
  VITE_TURN_USERNAME?: string
  VITE_TURN_CREDENTIAL?: string
}

function isIceServer(value: unknown): value is RTCIceServer {
  if (typeof value !== 'object' || value === null) return false
  const { urls, username, credential } = value as Record<string, unknown>
  const urlsOk =
    typeof urls === 'string' || (Array.isArray(urls) && urls.length > 0 && urls.every((u) => typeof u === 'string'))
  return urlsOk && (username === undefined || typeof username === 'string') &&
    (credential === undefined || typeof credential === 'string')
}

/**
 * Reads ICE servers from a provider's JSON response. Handles Metered's bare
 * array and Cloudflare's `{ iceServers: {...} }`. Invalid entries are dropped.
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

/** TURN servers given directly in environment variables. */
export function staticTurn(env: IceEnv): RTCIceServer[] {
  const urls = (env.VITE_TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^turns?:/.test(u))
  if (urls.length === 0) return []
  return [{ urls, username: env.VITE_TURN_USERNAME ?? '', credential: env.VITE_TURN_CREDENTIAL ?? '' }]
}

/** True when any server can relay (a turn: or turns: URL). */
export function hasRelay(servers: RTCIceServer[]): boolean {
  return servers.some((s) => [s.urls].flat().some((u) => /^turns?:/.test(u)))
}

/**
 * Builds the ICE server list. Never rejects: if the credentials URL fails or
 * is slow, play continues with STUN (and any static TURN), which still works
 * on many networks.
 */
export async function loadIceServers(
  env: IceEnv = import.meta.env as IceEnv,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): Promise<RTCIceServer[]> {
  const servers = [...DEFAULT_STUN, ...staticTurn(env)]
  const url = env.VITE_ICE_SERVERS_URL?.trim()
  if (!url) return servers
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ICE_FETCH_TIMEOUT_MS)
  try {
    const res = await fetchFn(url, { signal: controller.signal })
    if (res.ok) servers.push(...parseIceResponse(await res.json()))
  } catch {
    // Fall through with what we have.
  } finally {
    clearTimeout(timer)
  }
  return servers
}
