# Public API Reference

This document provides a high-level description of the externally visible API surfaces so that contributors can understand behaviour without diving into the tests.

---
## [GameEngine](./src/game/GameEngine.ts)
The main class responsible for managing the game state and logic.

| Method | Purpose | Parameters | Returns |
|--------|---------|------------|---------|
| `constructor(config)` | Create a new game instance using `GameConfig` (grid size, tick rate, etc.). | **config** – see [types/game.ts](./src/types/game.ts) | instance |
| `getState()` | Retrieve the full in-memory state: grid cells, ants, players. | – | `GameState` |
| `addPlayer()` | Register a new player and assign a unique colour.  Throws if `maxPlayers` reached. | – | `Player` |
| `removePlayer(playerId)` | Remove a player and their ant (if any). | **playerId** `string` | void |
| `placeAnt(playerId, position, rules)` | Spawn an ant for the player.  Validates bounds, uniqueness and rule array. | **position** `{ x, y }`<br>**rules** `Rule[]` | `Ant \| null` |
| `updateRules(playerId, rules)` | Replace the rule set of the player's ant. | – | `boolean` (true if update succeeded) |
| `flipTile(playerId, position)` | Toggle a tile between white and the player's colour.  Returns false for other players' tiles. | – | `boolean` |
| `tick()` | Advance the simulation one step (called every 250 ms by server). | – | void |
| `getGameStateSnapshot()` | Return diff of modified chunks since last tick for efficient WS broadcast. | – | `GameStateSnapshot` |

### Behavioural Notes
* Ants treat any tile not matching **their own** colour as white for rule lookup.
* Collisions: on a single tick, if two ants attempt the same target cell the one processed first moves, the second stays.
* Grid is toroidal; moving off an edge wraps around.

---
## [WebSocketServer](./src/websocket/WebSocketServer.ts)
The class responsible for managing the WebSocket connections and message handling.
All messages are JSON objects of shape `{ type: string, payload: object }`.

| Type | Sent by | Payload | Description |
|------|---------|---------|-------------|
| `PLAYER_JOIN` | Server | `{ playerId, color }` | New player joined the game. |
| `PLAYER_LEAVE` | Server | `{ playerId, cells, ants }` | Player disconnected; snapshot included for resync. |
| `PLACE_ANT` | Client → Server<br>Server → All | Client: `{ position, rules }`<br>Server: `{ cells, ants }` | Spawn ant / notify everyone. |
| `RULE_CHANGE` | Client → Server<br>Server → All | `{ rules }` / `{ playerId, rules }` | Update ant rules. |
| `TILE_FLIP` | Client → Server<br>Server → All | Client: `{ position }`<br>Server: `{ cells }` | Toggle tile ownership. |
| `GAME_STATE_SNAPSHOT` | Server | `{ cells, ants }` | Incremental diff every 250 ms. |
| `ERROR` | Server | `{ message }` | Validation or rate-limit error.

### Validation & Security
The server performs multiple layers of validation before a message is accepted:

| Check | Applies To | Rule |
|-------|-----------|------|
| **Origin whitelist** | Handshake | If `allowedOrigins` array is non-empty the `Origin` header **must** be an exact match (`includes` is not used) otherwise the handshake is rejected with **403 Forbidden**. |
| **Rate limit** | All runtime messages | A sliding counter allows **30 messages per player per 1 000 ms** window; additional messages receive an `ERROR` reply and are dropped. |
| **Schema validation** | Every received JSON packet | `type` and `payload` fields are required. Unknown `type` values raise `ERROR`. |
| &nbsp;– *PLACE_ANT* | `position` must exist and be numeric & ≥ 0; `rules` must be a non-empty array. |
| &nbsp;– *RULE_CHANGE* | `rules` must be a non-empty array. |
| &nbsp;– *TILE_FLIP* | `position` must exist and be numeric & ≥ 0. |
| **Rule validation** | Internally used by both *PLACE_ANT* and *RULE_CHANGE* | Each `Rule` requires `currentColor`, `newColor` and `turnDirection ∈ { 'LEFT', 'RIGHT' }`. |
| **Heartbeat / Liveness** | Connection maintenance | A `ping` is sent every `heartbeatInterval` (default 10 s). Lack of `pong` within two intervals terminates the socket and emits `PLAYER_LEAVE`. |

---
## [GameConfig](./src/config.ts)
Defines server-side tunables passed to both [GameEngine](./src/game/GameEngine.ts) and [WebSocketServer](./src/websocket/WebSocketServer.ts).

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `gridWidth` | `number` | 1000 | Number of cells on the **x** axis. |
| `gridHeight` | `number` | 1000 | Number of cells on the **y** axis. |
| `tickInterval` | `number` | 250 | Simulation step in **milliseconds**. |
| `chunkSize` | `number` | 50 | Width/height of a broadcast chunk; smaller = finer diffs, larger = fewer messages. |
| `maxPlayers` | `number` | 10 | Hard cap on concurrent players. |
| `heartbeatInterval` | `number` | 10 000 | Ping-pong interval for stale socket detection.

---
## Utility Helpers
Located in [`src/utils/antHelpers.ts`](./src/utils/antHelpers.ts).

| Function | Description |
|----------|-------------|
| `turnAnt(current, turn)` | Pure helper that rotates a cardinal `Direction` left or right. |
| `moveAnt(position, direction, gridW, gridH)` | Returns wrapped position after moving one step in `direction`. |

These helpers are covered by property-based tests (`ant.test.ts`) using **fast-check**.


## Extending the API
When adding new message types:
1. Update `types/game.ts` with the payload interface.
2. Add a `validateXMessage` helper in `WebSocketServer`.
3. Broadcast the result to all clients in `handleMessage`.
4. Document the new type in the table above.