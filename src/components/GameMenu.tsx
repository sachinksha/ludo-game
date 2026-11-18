import type { Role } from '../store/onlineStore'
import { Icon, type IconName } from './Icons'
import { Sheet } from './Sheet'

interface GameMenuProps {
  open: boolean
  onClose: () => void
  role: Role
  /** A local game with known seats (or a host) can restart. */
  canRestart: boolean
  onRestart: () => void
  /** Local: back to setup. Host: end the online game. Guest: leave. */
  onLeave: () => void
}

function Choice({ icon, title, detail, onClick, danger, disabled }: { icon: IconName; title: string; detail: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={`game-choice${danger ? ' game-choice-danger' : ''}`} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={22} />
      <span>
        <span className="game-choice-title">{title}</span>
        <span className="game-choice-detail">{detail}</span>
      </span>
    </button>
  )
}

/**
 * Everything that ends or restarts the game, in one clearly named place: the
 * toolbar's Game button. Each choice says exactly what it keeps and what it
 * throws away, and the screen still asks before discarding a game in progress.
 */
export function GameMenu({ open, onClose, role, canRestart, onRestart, onLeave }: GameMenuProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Game">
      <div className="game-menu">
        {role === 'guest' ? (
          <Choice icon="close" title="Leave the game" detail="The host can let a bot take your seat." onClick={onLeave} danger />
        ) : (
          <>
            <Choice
              icon="restart"
              title={role === 'host' ? 'Restart for everyone' : 'Restart'}
              detail="Start this game again from the beginning: same players and seats."
              onClick={onRestart}
              disabled={!canRestart}
            />
            {role === 'host' ? (
              <Choice icon="close" title="End the online game" detail="Ends it for everyone and closes the invite link." onClick={onLeave} danger />
            ) : (
              <Choice icon="list" title="Set up a new game" detail="Back to setup to choose players and colours." onClick={onLeave} />
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
