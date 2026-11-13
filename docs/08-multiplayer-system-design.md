# 8. Multiplayer system design

This chapter walks through the online feature the way a system design interview would: requirements, options, decision, details, failure modes, and what changes at scale.

## 1. Requirements

**Functional**
- A host creates a game and gets an invite link. Friends open it and join.
- Mixed seats: local humans, bots, online friends.
- Everyone sees the same game in near real time.
- The host can end the game and start a new one.

**Non-functional and constraints**
- **No login.** No email, no phone. A name only.
- **Links expire.** New players can join for a few minutes only.
- **Free.** No paid hosting. The site is a static deploy. If online play needed a paid server, the feature would be dropped.
- **Cheat-resistant enough** for friends: guests cannot choose their dice.
- **Resilient** to a guest's refresh or brief disconnect.

## 2. The key question: who is the authority?

Every multiplayer design has to answer "who decides what happened?"

| Model | How it works | Trade-offs |
| --- | --- | --- |
| Dedicated server | A server runs the rules; clients send inputs | Most robust and secure; costs money; needs a backend |
| **Host-authoritative peer** (chosen) | One player's browser runs the rules; others send inputs | Free; host can cheat; host leaving ends the game |
| Lockstep peers | Everyone runs the rules on the same inputs; needs agreed randomness | No single point of failure; dice need commit-reveal schemes to stop cheating; complex |
| Shared database (Firebase, Supabase) | Clients write to a realtime DB; rules in security rules or functions | Free tiers exist; needs accounts/projects; rules logic split from game code |

## 3. Transport options (and cost)

| Option | Free? | Notes |
| --- | --- | --- |
| WebSocket server (Node on Fly/Render) | Free tiers come and go; sleep on idle | Needs a backend to run and maintain |
| Vercel serverless | Free | No long-lived WebSockets, so not suitable on its own |
| Cloudflare Durable Objects / PartyKit | Free tier available | Excellent fit for room-based games; needs a Cloudflare account and deploy |
| Firebase Realtime DB / Firestore | Free tier | Needs a Google project; vendor lock-in |
| Supabase Realtime | Free tier | Needs a project; channels work well for rooms |
| **WebRTC data channels via PeerJS** (chosen) | Yes | No backend of our own. Free public signalling server and TURN relay |

**Decision:** WebRTC through PeerJS with the host's browser as authority. It meets "no paid hosting" outright, and the site stays a static deploy. If requirements grew (ranked play, spectators, persistence), the next step would be a room server on Cloudflare Durable Objects, and the protocol below would move there almost unchanged.

### How WebRTC connects (what to say in interviews)

1. **Signalling.** Two browsers cannot find each other directly. They exchange connection offers through a signalling server. Here that is PeerJS's free server; it never sees game messages.
2. **ICE and STUN.** Each browser asks a STUN server "what is my public address?" and gathers candidate addresses.
3. **TURN.** If both sides are behind strict NATs, traffic is relayed through a TURN server. Mobile data is the usual case: carriers use carrier-grade NAT with per-destination port mapping (symmetric NAT), so the address STUN discovers is useless to the other peer. PeerJS used to bundle a free TURN relay; it shut down, so the browser fetches relay details from the site's own `/api/turn` serverless function ([api/turn.ts](../api/turn.ts)), and [iceServers.ts](../src/net/iceServers.ts) falls back to STUN only if that fails.
4. **DTLS.** The data channel is encrypted end to end between the browsers.

## 4. Why this codebase made it easy

The game was already **event-sourced** ([chapter 4](04-state-management.md)): an initial state plus a list of actions, replayed deterministically. So replication needs no new state model. The host sends `initial` and then every action; guests replay them with the same engine. The online feature is mostly a transport and a seat manager.

## 5. Protocol

Defined in [protocol.ts](../src/net/protocol.ts). JSON messages with a `t` field.

**Guest → host**
- `hello { v, token, name, secret? }`: join (or rejoin) request.
- `intent { seq, action: 'roll' | 'move', tokenId? }`: "I want to act". `seq` is how many actions the guest has applied.
- `resync`: "send me everything again".
- `leave`.

**Host → guest**
- `welcome { color, secret }` or `reject { reason }`.
- `lobby { seats, expiresAt }`: who is in, before the game starts.
- `sync { snapshot: { gameId, initial, actions, paused } }`: a full copy.
- `action { gameId, seq, action }`: one new action.
- `paused { paused }`, `ended`.

### Sequence: a guest's roll

```
Guest                         Host                              Other guests
  │ intent {seq: 12, roll}      │                                   │
  │ ──────────────────────────▶ │ checks: guest's seat? its turn?   │
  │                             │ seq == 12? phase == roll?          │
  │                             │ rolls with crypto RNG → 5          │
  │ action {seq: 12, roll 5}    │ action {seq: 12, roll 5}           │
  │ ◀────────────────────────── │ ──────────────────────────────────▶│
  │ animates, records           │ animates, records                  │ animates, records
```

### Ordering and consistency

- WebRTC data channels opened with `reliable: true` deliver in order, like TCP.
- Each action carries `seq` (its index in the log) and `gameId` (which game). A guest that sees `seq` larger than expected missed something and sends `resync`. Smaller means a duplicate and is ignored. Actions from an old `gameId` are dropped.
- Intents carry the guest's `seq`. If the game moved on (say, a timeout or another action), the intent is **stale** and the host drops it. This prevents double rolls from a double tap or a laggy client.
- Consistency model: **single writer, ordered replication**. Guests are eventually consistent replicas; the host is linearizable by construction because it is the only writer.

## 6. Invite links and expiry

[invite.ts](../src/net/invite.ts) builds `https://site/#join=<hostId>&k=<token>&exp=<ms>`.

- **Fragment, not query string.** Browsers never send `#...` to the web server, so tokens do not appear in server logs or analytics.
- **The host enforces everything.** `exp` in the link is only for showing a countdown. The host checks its own token and its own clock ([`HostSession.admit`](../src/net/hostSession.ts)). Editing the link gains nothing.
- **Reset link** issues a new token; old links stop working.
- 5 minutes (`INVITE_TTL_MS`): long enough to share in a chat, short enough to limit reuse.

## 7. Reconnection

On admission the host gives the guest a random **seat secret**. The guest keeps it in `sessionStorage` (per tab, survives refresh). A `hello` with a valid secret reclaims the seat **even after expiry and after the game started**, and the host replies with a `sync`. Without the secret, a stranger with an old link gets `expired` or `started`.

If a guest stays away, the host sees a banner: **Let a bot play**. That records a `takeover` action, containing the bot's profile so replays stay deterministic, and permanently closes the seat. The engine renames the seat to the next "Bot N" and emits a `takeover` event with the old and new names. Because the rename happens inside the pure engine rather than in the host's UI, every guest's replica and every replay derive the same name with no extra message. Each screen turns the event into a short notice. This is the event-sourcing payoff again: put the decision in the action and the consequences in the reducer, and replication comes free.

## 8. Security: a threat model

| Threat | Mitigation |
| --- | --- |
| Guest forges dice | Guests never send dice; the host rolls |
| Guest moves out of turn or for another seat | Host maps each channel to one seat; checks turn, phase and `seq` |
| Malformed or oversized messages | `parseGuestMessage` validates types, ranges and lengths, and rebuilds objects (drops unknown fields) |
| Name injection (control characters, very long names) | `sanitizeName`; React escapes text output |
| Reusing an old link | Expiry plus single active token |
| Guessing a host id | PeerJS ids are random UUIDs; the token adds a second secret |
| Silent connection that never says hello | Dropped after `HELLO_TIMEOUT_MS` |
| **Host cheats** | Not mitigated. Acceptable for friends. A dedicated server or commit-reveal dice would be needed for strangers |
| Eavesdropping | WebRTC data channels are DTLS-encrypted |

## 9. Failure modes

| Failure | What happens |
| --- | --- |
| Public signalling server down | Hosting fails with a clear error; local play unaffected |
| No TURN relay and a strict NAT (mobile data) | ICE finds no path; the guest times out and sees "Could not reach the host". Works on the same machine or Wi-Fi, which makes it look like a "phone bug" |
| Strict firewall blocks WebRTC | Guest sees "Could not reach the host" with Try again. A `turns:` relay on port 443 usually gets through |
| Guest refreshes | Rejoins with its secret and gets a `sync` |
| Guest disconnects for good | Host offers bot takeover |
| Host closes the tab | Game ends for everyone (known limitation) |
| Signalling drops mid-game | Existing games continue (they are direct); the host reconnects to signalling quietly so new players could still find it |

### War story: works on my machine

The first real test passed between two browsers on one laptop and failed between a phone on 4G and a laptop on Wi-Fi. On one machine, ICE uses local "host" candidates, so no NAT is involved. Across networks, the phone's carrier NAT needs a relay. A ten-line UDP probe showed the default PeerJS TURN hostnames no longer resolve in DNS. Lessons worth telling in an interview:
- Test networked features across real network boundaries early. Localhost hides NAT, latency and packet loss.
- Free third-party dependencies can disappear. Make them configurable and fail soft (here: fall back to STUN and warn in the console).
- Diagnose the layer before the code: signalling worked (peers registered), so the failure had to be in ICE.

### Keeping the TURN key off the client (backend-for-frontend)

The first version read the provider URL from a `VITE_` variable, and Vercel warned that the prefix makes the value public. Vite inlines every `VITE_*` variable into the bundle at build time, so anything there is readable by anyone.

The fix is a minimal **backend-for-frontend**: one serverless function that holds the secret, calls the provider and returns only what the browser needs. Points worth making in an interview:
- **Know what you are actually protecting.** The provider key (which could be revoked, rotated or used to read account data) moves to the server. The TURN username and password cannot move: the browser's WebRTC stack needs them. So the gain is real but limited.
- **The endpoint is public.** Hiding a key behind an open endpoint stops key theft, not quota abuse. Next steps if abuse appeared: short-lived credentials (TURN REST API style, HMAC with expiry, which Cloudflare and coturn support), an origin check, and rate limiting per IP.
- **Fail soft.** No function (static host), no configuration, or a slow provider all lead to STUN only, never to a broken page.
- **Dev/prod parity.** A Vite plugin serves the same handler at `/api/turn` during `npm run dev`, so local development needs no extra tool. The function has no imports, so the platform runs it without bundling.
- **Untrusted input both ways.** The browser validates the endpoint's JSON with `parseIceResponse` even though it is our own server.

## 10. How the code is organised

- [transport.ts](../src/net/transport.ts): `Network` and `Channel` interfaces (the port).
- [peerNetwork.ts](../src/net/peerNetwork.ts): PeerJS adapter, loaded with dynamic `import()`.
- [iceServers.ts](../src/net/iceServers.ts): STUN defaults plus a fail-soft fetch of `/api/turn`.
- [api/turn.ts](../api/turn.ts): Vercel function that turns private `TURN_*` variables into relay details.
- [memoryNetwork.ts](../src/net/memoryNetwork.ts): test adapter.
- [hostSession.ts](../src/net/hostSession.ts): seats, admission, expiry, reconnection, broadcast, intent forwarding.
- [guestSession.ts](../src/net/guestSession.ts): connect, hello, receive, intents, resync.
- [onlineStore.ts](../src/store/onlineStore.ts): role and session wiring; inbox for the hook.
- [useLudoGame.ts](../src/hooks/useLudoGame.ts): one action pipeline for all roles.

## 11. Scaling the design

For a real product with thousands of concurrent games:

- Move authority to a **room server** (one Durable Object or one process per game). Same protocol: guests send intents, the room broadcasts actions.
- Add **identity** without passwords: anonymous device tokens, or magic links if accounts are needed later.
- **Persist** the action log per game for reconnection after server restarts, dispute resolution and replays.
- **Spectators** subscribe to the action stream read-only.
- **Matchmaking** becomes a separate service that creates rooms.
- Observability: per-room metrics (latency, resyncs, disconnects).

## Exercises

1. Whiteboard this design in 30 minutes without notes. Then compare. What did you forget?
2. Implement spectators: a `watch` hello that receives `sync` and actions but can send no intents.
3. Port the host to a Cloudflare Durable Object. Which files move? Which stay in the browser?
4. Design commit-reveal dice so that no single player (including the host) can choose a roll. What does it cost in round trips?
