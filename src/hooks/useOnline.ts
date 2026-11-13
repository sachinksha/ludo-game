import { useSyncExternalStore } from 'react'
import type { GuestView } from '../net/guestSession'
import type { HostView } from '../net/hostSession'
import { useOnlineStore } from '../store/onlineStore'

const noop = () => () => {}
const none = () => null

/**
 * The live view of the host session, or null when not hosting. Sessions are
 * external stores (plain objects with subscribe/getView), so React reads them
 * with useSyncExternalStore: re-render on change, never tear mid-render.
 */
export function useHostView(): HostView | null {
  const host = useOnlineStore((s) => s.host)
  return useSyncExternalStore(host?.subscribe ?? noop, host?.getView ?? none)
}

/** The live view of the guest session, or null when not a guest. */
export function useGuestView(): GuestView | null {
  const guest = useOnlineStore((s) => s.guest)
  return useSyncExternalStore(guest?.subscribe ?? noop, guest?.getView ?? none)
}
