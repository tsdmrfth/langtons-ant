# Multiplayer Langton's Ant

## Description
Langton's Ant is a two-dimensional cellular automaton with simple local rules that produce complex global behaviour.  
This repository contains a **multiplayer, real-time, browser-based** implementation where every connected player controls an individual ant with a unique colour and rule-set.  The service consists of:

* **api/** – a Node + TypeScript WebSocket server responsible for game state, tick processing, validation and broadcasting.
  - For a complete description of all public classes, methods and message schemas see [API_REFERENCE.md](./api/API_REFERENCE.md).
* **client/** – a React/Expo web application that renders the shared grid, lets the player define rules, place an ant, and interact with tiles.

The server maintains a single authoritative grid; clients receive incremental snapshots every 250 ms and render only the changed chunks for performance.

---
# Server Setup

## Getting Started

### Prerequisites
* Node ≥ 24.X
* Yarn ≥ 4.6.0

#### 1 — Clone & install
```bash
git clone https://github.com/tsdmrfth/langtons-ant
cd langtons-ant
yarn install
```

#### 2 — Run the server (dev mode)
Make sure youre in api folder

```bash
cd api
```

Run the server
```bash
yarn dev
```

#### 3 — Run unit tests
Make sure youre in api folder

```bash
cd api
```

Run the tests
```bash
yarn test
```

#### 4 — Production build & deploy
- Missing

---
## Technical Choices
| Topic | Decision & Rationale |
|-------|----------------------|
| **Language** | TypeScript with `strict: true` for reliability and editor tooling |
| **WebSocket library** | [`ws`](https://github.com/websockets/ws) – minimal, battle-tested, no HTTP server opinion |
| **State model** | `GameEngine` class keeps all grid data in memory for ultra-low latency; grid is a `Map` keyed by `x,y` and sharded into fixed-size chunks to minimise diff payloads |
| **Collision policy** | During a tick, ants are processed in player-join order; if two ants attempt the same cell, the first ant moves, the others stay.  This keeps determinism but is biased – Randomised ordering or hashed fairness could be added as a future improvement..  |
| **Colour allocation** | Random RGB excluding already-used values; guarantees uniqueness. |
| **Testing** | Jest unit tests for all game logic and WebSocket contract; CI step aborts on failure. |
| **Performance** | `permessage-deflate` is enabled in the WS handshake which cuts average snapshot payload size in local profiling and boosts ops/sec at shorter tick intervals. |

---
## Trade-offs 
* **Colour continuity:** when a player disconnects, their colour is returned to the available pool.  If they reconnect they will be treated as a new player and may receive a different colour – the implementation keeps the server stateless and avoids reserving colours indefinitely.
* **Fairness:** current collision resolution favours earlier ants.

---
## Future Work
With more time, I would have liked to implement and test the following:
- Replace `Map<string, Color>` with typed arrays inside each chunk to cut memory and accelerate traversal.
- Offload tick processing to worker threads to maintain WebSocket event loop responsiveness for larger grids.
- Partition the grid across shards and broadcast merged diffs for larger loads (e.g. 10k×10k grid with 160 players)
- Add a Redis layer plus periodic snapshots to enable restarts and historical replay.
- Add a deployment script to deploy the server to a cloud provider.
- Add support for other languages.
- A full React front-end:
  - Canvas-based grid renderer that repaints only the diffed chunks received in each `GAME_STATE_SNAPSHOT` message
  - Rule-editor form with client-side validation and live preview, syncing changes via `RULE_CHANGE`
  - Click/touch interactions for ant placement (`PLACE_ANT`) and tile flip (`TILE_FLIP`)
  - Reconnect logic with exponential back-off and token reuse so players retain colour and ant
  - Responsive layout with Tailwind CSS

---
## Performance Benchmarks
The following numbers were produced on an Apple M2 Pro using the provided benchmark script:

Higher Ops/Sec = faster
Lower Heap MB = less memory

┌─────────┬───────────────┬─────────┬───────────┬─────────┐
│ (index) │ Grid (NxN)    │ Players │ Ops / Sec │ Heap MB │
├─────────┼───────────────┼─────────┼───────────┼─────────┤
│ 0       │ '100x100'     │ 5       │ 1157123   │ '4.4'   │
│ 1       │ '100x100'     │ 10      │ 956145    │ '4.7'   │
│ 2       │ '100x100'     │ 20      │ 490156    │ '5.6'   │
│ 3       │ '100x100'     │ 40      │ 299655    │ '6.1'   │
│ 4       │ '100x100'     │ 80      │ 151573    │ '7.9'   │
│ 5       │ '100x100'     │ 160     │ 74885     │ '6.5'   │
│ 6       │ '500x500'     │ 5       │ 2413856   │ '6.8'   │
│ 7       │ '500x500'     │ 10      │ 1231009   │ '6.5'   │
│ 8       │ '500x500'     │ 20      │ 617622    │ '8.7'   │
│ 9       │ '500x500'     │ 40      │ 314628    │ '9.1'   │
│ 10      │ '500x500'     │ 80      │ 152989    │ '8.3'   │
│ 11      │ '500x500'     │ 160     │ 48827     │ '9.1'   │
│ 12      │ '1000x1000'   │ 5       │ 2488620   │ '9.6'   │
│ 13      │ '1000x1000'   │ 10      │ 1260259   │ '13.6'  │
│ 14      │ '1000x1000'   │ 20      │ 632978    │ '12.1'  │
│ 15      │ '1000x1000'   │ 40      │ 304021    │ '8.5'   │
│ 16      │ '1000x1000'   │ 80      │ 151584    │ '7.8'   │
│ 17      │ '1000x1000'   │ 160     │ 68753     │ '12.7'  │
│ 18      │ '5000x5000'   │ 5       │ 1780204   │ '19.1'  │
│ 19      │ '5000x5000'   │ 10      │ 1019307   │ '21.0'  │
│ 20      │ '5000x5000'   │ 20      │ 528186    │ '10.3'  │
│ 21      │ '5000x5000'   │ 40      │ 295184    │ '21.8'  │
│ 22      │ '5000x5000'   │ 80      │ 128239    │ '38.5'  │
│ 23      │ '5000x5000'   │ 160     │ 46980     │ '16.0'  │
│ 24      │ '10000x10000' │ 5       │ 2383388   │ '42.7'  │
│ 25      │ '10000x10000' │ 10      │ 845154    │ '25.9'  │
│ 26      │ '10000x10000' │ 20      │ 474433    │ '39.4'  │
│ 27      │ '10000x10000' │ 40      │ 255890    │ '93.6'  │
│ 28      │ '10000x10000' │ 80      │ 124351    │ '29.9'  │
│ 29      │ '10000x10000' │ 160     │ 64832     │ '26.3'  │
└─────────┴───────────────┴─────────┴───────────┴─────────┘

Run it yourself:
```bash
cd api
yarn benchmark
```