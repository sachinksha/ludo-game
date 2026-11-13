/**
 * Wire protocol for online games. Every message is a small JSON object with a
 * `t` (type) field.
 *
 * The host is authoritative: guests only send *intents* ("I want to roll"),
 * and the host decides the outcome (including the dice value) and broadcasts
 * the resulting action. Guests replay those actions with the same engine, so
 * every screen shows the same game.
 *
 * Anything that arrives from another device is untrusted, so the host parses
 * guest messages strictly before acting on them.
 */
import { COLOR_ORDER } from '../game/board'
import { MAX_NAME_LENGTH, type Color, type GameAction, type GameState, type PlayerKind } from '../game/types'

/** Bumped whenever the message format changes incompatibly. */
export const PROTOCOL_VERSION = 1

/** A seat as shown in the lobby and on every guest's screen. */
export interface SeatView {
  color: Color
  kind: PlayerKind
  /** Played from another device. */
  remote: boolean
  name: string
  /** A guest has claimed this online seat. */
  joined: boolean
  /** The guest who claimed it is currently connected. */
  connected: boolean
}

/** Everything a guest needs to rebuild the game from scratch. */
export interface Snapshot {
  /** Increments for every new game in the same session, so stale actions are ignored. */
  gameId: number
  initial: GameState
  actions: GameAction[]
  paused: boolean
}

/** What a guest may ask the host to do on its turn. */
export type Intent = { action: 'roll' } | { action: 'move'; tokenId: number }

export type GuestMessage =
  | { t: 'hello'; v: number; token: string; name: string; secret?: string }
  /** `seq` is how many actions the guest has applied, so stale intents are dropped. */
  | ({ t: 'intent'; seq: number } & Intent)
  | { t: 'resync' }
  | { t: 'leave' }

export type RejectReason = 'invalid' | 'expired' | 'full' | 'started' | 'version'

export type HostMessage =
  | { t: 'welcome'; color: Color; secret: string }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'lobby'; seats: SeatView[]; expiresAt: number }
  | { t: 'sync'; snapshot: Snapshot }
  /** `seq` is the action's index in the game's action list. */
  | { t: 'action'; gameId: number; seq: number; action: GameAction }
  | { t: 'paused'; paused: boolean }
  | { t: 'ended' }

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isInt = (x: unknown, min: number, max: number): x is number => Number.isInteger(x) && (x as number) >= min && (x as number) <= max
const isShortString = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max

/**
 * Validates a message from a guest. Returns null for anything malformed, so
 * the host can ignore it. Only the fields listed here are kept.
 */
export function parseGuestMessage(raw: unknown): GuestMessage | null {
  if (!isObject(raw)) return null
  switch (raw.t) {
    case 'hello': {
      if (!isInt(raw.v, 0, 1000) || !isShortString(raw.token, 64) || !isShortString(raw.name, 64)) return null
      if (raw.secret !== undefined && !isShortString(raw.secret, 64)) return null
      return { t: 'hello', v: raw.v, token: raw.token, name: raw.name, ...(raw.secret ? { secret: raw.secret } : {}) }
    }
    case 'intent': {
      if (!isInt(raw.seq, 0, 1_000_000)) return null
      if (raw.action === 'roll') return { t: 'intent', seq: raw.seq, action: 'roll' }
      if (raw.action === 'move' && isInt(raw.tokenId, 0, 3)) return { t: 'intent', seq: raw.seq, action: 'move', tokenId: raw.tokenId }
      return null
    }
    case 'resync':
      return { t: 'resync' }
    case 'leave':
      return { t: 'leave' }
    default:
      return null
  }
}

/**
 * Light shape check for messages from the host. The host is the authority, so
 * guests trust its content; this only filters out junk.
 */
export function parseHostMessage(raw: unknown): HostMessage | null {
  if (!isObject(raw) || typeof raw.t !== 'string') return null
  const known = ['welcome', 'reject', 'lobby', 'sync', 'action', 'paused', 'ended']
  return known.includes(raw.t) ? (raw as unknown as HostMessage) : null
}

/**
 * Cleans a name typed by a guest: strips control characters, collapses spaces
 * and trims to the length limit. Returns '' when nothing usable is left.
 */
export function sanitizeName(raw: string): string {
  const printable = [...raw].filter((ch) => {
    const code = ch.charCodeAt(0)
    return code >= 0x20 && code !== 0x7f
  })
  return printable
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim()
}

/** True if `x` is one of the four colours. */
export function isColor(x: unknown): x is Color {
  return typeof x === 'string' && (COLOR_ORDER as readonly string[]).includes(x)
}
