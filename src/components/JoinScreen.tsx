import { useState } from 'react'
import { useGuestView } from '../hooks/useOnline'
import { useNow } from '../hooks/useNow'
import { formatRemaining } from '../net/invite'
import { sanitizeName } from '../net/protocol'
import { MAX_NAME_LENGTH } from '../game/types'
import { useOnlineStore } from '../store/onlineStore'
import { SeatList } from './SeatList'

const NAME_KEY = 'ludo:guestName'

function savedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

const REJECT_TEXT = {
  invalid: 'This invite link is not valid any more. Ask the host for a new one.',
  expired: 'This invite link has expired. Ask the host for a new one.',
  full: 'Every seat in this game is already taken.',
  started: 'This game has already started.',
  version: 'The host is running a different version of the game. Both of you should refresh the page.',
} as const

/** A guest's path into an online game: pick a name, connect, wait for the host. */
export function JoinScreen() {
  const invite = useOnlineStore((s) => s.invite)
  const join = useOnlineStore((s) => s.join)
  const reconnect = useOnlineStore((s) => s.reconnect)
  const leave = useOnlineStore((s) => s.leave)
  const view = useGuestView()
  const now = useNow()
  const [name, setName] = useState(savedName)

  const remaining = (invite?.expiresAt ?? 0) - now
  const clean = sanitizeName(name)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!clean) return
    try {
      window.localStorage.setItem(NAME_KEY, clean)
    } catch {
      // Not remembered next time; no harm.
    }
    void join(clean)
  }

  let body: React.ReactNode
  if (!view) {
    body = (
      <form className="join-form" onSubmit={submit}>
        <label htmlFor="guest-name">Your name</label>
        <input
          id="guest-name"
          className="seat-name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <p className={`invite-expiry${remaining <= 0 ? ' invite-expired' : ''}`}>
          {remaining > 0 ? `This invite works for ${formatRemaining(remaining)} more.` : 'This invite looks expired, but you can still try.'}
        </p>
        <button type="submit" className="primary" disabled={!clean}>Join game</button>
      </form>
    )
  } else {
    switch (view.status) {
      case 'connecting':
        body = <p role="status">Connecting to the host...</p>
        break
      case 'lobby':
        body = (
          <>
            <p role="status">You are in. Waiting for the host to start the game.</p>
            <SeatList seats={view.seats} myColor={view.color} />
          </>
        )
        break
      case 'playing':
        body = <p role="status">Loading the game...</p>
        break
      case 'rejected':
        body = <p role="alert">{REJECT_TEXT[view.reason ?? 'invalid']}</p>
        break
      case 'unreachable':
        body = (
          <>
            <p role="alert">
              Could not reach the host. They may have closed the game, or your networks cannot connect directly (common on mobile data or strict Wi-Fi). Try again, or switch to the same Wi-Fi as the host.
            </p>
            <button type="button" className="primary" onClick={reconnect}>Try again</button>
          </>
        )
        break
      case 'lost':
        body = (
          <>
            <p role="alert">The connection to the host dropped.</p>
            <button type="button" className="primary" onClick={reconnect}>Reconnect</button>
          </>
        )
        break
      case 'ended':
        body = <p role="status">The host ended the game.</p>
        break
    }
  }

  return (
    <section className="setup lobby" aria-labelledby="join-title">
      <h1 id="join-title">Join a Ludo game</h1>
      <p className="tagline">No sign-up. Just a name.</p>
      <div className="join-body">{body}</div>
      <button type="button" className="lobby-leave" onClick={leave}>
        {view?.status === 'ended' || view?.status === 'rejected' ? 'Play on this device instead' : 'Leave'}
      </button>
    </section>
  )
}
