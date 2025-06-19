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
## Continuous Integration
This repository ships with a GitHub Actions workflow located at `.github/workflows/ci.yml` which runs on every push and pull-request to the `main` branch.

Pipeline outline
1. Checkout code
2. Enable Corepack then activate **Yarn 4.6.0** – matching the `packageManager` field
3. Spin up a Node 24.x matrix runner
4. Install dependencies with `yarn install --immutable` using the cached `api/yarn.lock`
5. Build the TypeScript sources via `yarn build:server`
6. Execute the Jest test suite with `yarn test`

All steps run from the `api` sub-directory to keep the mono-repo future-proof.  The workflow fails fast on type errors or failing tests, ensuring main is always deployable.

---
## Trade-offs 
* **Colour continuity:** when a player disconnects, their colour is returned to the available pool.  If they reconnect they will be treated as a new player and may receive a different colour – the implementation keeps the server stateless and avoids reserving colours indefinitely.
* **Fairness:** current collision resolution favours earlier ants.

---
## Future Work
With more time, I would have liked to implement and test the following:
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

- Higher Ops/Sec = faster
- Lower Heap MB = less memory

| Grid (NxN) | Players | Ops / Sec | Heap MB |
|------------|---------|-----------|---------|
| 100x100 | 5 | 1,157,123 | 4.4 |
| 100x100 | 10 | 956,145 | 4.7 |
| 100x100 | 20 | 490,156 | 5.6 |
| 100x100 | 40 | 299,655 | 6.1 |
| 100x100 | 80 | 151,573 | 7.9 |
| 100x100 | 160 | 74,885 | 6.5 |
| 500x500 | 5 | 2,413,856 | 6.8 |
| 500x500 | 10 | 1,231,009 | 6.5 |
| 500x500 | 20 | 617,622 | 8.7 |
| 500x500 | 40 | 314,628 | 9.1 |
| 500x500 | 80 | 152,989 | 8.3 |
| 500x500 | 160 | 48,827 | 9.1 |
| 1000x1000 | 5 | 2,488,620 | 9.6 |
| 1000x1000 | 10 | 1,260,259 | 13.6 |
| 1000x1000 | 20 | 632,978 | 12.1 |
| 1000x1000 | 40 | 304,021 | 8.5 |
| 1000x1000 | 80 | 151,584 | 7.8 |
| 1000x1000 | 160 | 68,753 | 12.7 |
| 5000x5000 | 5 | 1,780,204 | 19.1 |
| 5000x5000 | 10 | 1,019,307 | 21.0 |
| 5000x5000 | 20 | 528,186 | 10.3 |
| 5000x5000 | 40 | 295,184 | 21.8 |
| 5000x5000 | 80 | 128,239 | 38.5 |
| 5000x5000 | 160 | 46,980 | 16.0 |
| 10000x10000 | 5 | 2,383,388 | 42.7 |
| 10000x10000 | 10 | 845,154 | 25.9 |
| 10000x10000 | 20 | 474,433 | 39.4 |
| 10000x10000 | 40 | 255,890 | 93.6 |
| 10000x10000 | 80 | 124,351 | 29.9 |
| 10000x10000 | 160 | 64,832 | 26.3 |

Run it yourself:
```bash
cd api
yarn benchmark
```