# 1. Architecture and folder structure

## The layers

```
            ┌───────────────────────── UI (React) ─────────────────────────┐
            │ components/   App, SetupScreen, GameScreen, Board, HostLobby │
            └───────────────▲───────────────────────────────▲──────────────┘
                            │ reads state, calls actions    │
            ┌───────────────┴───────────┐     ┌─────────────┴─────────────┐
            │ hooks/  useLudoGame       │     │ hooks/  useOnline         │
            │ (timing, turn flow)       │     │ (session views)           │
            └───────────────▲───────────┘     └─────────────▲─────────────┘
                            │                               │
            ┌───────────────┴───────────┐     ┌─────────────┴─────────────┐
            │ store/  gameStore         │◀────│ store/  onlineStore       │
            │ (history, settings)       │     │ (role, session, inbox)    │
            └───────────────▲───────────┘     └─────────────▲─────────────┘
                            │                               │
            ┌───────────────┴───────────┐     ┌─────────────┴─────────────┐
            │ game/  pure rules         │◀────│ net/  sessions, protocol  │
            │ engine, rules, bot        │     │ transport (interfaces)    │
            └───────────────────────────┘     └───────────────────────────┘
```

Arrows point from the code that depends to the code it depends on. The important property: **arrows only point down**. `game/` imports nothing from React, the stores or the network. `net/` imports types from `game/` but nothing from React. You could lift `game/` into a Node server, a CLI or a React Native app unchanged.

Check it yourself:

```bash
grep -rn "from 'react'" src/game src/net    # nothing
grep -rn "store/" src/game src/net          # nothing
```

## Functional core, imperative shell

The pattern behind the layering has a name: **functional core, imperative shell**.

- **Core** ([src/game/](../src/game/)): pure functions. `rollWithValue(state, 6)` returns a new state. No clocks, no randomness, no I/O. Easy to test, easy to reason about, easy to replay.
- **Shell** (hooks, stores, components, `net/`): everything with side effects: timers, randomness, audio, the DOM, WebRTC, `localStorage`.

Notice how randomness is pushed to the edge. The engine never calls `Math.random`. [`rollWithValue`](../src/game/engine.ts) takes a die value. The shell picks the value with [`rollFor`](../src/game/engine.ts), which takes an injected `rng`. This is why replays are exact and tests can force any roll.

## Ports and adapters

Online play needs a network, and tests need no network. [src/net/transport.ts](../src/net/transport.ts) defines a **port**: the `Network` and `Channel` interfaces. Two **adapters** implement it:

- [peerNetwork.ts](../src/net/peerNetwork.ts): real WebRTC through PeerJS.
- [memoryNetwork.ts](../src/net/memoryNetwork.ts): in-process queues for tests.

[hostSession.ts](../src/net/hostSession.ts) and [guestSession.ts](../src/net/guestSession.ts) only know the port. That is why 25 networking tests run in milliseconds with no browser. This is also called **hexagonal architecture** or **dependency inversion**: high-level policy (who gets a seat) does not depend on low-level detail (WebRTC); both depend on an abstraction.

## Folder structure: by layer or by feature?

This repo groups by **layer** (`game/`, `net/`, `store/`, `hooks/`, `components/`). The common alternative is **by feature** (`features/setup/`, `features/online/`, `features/board/`, each with its own components, hooks and state).

| | By layer (this repo) | By feature |
| --- | --- | --- |
| Good when | The app is small, layers have very different rules (pure vs. effectful) | Many teams, many features, features ship independently |
| Strength | Dependency rules are easy to see and enforce | Related code sits together; deleting a feature is deleting a folder |
| Weakness | A feature change touches several folders | Shared domain logic needs a home (often `shared/` or `domain/`) |

For a principal interview, the right answer is not "feature folders are better". It is: *choose the structure that makes your most important rule easy to keep*. Here the most important rule is "the rules engine stays pure", so a top-level `game/` folder makes violations obvious in review. In a large product you might combine them: `domain/` (pure, by layer) plus `features/` (by feature).

## Where does new code go?

| If the code... | Put it in |
| --- | --- |
| Decides what is legal or what happens in the game | `game/` (pure, with tests) |
| Talks to another device | `net/` behind the `Network` port |
| Holds state that several components need, or must survive a remount | `store/` |
| Schedules things over time, or adapts a store for a component | `hooks/` |
| Draws something or handles a click | `components/` |

## Module boundaries worth noticing

- [`types.ts`](../src/game/types.ts) is the shared vocabulary. Every layer imports it, and it imports nothing.
- [`describe.ts`](../src/game/describe.ts) turns events into log text. Keeping text out of the engine means the engine can be reused with different wording or languages.
- [`colors.ts`](../src/components/colors.ts) keeps display colours in the UI layer, not the domain.
- The PeerJS adapter is loaded with `import('peerjs')`, so the bundler splits it into its own file ([chapter 9](09-accessibility-performance-ux.md)).

## Exercises

1. Draw the import graph of `src/` from memory, then check it with `grep -rn "^import" src`. Did anything surprise you?
2. Add a lint rule (or a test) that fails if any file in `src/game/` imports from `react`, `zustand` or `src/store`. Why is a mechanical check better than a code-review convention?
3. Sketch how you would reorganise this repo by feature. Where would `engine.ts` go? What breaks?
4. Write a third `Network` adapter, `BroadcastChannelNetwork`, that connects tabs in the same browser. Which files did you need to touch? (Answer: one new file. That is the point of the port.)
