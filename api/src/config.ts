import { GameConfig } from './types/game'

export const DEFAULT_GAME_CONFIG: GameConfig = {
  gridWidth: 1000,
  gridHeight: 1000,
  chunkSize: 50,
  tickInterval: 250,
  maxPlayers: 10,
  heartbeatInterval: 10000
}