/** Pip layouts on a 3 x 3 grid, as in the main die. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function MiniDie({ value }: { value: number }) {
  const on = new Set(PIPS[value])
  return (
    <span className="mini-die" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip${on.has(i) ? ' pip-on' : ''}`} />
      ))}
    </span>
  )
}

interface DicePoolProps {
  /** Dice rolled this turn and not used yet, in roll order. */
  pool: number[]
  /** Still rolling: every die so far is a banked 6. */
  banking: boolean
  /** The die the next move uses. */
  selectedDie: number | null
  /** True when the die can move some marble now. */
  usable: (die: number) => boolean
  /** This device's player chooses (otherwise the pool is shown, not chosen from). */
  interactive: boolean
  /** Show the keyboard hint (not on touch screens). */
  keyHint?: boolean
  onSelect: (die: number) => void
}

/**
 * The turn's dice under the roll-sixes-first house rule (R22): banked sixes
 * while rolling, then a choice of which die to use next. Each pooled die is a
 * button, so the order can be picked by keyboard or tap; dice that can't move
 * anything right now are disabled rather than hidden, so the row doesn't jump.
 */
export function DicePool({ pool, banking, selectedDie, usable, interactive, keyHint = false, onSelect }: DicePoolProps) {
  if (pool.length === 0 || (!banking && pool.length === 1)) return null
  return (
    <div className="dice-pool" role="group" aria-label={banking ? 'Banked dice' : 'Dice to use'}>
      <span className="dice-pool-label">{banking ? 'Banked:' : 'Use:'}</span>
      {pool.map((die, i) =>
        banking || !interactive ? (
          <span key={i} className={`dice-chip${!banking && die === selectedDie ? ' dice-chip-on' : ''}`} title={`A ${die}`}>
            <MiniDie value={die} />
            <span className="sr-only">{die}</span>
          </span>
        ) : (
          <button
            key={i}
            type="button"
            className={`dice-chip${die === selectedDie ? ' dice-chip-on' : ''}`}
            aria-pressed={die === selectedDie}
            aria-label={`Use the ${die}${usable(die) ? '' : ' (no move)'}`}
            disabled={!usable(die)}
            onClick={() => onSelect(die)}
            data-testid={`pool-die-${i}`}
          >
            <MiniDie value={die} />
          </button>
        ),
      )}
      {!banking && interactive && keyHint && (
        <span className="dice-pool-label" aria-hidden="true">
          <kbd>D</kbd> switches
        </span>
      )}
    </div>
  )
}
