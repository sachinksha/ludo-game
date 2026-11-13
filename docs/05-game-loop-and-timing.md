# 5. The game loop and timing

## Turn-based, not frame-based

Action games run a **frame loop** (`requestAnimationFrame`): read input, update physics, render, 60 times a second. Ludo is **turn-based**: nothing happens until someone acts. So there is no frame loop. The "loop" is the scheduling effect in [useLudoGame.ts](../src/hooks/useLudoGame.ts), which wakes up whenever state changes and schedules the next step with `setTimeout`.

Know when to use which:

| Need | Tool |
| --- | --- |
| Smooth, continuous motion tied to the display | `requestAnimationFrame` or CSS animation |
| A discrete step after a delay (bot thinking, settle pause) | `setTimeout` |
| A visual tick (clock, countdown) | `setInterval` ([useGameClock](../src/hooks/useGameClock.ts), [useNow](../src/hooks/useNow.ts)) |
| Simple visual transitions | CSS transitions (token movement eases between squares) |

## Truth first, then animation

When a token moves five squares, the engine computes the result instantly. The hook then walks the drawn token square by square:

```ts
steps.forEach((state, i) => {
  later(() => setShownPlayers((prev) => withTokenState(prev, color, tokenId, state)), i * TIMING.STEP_MS)
})
later(() => { record(action); settle() }, steps.length * TIMING.STEP_MS)
```

Two pieces of state:

- `game` (in the store): the truth, updated once when the animation ends.
- `shownPlayers` (in the hook): what is drawn, which lags behind during animation.

This is the **model/view separation** of game programming. Rules never wait for animations, and animations never decide rules. [`pathSteps`](../src/game/rules.ts) is a pure helper that lists intermediate squares, so even the animation path is unit-tested.

## The action pipeline

Every action follows one path:

```
decide ──▶ announce (host only) ──▶ animate ──▶ record ──▶ settle
```

- **decide**: `performRoll` picks a die value, a bot chooses a move, a human clicks, or a guest's intent arrives.
- **announce**: the host sends the action to guests *before* animating, so everyone animates together.
- **animate**: dice tumble (`ROLL_MS`) or the token walks (`STEP_MS` per square).
- **record**: append to the action log, which re-derives the game.
- **settle**: show the result, play sounds, hold briefly (`SETTLE_MS`, or `CELEBRATE_MS` when a player finishes), then release the lock.

Guests skip "decide": they take actions from their inbox and run the same `animate`. One pipeline for local, host and guest means one set of bugs, not three.

## The busy lock

While an action plays, `busy` is true and every entry point (`performRoll`, `playMove`, undo, redo) returns early. Without it, a fast double-click could start two moves, or a bot could act mid-animation. The lock is released only by `settle`, after the hold.

## Pause

Pause is a flag the scheduler checks before scheduling. Pausing mid-animation lets that animation finish, then nothing new starts. This is simpler and less error-prone than freezing timers halfway (you would need to record remaining time for each one). The README lists it as a known limitation, which is how you handle a deliberate trade-off.

Local games also auto-pause on `visibilitychange` (tab hidden) and window `blur`. Online games do not, because one player's tab switch should not stop everyone. The effect simply does not register in non-local roles.

## Timing constants in one place

`TIMING` collects every duration. Tests import it (`vi.advanceTimersByTime(TIMING.ROLL_MS + 10)`), so changing a duration never breaks tests. Name your magic numbers, and export them for tests.

## Determinism

Given the same initial state and actions, the game is identical. Randomness enters at exactly two decision points (dice and bot nudges), both from an injected `rng`, and both outcomes are recorded as actions. Determinism enables replays, undo, exact simulations and replicated multiplayer. Interviewers love hearing *why* determinism matters: it turns "it happened once on someone's machine" into a reproducible test.

## Celebrations and sound

`settle` inspects the events of the last action. A `finish` event (a player done, game not over) shows a banner and holds play for `CELEBRATE_MS`. Sounds come from the same events ([`playOutcomeSounds`](../src/hooks/useLudoGame.ts)), synthesised with the Web Audio API in [sfx.ts](../src/audio/sfx.ts). Events are the bridge from pure rules to effects: the engine says *what happened*, and the shell decides *how it looks and sounds*.

## Feedback that outlives the animation

The step-by-step walk shows a move only while it happens; anyone who glanced away misses it. The **last-move trail** fixes that: after a move settles, the board draws a faint line in the mover's colour through the squares it passed ([Board.tsx](../src/components/Board.tsx) `LastMoveTrail`). Points worth noting:
- **Derived from the event, not a new source of truth.** `settle` reads the `move` event the engine already emits and keeps `{ color, move }` in hook state. The path comes from `pathSteps`, the same function the animation uses, so trail and animation can never disagree.
- **View state, not game state.** It is not in the action log, so undo/redo simply clear it, and online guests get it for free because their actions go through the same `settle`.
- **Clear it at the right moment.** It disappears when the next move starts animating (a trail under a moving piece is confusing), not when the next player rolls, so a player who rolls still sees what happened before.
- **Contrast on any background.** A thin dark casing under the coloured line keeps a red trail visible on red squares.

## Exercises

1. Make pause freeze animations mid-move (record each timer's remaining time). Was it worth the complexity?
2. Replace the per-square `setTimeout`s with one `requestAnimationFrame` loop that interpolates position. What do you gain (smoothness, fewer timers) and lose (testability with fake timers)?
3. Add a "fast mode" setting that halves every `TIMING` value. Where does the setting live, and how does the hook read it?
4. A guest on a slow network receives two actions while still animating the first. Trace exactly what happens (hint: the inbox and the guest effect).
