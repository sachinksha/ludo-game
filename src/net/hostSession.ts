/**
 * The host side of an online game. Plain TypeScript with no React, so it can
 * be unit tested with an in-memory network.
 *
 * Responsibilities:
 *  - hand out online seats to guests who present a valid, unexpired invite;
 *  - let a guest who dropped out reclaim their seat with a private secret;
 *  - keep the authoritative action log and broadcast every new action;
 *  - forward guest intents (validated) to the game for the host to act on.
 *
 * UI code reads its state through subscribe/getView, which matches React's
 * useSyncExternalStore contract.
 */
import { displayNames } from '../game/engine'
import type { Color, GameAction, GameState, PlayerConfig } from '../game/types'
import { INVITE_TTL_MS, inviteUrl, randomToken } from './invite'
import {
  PROTOCOL_VERSION,
  parseGuestMessage,
  sanitizeName,
  type HostMessage,
  type Intent,
  type RejectReason,
  type SeatView,
  type Snapshot,
} from './protocol'
import type { Channel, HostEndpoint } from './transport'

/** A guest must say hello this soon after connecting, or is dropped. */
export const HELLO_TIMEOUT_MS = 10_000

interface Seat {
  color: Color
  kind: PlayerConfig['kind']
  remote: boolean
  name: string
  /** Lets a guest who disconnected reclaim this seat. Null until claimed. */
  secret: string | null
  channel: Channel | null
}

export interface HostView {
  seats: SeatView[]
  inviteUrl: string
  expiresAt: number
  /** A game has started; new players can no longer join with the invite. */
  started: boolean
  ended: boolean
}

export interface HostOptions {
  /** Page URL without fragment, used to build the invite link. */
  baseUrl: string
  now?: () => number
  token?: () => string
}

export class HostSession {
  private readonly seats: Seat[]
  private token: string
  private expiresAt: number
  private snapshot: Snapshot | null = null
  private ended = false
  private view: HostView
  private readonly listeners = new Set<() => void>()
  private readonly now: () => number
  private readonly newToken: () => string
  private readonly endpoint: HostEndpoint
  private readonly options: HostOptions

  /** Called when a connected guest asks to roll or move for its seat. */
  onIntent: ((color: Color, seq: number, intent: Intent) => void) | null = null

  constructor(endpoint: HostEndpoint, configs: PlayerConfig[], options: HostOptions) {
    this.endpoint = endpoint
    this.options = options
    this.now = options.now ?? Date.now
    this.newToken = options.token ?? (() => randomToken())
    const names = displayNames(configs)
    this.seats = configs.map((c, i) => ({
      color: c.color,
      kind: c.kind,
      remote: c.kind === 'human' && c.remote === true,
      name: names[i],
      secret: null,
      channel: null,
    }))
    this.token = this.newToken()
    this.expiresAt = this.now() + INVITE_TTL_MS
    this.view = this.buildView()
    endpoint.onConnect((channel) => this.accept(channel))
  }

  // ----- Reading state (useSyncExternalStore contract) -----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getView = (): HostView => this.view

  // ----- Host commands -----

  /** Issues a fresh token and restarts the expiry clock. Old links stop working. */
  refreshInvite(): void {
    this.token = this.newToken()
    this.expiresAt = this.now() + INVITE_TTL_MS
    this.changed()
  }

  /** True when every online seat has a guest. */
  allJoined(): boolean {
    return this.seats.every((s) => !s.remote || s.secret !== null)
  }

  /**
   * Seats for createGame. Online seats nobody claimed become bots, and claimed
   * seats carry the guest's name.
   */
  gameConfigs(): PlayerConfig[] {
    for (const s of this.seats) {
      if (s.remote && s.secret === null) {
        s.kind = 'bot'
        s.remote = false
      }
    }
    this.changed()
    return this.seats.map((s) =>
      s.remote ? { color: s.color, kind: 'human', remote: true, name: s.name } : { color: s.color, kind: s.kind, ...(s.kind === 'human' ? { name: s.name } : {}) },
    )
  }

  /** Starts (or restarts) a game and sends it to every guest. */
  startGame(initial: GameState, paused = false): void {
    // Seat names follow the game, which is the source of truth once it exists.
    for (const p of initial.players) {
      const seat = this.seats.find((s) => s.color === p.color)
      if (seat) seat.name = p.name
    }
    this.snapshot = { gameId: (this.snapshot?.gameId ?? 0) + 1, initial, actions: [], paused }
    this.broadcast({ t: 'sync', snapshot: this.snapshot })
    this.changed()
  }

  /** Records an action decided by the host and sends it to every guest. */
  announce(action: GameAction): void {
    if (!this.snapshot) return
    const seq = this.snapshot.actions.length
    this.snapshot = { ...this.snapshot, actions: [...this.snapshot.actions, action] }
    if (action.type === 'takeover') {
      const seat = this.seats.find((s) => s.color === action.color)
      if (seat) {
        seat.kind = 'bot'
        seat.remote = false
        seat.channel?.close()
        seat.channel = null
        seat.secret = null
        this.changed()
      }
    }
    this.broadcast({ t: 'action', gameId: this.snapshot.gameId, seq, action })
  }

  setPaused(paused: boolean): void {
    if (!this.snapshot || this.snapshot.paused === paused) return
    this.snapshot = { ...this.snapshot, paused }
    this.broadcast({ t: 'paused', paused })
  }

  /** Ends the session for everyone and closes the host endpoint. */
  end(): void {
    if (this.ended) return
    this.broadcast({ t: 'ended' })
    for (const s of this.seats) {
      s.channel?.close()
      s.channel = null
    }
    this.endpoint.close()
    this.ended = true
    this.changed()
  }

  // ----- Connections -----

  private accept(channel: Channel): void {
    let seat: Seat | null = null
    const timer = setTimeout(() => {
      if (!seat) channel.close()
    }, HELLO_TIMEOUT_MS)

    channel.onMessage((raw) => {
      const msg = parseGuestMessage(raw)
      if (!msg) return
      if (!seat) {
        if (msg.t !== 'hello') return
        const result = this.admit(msg.v, msg.token, msg.name, msg.secret)
        if (typeof result === 'string') {
          channel.send({ t: 'reject', reason: result } satisfies HostMessage)
          clearTimeout(timer)
          // Give the message a moment to flush before hanging up.
          setTimeout(() => channel.close(), 200)
          return
        }
        clearTimeout(timer)
        seat = result
        seat.channel?.close() // an older connection for this seat, if any
        seat.channel = channel
        channel.send({ t: 'welcome', color: seat.color, secret: seat.secret! } satisfies HostMessage)
        if (this.snapshot) channel.send({ t: 'sync', snapshot: this.snapshot } satisfies HostMessage)
        this.changed()
        return
      }
      if (seat.channel !== channel) return
      if (msg.t === 'intent') {
        const { t: _t, seq, ...intent } = msg
        this.onIntent?.(seat.color, seq, intent)
      } else if (msg.t === 'resync' && this.snapshot) {
        channel.send({ t: 'sync', snapshot: this.snapshot } satisfies HostMessage)
      } else if (msg.t === 'leave') {
        this.release(seat, channel)
      }
    })

    channel.onClose(() => {
      clearTimeout(timer)
      if (seat) this.release(seat, channel)
    })
  }

  /** Decides whether a hello earns a seat. Returns the seat, or why not. */
  private admit(version: number, token: string, name: string, secret?: string): Seat | RejectReason {
    if (this.ended) return 'invalid'
    if (version !== PROTOCOL_VERSION) return 'version'
    // A returning guest: the secret alone is enough, even after expiry or start.
    if (secret) {
      const seat = this.seats.find((s) => s.remote && s.secret === secret)
      if (seat) return seat
    }
    if (token !== this.token) return 'invalid'
    if (this.now() > this.expiresAt) return 'expired'
    if (this.snapshot) return 'started'
    const seat = this.seats.find((s) => s.remote && s.secret === null)
    if (!seat) return 'full'
    seat.secret = randomToken()
    seat.name = this.uniqueName(sanitizeName(name), seat)
    return seat
  }

  /** A guest left or dropped. Before the game starts, the seat opens up again. */
  private release(seat: Seat, channel: Channel): void {
    if (seat.channel !== channel) return
    seat.channel = null
    if (!this.snapshot && seat.remote) {
      seat.secret = null
      seat.name = displayNames(this.seats.map((s) => ({ color: s.color, kind: s.kind, remote: s.remote })))[this.seats.indexOf(seat)]
    }
    this.changed()
  }

  /** The guest's name, or a default, made unique among the seats. */
  private uniqueName(name: string, seat: Seat): string {
    const base = name || seat.name
    const taken = new Set(this.seats.filter((s) => s !== seat).map((s) => s.name.toLowerCase()))
    if (!taken.has(base.toLowerCase())) return base
    for (let n = 2; ; n++) {
      const suffix = ` ${n}`
      const candidate = base.slice(0, 12 - suffix.length) + suffix
      if (!taken.has(candidate.toLowerCase())) return candidate
    }
  }

  private broadcast(message: HostMessage): void {
    for (const s of this.seats) s.channel?.send(message)
  }

  private buildView(): HostView {
    return {
      seats: this.seats.map((s) => ({
        color: s.color,
        kind: s.kind,
        remote: s.remote,
        name: s.name,
        joined: s.secret !== null,
        connected: s.channel !== null,
      })),
      inviteUrl: inviteUrl(this.options.baseUrl, { hostId: this.endpoint.id, token: this.token, expiresAt: this.expiresAt }),
      expiresAt: this.expiresAt,
      started: this.snapshot !== null,
      ended: this.ended,
    }
  }

  /** Rebuilds the immutable view, tells guests about the lobby, and notifies the UI. */
  private changed(): void {
    this.view = this.buildView()
    if (!this.snapshot && !this.ended) this.broadcast({ t: 'lobby', seats: this.view.seats, expiresAt: this.expiresAt })
    this.listeners.forEach((l) => l())
  }
}
