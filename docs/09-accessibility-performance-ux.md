# 9. Accessibility, performance and UX

## Accessibility

**Semantics first.** Native elements carry behaviour for free: `<button>` is focusable and responds to Enter and Space; `<fieldset>`/`<legend>` group setup choices; `<label htmlFor>` names inputs.

**ARIA where native elements fall short:**

| Pattern | Where | Why |
| --- | --- | --- |
| `role="switch"` + `aria-checked` | Sound and Auto roll toggles ([GameScreen.tsx](../src/components/GameScreen.tsx)) | A button that is on or off |
| `aria-pressed` | Colour chips on setup | Toggle buttons in a group |
| `role="img"` + `aria-label` | The SVG board | A complex graphic with a text alternative |
| `aria-live="polite"` | The prompt line ("Your turn...") | Announces turn changes without stealing focus |
| `role="alert"` | Validation errors, connection problems | Announced immediately |
| `role="dialog"` / `alertdialog` + `aria-modal` | Win overlay, confirm dialogs | Marks modal content |
| `role="timer"` | Game clock, invite countdown | Semantic for a changing time value |
| `aria-keyshortcuts` | Toolbar buttons | Advertises keyboard shortcuts |

**Keyboard.** Every action has a key (Space, 1–4, arrows, P, L, N, S). The handler ignores keys while typing in inputs and while dialogs are open. The confirm dialog focuses the safe choice ("Keep playing") and closes on Escape.

**Motion.** `@media (prefers-reduced-motion: reduce)` turns off decorative animation (confetti, halos, banner pop).

**Touch.** Prompts change wording on touch devices ("Tap your dice"), keyboard help hides, and `touch-action: manipulation` removes the double-tap zoom delay on buttons.

## Performance

**Code splitting.** PeerJS (~115 kB, ~31 kB gzipped) is loaded with `import('peerjs')` only when someone hosts or joins. Run `npm run build` and look for the separate `bundler-*.js` chunk. Local-only players never download it. Ask in interviews: "what is on the critical path for the first screen?"

**Rendering.** The board is one SVG with a few hundred elements. React re-renders it on each animation step, which is cheap at this size. Selectors keep unrelated components from re-rendering. No `memo` is used, deliberately: measure before optimising ([chapter 3](03-react.md) exercise 4).

**Derivation cost.** Replaying the action log on every action is O(n) with n in the hundreds, negligible. Snapshots would fix it if n grew ([chapter 4](04-state-management.md)).

**No assets.** Sounds are synthesised with the Web Audio API ([sfx.ts](../src/audio/sfx.ts)), so there are no audio files to download or license. The `AudioContext` is created lazily on first use because browsers block audio before a user gesture.

**Timers.** Effects clean up their timers, so unmounting or pausing leaves nothing running.

## UX decisions worth discussing

- **Auto roll on by default, but never auto-choose a real decision.** Remove friction without removing agency.
- **Automatic moves** only when every option is equivalent.
- **Comeback dice:** a fairness feeling fix, disclosed in the UI and README, and switchable.
- **Celebrate each finish,** not only the winner: players who finish second still get a moment.
- **Offer to end** when only bots remain, rather than forcing people to watch.
- **Confirm destructive actions** (abandoning a game) but not cheap ones.
- **Auto pause** local games when the tab is hidden, but not online games.
- **Transparent choices:** the README's "Choices we made" table. Surprising rules are fine if they are explained.

## Exercises

1. Navigate a full local game with only the keyboard and a screen reader (Orca, NVDA or VoiceOver). Write down every point of friction and fix one.
2. Add a visible focus indicator audit: tab through every screen. Is focus ever invisible or lost (for example, after a dialog closes)?
3. Run Lighthouse on the production build. What is the biggest opportunity? Is it worth doing?
4. The board's `aria-label` is static. Design a better text alternative: how would a blind player know where their tokens are?
