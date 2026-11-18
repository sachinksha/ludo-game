# 11. Changing requirements: house rules, settings and sheets

> **Current state:** the house rules and comeback dice are now always on, as in Star Hop; the setup switches and the saved settings for them were removed. The engine still takes a `HouseRules` value (new games get `ALL_HOUSE_RULES` from the store's `newGameRules`, older saved games keep the rules they started with, and tests set `newGameRules` to play the base rules), so everything below about the engine, bots and tests still holds. The parts about setup checkboxes, settings and the Game menu's rule list describe the earlier version. Keeping the flag after the product decision is the cheap path: no save migration, no protocol bump, and the classic-dice tests keep testing a real code path.

Star Hop, a second game built on this codebase's architecture, grew a set of features worth bringing back: a house rule ("roll all your sixes first"), a settings sheet, a Game menu, sound themes, saved games and opt-in undo. This chapter follows that port through each layer. It is the best material in the guide for the interview question **"how did your design cope with a change in requirements?"**

Code: [types.ts](../src/game/types.ts), [engine.ts](../src/game/engine.ts), [bot.ts](../src/game/bot.ts), [gameStore.ts](../src/store/gameStore.ts), [useLudoGame.ts](../src/hooks/useLudoGame.ts), [Sheet.tsx](../src/components/Sheet.tsx), [SettingsSheet.tsx](../src/components/SettingsSheet.tsx), [GameMenu.tsx](../src/components/GameMenu.tsx), [themes.ts](../src/audio/themes.ts). Tests: [houseRules.test.ts](../src/game/houseRules.test.ts).

## 1. Ask before you build

"Roll all your sixes first" sounds complete until it meets Ludo's other rules. Two questions went back to the person who knew how they wanted it played:

| Question | Answer | What it decided |
| --- | --- | --- |
| Three sixes in a row forfeit a classic Ludo turn. With banking, what happens? | Forfeit the whole turn: every banked die is lost | Keeps `sixStreak`; the forfeit just clears the pool. Simpler than classic Ludo, since nothing has moved yet |
| A capture or reaching the centre earns a roll. With dice still banked, when? | Straight away, and the new die joins the bank | The engine can go from the move phase back to the roll phase with dice still in the pool |

Two more settled the defaults (rule on; undo off and granular). Each answer changed code paths. Guessing would have shipped a rule that played "wrong" to the one person who mattered.

## 2. Rules that change legality live in the game state

Comeback dice is a setting read at roll time. That works because it only changes dice values, and dice values are recorded in the actions. A rule that changes **what is legal** cannot work that way: a replay (undo, a saved game) after the player changes the setting would hit illegal actions, and an online guest with different settings would disagree with the host.

So the rule is **data in the state**, fixed when the game is created:

```ts
interface GameState { ...; rules: HouseRules; pool: number[] }
createGame(configs, rng, settings.houseRules)
```

Settings only choose the defaults for the next game. The Game menu and the Rules sheet read `game.rules`, so they show the rules of *this* game even after the player changes the setting.

> **The principle:** configuration that changes the meaning of recorded events must be recorded with them. Feature flags in products hit the same problem: a document created under flag A must keep being read under flag A.

## 3. Generalise instead of special-casing

The tempting change is a second code path: `if (rules.rollSixesFirst) { ... }` around every turn decision. Instead, **one die became a pool of one die**:

- `GameState.pool: number[]` holds the unused dice; `Move.die` names the die a move uses.
- Legal moves are generated for each distinct die in the pool (`legalMovesForPool`).
- The move action gains an optional `die`. Old action logs without it still replay: with one die there is nothing to disambiguate.

Classic Ludo is now a pool that never grows past one. The payoff came immediately: after the engine change, **all 185 existing tests passed unchanged**. Every test written before the pool existed now tests the new code. The only fixture that needed editing was one that built a `Move` by hand.

The branches that remain are small and named, in `performMove`:

```ts
if (rules.rollSixesFirst) {
  if (earnedRoll) return { ...base, phase: 'roll' }      // bonus roll now; pool kept
  if (pool.length > 0) { /* next die, or lose the unusable ones */ }
  return passTurn(base)                                   // using a 6 earns nothing more
}
if (earnedRoll || move.die === 6) return { ...base, phase: 'roll' }   // classic
```

## 4. Bots: from greedy to planning

With one die, a bot scores each move and takes the best. With two or three dice, order matters: a 6 that brings a piece out might set up a capture for the 4. The bot now adds the best follow-up for the remaining dice, with a **beam search** that reuses the existing scorer (so each persona plans in character):

```ts
score(first move) + planValue(afterPlanStep(state, move), extraDice)
```

`planValue` explores only the best 3 moves per step, at most two dice ahead. The test checks it against **brute force**: in 25 positions from seeded games with two different dice, the bot's first move always starts an optimal two-step plan. Moving the bot logic out of the hook years ago (pure functions over plain data) is what made this a 40-line change.

## 5. The UI adapts through one new piece of state

The hook gained a chosen die, following the same pattern as other position-bound UI state:

```ts
const [dieChoice, setDieChoice] = useState<{ seq: number; die: number } | null>(null)
const selectedDie = dieInUse(game, dieChoice) // the choice if still valid, else the first usable die
```

Tagged with `actionSeq`, the choice **expires by itself** after any action, with no effect and no reset code. The board's clickable pieces, the number keys and the guest's move intent all use `selectedDie`, so the rest of the UI didn't need to know about pools. `autoMoveTokenIds` refuses when the dice differ, because order is a real decision.

## 6. Saved games and versioning

Event sourcing makes saving trivial: write `{ v, configs, initial, actions }` after every action, and load by replaying. Three details matter:

- **Validate by replaying.** A save whose actions no longer apply (edited by hand, or from a different rules version) is discarded, not half-loaded.
- **Migrate one version at a time.** `MIGRATIONS[v]` upgrades a save by one version; a save from any older version walks up the chain. Version 1 has no migrations yet, but the chain exists before it is needed.
- **Settings don't need versions.** They are flat, independent preferences, loaded key by key over defaults. A missing key gets its default; a bad value (a volume of 7, an unknown theme) is ignored. Know which policy fits: flat preferences merge, structured documents migrate.

Two edge cases were found by thinking through the online flows, not by tests:

1. **Opening an invite link over a saved game** must show the join screen, not the saved game ([App.tsx](../src/App.tsx)).
2. **Leaving as a guest** used to clear the save. Now a guest's game (no local seats) hands back to the saved local game, paused. Star Hop still has this bug, which is a reminder that ported code inherits the original's gaps.

The protocol version went from 1 to 2, so an old guest and a new host refuse each other clearly instead of misreading moves.

## 7. Settings: sort controls by consequence

The old toolbar mixed three kinds of control: preferences (auto roll, sound), moment-to-moment actions (undo, pause) and game-ending actions ("Settings" actually meant *leave for setup*). The new layout sorts by **what a mis-tap costs**:

| Group | Examples | Cost of a mistake | Where |
| --- | --- | --- | --- |
| Game controls | Undo, redo, pause, rules | Nothing, or one undo | Toolbar |
| Preferences | Auto roll, auto move, undo on/off, sound, volume, sound style, theme | Nothing: change it back | Settings sheet |
| Game-ending | Restart, set up a new game, end online game, leave | The whole game | Game menu, always confirmed |

Opening any sheet pauses a local game, and closing resumes only if opening paused it (`pausedForSheet` ref), so a game the player paused stays paused. Undo became opt-in because it changes how the game plays (you can fish for a better roll), and **granular**: each undo is one human decision. After an undo, auto roll and auto move hold off at that position (`heldAt`), or the undone move would replay itself instantly.

## 8. The bottom sheet: let the platform do the hard parts

[Sheet.tsx](../src/components/Sheet.tsx) is the native `<dialog>` element opened with `showModal()`. The browser provides the top layer, an inert background, focus moved in and restored on close, and Esc as a `cancel` event. The component adds only the exit animation, backdrop taps (which must start *and* end on the backdrop), swipe-to-close on phones, and scroll containment. The same component is a centred dialog on wide screens and a bottom sheet at 700px and below.

Two lessons from Star Hop that carried over in the CSS:

- `overflow: clip`, not `hidden`, on the dialog: an `overflow: hidden` box can still be scrolled by focus, which once slid the sheet's header out of view.
- A visually hidden radio needs a positioned parent, or its containing block escapes the scrolling area.

Confirmations close the sheet first, then ask, because a `position: fixed` dialog can never appear above the top layer.

## 9. Sound themes: one name, many voices

The game only ever asks for a sound by name (`playSound('capture')`). [themes.ts](../src/audio/themes.ts) maps each name to a voice per theme: Classic bleeps, real tabla strokes, a bansuri in Raag Bhupali, a sitar with a buzzing bridge, a hammered santoor. Adding a theme touches nothing else. Everything is synthesised (Karplus-Strong strings, filtered noise, partials), so there are still no audio files. Every sound goes through one master chain: theme level and tone (a gentle low-pass, `warmth`, and a send into a small shared room reverb, `space`), then volume, then a limiter so stacked sounds never clip.

Star Hop later found every theme but the tabla sharp, and the fix came back here. Hearing is most sensitive around 2 to 5 kHz, so energy there sounds harsh even when the levels match. The cures, cheapest first: a low-pass per theme at 3 to 3.6 kHz (Q 0.5, no resonant bump); softer sources (Classic uses only sine and triangle waves, the bansuri dropped from E to A with less breath noise, the santoor down a fourth to A4); a softer Karplus–Strong strike (`PluckSpec.soft` smooths the starting noise burst, like a finger or padded hammer) and less sitar buzz; and a little reverb so notes bloom instead of stopping dead. Levels were then rebalanced against the tabla by each sound's loudest 250 ms. Star Hop's `docs/13-sound.md` has the measurements. The tests schedule every sound of every theme against a fake `AudioContext` that throws on what browsers reject (exponential ramps to zero, negative times).

## What to say in an interview

> "When a house rule arrived, the architecture told us where each change went. The rule changes legality, so it became data in the event-sourced state. The single die generalised to a pool of one, so all 185 existing tests covered the new path without edits. Bots went from greedy to a small beam search, checked against brute force. The UI needed one piece of position-tagged state. We versioned the save format and the protocol. And we reorganised controls by the cost of a mistake, so nothing in Settings can lose a game. The most valuable step was asking two questions first: both answers changed the engine."

## Exercises

1. Add a second house rule, "a block of two of your own pieces can't be passed". List every invariant, function and test it touches before writing code. (Hint: the simulation's "only safe squares hold mixed colours" check.)
2. Write migration `1 → 2` for a hypothetical change that renames `sixStreak` to `streak`, with a test that a version 1 save loads.
3. Move bot decisions into a Web Worker. What must be serialisable? How do the tests stay synchronous?
4. Convert `ConfirmDialog` to a native `<dialog>` so it can open on top of a sheet. Which flow is better on a phone?
5. Design question: a document editor whose formatting rules are configurable per workspace. How do old documents keep rendering correctly after the workspace changes its rules?
