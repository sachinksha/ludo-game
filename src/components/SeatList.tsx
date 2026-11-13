import type { SeatView } from '../net/protocol'
import { COLOR_NAME } from './colors'

/** Lobby seat status, shared by the host lobby and the guest waiting screen. */
function status(seat: SeatView, mine: boolean): string {
  if (mine) return 'You'
  if (seat.kind === 'bot') return 'Bot'
  if (!seat.remote) return 'Host'
  if (!seat.joined) return 'Waiting for a friend...'
  return seat.connected ? 'Joined' : 'Disconnected'
}

export function SeatList({ seats, myColor }: { seats: SeatView[]; myColor?: string | null }) {
  return (
    <ul className="lobby-seats" aria-label="Seats">
      {seats.map((seat) => {
        const text = status(seat, seat.color === myColor)
        return (
          <li key={seat.color} className={`lobby-seat${seat.remote && !seat.joined ? ' lobby-seat-open' : ''}`}>
            <span className={`panel-dot dot-${seat.color}`} aria-hidden="true" />
            <span className="lobby-seat-name">{seat.remote && !seat.joined ? COLOR_NAME[seat.color] : seat.name}</span>
            <span className="lobby-seat-status">{text}</span>
          </li>
        )
      })}
    </ul>
  )
}
