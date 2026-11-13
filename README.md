# Ludo

A browser Ludo game built with React, TypeScript, Vite and Zustand. Play on one device against bots and friends, or online with an invite link.

- **No login, no accounts, no scores.** Open it and play. Online games need only a name.
- **2 or 4 players.** Each seat is a human, a bot or (online) a friend on another device, with at least one human. In a 2-player game you pick the two colours.
- **Online play by invite link.** Browser to browser over WebRTC, with no game server to host or pay for. Links stop admitting new players after 5 minutes.
- **Bots with personalities.** Each bot gets a random playing style every game (hunter, guardian, racer or balanced), so no two games play out the same.
- **Light and dark themes.** Follows your device by default; pick **System**, **Light** or **Dark** in the footer on any screen.
- **Auto roll** and **Auto move** (both on by default): your dice roll by themselves, forced moves play themselves, and you step in only when there is a real choice of piece. Turn either off to do it yourself.
- **Fair dice, with optional comeback help** for a player stuck in base for a long time.
- **Celebrations** when any player gets all pieces home, not just at the end.
- **Undo and redo**, **pause and resume**, and automatic pause when you switch away from a local game.
- **Sound effects** synthesised in the browser (no audio files), with an on/off switch.
- **Tested.** 182 tests cover the rules engine, the bots, the stores, the hook timing, the network protocol and the UI, including simulated full games.
- **Free software** under the GNU GPL v3 (see [Licence](#licence)).
- **A learning guide** in [`docs/`](docs/README.md) that uses this codebase to teach React, state management, TypeScript, game loops, system design and testing, aimed at senior and principal frontend interviews.

## Contents

- [Quick start](#quick-start)
- [How to play](#how-to-play)
- [Online play](#online-play)
- [Rules](#rules)
- [Choices we made](#choices-we-made) (read this if something surprises you)
- [Dice](#dice)
- [Bots](#bots)
- [Architecture](#architecture)
- [Testing](#testing)
- [Deploying](#deploying)
- [Known limitations](#known-limitations)
- [Learning guide](#learning-guide)
- [Licence](#licence)

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with oxlint |

## How to play

1. Choose **On this device** or **Online (invite link)**.
2. Choose **2 players** or **4 players**. For 2 players, pick two colours. Opposite corners (red and yellow, or green and blue) are the classic layout, but any two work. Picking a third colour replaces the older pick.
3. Click a seat to change who plays it: **Human** or **Bot**, plus **Online friend** in online play. At least one seat must be a human on this device.
4. Optionally name each human seat (up to 12 characters, not blank, all different). Online friends choose their own names.
5. Leave **Comeback dice** on or turn it off (see [Dice](#dice)), then press **Start game** (or **Create invite link**).
6. Each seat has a corner panel with its own dice, and the **arrow** shows whose turn it is. With **Auto roll** on, your dice roll by themselves. With it off, **tap your dice** or press **Space**.
7. When there is no real choice, your piece moves by itself: only one piece can move, or every piece that can move sits on the same spot. Turn **Auto move** off to make every move yourself. Otherwise, click a highlighted piece or press its number (pieces are numbered 1 to 4 during your turn).

### Toolbar

| Button | What it does |
| --- | --- |
| **Undo** / **Redo** | Step back over your last decision (a roll and its move), or forward again. Local games only |
| **Pause** / **Resume** | Freeze the game. A local game also pauses itself when its tab goes to the background or the window loses focus. Online, only the host can pause, and it pauses for everyone |
| **Auto roll** switch | Roll automatically on your turn (on by default). You still choose the piece when there is a choice |
| **Theme** (footer) | System (default), Light or Dark. Remembered on this device |
| **Auto move** switch | Play your move automatically when there is no real choice (on by default). Off: you click every move, even forced ones |
| **Sound** switch | Sound effects on or off |
| **Settings** | Back to the setup screen. Asks before abandoning a game in progress. Online it reads **End online game** (host) or **Leave game** (guest) |
| **New game** | Same seats, fresh game. Online, the host restarts for everyone in the session |

The **clock** next to the title shows game time and stops while paused. The **game log** (collapsed by default) lists events newest first.

### Keyboard

| Key | Action |
| --- | --- |
| `Space` | Roll the dice |
| `1` to `4` | Move that piece |
| `←` / `→` | Undo / redo |
| `P` | Pause / resume |
| `L` | Show / hide the game log |
| `N` | New game |
| `S` | Settings |

On phones the toolbar shows icons only, panels shrink to one row, and keyboard help is hidden.

## Online play

### Hosting

1. On setup, choose **Online (invite link)** and set one or more seats to **Online friend**.
2. Press **Create invite link**. The lobby shows the link with **Copy** (and **Share** on phones), a countdown, and who has joined.
3. Send the link. Each friend who opens it types a name and takes the next open online seat.
4. Press **Start game**. Online seats nobody claimed become bots.
5. **Keep your tab open.** The host's browser runs the game for everyone.
6. **New game** restarts for everyone. **End online game** closes the session, and guests see "The host ended the game".

If a friend's connection drops mid-game, a banner offers **Let a bot play** for that seat. The seat is renamed to the next bot number (for example "Bot 2"), everyone at the table sees a short notice ("Asha left the game. Bot 2 is playing for them now."), and the game log records it. They can also come back: opening the same link in the same browser tab returns them to their seat, even after the link has expired.

### Joining

Open the link, type a name, press **Join game**, and wait for the host to start. No account, email or phone number. Auto roll and Auto move work for you too, set on your own device. Pause, undo and new game belong to the host.

### How it works

```
  Guest browser                      Host browser (authority)                 Guest browser
 ┌──────────────┐  intent: "roll"   ┌──────────────────────────┐   action     ┌──────────────┐
 │ same engine, │ ───────────────▶  │ validates the intent,    │ ───────────▶ │ same engine, │
 │ replays host │                   │ rolls the dice, records  │  broadcast   │ replays host │
 │ actions      │ ◀───────────────  │ the action, broadcasts   │              │ actions      │
 └──────────────┘   action (seq n)  └──────────────────────────┘              └──────────────┘
          ▲                                     ▲
          └──── WebRTC data channels (direct, encrypted with DTLS) ───┘
                signalling only via the free PeerJS server
```

- **The host is the server.** Guests send only intents ("roll", "move piece 2"). The host checks it is that guest's turn and position, decides the outcome (including the dice, so guests cannot cheat them), and broadcasts the resulting action. Every browser runs the same deterministic engine, so applying the same actions gives the same game.
- **The action log is the protocol.** The game was already stored as an initial state plus a list of actions (that is how undo works), so online play sends exactly those actions. A guest that misses one notices the gap in the sequence numbers and asks for a full copy.
- **Free infrastructure, no backend.** [PeerJS](https://peerjs.com) introduces the two browsers through its free public signalling server, then the game runs over a direct, encrypted WebRTC data channel. Google's public STUN server helps browsers find each other. A TURN relay carries traffic when no direct path exists, which is normal on mobile data. A small serverless function supplies its credentials from a free provider, keeping the provider key private (see [Connecting across networks](#connecting-across-networks)). The site is a static Vercel deploy plus that one optional function.
- **Privacy.** The invite (host id, one-time token, expiry) lives in the URL fragment after `#`, which browsers never send to web servers. Nothing is stored on any server. Names exist only in the players' browsers.
- **Invite expiry.** Links admit new players for 5 minutes. The host enforces the expiry and the token, so editing the link does not help. **Reset link** issues a new token and invalidates the old link.
- **Reconnecting.** On joining, a guest receives a private seat secret, kept in that tab's `sessionStorage`. It lets the same tab reclaim the seat after a refresh or a dropped connection.

### Connecting across networks

Two browsers on the same machine or the same Wi-Fi usually connect directly. A phone on **mobile data** and a laptop on Wi-Fi usually cannot, because mobile carriers put phones behind carrier-grade NAT. Those players need a **TURN relay** that forwards the (tiny) game messages.

PeerJS used to provide a free relay, but it has shut down. Without one, the game still works on the same network and on many home networks, but not on mobile data. To add a relay at no cost:

1. Create a free account with a TURN provider. [Metered](https://www.metered.ca/stun-turn) has a free plan with no card, and its monthly allowance is far more than a turn-based game uses. Create an app and copy its **credentials API URL**.
2. In Vercel, go to **Project → Settings → Environment Variables**. Add `TURN_CREDENTIALS_URL` with that URL, mark it **Sensitive**, and redeploy. For local development, put the same line in `.env.local` (see [.env.example](.env.example)). `npm run dev` serves the endpoint too.
3. Alternatively, set static credentials with `TURN_URLS`, `TURN_USERNAME` and `TURN_CREDENTIAL`.

**How the key stays private.** The browser asks the site's own `/api/turn`, a free Vercel serverless function ([api/turn.ts](api/turn.ts)). It reads the private variable, calls the provider and returns only the relay details. The variables have no `VITE_` prefix, so Vite never puts them in the JavaScript bundle. The relay username and password still reach the browser, because WebRTC runs there and needs them. Anyone who can open the site can also call `/api/turn`, so the function hides the provider key but does not stop someone from using your relay allowance. Set a usage limit in the provider's dashboard. On a static host without serverless functions, `/api/turn` does not exist and play falls back to STUN only. The browser console warns when no relay is available.

This account is only for you, the person deploying the game. Players still join with a link and a name.

The full design, alternatives considered and trade-offs are in [docs/08-multiplayer-system-design.md](docs/08-multiplayer-system-design.md).

## Rules

- Each player has four pieces, which start in their base.
- A piece leaves the base only on a **six**, onto its colour's start square (two squares past the arrow where its home lane begins).
- Pieces move clockwise. Each colour walks **51 squares** around the loop, turns into its own five-square **home lane**, and finishes in the centre. A piece must land **exactly** on the centre.
- Landing on an opponent on an **unsafe** square sends it back to base. Landing on a **stack** of opponents captures all of them.
- Start squares and the four **star** squares are safe: pieces share them without capturing.
- A **six**, a **capture**, or getting a piece **into the centre** earns an extra roll. The centre bonus does not apply to a player's last piece.
- **Three sixes in a row** forfeit the turn.
- If no piece can move, the turn passes.
- When all four pieces reach the centre, that player finishes and is ranked, with a fanfare and a banner. The game ends when one player is left.
- When every human has finished but two or more bots are still playing, the game offers to **end now**, ranking the remaining bots by how far their pieces have travelled.

## Choices we made

Ludo has many house rules and online versions differ. These are the choices this game makes, and why.

| Area | Choice | Why |
| --- | --- | --- |
| Track | 51 loop squares, then a 5-square lane | The common modern board. Start squares sit two past the arrow, so a piece ends its loop on the arrow square |
| Safe squares | Start squares and stars only | Matches most online versions. The arrow squares are not safe |
| Stacks | No blocks. Landing on a stack captures all of it | Blocks add complexity many players find confusing. Capturing the whole stack keeps the rule "only safe squares hold mixed colours" true |
| Extra rolls | Six, capture, and a piece reaching the centre (not your last) | Common online rules. No bonus after your last piece, because your game is over |
| Three sixes | Forfeit the turn | Classic rule that limits runaway streaks |
| Exact finish | Required | Classic rule. Overshooting moves are simply not legal |
| Theme | Follow the system by default; the board and player colours stay the same in dark mode, only the surroundings darken and the board's white squares dim slightly | Keeps the board recognisable and pieces easy to tell apart |
| Automatic moves | Played for you when every option gives the same result, unless you turn **Auto move** off. Online, each player's own device decides for their seat | Saves clicks without taking away a real decision. Some players like to make every move themselves |
| Dice | Cryptographic randomness, each roll independent | Removes any doubt about the random source. See [Dice](#dice) |
| Comeback dice | On by default, same help for humans and bots | Long dry spells are normal with fair dice and frustrating. Easy to turn off |
| Bots | Random style each game, small random nudges | Varied, human-feeling opponents without being dumb. See [Bots](#bots) |
| Ending early | Offered when every human is done; remaining bots ranked by total progress | Nobody wants to watch bots finish |
| Undo | Rewinds to your last roll, removing any bot turns after it. Local only | Undo returns you to a decision, not a single click. Online, rewriting shared history would surprise the other players |
| Auto pause | Local games only | Online, one player switching tabs would freeze everyone |
| Online authority | Host browser decides everything, including dice | Prevents cheating without a server. The cost: the host must keep the tab open |
| Invite links | 5 minutes, host-enforced, no accounts | Enough time to share a link, short enough that old links cannot be reused |

## Dice

Dice use the browser's cryptographic random generator (`crypto.getRandomValues`), and every roll is independent. Long droughts without a six are a normal part of fair dice. The chance of missing a six is 5/6 per roll, so 10 misses in a row happens about 16% of the time, and with four players someone hits a long dry spell most games.

**Comeback dice** (setup option, on by default) softens this. After a player has been stuck in base (no piece on the board) for 3 rolls without a six, their chance of a six rises by 6 percentage points per further roll, from 1 in 6 up to at most 1 in 2. It resets as soon as they roll a six or have a piece out, and it applies to bots and humans alike. Turn it off for strictly fair dice.

Settings (auto roll, comeback dice) are saved in the browser's `localStorage`.

## Bots

Each bot gets one of four styles at random when a game starts. Its weights then drift by up to ±15%, and every decision gets a small random nudge, so near-equal moves are not always resolved the same way. The style shows under the bot's name.

| Style | Leans towards |
| --- | --- |
| **Balanced** | A bit of everything |
| **Hunter** | Captures (especially of far-travelled pieces) and sitting just behind opponents. Takes more risks |
| **Guardian** | Avoiding squares opponents can reach, running from threats, safe squares and the home lane |
| **Racer** | Pushing its lead pieces home as fast as possible |

Every style scores each legal move on the same features: finishing a piece, captures, leaving the base, entering the home lane, progress, safe squares, how exposed the landing square is (opponents 1 to 6 squares behind it), escaping a threatened square, and opponents within reach next turn. All styles still take an obvious capture or finish. In simulated two-player games against the earlier fixed-priority bot, each style wins 55 to 60% of the time.

## Architecture

```
src/
├── game/                  Pure TypeScript rules. No React, no DOM, no network.
│   ├── types.ts           Domain types: Color, Token, Player, GameState, GameAction, GameEvent
│   ├── board.ts           Loop length, start squares, safe squares
│   ├── layout.ts          Grid coordinates for drawing
│   ├── rules.ts           Destinations, captures, legal moves, path steps
│   ├── engine.ts          State machine: createGame, rollWithValue, performMove, endGame, takeover
│   ├── history.ts         Replay of the action list, and where undo rewinds to
│   ├── bot.ts             Bot styles and move scoring
│   ├── names.ts           Seat name validation
│   └── describe.ts        Log text for each event
├── net/                   Online play. No React.
│   ├── protocol.ts        Message types and strict validation of guest input
│   ├── transport.ts       The Network/Channel interfaces (the seam for tests)
│   ├── peerNetwork.ts     WebRTC via PeerJS, loaded on demand
│   ├── iceServers.ts      STUN defaults plus TURN details from /api/turn
│   ├── memoryNetwork.ts   In-memory network for tests
│   ├── hostSession.ts     Seats, invites, expiry, reconnects, broadcasting (authority)
│   ├── guestSession.ts    Connecting, intents, receiving actions
│   └── invite.ts          Invite links and tokens
├── store/
│   ├── gameStore.ts       Zustand: configs, action history, redo stack, pause, settings
│   └── onlineStore.ts     Zustand: role, live session, inbox; wires sessions to the game store
├── hooks/
│   ├── useLudoGame.ts     Timing and turn flow for local, host and guest
│   ├── useOnline.ts       Session views via useSyncExternalStore
│   ├── useGameClock.ts    The game clock
│   └── useNow.ts          A ticking clock for countdowns
├── components/            Screens and UI: Setup, HostLobby, JoinScreen, GameScreen, Board,
│                          PlayerPanel, Dice, WinOverlay, ConfirmDialog, SeatList, Icons
├── audio/sfx.ts           Web Audio sound effects, with mute
├── App.tsx                Chooses setup, lobby, join or game from the stores
└── main.tsx               Entry point

api/
└── turn.ts                Vercel function: private TURN_* variables → relay details
```

### Design principles

- **Pure rules, impure shell.** Everything in `game/` takes a state and returns a new one. Nothing mutates its input or touches the DOM. React, timers, audio and networking live outside it.
- **The history is the state.** The store keeps the starting state and the list of actions. The current state, the log and the highlighted moves are derived by replaying them. That one decision gives exact undo/redo, a game log, deterministic tests and, later, online play almost for free.
- **Replays are exact.** Each roll stores its value, and bot styles are fixed at creation (a bot takeover carries its style in the action), so replaying always reproduces the same game.
- **One action path.** Every action is decided, then announced (when hosting), then animated, then recorded. Bots, auto moves, humans and online guests all go through it.
- **Animation is separate from rules.** The engine applies a move at once. The hook walks the piece square by square while the true state is already settled.
- **Injected effects.** Randomness, the network and storage are passed in, so tests use fixed dice, seeded simulations and an in-memory network.
- **Code splitting.** PeerJS loads only when someone goes online, so local players never download it.

The [learning guide](docs/README.md) explains each of these in depth.

## Testing

```bash
npm test
```

182 tests across:

- **Engine:** dice mapping, comeback odds, creation and names, lane entry and exact finish, captures (including stacks) and safe squares, extra rolls, automatic moves, the three-sixes forfeit, passes, finishing, ending early and bot takeover.
- **Bots:** every style still captures and finishes, guardians run from threats, racers push leaders, and close calls vary.
- **Full games:** seeded bot-only games for two and four players, with invariants checked after every action.
- **Network:** protocol validation, invite links, joining, expiry, wrong tokens, full games, leaving, reconnecting with a seat secret, ordered actions, pause, new games, takeover and ending, all over an in-memory network.
- **Stores and hooks:** undo, redo, settings, forced moves, auto roll, celebrations, the end-early offer, auto pause, and the hook in host and guest roles.
- **UI:** setup choices (including colours and online rules), the app flow, 2-player games, the log, the win overlay and the dialogs.

The network tests use an in-memory transport. Real WebRTC between two browsers has to be tested by hand: open the invite on a second device, or in a second browser.

## Deploying

This is a static Vite app plus one optional serverless function. On Vercel: import the repository, keep the defaults (framework **Vite**, build `npm run build`, output `dist`) and deploy. Vercel picks up [api/turn.ts](api/turn.ts) automatically. Online play uses the free public PeerJS signalling server. For players on mobile data, also set `TURN_CREDENTIALS_URL` (see [Connecting across networks](#connecting-across-networks)). Any static host works too, but without the function online play is limited to networks that connect directly.

## Browser support

Any modern browser. Online play needs WebRTC data channels, which every current browser supports. Sound uses the Web Audio API and is silent where unavailable. Animations switch off when the system asks for reduced motion.

## Known limitations

- **The host's tab is the server.** If the host closes it, the online game ends. Guests can reconnect only while the host is still there.
- **Free public servers, no guarantees.** The PeerJS signalling server is a free community service with no uptime promise. If it is down, local play still works, but online games cannot start.
- **Mobile data needs a TURN relay.** Without one configured, players on different networks (especially mobile data) often cannot connect. See [Connecting across networks](#connecting-across-networks).
- **Some networks block WebRTC.** Strict corporate or school firewalls may stop connections even with a relay. A relay on port 443 over TLS (`turns:`) gets through most of them.
- **No spectators and no late joining.** Once a game starts, only players reclaiming their own seat can connect.
- **Bots look one move ahead** rather than searching, so they are reasonable rather than strong.
- **Pausing takes effect after the current animation.**
- **Local games live in memory.** Refreshing the page starts over.

## Learning guide

[`docs/`](docs/README.md) is a study guide built on this codebase: architecture and folder structure, TypeScript, React, state management, the game loop and timing, the rules engine and AI, testing, multiplayer system design, accessibility and performance, and a set of interview questions answered with references to the code.

[LEARNINGS.md](LEARNINGS.md) is a reusable playbook for building the next game from this one: what to copy, adapt or rewrite, the engine contract, the feature checklist players now expect, the online deployment recipe, and the pitfalls hit along the way.

## Licence

Copyright (C) 2026 Sachin Kiran Shah.

This program is free software: you can redistribute it and/or modify it under the terms of the **GNU General Public License** as published by the Free Software Foundation, either **version 3** of the License, or (at your option) any later version. See [LICENSE](LICENSE) for the full text.

In short: anyone may use, study, copy, modify and share it, including commercially. If you distribute it or a modified version, you must share the source under the same licence.

Third-party libraries keep their own licences (React, Zustand and PeerJS are MIT, all compatible with the GPL).
