/**
 * Invite links. A link carries the host's peer id, a random one-time token and
 * an expiry time, all in the URL fragment (after #), which browsers never send
 * to the web server. The host checks the token and the expiry itself, so the
 * values in the link are for display only and cannot be forged into access.
 */

/** How long an invite link stays valid for joining. */
export const INVITE_TTL_MS = 5 * 60_000

export interface Invite {
  hostId: string
  token: string
  /** Epoch milliseconds after which the host refuses new players with this token. */
  expiresAt: number
}

/** A random URL-safe string from the cryptographic generator. */
export function randomToken(bytes = 16): string {
  const buf = new Uint8Array(bytes)
  globalThis.crypto.getRandomValues(buf)
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The full link to share. `base` is the page URL without a fragment. */
export function inviteUrl(base: string, invite: Invite): string {
  const params = new URLSearchParams({ join: invite.hostId, k: invite.token, exp: String(invite.expiresAt) })
  return `${base}#${params.toString()}`
}

/** Reads an invite from a URL fragment such as "#join=...&k=...&exp=...", or null. */
export function parseInvite(hash: string): Invite | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const hostId = params.get('join')
  const token = params.get('k')
  const expiresAt = Number(params.get('exp'))
  if (!hostId || !token || !Number.isFinite(expiresAt)) return null
  if (hostId.length > 128 || token.length > 64) return null
  return { hostId, token, expiresAt }
}

/** "4:05" style countdown for the time left, never negative. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
