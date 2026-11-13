/**
 * The transport seam. The session logic (host and guest) talks only to these
 * interfaces, never to WebRTC directly. Production plugs in PeerJS
 * (peerNetwork.ts); tests plug in an in-memory network (memoryNetwork.ts).
 * This is the "ports and adapters" pattern: swap the adapter, keep the logic.
 */

/** A two-way, ordered, reliable message pipe to one other device. */
export interface Channel {
  send(message: unknown): void
  close(): void
  onMessage(handler: (message: unknown) => void): void
  onClose(handler: () => void): void
}

/** A host that guests can connect to by its id. */
export interface HostEndpoint {
  /** Public id that goes into the invite link. */
  readonly id: string
  onConnect(handler: (channel: Channel) => void): void
  close(): void
}

export interface Network {
  /** Opens a host endpoint and resolves once it has an id. */
  host(): Promise<HostEndpoint>
  /** Connects to a host by id. Rejects with Error('unreachable') if it cannot be found. */
  join(hostId: string): Promise<Channel>
}
