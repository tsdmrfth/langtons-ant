export type Direction = 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'

export type Color = string

export interface Position {
  x: number
  y: number
}

export interface Ant {
  id: string
  position: Position
  direction: Direction
  color: Color
  rules: Rule[]
}

export interface Rule {
  currentColor: Color
  newColor: Color
  turnDirection: 'LEFT' | 'RIGHT'
}

export interface Grid {
  width: number
  height: number
  cells: Map<string, Color>
}

export interface GameState {
  grid: Grid
  ants: Ant[]
  players: Map<string, Player>
}

export interface Player {
  id: string
  color: Color
  antId: string | null
}

export interface GameConfig {
  gridWidth: number
  gridHeight: number
  tickInterval: number
  chunkSize: number
  maxPlayers: number
  heartbeatInterval: number
}

export interface WebSocketMessage {
  type: 'GAME_STATE_SNAPSHOT' | 'PLAYER_JOIN' | 'PLAYER_LEAVE' | 'PLACE_ANT' | 'RULE_CHANGE' | 'TILE_FLIP' | 'ERROR'
  payload: any
}

export interface GameStateSnapshot {
  cells: Record<string, Record<string, Color>>
  ants: Ant[]
}