# Ludo

A browser Ludo game built with React, TypeScript, Vite and Zustand.

- **No login, no accounts, no scores.** Open it and play.
- **2 or 4 players.** Each seat is a human or a bot, in any mix.
- **Classic board.** Coloured bases, coloured start squares, an arrow where each home lane begins, stars on safe squares, and a home lane for each colour.
- **Per-player dice.** Each seat shows its own last roll. On your turn, tap your dice to roll.
- **Undo and redo**, plus **pause and resume**.
- **Sound effects** synthesised in the browser (no audio files), with a sound on/off switch.
- **Tested.** The rules engine, the store, the hook timing and the UI are covered, including simulated bot-only games.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with oxlint |

## How to play

1. On the setup screen, choose **2 players** (red and yellow, on opposite sides) or **4 players**.
2. Click a seat to switch it between **Human** and **Bot**. The default is red as a human, with three bots.
3. Optionally type a name for each human seat (up to 12 characters). Names must not be blank and must all be different.
4. Press **Start game**.
5. Your dice sit in your corner panel, and the **arrow** above them shows whose turn it is. **Tap the dice** (or press **Space**) to roll.
6. When there is no real choice, your token moves automatically. That is when only one token can move, or when every token that can move sits on the same spot (for example all in the base on a six, or stacked on one square). Otherwise, choose a highlighted token on the board, or press its number. Your tokens are numbered 1 to 4 during your turn, and each keeps its number for the whole game.

### Keyboard

| Key | Action |
| --- | --- |
| `Space` | Roll the dice |
| `1` to `4` | Move that token |
| `←` / `→` | Undo / redo |
| `P` | Pause / resume |
| `L` | Show / hide the game log |
| `N` | New game |
| `S` | Settings |

### Toolbar

| Button | What it does |
| --- | --- |
| **Undo** / **Redo** | Step back over your last decision (a roll and its move), or step forward again |
| **Pause** / **Resume** | Freeze the game. Bots and your moves stop until you resume |
| **Sound** switch | Turn sound effects on or off |
| **Settings** | Open the setup screen to change seats. Asks before aborting a game in progress |
| **New game** | Start again with the same seats. Asks before aborting a game in progress |

The **clock** next to the title shows the game time. It stops while the game is paused and when it ends.

The **game log** on the right lists events with the latest at the top. It starts collapsed; open it from its header or with `L`.

On phones the toolbar shows icons only, the player panels shrink to one row, and the keyboard help is hidden.

### Rules

- Each player has four tokens, which start in their base.
- A token leaves the base only on a **six**, and it appears on its colour's coloured start square, two squares past the arrow where its home lane begins.
- Tokens move clockwise around the loop. Each colour walks **51 squares**, then turns into its own five-square **home lane** and finishes in the centre. Its last loop square is the arrow square, from which it steps into the lane.
- A token must land **exactly** on the centre to finish.
- Landing on an opponent's token on an **unsafe** square sends it back to its base.
- Start squares and the four **star** squares are safe. Tokens can share them without capturing.
- Rolling a **six** earns an extra roll.
- **Capturing** an opponent's token also earns an extra roll.
- Getting a token **into the centre** earns an extra roll too, unless it was that player's last token.
- Rolling **three sixes in a row** forfeits your turn.
- If no token can move, the turn passes.
- When all of a player's tokens reach the centre, that player finishes and is ranked. The game ends when one player is still playing.

## Architecture

```
src/
├── game/                  Pure TypeScript. No React and no DOM.
│   ├── types.ts           Domain types: Color, Token, Player, GameState, GameAction, GameEvent
│   ├── board.ts           Loop length, start squares, safe squares
│   ├── layout.ts          Grid coordinates for drawing (ring, lanes, bases, centre)
│   ├── rules.ts           Movement rules: destinations, captures, legal moves, path steps
│   ├── engine.ts          State machine: createGame, rollWithValue, applyAction, performMove
│   ├── history.ts         Replay of the action list, and where undo rewinds to
│   ├── bot.ts             Bot move scoring
│   ├── describe.ts        Log text for each event
│   └── *.test.ts          Engine, layout, bot and full-game simulation tests
├── store/
│   └── gameStore.ts       Zustand store: configs, action history, redo stack, pause
├── hooks/
│   └── useLudoGame.ts     Timing: dice tumble, step-by-step moves, bot turns, forced moves
├── components/
│   ├── App-level screens: SetupScreen, GameScreen, WinOverlay, ConfirmDialog
│   ├── Board.tsx          SVG board, arrows, stars, tokens and halos
│   ├── PlayerPanel.tsx    One panel per seat: name, turn arrow and that seat's dice
│   ├── Dice.tsx           Tumbling die, which is also the roll button
│   ├── Icons.tsx          Inline SVG icons used with labels
│   └── colors.ts          Shared colours
├── audio/sfx.ts           Web Audio sound effects, with mute
├── App.tsx                Chooses setup or game from the store
└── main.tsx               Entry point
```

### Design

- **Pure rules, impure shell.** Everything in `game/` takes a state and returns a new one. Nothing mutates its input, and nothing touches the DOM.
- **The store is the history.** The game is never mutated in place. The store keeps the starting state and the list of actions taken. The current state, the log and the highlighted moves are all derived by replaying those actions. Undo removes actions from the end of the list and keeps them on a redo stack. Redo puts them back. A new action clears the redo stack.
- **Replays are exact.** Each roll stores its die value, so replaying the history always reproduces the same game.
- **Undo steps back over decisions, not clicks.** Undo removes the most recent human roll together with the move that followed. Bot turns that came after it are removed too. The human returns to the same point they were deciding from.
- **Injected randomness.** Dice come from a `rng` function. Production uses `Math.random`. Tests pass a fixed function, and simulations use a seeded generator.
- **Animation is separate from rules.** The engine applies a move at once. The hook replays it one square at a time, so the visible token walks the path while the true state is already settled.
- **Timing lives in one place.** The hook schedules dice tumbles, move steps, bot thinking time and forced moves. Timers are cleared on pause, on undo and on unmount.

### Bots

Each legal move gets a score, and the bot plays the highest. Ties go to the lowest token id.

| Priority | Condition | Score |
| --- | --- | --- |
| 1 | Finishes a token | +100 |
| 2 | Captures an opponent | +60 |
| 3 | Brings a token out of the base | +40 |
| 4 | Lands on a safe square | +15 |
| 5 | Advances, weighted by distance (tie-breaker) | a few points |

## Testing

```bash
npm test
```

The suite has 64 tests across:

- **Engine:** dice mapping, creation, lane entry and exact finish, captures and safe squares, the six and capture bonuses, automatic moves, the three-sixes forfeit, passes and finishing.
- **Layout:** 52 distinct loop squares, joined steps, and lanes that meet the loop.
- **Bot:** finishing, captures and base exits are preferred.
- **Full games:** bot-only games for two and four players, with invariants checked after every action.
- **Store:** undo, redo, the redo stack, abort, the session counter, the log and pause.
- **Hook:** a forced single move plays without a click, and a real choice does not.
- **UI:** setup choices, the App flow, the log, the win overlay and the confirmation.
- **Audio:** the mute state, and no crash without Web Audio.

## Deploying to Vercel

This is a standard Vite app, so Vercel detects it.

1. Push the repository to GitHub.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Keep the defaults: framework **Vite**, build command `npm run build`, output `dist`.
4. Deploy. Each push to the main branch redeploys.

No environment variables are needed.

## Browser support

Any modern browser. Sound uses the Web Audio API, and the game plays silently where it is unavailable. The decorative animations switch off when the operating system requests reduced motion.

## Known limitations

- Bots use a greedy heuristic, not a search, so they are reasonable rather than strong opponents.
- Pausing takes effect after the move or roll currently animating finishes.
- Game state lives in memory. Refreshing the page starts over, since there are no accounts or saves.

## Licence

Add a licence before publishing.
