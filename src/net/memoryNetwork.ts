/**
 * An in-memory Network for tests: hosts and guests in the same process,
 * connected by queues instead of WebRTC. Messages are JSON round-tripped, like
 * on the wire, so tests catch anything that would not survive serialisation.
 * Delivery is asynchronous (a microtask), like a real network.
 */
import type { Channel, HostEndpoint, Network } from './transport'

class MemoryChannel implements Channel {
  peer: MemoryChannel | null = null
  private messageHandlers: ((m: unknown) => void)[] = []
  private closeHandlers: (() => void)[] = []
  closed = false

  send(message: unknown): void {
    if (this.closed || !this.peer) return
    const peer = this.peer
    const copy = JSON.parse(JSON.stringify(message)) as unknown
    queueMicrotask(() => {
      if (!peer.closed) peer.messageHandlers.forEach((h) => h(copy))
    })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.closeHandlers.forEach((h) => h())
    const peer = this.peer
    if (peer && !peer.closed) queueMicrotask(() => peer.close())
  }

  onMessage(handler: (m: unknown) => void): void {
    this.messageHandlers.push(handler)
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler)
  }
}

export class MemoryNetwork implements Network {
  private readonly hosts = new Map<string, (ch: Channel) => void>()
  private next = 1

  async host(): Promise<HostEndpoint> {
    const id = `host-${this.next++}`
    let handler: (ch: Channel) => void = () => {}
    this.hosts.set(id, (ch) => handler(ch))
    return {
      id,
      onConnect: (h) => {
        handler = h
      },
      close: () => {
        this.hosts.delete(id)
      },
    }
  }

  async join(hostId: string): Promise<Channel> {
    const accept = this.hosts.get(hostId)
    if (!accept) throw new Error('unreachable')
    const guest = new MemoryChannel()
    const host = new MemoryChannel()
    guest.peer = host
    host.peer = guest
    accept(host)
    return guest
  }
}
