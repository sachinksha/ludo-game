# 7. Testing strategy

`npm test` runs 170 tests in about two seconds with Vitest, jsdom and React Testing Library.

## Shape of the suite

| Layer | Files | Style | Speed |
| --- | --- | --- | --- |
| Pure rules | `engine.test.ts`, `layout.test.ts`, `bot.test.ts`, `names.test.ts` | Plain function calls, exact assertions | Fastest |
| Simulations | `simulation.test.ts` | Seeded full games with invariants | Fast |
| Networking | `net/net.test.ts` | Real session classes over an in-memory network | Fast |
| Stores | `gameStore.test.ts` | Call actions, inspect state | Fast |
| Hooks | `useLudoGame.test.ts`, `online.test.ts` | `renderHook` + fake timers | Medium |
| Components | `SetupScreen.test.tsx`, `App.test.tsx`, ... | Render, click by role/label, assert on screen | Medium |

Most logic sits in pure code, so most tests are cheap. This is the practical meaning of "design for testability": the architecture ([chapter 1](01-architecture.md)) decides how easy testing is long before you write a test.

## Inject what is hard to control

- **Randomness.** Engine functions take an `rng`. Tests pass `() => 0.45` (always a 3) or a seeded generator (mulberry32 in `simulation.test.ts`). An early version of the simulation broke when `createGame` started drawing from unseeded randomness; seeding it made failures reproducible, which exposed the stacked-capture bug ([chapter 6](06-rules-engine-and-ai.md)).
- **Time.** `vi.useFakeTimers()` plus `vi.advanceTimersByTime(TIMING.ROLL_MS + 10)`. Tests import `TIMING` rather than hard-coding milliseconds.
- **The network.** `MemoryNetwork` implements the same interface as PeerJS. Messages are JSON round-tripped, like the wire, and delivered on a microtask, like a real (asynchronous) network.
- **Clock for expiry.** `HostSession` accepts `now: () => number`, so a test can jump past the 5-minute expiry instantly.
- **Storage.** `GuestSession` takes a `SeatStore` interface; tests pass a `Map`-backed fake.

## Fake timers and React

Advancing a large span at once can skip steps, because each step schedules the next only after React re-renders and runs effects. The hook tests advance in stages:

```ts
act(() => vi.advanceTimersByTime(TIMING.ROLL_MS + 10))
act(() => vi.advanceTimersByTime(TIMING.SETTLE_MS + 10))
act(() => vi.advanceTimersByTime(TIMING.AUTO_MOVE_MS + 10))
```

The online hook tests fake only timer functions (`toFake: ['setTimeout', ...]`) so promise microtasks (network delivery) still run, and flush them with a small `tick()` helper. Knowing *which* async primitives you are faking is the difference between flaky and solid async tests.

## Query like a user

Component tests find elements by role and accessible name:

```ts
fireEvent.click(screen.getByRole('button', { name: 'Blue', pressed: false }))
expect(screen.getByRole('alert')).toHaveTextContent('Set at least one seat to Online friend.')
```

If a test cannot find a control by role and name, a screen reader user cannot either. Tests double as an accessibility check.

## Test behaviour, not implementation

Good: "a guest's double tap sends one intent" ([online.test.ts](../src/hooks/online.test.ts)). Fragile: "`intentSentAt.current` equals 1". The first survives refactors; the second breaks on renames.

## Regression tests first

When the 2-player crash was reported (`Cannot read properties of undefined (reading 'finishRank')`), the fix came with a test that starts a 2-player game through the real setup screen. Running it **before** the fix reproduced the exact error, which proves the test covers the bug. Make "write the failing test first" a habit for bug fixes.

## Test isolation with singletons

Zustand stores are module singletons, so state leaks between tests unless reset. `beforeEach` calls `abort()` and clears `lastConfigs`. The online tests call `cleanup()` (unmount) before `leave()`, mirroring the app where the screen unmounts before the game disappears. Order of teardown matters.

## What is not automated, and why

- **Real WebRTC between two browsers.** It needs two browser processes, UDP networking and the public PeerJS servers. An attempt to automate it with headless Firefox failed because that environment could not gather any ICE candidates. The protocol and sessions are tested over the in-memory network; the WebRTC adapter (~100 lines) is tested by hand. Be explicit about such gaps rather than pretending coverage.
- **Visual appearance.** No screenshot tests. A tool like Playwright with visual comparisons would add this.

## Exercises

1. Write a Playwright test that opens two browser contexts and plays an online game on your machine. What do you need for CI (hint: Chromium's fake media/WebRTC flags, network access)?
2. Add a property-based test with `fast-check` for `parseGuestMessage`: random JSON must never throw and never return an object with extra keys.
3. Find an untested branch with `npx vitest run --coverage` and test it. Was it worth testing?
4. Make one test flaky on purpose (rely on real time). Then fix it. Write down the rule you followed.
