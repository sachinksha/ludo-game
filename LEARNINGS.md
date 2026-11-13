# Learnings: carrying this game's foundations into the next one

A playbook for building another turn-based browser game from what this Ludo game already does. It says what to copy, what to adapt, which behaviours players will expect again, and which mistakes not to repeat.

You can hand this file to a coding assistant at the start of the next project (see [Kick-off prompt](#kick-off-prompt)). For deeper explanations of each pattern, see the study guide in [docs/](docs/README.md).

## Contents

1. [The ideas that made everything else easy](#1-the-ideas-that-made-everything-else-easy)
2. [Reuse map: copy, adapt, rewrite](#2-reuse-map-copy-adapt-rewrite)
3. [Project skeleton](#3-project-skeleton)
4. [The engine contract](#4-the-engine-contract)
5. [The action pipeline and timing](#5-the-action-pipeline-and-timing)
6. [Feature checklist to carry forward](#6-feature-checklist-to-carry-forward)
7. [Online multiplayer recipe](#7-online-multiplayer-recipe)
8. [Testing recipe](#8-testing-recipe)
9. [Pitfalls we hit](#9-pitfalls-we-hit)
10. [Defaults and decisions to keep](#10-defaults-and-decisions-to-keep)
11. [What to do differently next time](#11-what-to-do-differently-next-time)
12. [Step-by-step plan for the next game](#12-step-by-step-plan-for-the-next-game)
13. [Kick-off prompt](#kick-off-prompt)

---

## 1. The ideas that made everything else easy

These were decided early here, and nearly every later feature depended on them. Decide them on day one next time.

| Idea | What it means | What it gave us for free |
| --- | --- | --- |
| **Event sourcing** | The game is `initial state + list of actions`. The current state is always derived by replaying the actions. | Undo/redo, the game log, deterministic tests, online sync, bot takeover, replays |
| **Randomness recorded in actions** | A roll action stores its value (`{ type: 'roll', value: 5 }`). Decisions that use randomness (bot profiles) are stored in the action that introduces them. | Replays are exact. Only the authority rolls dice, so online guests cannot cheat |
| **Pure rules core** | `src/game/` is plain TypeScript: no React, no DOM, no timers, no network. Functions take state and return new state. | Fast tests, seeded simulations, reuse on a server later |
| **Rules decide, UI animates** | The engine applies a move instantly. The UI animates from the old state to the new one, and the true state is already settled. | No game logic in animations, and no animation bugs in the rules |
| **One action pipeline** | Humans, bots, auto moves and online guests all go through decide → announce → animate → record. | Each new input source (bots, network) was a small addition |
| **Effects injected** | `rng`, the clock, the network and storage are parameters with real defaults. | Fixed dice in tests, jumping past 5-minute expiries instantly, an in-memory network |
| **Ports and adapters for I/O** | The network is an interface (`Network`, `Channel`). PeerJS is one adapter, an in-memory network is another. | Multiplayer tested without a network; the transport can be swapped later |

**Rule of thumb:** if a feature needs the game to be "the same everywhere" (undo, replay, online, spectators), make it an action and let the reducer compute the consequences. Example: when a bot takes over a seat, the engine renames it to "Bot N". Every guest replays the same action and gets the same name, with no extra message.

---

## 2. Reuse map: copy, adapt, rewrite

### Copy almost as is (game-agnostic)

| File(s) | What it is | Changes needed |
| --- | --- | --- |
| [src/net/transport.ts](src/net/transport.ts) | `Network` / `Channel` / `HostEndpoint` interfaces | None |
| [src/net/peerNetwork.ts](src/net/peerNetwork.ts) | PeerJS adapter, lazy-loaded, reconnects to signalling | None |
| [src/net/memoryNetwork.ts](src/net/memoryNetwork.ts) | In-memory network for tests (JSON round-trip, async delivery) | None |
| [src/net/iceServers.ts](src/net/iceServers.ts) + [api/turn.ts](api/turn.ts) | STUN defaults, TURN from a private serverless function, fail-soft | None |
| [src/net/invite.ts](src/net/invite.ts) | Invite links in the URL fragment, tokens, 5-minute expiry, countdown text | Maybe the TTL |
| [vite.config.ts](vite.config.ts) `turnApi` plugin, [.vercelignore](.vercelignore), [.env.example](.env.example) | `/api/turn` in dev and preview, tests kept out of the deploy | None |
| [src/audio/sfx.ts](src/audio/sfx.ts) | Synthesised Web Audio sounds, lazy `AudioContext`, mute | New sound names |
| [src/hooks/useGameClock.ts](src/hooks/useGameClock.ts), [src/hooks/useNow.ts](src/hooks/useNow.ts) | Pausable game clock, ticking "now" for countdowns | None |
| [src/hooks/useOnline.ts](src/hooks/useOnline.ts) | `useSyncExternalStore` bindings for session objects | None |
| [src/components/ConfirmDialog.tsx](src/components/ConfirmDialog.tsx), [Icons.tsx](src/components/Icons.tsx), [SeatList.tsx](src/components/SeatList.tsx) | Accessible confirm dialog, inline SVG icons, lobby seat list | Icon set |
| [src/game/history.ts](src/game/history.ts) | `replay(initial, actions)`, undo index | Undo granularity |
| [src/game/names.ts](src/game/names.ts) | Seat name validation (blank, duplicate) | None |
| [src/__tests__/setup.ts](src/__tests__/setup.ts), Vitest config | jsdom + Testing Library setup | None |
| `LICENSE` (GPL-3.0) | Licence text | Copyright line |

### Adapt (the shape carries over, details change)

| File(s) | Keep | Change |
| --- | --- | --- |
| [src/net/protocol.ts](src/net/protocol.ts) | Message envelope (`t`), `hello`/`welcome`/`reject`/`lobby`/`sync`/`action`/`paused`/`ended`, strict parse that rebuilds objects, `sanitizeName`, `PROTOCOL_VERSION` | The `intent` payload (which moves a guest can request) |
| [src/net/hostSession.ts](src/net/hostSession.ts) | Admission (token, expiry, version, started, full), seat secrets, broadcast with `seq` + `gameId`, hello timeout, bot fill-in | Seat model if the game has no colours |
| [src/net/guestSession.ts](src/net/guestSession.ts) | Status machine (connecting → lobby → playing → lost/ended), gap detection → resync, seat secret in `sessionStorage` | Nothing much |
| [src/store/gameStore.ts](src/store/gameStore.ts) | `initial`, `actions`, `redoStack`, derived `game` and `log`, `session` counter for remounts, persisted `settings`, `load()` for online snapshots | The settings fields |
| [src/store/onlineStore.ts](src/store/onlineStore.ts) | Roles (local/host/guest), inbox for the hook, lazy PeerJS import, subscription that broadcasts new games and pauses | Seat configs |
| [src/hooks/useLudoGame.ts](src/hooks/useLudoGame.ts) | Busy lock + ref, `later()` timers with cleanup, scheduler effect, `submit`, celebration, notice, auto-pause, intent de-duplication | Animation steps, what counts as "auto" |
| [src/components/SetupScreen.tsx](src/components/SetupScreen.tsx), [HostLobby.tsx](src/components/HostLobby.tsx), [JoinScreen.tsx](src/components/JoinScreen.tsx), [WinOverlay.tsx](src/components/WinOverlay.tsx) | Flows, validation messages, accessibility | Seat count and options |
| [src/App.tsx](src/App.tsx) | Routing by store state: game → session, guest → join, host → lobby, else setup. Invite parsed from the hash on load | Component names |

### Rewrite (Ludo-specific)

`board.ts`, `layout.ts`, `rules.ts`, `engine.ts` (reuse its *structure*), `bot.ts` (reuse the *utility-scoring approach*), `describe.ts`, `Board.tsx`, `Dice.tsx`, `PlayerPanel.tsx`, `colors.ts`.

**Suggestion:** before the second game, extract the copy-as-is files into a shared folder (or a small package) only once you have actually used them twice. Build the second game first, then extract what turned out to be shared.

---

## 3. Project skeleton

```
src/
├── game/        Pure rules: types, engine (applyAction), rules (legal moves), bot, describe (log text), history
├── net/         Online play, no React: protocol, transport, peer/memory adapters, host/guest sessions, invite, iceServers
├── store/       Zustand: gameStore (action log + derived state + settings), onlineStore (roles, sessions)
├── hooks/       useXGame (timing + action pipeline), useGameClock, useNow, useOnline
├── components/  Screens (Setup, HostLobby, Join, Game) and pieces (Board, panels, dialogs, icons)
├── audio/       sfx.ts
├── App.tsx      Chooses the screen from store state
└── main.tsx
api/
└── turn.ts      Vercel function: private TURN_* variables → relay details
docs/            Study guide (keep updated when patterns change)
```

**Dependency rule:** `game/` imports nothing outside itself. `net/` does not import React. Components never call the engine to change state; they call the hook.

**Stack that worked:** Vite + React 19 + TypeScript (strict, `erasableSyntaxOnly`) + Zustand + Vitest + Testing Library + jsdom + oxlint + PeerJS, deployed on Vercel. Three runtime dependencies besides React.

---

## 4. The engine contract

Give the next game's engine the same shape, so the store, history, network and hook carry over unchanged.

```ts
// types.ts
type PlayerKind = 'human' | 'bot'
interface PlayerConfig { seat: SeatId; kind: PlayerKind; name?: string; remote?: boolean }
interface Player { seat: SeatId; kind: PlayerKind; name: string; remote: boolean; bot: BotProfile | null; finishRank: number | null /* + game data */ }

interface GameState {
  players: Player[]
  current: number          // whose turn
  phase: 'roll' | 'move' | 'gameOver' /* game-specific */
  events: GameEvent[]      // what the LAST action caused (for sounds, log, banners)
  /* game-specific board state */
}

type GameAction =                      // every action records who acted
  | { type: 'roll'; value: number; actor: PlayerKind }   // randomness stored
  | { type: 'move'; /* choice */; actor: PlayerKind }
  | { type: 'end'; actor: PlayerKind }                    // end early, rank by progress
  | { type: 'takeover'; seat: SeatId; bot: BotProfile; actor: PlayerKind }

// engine.ts
createGame(configs, rng = secureRandom): GameState   // bots get random profiles from rng
applyAction(state, action): GameState                 // pure; returns the same state if the action is illegal
legalMoves(state): Move[]                             // used by UI highlighting, bots and validation
```

Habits worth keeping:
- **Return the same state object for illegal actions.** Callers (and the host validating guest intents) can check `next === state`.
- **`events` on every state** describes what just happened. The UI turns events into sounds, log lines, banners and notices. The log is derived from events, never stored.
- **Display names are computed once** in `createGame` ("You", "Host", "Player N", "Friend N", "Bot N") and changed only by actions (takeover).
- **Use `secureRandom`** (`crypto.getRandomValues`) as the default, and allow an `rng` parameter for tests.
- **Seeded simulations** play hundreds of full bot-only games in tests and check invariants after every action. This found a real bug ([section 9](#9-pitfalls-we-hit)).

---

## 5. The action pipeline and timing

Most of the work in a game like this goes into timing, not rules. The pattern in `useLudoGame.ts`:

```
decide (human click / bot choice / auto rule / guest intent at host)
  → announce (host only: broadcast the action with seq + gameId)
  → animate (dice tumble, step-by-step walk; state not yet recorded)
  → record (store.record(action); state re-derived)
  → settle (show final state, play sounds, celebration/notice, release busy lock)
```

- **Busy lock in state and a ref.** State for rendering (disable buttons), ref for timer callbacks (no stale closures).
- **One scheduler effect.** On every render where nothing is busy or paused, it decides the single next automatic step (bot roll, auto roll, auto move, host handling a queued intent) and schedules exactly one timer. It always returns a cleanup.
- **`later(fn, ms)`** pushes timer ids into a ref, and every id is cleared on unmount. Starting a new game changes `session`, which is used as a React `key`, so the whole game screen remounts and old timers die.
- **Timing constants are exported** (`TIMING.ROLL_MS`, `STEP_MS`, `SETTLE_MS`, `BOT_ROLL_MS`, `BOT_MOVE_MS`, `AUTO_MOVE_MS`, `AUTO_ROLL_MS`, `CELEBRATE_MS`, `NOTICE_MS`) so tests and tuning use the same numbers.
- **Read fresh state inside callbacks** with `useGameStore.getState()`, not values captured at render.
- **Blocking vs non-blocking feedback.** A celebration holds play for a moment. A notice (like a bot takeover) does not hold play. Pausing takes effect after the current animation.
- **Guests never apply anything locally.** They send an intent, block repeat intents for the same `seq`, and wait for the host's action to come back through the same animate/record path.

---

## 6. Feature checklist to carry forward

Players of this game now expect these. Tick them off in the next game, adapting the wording.

### Setup
- [ ] Seats can be **Human**, **Bot** or **Online friend**; 2 or 4 seats (or whatever the game supports).
- [ ] **At least one human** required. Message: "At least one seat must be a human player."
- [ ] Hosting needs a human seat on this device, and at least one Online friend seat.
- [ ] **Names** validated (not blank, unique, case-insensitive), max 12 characters, sanitised for online.
- [ ] **Pick colours/positions** when not all seats are used (third pick replaces the oldest).
- [ ] Last setup **remembered** after a game, to restart quickly.
- [ ] Game-specific assist options with clear labels (here: **Comeback dice**).

### During play
- [ ] **Auto roll** switch, on by default, persisted. Never auto-choose a real decision.
- [ ] **Auto move** switch, on by default, persisted: play forced moves (only one option, or all options equivalent) automatically. Online, each device automates only its own seat by sending intents; the host never auto-plays a remote human's move.
- [ ] **Bot personalities** (here balanced/hunter/guardian/racer) assigned randomly per game, ±15% weight jitter, small noise on close calls, and always take obvious wins/captures. The persona label is shown on the bot's panel.
- [ ] **Comeback assist** for long droughts: fair dice first, small disclosed boost after a grace period, capped, applies to everyone, switchable.
- [ ] **Last-move trail**: faint polyline in the mover's colour along the path just taken, ring on the starting square, dark casing so it shows on same-coloured squares. Set on settle from the `move` event; cleared when the next move starts animating and on undo/redo. View-only state in the hook, not game state.
- [ ] **Whose turn** is obvious: arrow, highlighted panel, live prompt line.
- [ ] **Undo/redo** (local only): undo returns to the human's last decision, removing bot turns after it.
- [ ] **Game log**, collapsible, derived from events.
- [ ] **Pause**, plus **auto-pause** when the tab is hidden or loses focus (local games only; never online).
- [ ] **Sound** with a mute switch, synthesised (no audio files).
- [ ] **Game clock** that stops while paused.
- [ ] **Keyboard shortcuts** for everything (Space roll, 1–4 pick, arrows undo/redo, P pause, L log, N new, S settings), ignored while typing or when a dialog is open.
- [ ] **Touch-aware prompts** ("Tap your dice"), keyboard help hidden on touch devices.

### Finishing
- [ ] **Celebrate each player who finishes** (banner, confetti, sound), not only the winner.
- [ ] **Offer to end early** when all humans have finished and only bots remain; unfinished players ranked by progress.
- [ ] **Win overlay** with full ranking, New game and back to setup.
- [ ] **Confirm destructive actions** (abandon game), but not cheap ones.

### Online
- [ ] **Invite link**, no login: name only. Link valid for **5 minutes** with a countdown, Copy, Share (Web Share API) and Reset link.
- [ ] Lobby shows who has joined; host can **start now** with bots filling empty seats.
- [ ] **Host is the authority**: guests send intents; the host validates turn/seat/`seq` and rolls dice.
- [ ] **Reconnect** after refresh using a seat secret in `sessionStorage`, even after the link expired.
- [ ] Host sees "X lost connection" with **Let a bot play**. The seat is renamed "Bot N" and **every player gets a notice**.
- [ ] Guest sees "connection dropped" with Reconnect/Leave.
- [ ] Host can **End online game** and start a **New game** with the same people. Pause is host-only; undo is disabled online.
- [ ] **TURN relay** configured, so mobile data works ([section 7](#7-online-multiplayer-recipe)).

### Quality
- [ ] Accessible: native buttons, `role="switch"`, `aria-pressed`, `aria-live`, `role="alert"`, dialogs with focus management, board `aria-label`.
- [ ] `prefers-reduced-motion` turns off decorative animation.
- [ ] **Theme**: System (default) / Light / Dark in the footer, CSS custom properties with `prefers-color-scheme` + `data-theme`, inline pre-paint script in `index.html`, game colours unchanged across themes.
- [ ] Settings in `localStorage`, every access wrapped in try/catch.
- [ ] PeerJS loaded only when someone goes online (code splitting).
- [ ] README with a **"Choices we made"** table explaining every house rule and trade-off.

---

## 7. Online multiplayer recipe

### Architecture (free, no backend of your own)
- **Signalling:** PeerJS public server (`0.peerjs.com`). It only introduces browsers.
- **Transport:** WebRTC data channel, `reliable: true`, JSON serialisation. Encrypted (DTLS).
- **NAT traversal:** Google STUN + **TURN from Metered's free plan**, served through `/api/turn`.
- **Authority:** the host's browser. If the host's tab closes, the game ends (accepted limitation).

### Protocol essentials
- Guest → host: `hello {v, token, name, secret?}`, `intent {seq, ...}`, `resync`, `leave`.
- Host → guest: `welcome {color, secret}` / `reject {reason}`, `lobby`, `sync {snapshot}`, `action {gameId, seq, action}`, `paused`, `ended`.
- `seq` = index in the action log. Guests detect gaps and ask for `resync`. Duplicates are ignored. An old `gameId` is dropped. Intents with a stale `seq` are dropped by the host (no double rolls).
- Parse every inbound message strictly and **rebuild** the object (drop unknown fields). Treat even your own `/api/turn` response as untrusted.

### Deployment checklist (Vercel)
1. Push the code. Vercel deploys from GitHub, **so uncommitted files are not deployed** (this caused a 404 on `/api/turn` once).
2. Metered: create a free app and copy its credentials API URL.
3. Vercel → Project → Settings → Environment Variables: `TURN_CREDENTIALS_URL`, marked **Sensitive**, for Production (and Preview if used). **Do not use a `VITE_` prefix**: Vite compiles every `VITE_*` value into the public bundle, and Vercel warns about it.
4. Redeploy, then open `https://<site>/api/turn`. Expect JSON with `turn:` URLs; an empty list means the variable is missing for that environment.
5. Locally: put the same variable in `.env.local` (git-ignored). `npm run dev` serves `/api/turn` through the Vite plugin.

### Testing across networks
- Same machine / same Wi-Fi proves little: it uses local addresses. **Test phone on mobile data ↔ laptop on Wi-Fi early.**
- `chrome://webrtc-internals` (Chrome/Brave) shows the selected candidate pair: `host`/`srflx` = direct and free, `relay` = using the TURN quota.
- Data use is tiny (no audio/video): estimated well under 1 MB per relayed player per game. Direct connections use none of the TURN quota. Guest Wi-Fi networks with client isolation force the relay even on "the same Wi-Fi".
- Quick check that a server is alive: a STUN/TURN request over UDP (that is how we found PeerJS's old TURN hostnames no longer resolve).

### Threat model to restate
Guests can't forge dice or act out of turn. Names are sanitised. Invite links expire and have a single active token. Ids and tokens are random. Silent connections are dropped after 10 s. **The host can cheat**; fine for friends, not for strangers (needs a server or commit-reveal dice).

---

## 8. Testing recipe

| Layer | How | Example |
| --- | --- | --- |
| Rules | Plain calls, exact assertions, fixed `rng` (`() => 0.45` = always 3) | `engine.test.ts` |
| Simulations | Seeded (mulberry32) bot-only games with invariants after every action | `simulation.test.ts` |
| Bots | Hand-built positions (helper to place tokens by progress), assert the choice | `bot.test.ts` |
| Network | Real session classes over `MemoryNetwork`, injected `now()` and storage | `net/net.test.ts` |
| Store | Call actions, inspect derived state | `gameStore.test.ts` |
| Hook timing | `renderHook` + fake timers, advanced **in stages** so effects re-schedule | `useLudoGame.test.ts`, `online.test.ts` |
| Components | Query by role and accessible name, like a user | `SetupScreen.test.tsx`, `App.test.tsx` |
| Serverless | Call the handler's pure function with a fake `fetch` | `api/turn.test.ts` |

Rules learned the hard way:
- With promises involved, fake **only** timer functions (`toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']`) so microtasks still run, and flush them with a small `tick()` helper.
- Zustand stores are singletons: reset them in `beforeEach` (including "last used" values).
- Unmount (`cleanup()`) **before** tearing down stores, as the app does.
- Bug fix = failing test first. Run it before the fix to prove it reproduces the bug.
- Real WebRTC between two browsers was not automatable here (headless Firefox gathered no ICE candidates). Keep the real adapter thin and test it by hand, and say so.

---

## 9. Pitfalls we hit

| Problem | Cause | Fix / lesson |
| --- | --- | --- |
| 2-player game crashed (`reading 'finishRank'`) | UI assumed all four colours had players | Render panels only for seated players; regression test through the real setup screen |
| Mixed colours left on one square after a capture | Capture removed only the first token of a stacked pair | Capture every opponent on the landing square. Found only after **seeding** the simulation |
| Simulation became flaky | `createGame` started drawing unseeded randomness for bot profiles | Pass `rng` everywhere randomness is used |
| Timers acted on old values | Stale closures in scheduled callbacks | Busy ref + `getState()` inside callbacks |
| Hook test skipped steps | One big `advanceTimersByTime` jumped past effect re-scheduling | Advance in stages |
| `erasableSyntaxOnly` build error (TS1294) | Constructor parameter properties | Assign fields explicitly in constructors |
| Zustand selector did not update for a session object | Session state lived outside the store | `useSyncExternalStore` with immutable snapshots |
| Lint: setState inside an effect | Handling the network inbox synchronously in an effect | Defer with `setTimeout(0)` |
| Online tests threw "requires an active game" | Store torn down while the hook was mounted | `cleanup()` before `leave()` |
| Host "New game" after a takeover reused old seats | Restarted from stale configs | Restart from the host session's current seats |
| Phone on 4G could not join | PeerJS's bundled TURN servers had shut down; same-machine tests hid it | Configurable TURN, STUN fallback, console warning, test across networks |
| Vercel warned about `VITE_ICE_SERVERS_URL` | `VITE_*` is public by design | Private `TURN_*` variable read by `/api/turn` |
| `/api/turn` returned 404 after deploy | The function was never committed or pushed | Check `git status` before debugging a deploy |
| Takeover was invisible to guests | Seat kept the human's name; only the host knew | Rename in the engine, emit an event with both names, show a notice to everyone |

---

## 10. Defaults and decisions to keep

| Decision | Default | Why |
| --- | --- | --- |
| Auto roll | On | Removes friction; real choices still wait for the player |
| Theme | System | Respect the device; let players override |
| Auto move | On | Same, for forced moves; some players want to click every move |
| Comeback assist | On, disclosed, switchable, same for bots | Fair dice feel unfair in long droughts |
| Auto-pause on hidden tab | Local games only | Pausing an online game would freeze everyone |
| Undo | Local only, back to your last decision | Rewriting shared history online would confuse others |
| Invite expiry | 5 minutes, host-enforced | Long enough to share, short enough to limit reuse |
| Invite in URL fragment (`#`) | Always | Never sent to servers or logs |
| Bot strength | One-move lookahead with personas | Fun and varied rather than optimal; measured by simulation |
| Sounds | Synthesised | No files, no licensing |
| Licence | GPL-3.0-or-later | Free to copy and modify; derivatives must stay open |
| Hosting | Static site + one optional serverless function on Vercel free tier | No paid infrastructure (a hard constraint) |
| Login | None; name only | Hard constraint: no email or phone |

---

## 11. What to do differently next time

- **Set up deploys, TURN and a two-device test in week one**, not at the end. Network problems only show up across real networks.
- **Split the big screen component early.** `GameScreen.tsx` grew large; extract `useShortcuts`, banners and the toolbar from the start.
- **Enable `noUncheckedIndexedAccess`** from the first commit (the 2-player crash was an unchecked lookup).
- **Persist local games** through the action log (cheap with event sourcing; refreshing currently loses the game).
- **Playwright two-browser test** with Chromium's WebRTC flags, if CI with network access is available.
- **Board text alternative** for screen reader users (where are my pieces?), designed in from the start.
- **Extract a shared "game shell"** (action log store, pipeline hook, network) after the second game proves what is common.
- Consider **spectators** (read-only `watch` hello) and **self-hosted signalling** as configuration.

---

## 12. Step-by-step plan for the next game

1. **Write the rules down** in the README's "Choices we made" table before coding. Decide house rules explicitly.
2. **Scaffold** with Vite React TS. Copy configs: `tsconfig.*`, `vite.config.ts` (with `turnApi`), Vitest setup, `.vercelignore`, `.env.example`, `LICENSE`.
3. **Types first** (`game/types.ts`) following [section 4](#4-the-engine-contract): seats, state, actions with recorded randomness, events.
4. **Engine + tests**, pure, with fixed `rng`. Then a **seeded simulation** with invariants.
5. **Store** (copy `gameStore.ts`: action log, derived state, undo/redo, settings) and **history**.
6. **Minimal UI**: setup screen and board, playable locally with clicks.
7. **Pipeline hook**: busy lock, timing constants, animation, scheduler effect. Hook tests with staged fake timers.
8. **Bots**: utility scoring with personas, jitter and noise; check strength with simulations.
9. **Polish features** from the [checklist](#6-feature-checklist-to-carry-forward): auto roll/move, celebrations, notices, end-early offer, pause/auto-pause, sound, clock, shortcuts, touch, reduced motion.
10. **Online**: copy `net/`, `onlineStore.ts`, `api/turn.ts`; adapt the intent type and seat model; copy lobby/join screens. Deploy to Vercel with `TURN_CREDENTIALS_URL` and **test phone-on-data ↔ laptop immediately**.
11. **Docs**: README (features, choices, online setup, limitations), and update the study guide chapters with anything new.

---

## Kick-off prompt

Paste this at the start of the next project, together with this file:

> I'm building a new turn-based browser game: **<name and one-paragraph rules>**. Use `LEARNINGS.md` from my Ludo project as the blueprint. Keep the same architecture: event-sourced state (initial state + action log, randomness recorded in actions), pure `game/` engine with injected `rng`, Zustand store with derived state and undo/redo, one action pipeline hook with exported timing constants, and the `net/` host-authoritative WebRTC layer with invite links (5-minute expiry), seat secrets, bot takeover and TURN via `/api/turn`. Constraints: no paid hosting, no email/phone login, GPL-3.0. Carry forward every item in the feature checklist that applies, and tell me which ones don't fit this game and why. Start with the rules table and `types.ts`, then the engine with tests, before any UI.
