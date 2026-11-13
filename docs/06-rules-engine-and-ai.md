# 6. Rules engine and AI

## The engine is a reducer

[engine.ts](../src/game/engine.ts) exposes `applyAction(state, action): GameState`. Same shape as a Redux reducer or `useReducer`: pure, synchronous, returns a new object, never mutates. Inside, it delegates:

- `rollWithValue`: records the roll, handles the three-sixes forfeit and "no legal move", or moves to the `move` phase with `legalMoves`.
- `performMove`: moves a token, captures (a whole stack), ranks finishers, ends the game, and decides whether the same player rolls again.
- `endGame`: ranks unfinished players by progress.
- `takeover`: hands a seat to a bot mid-game.

`commit(state, events)` bumps `actionSeq` and attaches the **events** this action produced.

## A small state machine

```
          roll (no legal move / three sixes) ─┐
          ┌──────────────────────────────────┐│
          ▼                                  ││
      ┌──────┐  roll (legal moves)   ┌──────┐ ││
      │ roll │ ────────────────────▶ │ move │ ││
      └──────┘ ◀──────────────────── └──────┘ ││
          ▲      move (bonus: same player)    ││
          │      move (no bonus: next player) ││
          └────────────────────────────────── ┘
                    any → gameOver (one player left, or 'end')
```

`phase` is `'roll' | 'move' | 'gameOver'`. Each function first checks the phase (`if (state.phase !== 'roll') return state`), so invalid actions are no-ops rather than corruption. Making invalid transitions impossible, not just unlikely, is what lets the network host apply guest intents safely.

## Events: what happened, not how to show it

`GameEvent` values (`roll`, `move`, `capture`, `finish`, `turnPass`, `gameOver`, `takeover`) describe outcomes. Three consumers read them:

- [describe.ts](../src/game/describe.ts) turns them into log text.
- `playOutcomeSounds` picks sounds.
- `settle` shows the finish banner.

The engine has no idea any of these exist. Adding a new consumer (achievements, analytics) needs no engine change. This is the **observer** idea, applied to pure data.

## Derived rule helpers

[rules.ts](../src/game/rules.ts) holds pure building blocks: `progressOf` (distance from start), `destinationFor` (where a token lands, or `null` if illegal), `buildMove` (including captures), `legalMovesFor`, `pathSteps` (for animation). [board.ts](../src/game/board.ts) holds the geometry as data: start squares, safe squares, lane entries. **Data over code**: changing the board means editing tables, not logic.

## Automatic moves

[`autoMoveTokenIds`](../src/game/engine.ts) decides when the player has no *real* choice: one legal move, or every legal move starts from the same spot (stacked tokens, or all from the base on a six). It returns ids or `null`. The rule is pure and tested; the hook only acts on it. Good UX decisions often reduce to a small pure function plus a test.

Whether to *act* on it is a player preference, the **Auto move** switch, and that lives in the hook, not the engine. Online, that raises a design question: whose preference applies to a guest's seat? The answer is the guest's own. The host never auto-plays a remote human's forced move; the guest's device sees the forced move, and if its switch is on, sends the move intent itself. Rule of thumb: the authority owns *what is legal*; each client owns *how its own player likes to play*. Bots are always automatic.

## The bots: utility-based AI

[bot.ts](../src/game/bot.ts) uses the simplest AI that works well for games with small branching: **score every legal move, pick the best**. Each move gets a weighted sum of features:

| Feature | Meaning |
| --- | --- |
| `finish` | A token reaches the centre |
| `capture` + `captureProgress` | Sending an opponent home, worth more the further it had travelled |
| `exit` | Leaving the base |
| `lane` | Entering the safe home lane |
| `progress`, `lead` | Squares advanced; preference for advancing leaders |
| `danger` | Exposure at the landing square (penalty) and escape from a threatened square (bonus) |
| `safe` | Landing on a star or start |
| `attack` | Landing 1 to 6 squares behind opponents (a capture threat next turn) |
| `noise` | Random nudge so close calls vary |

**Danger** estimates risk as `1 - 0.7^n` for `n` opponents in range, scaled by how valuable the token is (`12 + progress × 0.6`). It's a heuristic, not exact probability: easy to explain, cheap to compute, good enough.

**Personalities** are weight tables (`PERSONA_WEIGHTS`). `createBotProfile` picks one at random and jitters each weight by ±15%, so two hunters differ and the same seat plays differently each game. The profile is stored in the game state so replays stay exact.

**Is it actually better?** Claims about AI need measurement. During development, a throwaway simulation played 600 seeded two-player games per style against the previous fixed-priority bot. Each style won 55–60%, a margin of about two to five standard errors in a game dominated by dice. Measure, don't guess.

### Alternatives to know

| Technique | When it fits |
| --- | --- |
| Utility scoring (used here) | Small branching, need for tunable personality, cheap |
| Expectimax (minimax with chance nodes) | Dice games where looking ahead 1–2 turns matters; cost grows fast with 4 players |
| Monte Carlo Tree Search | Larger games; simulate many random playouts per move |
| Learned policies (RL) | When you can train offline; hard to tune for "personality" |

## Randomness and probability

- `rollDie(rng)` maps a uniform `[0, 1)` value to a face. `secureRandom` uses `crypto.getRandomValues`.
- **Comeback dice** (`sixChance`): fair odds until a player has been stuck for `COMEBACK_GRACE` rolls, then +6 percentage points per roll, capped at 50%. `rollFor` gives a six with probability `p` and spreads the rest evenly over 1–5. When no help applies it calls `rollDie` directly, so fair rolls are identical to before (a test checks this).
- Why players feel dice are unfair: P(no six in 10 rolls) = (5/6)^10 ≈ 16%. With four players over a game, a long drought for someone is likely. Knowing this lets you discuss **perceived fairness versus actual fairness**, a real product question.

## Invariants

[simulation.test.ts](../src/game/simulation.test.ts) plays full seeded games and checks, after every action: four tokens per player, no two colours sharing an unsafe square, unique finishing ranks. An invariant check found a real bug during development: capturing one token of a stacked pair left the attacker sharing a square with the survivor. The fix was to capture the whole stack. **Invariants catch the bugs you did not think to write a test for.**

## Exercises

1. Add a fifth personality, "blocker", that likes sitting just ahead of opponents' lane entries. Write a simulation measuring its win rate against the others.
2. Implement one-ply expectimax: for each move, average the score of the opponent's best response over the six die faces. Is it stronger? How much slower?
3. Add a house rule toggle: two tokens of the same colour form a block that cannot be passed. Which functions change? Which tests?
4. Write a property-based test (with `fast-check`) that random action sequences never break the invariants.
