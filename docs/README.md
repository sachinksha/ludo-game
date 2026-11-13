# Learning frontend engineering from this Ludo game

This guide uses one small, complete, tested codebase to teach the things senior and principal frontend interviews probe: architecture, TypeScript, React, state management, real-time timing, system design, testing, accessibility and performance.

A game is a good teacher. It has rich state, strict rules, time-based UI, AI, and (here) real-time multiplayer, in a few thousand lines you can read in a weekend. Everything below points at real code you can open, change and test.

## How to use this guide

1. **Run it first.** `npm install && npm run dev`, play a local game, then open two browser windows and play an online game with yourself.
2. **Read a chapter, then the code it names.** Every chapter links to files. Keep the editor open beside it.
3. **Do the exercises.** Each chapter ends with a few. They are the real learning. Run `npm test` after each change.
4. **Answer the interview questions out loud.** [Chapter 10](10-interview-prep.md) collects questions with model answers grounded in this code. Practise explaining trade-offs, not just facts.

## Chapters

| # | Chapter | You will learn |
| --- | --- | --- |
| 1 | [Architecture and folder structure](01-architecture.md) | Layering, dependency direction, functional core and imperative shell, ports and adapters, where code should live |
| 2 | [TypeScript patterns](02-typescript.md) | Discriminated unions, exhaustive switches, type guards for untrusted data, `satisfies`, literal types, compiler settings |
| 3 | [React patterns](03-react.md) | Hooks as controllers, refs and stale closures, effects as schedulers, `useSyncExternalStore`, keys to reset state, StrictMode |
| 4 | [State management](04-state-management.md) | Zustand, derived state, event sourcing, undo/redo, the kinds of state, client versus server state |
| 5 | [The game loop and timing](05-game-loop-and-timing.md) | Turn-based loops, separating animation from truth, a busy lock, pause, determinism |
| 6 | [Rules engine and AI](06-rules-engine-and-ai.md) | Pure reducers, state machines, events, utility-based AI, randomness and probability |
| 7 | [Testing strategy](07-testing.md) | What to test where, fake timers, injected randomness, simulations with invariants, in-memory networks, accessible queries |
| 8 | [Multiplayer system design](08-multiplayer-system-design.md) | Requirements to design, authority models, protocols, consistency, reconnection, security, cost, alternatives |
| 9 | [Accessibility, performance and UX](09-accessibility-performance-ux.md) | ARIA, keyboard support, reduced motion, code splitting, rendering cost, mobile |
| 10 | [Interview preparation](10-interview-prep.md) | Question bank with answers tied to this code, system design prompts, "what would you change" |

## A suggested two-week plan

| Days | Focus |
| --- | --- |
| 1–2 | Chapters 1 and 2. Draw the dependency graph of `src/` from memory |
| 3–4 | Chapter 3. Rewrite one component's state handling and explain the difference |
| 5–6 | Chapter 4. Implement one state exercise (for example, persisting a local game) |
| 7 | Chapter 5. Add an animation and keep the tests green |
| 8 | Chapter 6. Add a bot style and measure it with a simulation |
| 9 | Chapter 7. Add tests for something untested |
| 10–11 | Chapter 8. Whiteboard the multiplayer design without notes, then compare with the chapter |
| 12 | Chapter 9. Audit one screen with a screen reader and the keyboard only |
| 13–14 | Chapter 10. Mock interviews: answer every question out loud, time-boxed |

## The one idea to remember

> The game is a starting state plus a list of actions. Everything else is derived.

Undo, redo, the game log, deterministic tests, simulations and online multiplayer all fall out of that single decision ([chapter 4](04-state-management.md)). In interviews, being able to name the decision that made later features cheap is what separates principal-level answers from senior ones.
