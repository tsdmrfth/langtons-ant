import { Server } from 'http'
import { RawData, WebSocket, WebSocketServer as WSServer } from 'ws'
import { GameEngine } from '../game/GameEngine'
import { GameConfig, GameStateSnapshot, Rule, WebSocketMessage } from '../types/game'

const RATE_LIMIT_WINDOW_MS = 1000
const MAX_MESSAGES_PER_WINDOW = 30

export class WebSocketServer {
  private wss: WSServer
  private gameEngine: GameEngine
  private clients: Map<string, WebSocket>
  private gameLoop: NodeJS.Timeout | null
  private rateLimitCounters: Map<string, { count: number, windowStart: number }>
  private allowedOrigins: string[]
  private config: GameConfig

  constructor(server: Server, config: GameConfig, allowedOrigins: string[] = []) {
    this.allowedOrigins = allowedOrigins
    this.wss = new WSServer({
      server,
      perMessageDeflate: true,
      verifyClient: (info, done) => {
        if (this.allowedOrigins.length === 0) return done(true)
        const origin = info.origin || ''
        const isAllowed = this.allowedOrigins.includes(origin)
        return done(isAllowed, isAllowed ? undefined : 403, 'Forbidden origin')
      }
    })

    this.gameEngine = new GameEngine(config)
    this.clients = new Map()
    this.rateLimitCounters = new Map()
    this.gameLoop = null
    this.config = config
    this.initialize()
  }

  private initialize(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      try {
        const player = this.gameEngine.addPlayer()
        const socket = ws as WebSocket & {
          isAlive?: boolean
          playerId?: string
        }
        socket.isAlive = true
        socket.playerId = player.id
        this.clients.set(player.id, socket)
        this.broadcastGameState({
          type: 'PLAYER_JOIN',
          payload: { playerId: player.id, color: player.color }
        })
        socket.on('message', (data: RawData) => {
          if (this.isRateLimited(player.id)) {
            this.handleError(socket, new Error('Rate limit exceeded'))
            return
          }

          try {
            const raw = typeof data === 'string' ? data : data.toString()
            const message: WebSocketMessage = JSON.parse(raw)
            this.validateMessage(message)
            this.handleMessage(player.id, message)
          } catch (error) {
            this.handleError(socket, error)
          }
        })
        socket.on('close', () => {
          this.handleDisconnect(player.id)
        })
        socket.on('error', (error) => {
          this.handleError(socket, error)
        })
        socket.on('pong', () => {
          socket.isAlive = true
        })
      } catch (error) {
        this.handleError(ws, error)
      }
    })

    const heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach(client => {
        const socket = client as WebSocket & {
          isAlive?: boolean
          playerId?: string
        }

        if (socket.isAlive === false) {
          if (socket.playerId) {
            this.handleDisconnect(socket.playerId)
          }
          return socket.terminate()
        }

        socket.isAlive = false
        try {
          socket.ping()
        } catch (error) {
          socket.terminate()
        }
      })
    }, this.config.heartbeatInterval)
    this.wss.on('close', () => clearInterval(heartbeatInterval))
    this.startGameLoop()
  }

  private validateMessage(message: WebSocketMessage): void {
    if (!message.type) {
      throw new Error('Invalid message format: missing type')
    }

    if (!message.payload) {
      throw new Error('Invalid message format: missing payload')
    }

    switch (message.type) {
      case 'PLACE_ANT':
        this.validateAntPlaceMessage(message)
        break
      case 'RULE_CHANGE':
        this.validateRuleChangeMessage(message)
        break
      case 'PLAYER_JOIN':
      case 'PLAYER_LEAVE':
      case 'ERROR':
        break
      case 'TILE_FLIP':
        this.validateTileFlipMessage(message)
        break
      default:
        throw new Error(`Invalid message type: ${message.type}`)
    }
  }

  private validateAntPlaceMessage(message: WebSocketMessage): void {
    const { position, rules } = message.payload

    if (!position) {
      throw new Error('Invalid ant position: position is required')
    }

    if (typeof position.x !== 'number' || typeof position.y !== 'number') {
      throw new Error('Invalid ant position: ant position x and y must be numbers')
    }

    if (position.x < 0 || position.y < 0) {
      throw new Error('Invalid ant position: ant position x and y must be positive')
    }

    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error('Invalid ant rules')
    }

    this.validateRules(rules)
  }

  private validateRuleChangeMessage(message: WebSocketMessage): void {
    const { rules } = message.payload

    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error('Invalid rules array')
    }

    this.validateRules(rules)
  }

  private validateRules(rules: Rule[]): void {
    for (const rule of rules) {
      if (!rule.currentColor || !rule.newColor || !rule.turnDirection) {
        throw new Error('Invalid rule format: currentColor, newColor, and turnDirection are required')
      }

      if (!['LEFT', 'RIGHT'].includes(rule.turnDirection)) {
        throw new Error('Invalid turn direction: turnDirection must be LEFT or RIGHT')
      }
    }
  }

  private handleMessage(playerId: string, message: WebSocketMessage): void {
    try {
      switch (message.type) {
        case 'PLACE_ANT':
          const { position, rules } = message.payload
          this.gameEngine.placeAnt(playerId, position, rules)
          const snapshot = this.gameEngine.getGameStateSnapshot()
          const antPlaceMessage: WebSocketMessage = {
            type: 'PLACE_ANT',
            payload: { cells: snapshot.cells, ants: snapshot.ants }
          }
          this.broadcastGameState(antPlaceMessage)
          break

        case 'RULE_CHANGE':
          const { rules: newRules } = message.payload
          this.gameEngine.updateRules(playerId, newRules)
          this.broadcastGameState({
            type: 'RULE_CHANGE',
            payload: { playerId, rules: newRules }
          })
          break

        case 'TILE_FLIP':
          const { position: flipPosition } = message.payload
          const flipped = this.gameEngine.flipTile(playerId, flipPosition)

          if (!flipped) {
            throw new Error('Invalid tile flip')
          }

          const flipSnapshot = this.gameEngine.getGameStateSnapshot()
          this.broadcastGameState({
            type: 'TILE_FLIP',
            payload: { cells: flipSnapshot.cells }
          })
          break
      }
    } catch (error) {
      const client = this.clients.get(playerId)

      if (client) {
        this.handleError(client, error)
      } else {
        console.error('No active client while handling error:', error)
      }
    }
  }

  private handleDisconnect(playerId: string): void {
    try {
      this.gameEngine.removePlayer(playerId)
      this.clients.delete(playerId)
      const snapshot = this.gameEngine.getGameStateSnapshot()
      const message: WebSocketMessage = {
        type: 'PLAYER_LEAVE',
        payload: { playerId, cells: snapshot.cells, ants: snapshot.ants }
      }
      this.broadcastGameState(message)
    } catch (error) {
      console.error('Error handling disconnect:', error)
    }
  }

  private handleError(ws: WebSocket, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    this.sendToClient(ws, {
      type: 'ERROR',
      payload: { message: errorMessage }
    })
  }

  private startGameLoop(): void {
    this.gameLoop = setInterval(() => {
      try {
        this.gameEngine.tick()
        this.broadcastGameStateSnapshot()
      } catch (error) {
        console.error('Error in game loop:', error)
      }
    }, this.config.tickInterval)
  }

  private broadcastGameStateSnapshot() {
    const snapshot: GameStateSnapshot = this.gameEngine.getGameStateSnapshot()

    if (snapshot.ants.length === 0 && Object.keys(snapshot.cells).length === 0) {
      return
    }

    const message: WebSocketMessage = {
      type: 'GAME_STATE_SNAPSHOT',
      payload: snapshot
    }
    this.broadcastGameState(message)
  }

  private broadcastGameState(message: WebSocketMessage): void {
    this.clients.forEach(client => {
      this.sendToClient(client, message)
    })
  }

  private sendToClient(client: WebSocket, message: WebSocketMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message))
      } catch (error) {
        console.error('Error sending message to client:', error)
      }
    }
  }

  public stop(): void {
    if (this.gameLoop) {
      clearInterval(this.gameLoop)
      this.gameLoop = null
    }
    this.wss.close()
  }

  private validateTileFlipMessage(message: WebSocketMessage): void {
    const { position } = message.payload

    if (!position) {
      throw new Error('Invalid tile flip: position is required')
    }

    if (typeof position.x !== 'number' || typeof position.y !== 'number') {
      throw new Error('Invalid tile flip: x and y must be numbers')
    }

    if (position.x < 0 || position.y < 0) {
      throw new Error('Invalid tile flip: x and y must be positive')
    }
  }

  private isRateLimited(playerId: string): boolean {
    const now = Date.now()
    const counter = this.rateLimitCounters.get(playerId) || { count: 0, windowStart: now }

    if (now - counter.windowStart > RATE_LIMIT_WINDOW_MS) {
      counter.count = 1
      counter.windowStart = now
      this.rateLimitCounters.set(playerId, counter)
      return false
    }

    counter.count += 1
    this.rateLimitCounters.set(playerId, counter)
    return counter.count > MAX_MESSAGES_PER_WINDOW
  }
} 