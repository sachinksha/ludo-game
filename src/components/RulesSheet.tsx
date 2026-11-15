import { useState } from 'react'
import { LANE_LENGTH, TRACK_LENGTH } from '../game/board'
import { BASE_SIX_CHANCE, COMEBACK_CAP, COMEBACK_GRACE, COMEBACK_STEP, MAX_SIX_STREAK } from '../game/engine'
import { IS_TOUCH } from '../hooks/useShortcuts'
import { useGameStore } from '../store/gameStore'
import { Icon } from './Icons'
import { HOUSE_RULE_TEXT } from './houseRuleText'
import { Sheet } from './Sheet'

const pct = (x: number) => `${Math.round(x * 100)}%`

/**
 * The game rules in plain words. Numbers come from the engine's constants, so
 * the text cannot drift from what the game actually does.
 */
export function RulesContent() {
  const comebackDice = useGameStore((s) => s.settings.comebackDice)
  // In a game, the rules it was started with; on setup, the rules a new game would use.
  const houseRules = useGameStore((s) => s.game?.rules ?? s.settings.houseRules)
  const tap = IS_TOUCH ? 'Tap' : 'Click'

  return (
    <div className="rules">
      <section aria-labelledby="rules-short">
        <h3 id="rules-short">The short version</h3>
        <ol className="rules-steps">
          <li>
            Roll a <b>6</b> to bring a piece out of your base.
          </li>
          <li>Race it clockwise round the board by the number you roll.</li>
          <li>
            Land on another player's piece to <b>capture</b> it: it goes back to their base.
          </li>
          <li>
            Get all <b>4 pieces to the centre</b> first to win.
          </li>
        </ol>
      </section>

      <section aria-labelledby="rules-turn">
        <h3 id="rules-turn">Your turn</h3>
        <ul>
          <li>Roll the die, then move one piece by exactly that many squares.</li>
          <li>
            A <b>6</b>, a <b>capture</b>, or getting a piece <b>into the centre</b> earns another roll (not for your last
            piece: your game is over).
          </li>
          <li>
            <b>{MAX_SIX_STREAK} sixes in a row</b> lose the turn.
          </li>
          <li>If no piece can move, your turn passes.</li>
        </ul>
      </section>

      <section aria-labelledby="rules-moving">
        <h3 id="rules-moving">Moving and capturing</h3>
        <ul>
          <li>
            Each colour goes {TRACK_LENGTH} squares round the board, then up its own {LANE_LENGTH}-square <b>home lane</b>{' '}
            to the centre. You need the exact number to finish.
          </li>
          <li>
            The <b>start squares</b> and the <b>stars</b> are safe: pieces share them and nobody is captured there.
          </li>
          <li>Anywhere else on the loop, landing on opponents sends every one of them back to base, a whole stack included.</li>
          <li>Pieces in the home lane are safe.</li>
        </ul>
      </section>

      <section aria-labelledby="rules-comeback">
        <h3 id="rules-comeback">
          Comeback dice <span className="rules-tag">{comebackDice ? 'On' : 'Off'}</span>
        </h3>
        <p>
          If every piece you have left is in base and you miss {COMEBACK_GRACE} sixes in a row, your chance of a 6 goes up
          by {pct(COMEBACK_STEP)} for each further miss, up to {pct(COMEBACK_CAP)} (normally it's {pct(BASE_SIX_CHANCE)}).
          It applies to bots too, and you can turn it off on the setup screen.
        </p>
      </section>

      <section aria-labelledby="rules-house">
        <h3 id="rules-house">House rules</h3>
        <p>Optional rules, chosen on the setup screen and fixed for the whole game.</p>
        <ul className="rules-house">
          <li>
            <b>{HOUSE_RULE_TEXT.rollSixesFirst.title}</b>{' '}
            <span className="rules-tag">{houseRules.rollSixesFirst ? 'On' : 'Off'}</span>
            <br />
            After a 6, roll again straight away, and keep going until you roll something else. Then use every die, one at a
            time, on any pieces, in the order you choose. A die no piece can use is lost, so plan the order. Using a 6 doesn't
            earn another roll (you already had it). {MAX_SIX_STREAK} sixes in a row still lose the whole turn. A capture or a
            piece reaching the centre gives you a roll straight away, and that die joins the ones you still have. Getting your
            last piece home ends your turn, even with dice left.
          </li>
        </ul>
      </section>

      <section aria-labelledby="rules-controls">
        <h3 id="rules-controls">Playing here</h3>
        <ul>
          <li>{tap} a glowing piece to move it{IS_TOUCH ? '.' : ', or press its number (1–4).'}</li>
          <li>
            With several dice to use, the dice show under the prompt. {tap} one to choose it
            {IS_TOUCH ? '.' : ', or press D to switch.'}
          </li>
          <li>Auto roll, Auto move, Undo, sounds and the theme are in Settings (the gear button).</li>
          <li>To restart the game, or set up a different one, use the Game button (the flag).</li>
        </ul>
      </section>
    </div>
  )
}

/** The rules in a sheet (phones) or dialog (wider screens). */
export function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play">
      <RulesContent />
    </Sheet>
  )
}

/** A self-contained "Rules" button with its sheet, for screens outside the game. */
export function RulesButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="tool" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="book" />
        <span>Rules</span>
      </button>
      <RulesSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
