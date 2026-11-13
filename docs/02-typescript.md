# 2. TypeScript patterns

## Discriminated unions model "one of these shapes"

A token is in exactly one place. [types.ts](../src/game/types.ts) says so in the type:

```ts
export type TokenState =
  | { kind: 'yard' }
  | { kind: 'track'; pos: number }
  | { kind: 'lane'; step: number }
  | { kind: 'home' }
```

The literal `kind` field is the **discriminant**. After `if (state.kind === 'track')`, TypeScript knows `state.pos` exists. Compare the weaker alternative, `{ kind: string; pos?: number; step?: number }`, which allows nonsense like a home token with a position.

The same pattern runs through the codebase: `GameAction`, `GameEvent`, the network's `GuestMessage` and `HostMessage`, and the `Inbound` inbox items in [onlineStore.ts](../src/store/onlineStore.ts). **Make illegal states unrepresentable** is the principle.

## Exhaustive switches

[`applyAction`](../src/game/engine.ts) switches on `action.type` with no `default`:

```ts
switch (action.type) {
  case 'roll': return rollWithValue(state, action.value)
  case 'move': return applyMove(state, action.tokenId)
  case 'end': return endGame(state)
  case 'takeover': return takeover(state, action.color, action.bot)
}
```

The function's return type is `GameState`. If someone adds a new action type and forgets this switch, the function can fall off the end and return `undefined`, and the compiler reports an error. That is a compile-time checklist for every place a new case must be handled. A common explicit version uses `never`:

```ts
default: {
  const unreachable: never = action
  throw new Error(`Unhandled action ${JSON.stringify(unreachable)}`)
}
```

## Type guards for untrusted data

Types vanish at runtime. A message from another browser is `unknown` until proven otherwise. [`parseGuestMessage`](../src/net/protocol.ts) validates every field and **rebuilds** the object rather than casting:

```ts
case 'intent': {
  if (!isInt(raw.seq, 0, 1_000_000)) return null
  if (raw.action === 'move' && isInt(raw.tokenId, 0, 3))
    return { t: 'intent', seq: raw.seq, action: 'move', tokenId: raw.tokenId }
  ...
}
```

Rebuilding means extra fields a malicious guest adds (`admin: true`) never reach the host's logic. Small guards like `isInt` and `isShortString` use `x is number` return types so TypeScript narrows after the check. In larger apps you would use a schema library (Zod, Valibot) for the same job. Be ready to explain the trade-off: a dependency and bundle size versus hand-written checks.

Note the asymmetry: the host parses guests strictly, but guests only shape-check the host ([`parseHostMessage`](../src/net/protocol.ts)), because the host is the authority. Trust boundaries should be explicit in code.

## `satisfies`

In [hostSession.ts](../src/net/hostSession.ts):

```ts
channel.send({ t: 'reject', reason: result } satisfies HostMessage)
```

`channel.send` accepts `unknown`, so without help a typo like `{ t: 'rejcet' }` would compile. `satisfies` checks the literal against `HostMessage` without changing its type. Compare `as HostMessage`, which would silence errors instead of catching them.

## Literal types and `Record`

```ts
export type Color = 'red' | 'green' | 'yellow' | 'blue'
export const START_INDEX: Record<Color, number> = { red: 41, green: 2, yellow: 15, blue: 28 }
```

`Record<Color, number>` forces every colour to be present. Add a colour and every such table fails to compile until updated. `Partial<Record<Color, string>>` (in [names.ts](../src/game/names.ts)) is the "maybe some colours" version.

## `as const` and readonly data

`COLOR_ORDER: readonly Color[]` and the `TIMING = { ... } as const` object in [useLudoGame.ts](../src/hooks/useLudoGame.ts) are immutable at the type level. `as const` also keeps literal types (`600`, not `number`), which matters when values are used as discriminants.

## Classes versus closures, and `erasableSyntaxOnly`

The sessions are classes; most code is functions. Classes fit here because a session is a long-lived object with private state and a public API (`subscribe`, `getView`, `announce`).

The project enables `erasableSyntaxOnly` in [tsconfig.app.json](../tsconfig.app.json). It bans TypeScript features that generate runtime code: enums, namespaces and constructor **parameter properties** (`constructor(private x: X)`). The payoff: the code is "JavaScript with types removed", which tools like Node's built-in type stripping can run directly. You will see explicit field assignments in the session constructors for this reason.

## `verbatimModuleSyntax` and type-only imports

`import type { Color } from './types'` is erased entirely. With `verbatimModuleSyntax`, the compiler requires `type` on imports used only as types, so bundlers never keep a module alive just for its types. It also prevents accidental import side effects.

## Generic signatures worth reading

- `useSyncExternalStore(subscribe, getSnapshot)` in [useOnline.ts](../src/hooks/useOnline.ts) is generic over the snapshot type.
- `create<GameStoreState>()((set, get) => ...)` in [gameStore.ts](../src/store/gameStore.ts). The curried `create<T>()(...)` form exists so TypeScript can infer the rest while you supply `T`.

## Exercises

1. Add a fifth `GameAction` (for example `{ type: 'resign'; color }`). Follow the compiler errors. How many places did it find for you?
2. Replace `parseGuestMessage` with a Zod schema. Compare bundle size (`npm run build`) and readability. Which would you choose for a team of 20? Why?
3. Find a place where a `string` could be a narrower literal type, and tighten it.
4. Explicitly add `"strict": true` (and consider `"noUncheckedIndexedAccess": true`) to `tsconfig.app.json`. Fix what breaks. What bugs does `noUncheckedIndexedAccess` prevent in `players[idx]`?
