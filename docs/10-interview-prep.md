# 10. Interview preparation

Principal-level interviews test judgement more than recall: can you name the decision that matters, compare options, state trade-offs and risks, and say what you would do next. Practise each answer out loud in about two minutes. Each answer below points at code so you can speak from experience.

## Architecture and design

**Q: Walk me through the architecture of a project you know well.**
Start from the one key decision: game state is an initial state plus an action log, replayed by a pure engine. Then the layers: pure `game/`, effectful shell (stores, hooks, components), and `net/` behind a transport interface. Close with what it enabled: undo, the log, deterministic tests, and multiplayer with almost no new state model. ([Chapter 1](01-architecture.md), [chapter 4](04-state-management.md))

**Q: How do you decide where code lives?**
By its dependencies and side effects. Pure rules in `game/`, I/O behind interfaces, React only at the edges. Make the most important rule easy to see and enforce mechanically.

**Q: Feature folders or layer folders?**
It depends on team size and which boundary matters most. Here the pure-engine boundary matters most, so layers. In a large multi-team app, feature folders plus a shared pure domain layer.

**Q: How would you make this codebase support a second game (say, Snakes and Ladders)?**
Extract a generic shell: action log store, replay, the action pipeline hook and the network layer depend only on "a reducer plus a serialisable action type". Each game supplies its engine, its board component and its bot. Watch for premature abstraction: build the second game first, then extract what is truly shared.

## React

**Q: What is a stale closure and how did you avoid it?**
A callback captures variables from the render that created it. Timers scheduled earlier saw an old `busy`. The hook mirrors `busy` in a ref and reads store values with `getState()` inside callbacks. ([Chapter 3](03-react.md))

**Q: When would you use `useSyncExternalStore`?**
When state lives outside React (here, network session objects) and components must render it consistently. The snapshot must be immutable and stable between changes.

**Q: How do you reset component state cleanly?**
Change its `key`. A new game remounts `LudoSession`, discarding timers and local state.

**Q: Effects: what are they for, and what are common mistakes?**
For synchronising with things outside React: timers, subscriptions, the DOM, the network. Mistakes: deriving state in effects (compute it during render instead), missing cleanups, synchronous state updates inside effects causing cascades. The game's scheduler effect schedules at most one timer and always cleans up.

## State management

**Q: How would you implement undo/redo?**
Store actions, not snapshots. Undo truncates to a chosen index and pushes the removed group onto a redo stack. Replay derives the state. Requires deterministic replay: record random outcomes. Mention snapshots for long histories.

**Q: Client state versus server state?**
Server state is owned remotely and cached (TanStack Query territory). Live shared state needs an authority and replication (this game's host and action stream). A real product often has both. ([Chapter 4](04-state-management.md))

**Q: Why Zustand over Redux or Context?**
Small, selector-based, usable outside React (the network layer and tests need that), no provider. The engine is already a reducer, so switching libraries would not touch the rules.

## System design

**Q: Design online multiplayer for a turn-based game without a paid backend.**
Use the structure in [chapter 8](08-multiplayer-system-design.md): requirements, authority model, transport options with costs, protocol (intents up, actions down, sequence numbers), invite links with host-enforced expiry, reconnection with seat secrets, threat model, failure modes, and the path to a room server at scale.

**Q: How do you keep clients in sync?**
Single writer (the host), ordered reliable channel, sequence numbers to detect gaps, a full `sync` to recover, `gameId` to discard stale actions, `seq` on intents to drop stale requests.

**Q: How do you stop cheating?**
Clients send intents, never outcomes. The authority validates turn, seat and position, and owns randomness. Admit the residual risk: a host-authoritative peer can cheat; a server or commit-reveal dice fixes that.

**Q: The public signalling server is down. What happens, and what would you do?**
Hosting fails with a clear message; local play works. Short term: allow configuring a self-hosted PeerJS server. Long term: move to a room server you control.

**Q: Your WebRTC feature works locally but not from a phone on 4G. Why?**
Same-machine connections use local candidates, so NAT never comes up. Carrier-grade NAT on mobile data is usually symmetric, so STUN-discovered addresses do not work and a TURN relay is required. Here the default free relay had disappeared; the fix was configurable TURN with a STUN-only fallback. ([Chapter 8](08-multiplayer-system-design.md))

## Testing

**Q: How do you test time-based UI?**
Inject time. Fake timers, advance in steps so effects can re-schedule, export duration constants. Fake only the primitives you mean to (timers, not microtasks) when promises are involved.

**Q: How do you test networking code without a network?**
Put it behind an interface and write an in-memory adapter that behaves like the real one (asynchronous, JSON round-trip). Test the real session logic over it. Hand-test the thin real adapter, and say so.

**Q: Tell me about a bug your tests found.**
Seeded simulations with invariants revealed that capturing a stacked pair left mixed colours on an unsafe square. Making the simulation deterministic was the precondition for finding it. ([Chapter 6](06-rules-engine-and-ai.md))

## Product and judgement

**Q: Players complain the dice are rigged. What do you do?**
Check the facts first: the dice are fair, and a 10-roll drought happens about 16% of the time. Then address the feeling: an optional, disclosed comeback mechanic that applies to everyone, on by default and easy to turn off. Measure complaints afterwards.

**Q: How do you make bots fun, not just strong?**
Personalities with tunable weights, random variation per game, small noise on close calls, and a floor of sensible play (always take obvious captures and finishes). Measure strength with simulations so "fun" does not mean "dumb".

**Q: What would you change in this codebase?**
Have an honest list ready. For example:
- `GameScreen` is large; split it and extract a `useShortcuts` hook.
- Enable `noUncheckedIndexedAccess` and fix the fallout.
- Add Playwright end-to-end tests for two-browser online play in CI.
- Persist local games via the action log.
- Allow a self-hosted signalling server via configuration.
- Board text alternative for screen reader users.

## Behavioural angle

Principal interviews include "tell me about a time" questions. This project gives you real stories:
- **A trade-off you made:** free P2P versus a room server. What you gave up (host must stay online, host can cheat) and why it was right for the constraints.
- **Handling ambiguity:** "should bots behave differently?" turned into measurable personalities with a simulation-backed claim.
- **Raising quality:** a bug found by invariants, a regression test written before the fix.
- **Transparency:** documenting surprising rules and limitations instead of hiding them.

## Practice prompts

1. Explain event sourcing to a junior engineer using this game, in three minutes.
2. You have one week to add ranked online play with persistent ratings. What do you build, in what order, and what do you cut?
3. A guest reports the board looks different from the host's. Walk through how you would debug it.
4. Review `useLudoGame.ts` as if it were a pull request. What comments would you leave?
5. Your team wants to rewrite the bots with machine learning. Make the case for and against.
