import type { Color, PlayerKind } from './types'

/**
 * Checks each human seat's name: it must not be blank and must differ from
 * every other seat's name (case-insensitive). Returns an error per seat.
 */
export function validateNames(seats: { color: Color; kind: PlayerKind; name: string }[]): Partial<Record<Color, string>> {
  const errors: Partial<Record<Color, string>> = {}
  for (const seat of seats) {
    if (seat.kind !== 'human') continue
    const name = seat.name.trim()
    if (name === '') {
      errors[seat.color] = 'Name cannot be blank.'
      continue
    }
    const clash = seats.some((o) => o.color !== seat.color && o.name.trim().toLowerCase() === name.toLowerCase())
    if (clash) errors[seat.color] = 'Name is already taken.'
  }
  return errors
}
