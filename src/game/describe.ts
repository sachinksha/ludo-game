import type { Color, GameEvent } from './types'

/** Display names used in the game log. Kept here so the rules layer has no UI imports. */
const NAME: Record<Color, string> = {
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  blue: 'Blue',
}

/** Human-readable text for a game event, or null when it needs no log line. */
export function describeEvent(event: GameEvent): string | null {
  switch (event.type) {
    case 'roll':
      return `${NAME[event.color]} rolled a ${event.value}`
    case 'move':
      if (event.move.finishes) return `${NAME[event.color]} moved a token into the centre`
      if (event.move.from.kind === 'yard') return `${NAME[event.color]} brought a token out of its base`
      return `${NAME[event.color]} moved a token`
    case 'capture':
      return `${NAME[event.color]} captured a ${NAME[event.victim]} token`
    case 'finish':
      return `${NAME[event.color]} finished in place ${event.rank}`
    case 'turnPass':
      return event.reason === 'threeSixes'
        ? `${NAME[event.color]} rolled three sixes and forfeits the turn`
        : `${NAME[event.color]} has no legal move`
    case 'takeover':
      return `A bot took over the ${NAME[event.color]} seat`
    case 'gameOver':
      return event.early ? 'Game ended early. Unfinished players are ranked by progress' : null
    default:
      return null
  }
}
