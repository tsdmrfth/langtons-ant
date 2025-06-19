import { v4 as uuidv4 } from 'uuid'
import { Ant, Color, Direction, GameConfig, GameState, GameStateSnapshot, Player, Position, Rule } from '../types/game'

const COLOR_WHITE = '#FFFFFF'

export class GameEngine {
  private state: GameState
  private config: GameConfig
  private chunks: Map<string, Set<string>>
  private modifiedChunks: Set<string>

  constructor(config: GameConfig) {
    this.config = config
    this.state = {
      grid: {
        width: config.gridWidth,
        height: config.gridHeight,
        cells: new Map()
      },
      ants: [],
      players: new Map()
    }
    this.chunks = new Map()
    this.modifiedChunks = new Set()
    this.initializeChunks()
  }

  public getState(): GameState {
    return this.state
  }

  public addPlayer(): Player {
    if (this.state.players.size >= this.config.maxPlayers) {
      throw new Error('Maximum number of players reached')
    }

    const id = uuidv4()
    const color = this.generateUniqueColor()
    const player: Player = { id, color, antId: null }
    this.state.players.set(id, player)
    return player
  }

  public removePlayer(playerId: string): void {
    const player = this.state.players.get(playerId)
    if (player?.antId) {
      this.removeAnt(player.antId)
    }
    this.state.players.delete(playerId)
  }

  public placeAnt(playerId: string, position: Position, rules: Rule[]): Ant | null {
    const player = this.state.players.get(playerId)

    if (!player) return null

    if (player.antId) {
      throw new Error('Player already has an ant')
    }

    if (!this.isPositionInBounds(position)) {
      throw new Error('Position out of bounds')
    }

    if (rules.length === 0) {
      throw new Error('Rules cannot be empty')
    }

    const existingAnt = this.state.ants.find(ant =>
      ant.position.x === position.x && ant.position.y === position.y
    )

    if (existingAnt) {
      throw new Error('An ant already exists at this position')
    }

    const ant: Ant = {
      id: uuidv4(),
      position,
      direction: 'UP',
      color: player.color,
      rules
    }
    this.state.ants.push(ant)
    player.antId = ant.id
    this.updateChunkMembership(undefined, position)
    return ant
  }

  public updateRules(playerId: string, rules: Rule[]): boolean {
    const player = this.state.players.get(playerId)
    if (!player?.antId) return false

    const ant = this.state.ants.find(a => a.id === player.antId)
    if (!ant) return false

    ant.rules = rules
    return true
  }

  public tick(): void {
    const newAnts: Ant[] = []
    const cells = this.state.grid.cells
    this.modifiedChunks.clear()
    const occupiedPositions = new Map<string, { ant: Ant, direction: Direction, position: Position }>()

    for (const ant of this.state.ants) {
      const cellKey = this.getCellKey(ant.position)
      const currentColor = cells.get(cellKey) || COLOR_WHITE
      const ruleColor = currentColor === ant.color ? currentColor : COLOR_WHITE
      const rule = ant.rules.find(rule => rule.currentColor === ruleColor)

      if (!rule) {
        newAnts.push({ ...ant })
        continue
      }

      if (currentColor === COLOR_WHITE || currentColor === ant.color) {
        cells.set(cellKey, rule.newColor)
      }

      const newDirection = this.turnAnt(ant.direction, rule.turnDirection)
      const newPosition = this.moveAnt(ant.position, newDirection)
      const newCellKey = this.getCellKey(newPosition)

      if (occupiedPositions.has(newCellKey)) {
        newAnts.push({ ...ant, direction: newDirection })
        continue
      }

      occupiedPositions.set(newCellKey, {
        ant,
        direction: newDirection,
        position: newPosition
      })
    }

    for (const { ant, direction, position } of occupiedPositions.values()) {
      this.updateChunkMembership(ant.position, position)
      newAnts.push({ ...ant, direction, position })
    }

    this.state.ants = newAnts
    this.state.grid.cells = cells
  }

  private initializeChunks(): void {
    const { gridWidth, gridHeight, chunkSize } = this.config
    const chunksX = Math.ceil(gridWidth / chunkSize)
    const chunksY = Math.ceil(gridHeight / chunkSize)

    for (let x = 0; x < chunksX; x++) {
      for (let y = 0; y < chunksY; y++) {
        this.chunks.set(`${x},${y}`, new Set())
      }
    }
  }

  private getChunkKey(position: Position): string {
    const { chunkSize } = this.config
    const chunkX = Math.floor(position.x / chunkSize)
    const chunkY = Math.floor(position.y / chunkSize)
    return `${chunkX},${chunkY}`
  }

  private updateChunkMembership(oldPosition?: Position, newPosition?: Position) {
    if (oldPosition) {
      const oldChunkKey = this.getChunkKey(oldPosition)
      const oldChunk = this.chunks.get(oldChunkKey)

      if (oldChunk) {
        const oldCellKey = this.getCellKey(oldPosition)
        oldChunk.delete(oldCellKey)
        this.modifiedChunks.add(oldChunkKey)
      }
    }

    if (newPosition) {
      const newCellKey = this.getCellKey(newPosition)
      const newChunkKey = this.getChunkKey(newPosition)
      const newChunk = this.chunks.get(newChunkKey)

      if (newChunk) {
        newChunk.add(newCellKey)
        this.modifiedChunks.add(newChunkKey)
      }
    }
  }

  private removeAnt(antId: string): void {
    const ant = this.state.ants.find(a => a.id === antId)

    if (ant) {
      this.updateChunkMembership(ant.position, undefined)
      this.state.ants = this.state.ants.filter(a => a.id !== antId)
    }
  }

  private getCellKey(position: Position): string {
    return `${position.x},${position.y}`
  }

  private turnAnt(currentDirection: Direction, turnDirection: 'LEFT' | 'RIGHT'): Direction {
    const directions: Direction[] = ['UP', 'RIGHT', 'DOWN', 'LEFT']
    const currentIndex = directions.indexOf(currentDirection)
    const turnAmount = turnDirection === 'LEFT' ? -1 : 1
    const newIndex = (currentIndex + turnAmount + 4) % 4
    return directions[newIndex]
  }

  private moveAnt(position: Position, direction: Direction): Position {
    const newPosition = { ...position }

    switch (direction) {
      case 'UP':
        newPosition.y = (newPosition.y - 1 + this.config.gridHeight) % this.config.gridHeight
        break
      case 'RIGHT':
        newPosition.x = (newPosition.x + 1) % this.config.gridWidth
        break
      case 'DOWN':
        newPosition.y = (newPosition.y + 1) % this.config.gridHeight
        break
      case 'LEFT':
        newPosition.x = (newPosition.x - 1 + this.config.gridWidth) % this.config.gridWidth
        break
    }

    return newPosition
  }

  private generateRandomColor(): Color {
    let color: Color
    do {
      color = '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase()
    } while (color === COLOR_WHITE)
    return color
  }

  private generateUniqueColor(): Color {
    let color: Color
    const usedColors = new Set(Array.from(this.state.players.values()).map(player => player.color))
    do {
      color = this.generateRandomColor()
    } while (usedColors.has(color))
    return color
  }

  private isPositionInBounds(position: Position): boolean {
    return position.x >= 0 && position.x < this.config.gridWidth && position.y >= 0 && position.y < this.config.gridHeight
  }

  public flipTile(playerId: string, position: Position): boolean {
    const player = this.state.players.get(playerId)

    if (!player) return false

    const cellKey = this.getCellKey(position)
    const currentColor = this.state.grid.cells.get(cellKey) || COLOR_WHITE
    const chunkKey = this.getChunkKey(position)
    const chunk = this.chunks.get(chunkKey)

    if (currentColor === COLOR_WHITE) {
      this.state.grid.cells.set(cellKey, player.color)

      if (chunk) {
        chunk.add(cellKey)
      }

      this.modifiedChunks.add(chunkKey)
      return true
    }

    if (currentColor === player.color) {
      this.state.grid.cells.set(cellKey, COLOR_WHITE)
      this.modifiedChunks.add(chunkKey)
      return true
    }

    return false
  }

  public getGameStateSnapshot(): GameStateSnapshot {
    const cells = this.state.grid.cells
    const diff: Record<string, Record<string, Color>> = {}

    this.modifiedChunks.forEach(chunkKey => {
      const chunk = this.chunks.get(chunkKey)

      if (!chunk) return

      chunk.forEach(cellKey => {
        const color = cells.get(cellKey)
        if (color) {
          if (!diff[chunkKey]) {
            diff[chunkKey] = {}
          }
          diff[chunkKey][cellKey] = color
        }
      })
    })

    return {
      cells: diff,
      ants: this.state.ants
    }
  }
} 