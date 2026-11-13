/**
 * GET /api/turn: returns ICE servers (STUN/TURN) for online play.
 *
 * A Vercel serverless function (free tier). It exists so the TURN provider's
 * API key stays a private server-side environment variable instead of being
 * compiled into the public JavaScript bundle.
 *
 * Configure ONE of these in Vercel (Project → Settings → Environment
 * Variables), or in .env.local for `npm run dev`:
 *
 *   TURN_CREDENTIALS_URL   A provider URL that returns ICE servers as JSON, for
 *                          example Metered's
 *                          https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>
 *   TURN_URLS              Or static credentials: comma-separated turn:/turns: URLs,
 *   TURN_USERNAME          with their username
 *   TURN_CREDENTIAL        and credential.
 *
 * What this does and does not protect: the provider key never reaches the
 * browser. The relay username and password still do (WebRTC runs in the
 * browser and needs them), and anyone can call this endpoint. This is the
 * place to add rate limiting or origin checks later.
 *
 * Self-contained on purpose (no imports), so it runs on Vercel without any
 * bundling. The Vite dev server reuses `iceServersFromEnv` (see vite.config.ts).
 * The browser validates the response again (src/net/iceServers.ts).
 */

export interface TurnEnv {
  TURN_CREDENTIALS_URL?: string
  TURN_URLS?: string
  TURN_USERNAME?: string
  TURN_CREDENTIAL?: string
}

/** Give up on the provider after this long. */
const UPSTREAM_TIMEOUT_MS = 4000

/** Unwraps Metered's bare array or Cloudflare's `{ iceServers: {...} }` into a list. */
function toList(body: unknown): unknown[] {
  const list =
    typeof body === 'object' && body !== null && !Array.isArray(body) && 'iceServers' in body
      ? (body as { iceServers: unknown }).iceServers
      : body
  return Array.isArray(list) ? list : list ? [list] : []
}

function staticTurn(env: TurnEnv): unknown[] {
  const urls = (env.TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^turns?:/.test(u))
  if (urls.length === 0) return []
  return [{ urls, username: env.TURN_USERNAME ?? '', credential: env.TURN_CREDENTIAL ?? '' }]
}

/** Builds the relay list from environment variables. Never throws. */
export async function iceServersFromEnv(env: TurnEnv, fetchFn: typeof fetch = fetch): Promise<unknown[]> {
  const servers = staticTurn(env)
  const url = env.TURN_CREDENTIALS_URL?.trim()
  if (!url) return servers
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
    if (res.ok) servers.push(...toList(await res.json()))
  } catch {
    // Provider down or slow: return what we have. Never leak upstream details.
  }
  return servers
}

export async function GET(): Promise<Response> {
  const iceServers = await iceServersFromEnv(process.env)
  return Response.json(
    { iceServers },
    // Per-browser cache: credentials are per deployment, and a short cache
    // spares the provider when someone hosts several games in a row.
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  )
}
