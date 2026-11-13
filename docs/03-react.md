# 3. React patterns

## A hook as a controller

[`useLudoGame`](../src/hooks/useLudoGame.ts) returns a `LudoController`: data (`game`, `shownPlayers`, `busy`, ...) plus commands (`roll`, `pickToken`, `undo`, ...). [`GameScreen`](../src/components/GameScreen.tsx) receives it as a single prop and renders.

This separates **behaviour** (timing, turn flow, network roles) from **presentation** (layout, labels). You can test the hook alone with `renderHook` ([useLudoGame.test.ts](../src/hooks/useLudoGame.test.ts)) and the screen with a fake controller. It is the hooks-era version of the container/presentational split.

[`App.tsx`](../src/App.tsx) creates the controller inside a small `LudoSession` component, keyed by session:

```tsx
if (game) screen = <LudoSession key={session} />
```

## Keys reset state

When `session` changes (new game, or a host's snapshot arrives), React sees a different `key`, unmounts the old `LudoSession` and mounts a new one. Every `useState`, `useRef` and timer inside is discarded. This is the idiomatic way to **reset a subtree**, cleaner than writing "reset everything" effects. The game clock ([useGameClock.ts](../src/hooks/useGameClock.ts)) relies on it: "mount a fresh component to reset it".

## State versus refs, and stale closures

The hook keeps `busy` in **both** state and a ref:

```ts
const [busy, setBusy] = useState(false)
const busyRef = useRef(false)
const setBusyBoth = (value) => { busyRef.current = value; setBusy(value) }
```

- **State** triggers a re-render, so the UI and effects see the new value.
- **Ref** is read synchronously by callbacks scheduled earlier (timers), which would otherwise see the `busy` value from the render that created them. That outdated value is a **stale closure**.

Rule of thumb: render-affecting values go in state; values read by long-lived callbacks go in refs (or are read fresh from a store with `getState()`, as `performRoll` does).

## Effects as schedulers

One effect drives the whole game:

```ts
useEffect(() => {
  if (busy || paused || offerEnd || game.phase === 'gameOver') return
  if (game.phase === 'roll' && seat.kind === 'bot') {
    const id = window.setTimeout(performRoll, TIMING.BOT_ROLL_MS)
    return () => window.clearTimeout(id)
  }
  ...
}, [game, busy, paused, ...])
```

Every time the game, `busy` or `paused` changes, React re-runs it. It looks at the current situation, schedules **at most one** next step, and returns a cleanup that cancels it. So pausing, undoing or unmounting automatically cancels pending work. There is no hand-written "cancel all timers" logic.

The pattern is **reconciliation**: describe what should be scheduled for this state, and let React's effect lifecycle handle the transitions. Note the scheduled work runs from a timer, never synchronously inside the effect. The linter (`react(set-state-in-effect)`) warns about synchronous state updates inside effects because they cause cascading renders.

## External stores: `useSyncExternalStore`

The network sessions are plain classes, not React state. To render their state safely, [useOnline.ts](../src/hooks/useOnline.ts) uses:

```ts
return useSyncExternalStore(host?.subscribe ?? noop, host?.getView ?? none)
```

The contract: `subscribe(listener)` returns an unsubscribe function, and `getSnapshot()` returns an **immutable** value that only changes identity when the data changes. That is why `HostSession.changed()` builds a new `view` object each time. React re-renders on change and guarantees every component sees the same snapshot in a render (no **tearing** under concurrent rendering). Zustand itself is built on this hook.

There's a bug this design avoids: an early draft read `useOnlineStore((s) => s.guest?.getView().color)`. The guest object never changed identity, so zustand never re-rendered when the colour arrived. The fix was to subscribe to the session itself.

## Selectors

```ts
const autoRoll = useGameStore((s) => s.settings.autoRoll)
```

Each component subscribes to the slice it needs. Zustand compares the selected value with `Object.is`, so the component re-renders only when that slice changes. Selecting a whole object (`useGameStore((s) => s)`) would re-render on every change.

## Controlled inputs and derived validation

[SetupScreen](../src/components/SetupScreen.tsx) holds the form in state (mode, colours, seat kinds, names) and **derives** everything else during render: default names, validation errors, whether Start is enabled. Nothing derived is stored, so nothing can drift out of sync. Ask yourself of every `useState`: "can this be computed from other state?" If yes, compute it.

## Lazy initial state

```ts
const [pair, setPair] = useState<Color[]>(() => (initial?.length === 2 ? ... : DEFAULT_PAIR))
```

Passing a function means the initialiser runs once, not on every render. Use it whenever the initial value is computed.

## StrictMode

[main.tsx](../src/main.tsx) wraps the app in `<StrictMode>`. In development, React mounts components, unmounts them and mounts them again, so effects run setup → cleanup → setup. Code that breaks under this (an effect that opens a connection without closing it in cleanup) would also break in real remounts. The invite-parsing effect in `App` is safe because `openInvite` is idempotent.

## Composition over configuration

`ConfirmDialog` takes `confirmClass` so the same dialog serves "Abort game" (danger) and "End game" (primary). `WinOverlay` makes `onNewGame` optional: guests cannot start games, so the button simply does not render. Small, optional props beat boolean flag explosions (`isGuest`, `isHost`, ...).

## Exercises

1. Remove `busyRef` and read `busy` from state inside `performRoll`. Write a test that shows the stale-closure bug.
2. Split `GameScreen` (300+ lines) into smaller components. Where should the keyboard handler live? Should it be a custom hook (`useShortcuts`)?
3. Replace the `key={session}` reset with an effect that resets state on session change. Compare complexity. Why is the key better?
4. Wrap `Board` in `React.memo`. Measure with the React DevTools Profiler during a move. Did it help? Why or why not? (Hint: look at what props change.)
