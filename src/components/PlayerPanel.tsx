import type { Color, Player } from '../game/types'
import { COLOR_NAME } from './colors'
import { Die } from './Dice'

interface PlayerPanelProps {
  player: Player
  /** This seat is the one to play next. */
  active: boolean
  /** The dice can be tapped right now (human, active, waiting to roll). */
  canRoll: boolean
  rolling: boolean
  onRoll: () => void
  /** Grid area this panel occupies, e.g. "red". */
  area: Color
  finished: boolean
}

export function PlayerPanel({ player, active, canRoll, rolling, onRoll, area, finished }: PlayerPanelProps) {
  const classes = ['panel', `panel-${player.color}`, active ? 'panel-active' : '', finished ? 'panel-finished' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <section className={classes} style={{ gridArea: area }} aria-label={`${player.name} (${COLOR_NAME[player.color]})`}>
      <header className="panel-name">
        <span className={`panel-dot dot-${player.color}`} aria-hidden="true" />
        <span className="panel-name-text" title={player.name}>{player.name}</span>
        {finished && <span className="panel-rank">#{player.finishRank}</span>}
      </header>
      <div className="panel-dice">
        {active && <span className="turn-arrow" aria-hidden="true" />}
        <Die
          value={player.lastRoll}
          rolling={rolling && active}
          clickable={canRoll}
          onRoll={onRoll}
          label={`${player.name} dice`}
        />
      </div>
    </section>
  )
}
