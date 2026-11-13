import { useState } from 'react'
import { useHostView } from '../hooks/useOnline'
import { useNow } from '../hooks/useNow'
import { formatRemaining } from '../net/invite'
import { useOnlineStore } from '../store/onlineStore'
import { SeatList } from './SeatList'

/** The host's waiting room: share the link, watch friends join, then start. */
export function HostLobby() {
  const view = useHostView()
  const connecting = useOnlineStore((s) => s.connecting)
  const host = useOnlineStore((s) => s.host)
  const startHostedGame = useOnlineStore((s) => s.startHostedGame)
  const leave = useOnlineStore((s) => s.leave)
  const now = useNow()
  const [copied, setCopied] = useState(false)

  if (connecting || !view || !host) {
    return (
      <section className="setup lobby" aria-labelledby="lobby-title">
        <h1 id="lobby-title">Online game</h1>
        <p className="tagline" role="status">Opening a lobby...</p>
        <button type="button" onClick={leave}>Cancel</button>
      </section>
    )
  }

  const remaining = view.expiresAt - now
  const expired = remaining <= 0
  const friends = view.seats.filter((s) => s.remote)
  const joined = friends.filter((s) => s.joined).length
  const allJoined = joined === friends.length
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(view.inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the field is selectable, so the link can be copied by hand.
    }
  }

  return (
    <section className="setup lobby" aria-labelledby="lobby-title">
      <h1 id="lobby-title">Invite friends</h1>
      <p className="tagline">Send this link. Each friend who opens it takes the next open seat.</p>

      <div className="invite">
        <label className="sr-only" htmlFor="invite-link">Invite link</label>
        <input id="invite-link" className="invite-link" readOnly value={view.inviteUrl} onFocus={(e) => e.currentTarget.select()} />
        <div className="invite-actions">
          <button type="button" className="primary" onClick={copy} disabled={expired}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          {canShare && (
            <button type="button" onClick={() => void navigator.share({ title: 'Join my Ludo game', url: view.inviteUrl }).catch(() => {})} disabled={expired}>
              Share
            </button>
          )}
        </div>
        <p className={`invite-expiry${expired ? ' invite-expired' : ''}`} role="timer" aria-live="off">
          {expired ? 'This link has expired.' : `Link works for ${formatRemaining(remaining)} more.`}{' '}
          <button type="button" className="link-button" onClick={() => host.refreshInvite()}>
            {expired ? 'Make a new link' : 'Reset link'}
          </button>
        </p>
      </div>

      <h2 className="lobby-heading">
        Seats <span className="log-count">{joined}/{friends.length} friends joined</span>
      </h2>
      <SeatList seats={view.seats} />

      <div className="overlay-actions lobby-actions">
        <button type="button" onClick={leave}>Cancel</button>
        <button type="button" className="primary" onClick={startHostedGame}>
          {allJoined ? 'Start game' : 'Start now (bots take empty seats)'}
        </button>
      </div>
      <p className="setup-hint lobby-note">
        Games connect browser to browser. No accounts, and nothing is stored on a server.
        Keep this tab open: it runs the game for everyone.
      </p>
    </section>
  )
}
