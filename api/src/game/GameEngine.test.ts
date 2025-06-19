import { GameEngine } from './GameEngine'
import { GameConfig, Position, Rule } from '../types/game'

describe('GameEngine', () => {
    const gameConfig: GameConfig = {
        gridWidth: 100,
        gridHeight: 100,
        tickInterval: 250,
        chunkSize: 10,
        maxPlayers: 10,
        heartbeatInterval: 10000
    }
    let gameEngine: GameEngine

    beforeEach(() => {
        gameEngine = new GameEngine(gameConfig)
    })

    describe('Player Management', () => {
        it('should add a player with unique color', () => {
            const player = gameEngine.addPlayer()
            expect(player).toBeDefined()
            expect(player.id).toBeDefined()
            expect(player.color).toMatch(/^#[0-9A-F]{6}$/)
            expect(player.color).not.toBe('#FFFFFF')
            expect(player.antId).toBeNull()
        })

        it('should remove a player and their ant', () => {
            const player = gameEngine.addPlayer()
            const position: Position = { x: 0, y: 0 }
            const rules: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: '#000000',
                turnDirection: 'RIGHT'
            }]
            gameEngine.placeAnt(player.id, position, rules)
            gameEngine.removePlayer(player.id)
            const state = gameEngine.getState()
            expect(state.players.has(player.id)).toBeFalsy()
            expect(state.ants.find(a => a.id === player.antId)).toBeUndefined()
        })

        it('should enforce maximum player limit', () => {
            for (let i = 0; i < gameConfig.maxPlayers; i++) {
                gameEngine.addPlayer()
            }

            expect(() => gameEngine.addPlayer()).toThrow('Maximum number of players reached')
        })
    })

    describe('Ant Management', () => {
        it('should place an ant for a player', () => {
            const player = gameEngine.addPlayer()
            const position: Position = { x: 0, y: 0 }
            const rules: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: '#000000',
                turnDirection: 'RIGHT'
            }]

            const ant = gameEngine.placeAnt(player.id, position, rules)
            expect(ant).toBeDefined()
            expect(ant?.position).toEqual(position)
            expect(ant?.color).toBe(player.color)
            expect(ant?.rules).toEqual(rules)
        })

        it('should update ant rules', () => {
            const player = gameEngine.addPlayer()
            const position: Position = { x: 0, y: 0 }
            const initialRules: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: '#000000',
                turnDirection: 'RIGHT'
            }]
            const newRules: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: '#FF0000',
                turnDirection: 'LEFT'
            }]
            gameEngine.placeAnt(player.id, position, initialRules)
            const success = gameEngine.updateRules(player.id, newRules)
            expect(success).toBeTruthy()
            const state = gameEngine.getState()
            const ant = state.ants.find(a => a.id === player.antId)
            expect(ant?.rules).toEqual(newRules)
        })

        it('should prevent a player from placing multiple ants', () => {
            const player = gameEngine.addPlayer()
            const pos1: Position = { x: 0, y: 0 }
            const pos2: Position = { x: 1, y: 1 }
            const rules: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: '#000000',
                turnDirection: 'RIGHT'
            }]

            gameEngine.placeAnt(player.id, pos1, rules)
            expect(() => gameEngine.placeAnt(player.id, pos2, rules)).toThrow('Player already has an ant')
        })
    })

    describe('Game Mechanics', () => {
        it('should move ant according to rules', () => {
            const player = gameEngine.addPlayer()
            const position: Position = { x: 0, y: 0 }
            const rules: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: '#000000',
                turnDirection: 'RIGHT'
            }]
            gameEngine.placeAnt(player.id, position, rules)
            gameEngine.tick()
            const state = gameEngine.getState()
            const ant = state.ants.find(a => a.id === player.antId)
            expect(ant?.position).toEqual({ x: 1, y: 0 })
            expect(ant?.direction).toBe('RIGHT')
        })

        it('should wrap ant position around grid boundaries', () => {
            const player = gameEngine.addPlayer()
            const position: Position = { x: gameConfig.gridWidth - 1, y: 0 }
            const rules: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: '#000000',
                turnDirection: 'RIGHT'
            }]
            gameEngine.placeAnt(player.id, position, rules)
            gameEngine.tick()
            const state = gameEngine.getState()
            const ant = state.ants.find(a => a.id === player.antId)
            expect(ant?.position).toEqual({ x: 0, y: 0 })
        })

        it('should update cell colors according to rules', () => {
            const player = gameEngine.addPlayer()
            const position: Position = { x: 0, y: 0 }
            const rules: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: '#000000',
                turnDirection: 'RIGHT'
            }]

            gameEngine.placeAnt(player.id, position, rules)
            gameEngine.tick()

            const state = gameEngine.getState()
            const cellKey = `${position.x},${position.y}`
            expect(state.grid.cells.get(cellKey)).toBe('#000000')
        })

        it('should handle multiple ants in the same cell', () => {
            const player1 = gameEngine.addPlayer()
            const player2 = gameEngine.addPlayer()
            const position: Position = { x: 0, y: 0 }
            const rules: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: '#000000',
                turnDirection: 'RIGHT'
            }]
            gameEngine.placeAnt(player1.id, position, rules)
            expect(() => gameEngine.placeAnt(player2.id, position, rules)).toThrow()
        })

        it('should resolve collisions such that the first ant moves and the second stays', () => {
            const player1 = gameEngine.addPlayer()
            const player2 = gameEngine.addPlayer()

            const rules1: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: player1.color,
                turnDirection: 'RIGHT'
            }]

            const rules2: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: player2.color,
                turnDirection: 'LEFT'
            }]

            const pos1: Position = { x: 0, y: 1 }
            const pos2: Position = { x: 2, y: 1 }
            gameEngine.placeAnt(player1.id, pos1, rules1)
            gameEngine.placeAnt(player2.id, pos2, rules2)
            gameEngine.tick()
            const state = gameEngine.getState()
            const ant1 = state.ants.find(a => a.id === player1.antId)
            const ant2 = state.ants.find(a => a.id === player2.antId)
            expect(ant1?.position).toEqual({ x: 1, y: 1 })
            expect(ant1?.direction).toBe('RIGHT')
            expect(ant2?.position).toEqual({ x: 2, y: 1 })
            expect(ant2?.direction).toBe('LEFT')
        })

        it('should treat other players color as white but not repaint their tile', () => {
            const player1 = gameEngine.addPlayer()
            const rules1: Rule[] = [{ currentColor: '#FFFFFF', newColor: player1.color, turnDirection: 'RIGHT' }]
            gameEngine.placeAnt(player1.id, { x: 0, y: 0 }, rules1)
            gameEngine.tick() // ant moves to 1,0 and paints 0,0 with its color

            const tileColorAfterPlayer1 = gameEngine.getState().grid.cells.get('0,0')

            const player2 = gameEngine.addPlayer()
            const rules2: Rule[] = [{ currentColor: '#FFFFFF', newColor: '#FF0000', turnDirection: 'RIGHT' }]
            gameEngine.placeAnt(player2.id, { x: 0, y: 0 }, rules2) // tile occupied by color of player1 but no ant present
            gameEngine.tick()

            const cellKey = '0,0'
            const state = gameEngine.getState()
            expect(tileColorAfterPlayer1).toBeDefined()
            expect(state.grid.cells.get(cellKey)).toBe(tileColorAfterPlayer1) // remains unchanged
        })
    })

    describe('Chunk Management', () => {
        it('should create correct number of chunks', () => {
            const expectedChunksX = Math.ceil(gameConfig.gridWidth / gameConfig.chunkSize)
            const expectedChunksY = Math.ceil(gameConfig.gridHeight / gameConfig.chunkSize)
            const expectedTotalChunks = expectedChunksX * expectedChunksY
            const chunks = (gameEngine as any).chunks
            expect(chunks.size).toBe(expectedTotalChunks)
        })

        it('should update chunk membership when ant moves', () => {
            const player = gameEngine.addPlayer()
            const position: Position = { x: 9, y: 0 }
            const rules: Rule[] = [{
                currentColor: '#FFFFFF',
                newColor: '#000000',
                turnDirection: 'RIGHT'
            }]
            gameEngine.placeAnt(player.id, position, rules)
            gameEngine.tick()
            const chunks = (gameEngine as any).chunks
            const oldChunkKey = '0,0'
            const newChunkKey = '1,0'
            const oldCellKey = '9,0'
            const newCellKey = '10,0'
            expect(chunks.get(oldChunkKey)?.has(oldCellKey)).toBeFalsy()
            expect(chunks.get(newChunkKey)?.has(newCellKey)).toBeTruthy()
        })

        it('should remove cell from chunk after ant removal', () => {
            const player = gameEngine.addPlayer()
            const position: Position = { x: 0, y: 0 }
            const rules: Rule[] = [{ currentColor: '#FFFFFF', newColor: '#000000', turnDirection: 'RIGHT' }]
            gameEngine.placeAnt(player.id, position, rules)
            const cellKey = '0,0'
            const chunkKey = '0,0'
            const chunksBefore = (gameEngine as any).chunks
            expect(chunksBefore.get(chunkKey).has(cellKey)).toBeTruthy()

            gameEngine.removePlayer(player.id)
            const chunksAfter = (gameEngine as any).chunks
            expect(chunksAfter.get(chunkKey).has(cellKey)).toBeFalsy()
        })
    })

    describe('Validation', () => {
        it('should throw when placing ant out of bounds', () => {
            const player = gameEngine.addPlayer()
            const position: Position = { x: -1, y: 0 }
            expect(() => gameEngine.placeAnt(player.id, position, [])).toThrow()
        })

        it('should throw when placing ant with empty rules', () => {
            const player = gameEngine.addPlayer()
            const position: Position = { x: 0, y: 0 }
            expect(() => gameEngine.placeAnt(player.id, position, [])).toThrow()
        })
    })

    describe('flipTile', () => {
        it('should allow player to flip their own tile', () => {
            const player = gameEngine.addPlayer()
            const position: Position = { x: 0, y: 0 }
            const flipped = gameEngine.flipTile(player.id, position)
            expect(flipped).toBeTruthy()
            const cellKey = '0,0'
            const state = gameEngine.getState()
            expect(state.grid.cells.get(cellKey)).toBe(player.color)
        })

        it('should prevent flipping another players tile', () => {
            const player1 = gameEngine.addPlayer()
            const player2 = gameEngine.addPlayer()
            const position: Position = { x: 1, y: 0 }
            gameEngine.flipTile(player1.id, position)
            const success = gameEngine.flipTile(player2.id, position)
            expect(success).toBeFalsy()
            const cellKey = '1,0'
            const state = gameEngine.getState()
            expect(state.grid.cells.get(cellKey)).toBe(player1.color)
        })
    })

    describe('Stress Test', () => {
        jest.setTimeout(20000)

        it('handles 100 ants on 1000X1000 grid for 1000 ticks without errors', () => {
            const gameConfig: GameConfig = {
                gridWidth: 1000,
                gridHeight: 1000,
                tickInterval: 250,
                chunkSize: 50,
                maxPlayers: 100,
                heartbeatInterval: 10000
            }
            const engine = new GameEngine(gameConfig)
            const baseRule: Rule = {
                currentColor: '#FFFFFF',
                newColor: '#000000',
                turnDirection: 'RIGHT'
            }
            const positions = new Set<string>()
            for (let i = 0; i < 100; i++) {
                const player = engine.addPlayer()
                let x: number
                let y: number
                do {
                    x = Math.floor(Math.random() * gameConfig.gridWidth)
                    y = Math.floor(Math.random() * gameConfig.gridHeight)
                } while (positions.has(`${x},${y}`))
                positions.add(`${x},${y}`)
                engine.placeAnt(player.id, { x, y }, [baseRule])
            }
            expect(engine.getState().ants.length).toBe(100)

            for (let i = 0; i < 1000; i++) {
                engine.tick()
            }

            const state = engine.getState()
            expect(state.ants.length).toBe(100)

            state.ants.forEach(ant => {
                expect(ant.position.x).toBeGreaterThanOrEqual(0)
                expect(ant.position.x).toBeLessThan(gameConfig.gridWidth)
                expect(ant.position.y).toBeGreaterThanOrEqual(0)
                expect(ant.position.y).toBeLessThan(gameConfig.gridHeight)
            })
        })
    })
}) 