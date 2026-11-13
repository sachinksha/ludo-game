/**
 * The guest side of an online game. Plain TypeScript with no React.
 *
 * A guest never decides anything about the game. It sends intents for its own
 * seat and replays the actions the host broadcasts. It keeps a private seat
 * secret (in sessionStorage) so a page refresh or dropped connection can
 * reclaim the same seat.
 */
import type { Color, GameAction } from '../game/types'
import type { Invite } from './invite'
import {
  PROTOCOL_VERSION,
  parseHostMessage,
  type GuestMessage,
  type Intent,
  type RejectReason,
  type SeatView,
  type Snapshot,
} from './protocol'
import type { Channel, Network } from './transport'

export type GuestStatus =
  /** Opening the connection and waiting for the host's answer. */
  | 'connecting'
  /** Seated, waiting for the host to start. */
  | 'lobby'
  /** A game is in progress (or just finished). */
  | 'playing'
  /** The host said no. See `reason`. */
  | 'rejected'
  /** The host could not be reached at all. */
  | 'unreachable'
  /** The connection dropped after joining. Reconnecting is possible. */
  | 'lost'
  /** The host ended the session. */
  | 'ended'

export interface GuestView {
  status: GuestStatus
  color: Color | null
  seats: SeatView[]
  expiresAt: number
  reason: RejectReason | null
}

/** Minimal storage interface, so tests can pass a Map-backed fake. */
export interface SeatStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface GuestHandlers {
  /** A full game state arrived (first start, new game, or after a resync). */
  onSync(snapshot: Snapshot): void
  /** One new action arrived, in order. */
  onAction(action: GameAction, seq: number, gameId: number): void
  onPaused(paused: boolean): void
}

const seatKey = (hostId: string) => `ludo:seat:${hostId}`

export class GuestSession {
  private channel: Channel | null = null
  private view: GuestView
  private readonly listeners = new Set<() => void>()
  private gameId = 0
  private readonly network: Network
  readonly invite: Invite
  private readonly name: string
  private readonly handlers: GuestHandlers
  private readonly store: SeatStore

  constructor(network: Network, invite: Invite, name: string, handlers: GuestHandlers, store: SeatStore) {
    this.network = network
    this.invite = invite
    this.name = name
    this.handlers = handlers
    this.store = store
    this.view = { status: 'connecting', color: null, seats: [], expiresAt: invite.expiresAt, reason: null }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getView = (): GuestView => this.view

  /** The game currently being played, for ignoring stale actions. */
  get currentGameId(): number {
    return this.gameId
  }

  /** Connects (or reconnects) to the host and says hello. */
  async connect(): Promise<void> {
    this.update({ status: 'connecting', reason: null })
    let channel: Channel
    try {
      channel = await this.network.join(this.invite.hostId)
    } catch {
      this.update({ status: 'unreachable' })
      return
    }
    this.channel = channel
    channel.onMessage((raw) => this.receive(channel, raw))
    channel.onClose(() => {
      if (this.channel !== channel) return
      this.channel = null
      if (this.view.status === 'lobby' || this.view.status === 'playing' || this.view.status === 'connecting') {
        this.update({ status: 'lost' })
      }
    })
    const secret = this.store.getItem(seatKey(this.invite.hostId)) ?? undefined
    this.send({ t: 'hello', v: PROTOCOL_VERSION, token: this.invite.token, name: this.name, ...(secret ? { secret } : {}) })
  }

  /** Asks the host to roll or move. `seq` is the number of actions applied locally. */
  sendIntent(seq: number, intent: Intent): void {
    this.send({ t: 'intent', seq, ...intent })
  }

  /** Asks for a full snapshot, after noticing a gap in the action sequence. */
  requestResync(): void {
    this.send({ t: 'resync' })
  }

  /** Leaves for good: tells the host and forgets the seat secret. */
  leave(): void {
    this.send({ t: 'leave' })
    this.store.removeItem(seatKey(this.invite.hostId))
    const ch = this.channel
    this.channel = null
    ch?.close()
  }

  private send(message: GuestMessage): void {
    this.channel?.send(message)
  }

  private receive(channel: Channel, raw: unknown): void {
    if (this.channel !== channel) return
    const msg = parseHostMessage(raw)
    if (!msg) return
    switch (msg.t) {
      case 'welcome':
        this.store.setItem(seatKey(this.invite.hostId), msg.secret)
        this.update({ status: this.view.status === 'playing' ? 'playing' : 'lobby', color: msg.color })
        return
      case 'reject':
        // A stale secret (seat taken over or session restarted) is worthless now.
        this.store.removeItem(seatKey(this.invite.hostId))
        this.update({ status: 'rejected', reason: msg.reason })
        return
      case 'lobby':
        this.update({ seats: msg.seats, expiresAt: msg.expiresAt })
        return
      case 'sync':
        this.gameId = msg.snapshot.gameId
        this.update({ status: 'playing' })
        this.handlers.onSync(msg.snapshot)
        return
      case 'action':
        if (msg.gameId !== this.gameId) return
        this.handlers.onAction(msg.action, msg.seq, msg.gameId)
        return
      case 'paused':
        this.handlers.onPaused(msg.paused)
        return
      case 'ended':
        this.store.removeItem(seatKey(this.invite.hostId))
        this.update({ status: 'ended' })
        return
    }
  }

  private update(patch: Partial<GuestView>): void {
    this.view = { ...this.view, ...patch }
    this.listeners.forEach((l) => l())
  }
}
