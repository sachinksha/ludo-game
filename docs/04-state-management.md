# 4. State management

## Kinds of state in this app

Principal-level answers start by **classifying** state, because each kind wants a different home.

| Kind | Example here | Lives in | Why there |
| --- | --- | --- | --- |
| Domain state | Tokens, turn, phase | `gameStore` (derived from the action log) | Shared by many components, must survive remounts, needs undo |
| Session state | Role, live network session, inbox | `onlineStore` | App-wide, not part of the game's rules |
| External state | Who is connected, invite expiry | `HostSession` / `GuestSession` objects | Owned by non-React code, read with `useSyncExternalStore` |
| Animation state | Where a token is drawn mid-move, dice tumbling | `useState` in `useLudoGame` | Visual only, per mount, thrown away on reset |
| Form state | Setup choices | `useState` in `SetupScreen` | Local until submitted |
| Persisted preferences | Auto roll, auto move, comeback dice | `gameStore.settings` + `localStorage` | Should survive reloads |
| Per-tab identity | Online seat secret | `sessionStorage` | Survives refresh, not shared across tabs |
| Derived state | Log text, legal moves, validation errors | Computed, never stored | Cannot drift out of sync |

## The action log: event sourcing in the browser

The central decision ([gameStore.ts](../src/store/gameStore.ts)):

```ts
initial: GameState | null    // the starting position
actions: GameAction[]        // every decision, oldest first: the source of truth
game: GameState | null       // derived: replay(initial, actions)
log: LogEntry[]              // derived from the events of each action
```

Each `record(action)` appends and re-derives. This is **event sourcing**: store the events, derive the state. What it buys:

- **Undo/redo** is slicing an array ([`undoIndex`](../src/game/history.ts) finds the last human roll). Redo puts the slice back.
- **The game log** is a by-product of replay.
- **Tests** can build any position by replaying actions.
- **Online play** sends the same actions over the network. A guest is a replica that applies the host's log ([chapter 8](08-multiplayer-system-design.md)).
- **Debugging**: a bug report could be the action list, replayed exactly.

The requirement that makes it work: **replay must be deterministic**. Rolls store their value. Bot styles are chosen in `createGame` and stored in the initial state. A bot takeover carries its profile inside the action. Anything random is decided once and recorded.

Cost: re-deriving replays the whole list on every action. A Ludo game is a few hundred actions, so this is microseconds. For long histories you would add **snapshots** (store the state every N actions and replay from the nearest one). Be ready to say this unprompted.

## Why Zustand?

Zustand is a small store with a hook. Compared with alternatives:

| Option | Fit here |
| --- | --- |
| `useState` + props | Fine for one screen. Here the game state is read by the hook, the screen, the online store and tests outside React |
| React Context + `useReducer` | Works, but every consumer re-renders on any change unless you split contexts. No access outside React |
| Redux Toolkit | Same model (actions + reducer) with excellent devtools. More ceremony for a small app |
| Zustand (chosen) | Tiny, selector-based subscriptions, `getState()`/`subscribe()` outside React, no provider |
| XState | Great for complex state machines; the game's phases (roll → move → roll) are simple enough to hand-roll |

Notice the engine is already a reducer (`applyAction(state, action) => state`). Swapping Zustand for Redux would not touch `game/` at all. The rules are independent of the state library, which is the real architectural win.

## Stores talking to stores

[onlineStore.ts](../src/store/onlineStore.ts) subscribes to the game store at module level:

```ts
useGameStore.subscribe((state, prev) => {
  if (role !== 'host' || !host) return
  if (state.initial && state.initial !== prev.initial) host.startGame(state.initial, state.paused)
  else if (state.paused !== prev.paused) host.setPaused(state.paused)
})
```

Starting a new game or pausing, from anywhere, is broadcast to guests without any component knowing about networking. The trade-off: this behaviour is implicit, so it needs a comment and a test. Use subscriptions for cross-cutting reactions ("whenever X changes, tell Y"), and explicit calls for decisions with timing that matters. Actions are announced explicitly in `submit()` because guests should start animating at the same moment as the host, not after the host's animation ends.

## Client state versus server state

You asked whether online play needs "server state management". It's worth being precise, because interviewers probe this.

- **Server state** usually means data owned by a backend, fetched over HTTP, possibly stale, shared by many users: a product catalogue, a user profile. Tools like **TanStack Query** or **SWR** manage caching, refetching, invalidation and loading states.
- **Real-time shared state** (a multiplayer game, a collaborative document) is different. Nobody "fetches" the game. One party is authoritative and others hold replicas kept in sync by a stream of updates.

Here, the host's browser is the authority, and guests are replicas. So the problem is **replication**, not caching:

| Concern | How it is handled |
| --- | --- |
| Single source of truth | The host's action log ([`HostSession.snapshot`](../src/net/hostSession.ts)) |
| Getting a replica | A `sync` message: initial state + actions |
| Keeping it current | Ordered `action` messages with sequence numbers |
| Detecting gaps | Guest compares `seq` with how many actions it has; asks for `resync` |
| Writes from replicas | Guests send intents; only the host writes |

If this game had a real backend (say, ranked matches with stored results), you would likely use **both**: TanStack Query for profile and match history (classic server state), and a WebSocket stream for the live game (replicated state).

## Persistence

Settings persist with plain `localStorage`, wrapped in `try/catch` because storage can throw (private mode, quota, disabled). Zustand also offers a `persist` middleware; writing it by hand here keeps the validation explicit (unknown or malformed values fall back to defaults in `loadSettings`). Never trust what you read back from storage.

The game itself is **not** persisted. With the action log, persisting it would be trivial: save `initial` and `actions`, reload them with `load()`. That is exercise 1.

## Exercises

1. Persist a local game across refreshes using the action log. What do you store? What about the redo stack? What if the rules change between versions (hint: version your saved data)?
2. Add snapshots to `derive()`: cache the state every 50 actions. Measure whether it matters. Explain when it would.
3. Rewrite `gameStore` with Redux Toolkit. What changed in `game/`? (Nothing should.)
4. List every place state is duplicated (`busy` and `busyRef`, `shownPlayers` and `game.players`). Justify each one or remove it.
