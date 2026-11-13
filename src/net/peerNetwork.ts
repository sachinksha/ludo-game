/**
 * The production Network: browser-to-browser WebRTC data channels via PeerJS.
 *
 * - Signalling (exchanging connection details) uses the free public PeerJS
 *   server, 0.peerjs.com. It only introduces the two browsers; game messages
 *   never pass through it.
 * - NAT traversal uses Google's public STUN servers plus a TURN relay from
 *   /api/turn if one is configured (see iceServers.ts). Without TURN, players on mobile data or
 *   strict networks often cannot connect.
 *
 * None of these cost anything or need an account, but they are best-effort
 * public services with no uptime guarantee.
 *
 * PeerJS is loaded with a dynamic import, so people who only play locally never
 * download it (Vite splits it into its own chunk).
 */
import type { DataConnection, Peer as PeerType } from 'peerjs'
import type { Channel, HostEndpoint, Network } from './transport'
import { hasRelay, loadIceServers } from './iceServers'

/** Give up connecting to a host after this long. */
const CONNECT_TIMEOUT_MS = 15_000

let warned = false

/** Loads PeerJS and creates a Peer with our ICE servers. */
async function createPeer(): Promise<PeerType> {
  const [{ Peer }, iceServers] = await Promise.all([import('peerjs'), loadIceServers()])
  if (!hasRelay(iceServers) && !warned) {
    warned = true
    console.warn(
      '[ludo] No TURN relay configured. Online play may fail between different networks ' +
        '(for example mobile data and Wi-Fi). Set TURN_CREDENTIALS_URL; see api/turn.ts.',
    )
  }
  return new Peer({ config: { iceServers } })
}

function wrap(conn: DataConnection, onClosed?: () => void): Channel {
  const closeHandlers: (() => void)[] = []
  let closed = false
  const fireClose = () => {
    if (closed) return
    closed = true
    closeHandlers.forEach((h) => h())
    onClosed?.()
  }
  conn.on('close', fireClose)
  conn.on('error', fireClose)
  return {
    send: (message) => {
      if (!closed && conn.open) void conn.send(message)
    },
    close: () => {
      conn.close()
      fireClose()
    },
    onMessage: (handler) => conn.on('data', handler),
    onClose: (handler) => closeHandlers.push(handler),
  }
}

/** Resolves once the peer is registered with the signalling server. */
function whenOpen(peer: PeerType): Promise<string> {
  return new Promise((resolve, reject) => {
    peer.once('open', resolve)
    peer.once('error', reject)
  })
}

export const peerNetwork: Network = {
  async host(): Promise<HostEndpoint> {
    const peer = await createPeer()
    const id = await whenOpen(peer)
    // If the signalling link drops, existing games keep working (they are
    // direct), but new guests could not find us. Reconnect quietly.
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect()
    })
    let handler: (ch: Channel) => void = () => {}
    peer.on('connection', (conn) => {
      conn.on('open', () => handler(wrap(conn)))
    })
    return {
      id,
      onConnect: (h) => {
        handler = h
      },
      close: () => peer.destroy(),
    }
  },

  async join(hostId: string): Promise<Channel> {
    const peer = await createPeer()
    try {
      await whenOpen(peer)
    } catch {
      peer.destroy()
      throw new Error('unreachable')
    }
    return new Promise<Channel>((resolve, reject) => {
      const fail = () => {
        peer.destroy()
        reject(new Error('unreachable'))
      }
      const timer = setTimeout(fail, CONNECT_TIMEOUT_MS)
      peer.on('error', () => {
        clearTimeout(timer)
        fail()
      })
      const conn = peer.connect(hostId, { reliable: true, serialization: 'json' })
      conn.on('open', () => {
        clearTimeout(timer)
        // The guest owns its Peer, so tear it down with the channel.
        resolve(wrap(conn, () => peer.destroy()))
      })
    })
  },
}
