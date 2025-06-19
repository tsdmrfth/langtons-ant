import * as fc from 'fast-check'
import { GameEngine } from './GameEngine'
import { GameConfig, Rule } from '../types/game'

describe('GameEngine property tests', () => {
  const config: GameConfig = {
    gridWidth: 20,
    gridHeight: 20,
    tickInterval: 250,
    chunkSize: 5,
    maxPlayers: 10,
    heartbeatInterval: 10000
  }

  it('ensures no duplicate ant positions after tick', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 6 }), (count: number) => {
        const engine = new GameEngine(config)
        const rules: Rule[] = [{ currentColor: '#FFFFFF', newColor: '#000000', turnDirection: 'RIGHT' }]

        const positions = new Set<string>()
        for (let i = 0; i < count; i++) {
          const player = engine.addPlayer()
          const pos = { x: i, y: 0 }
          engine.placeAnt(player.id, pos, rules)
          positions.add(`${pos.x},${pos.y}`)
        }

        expect(positions.size).toBe(count)

        engine.tick()
        const snapshot = engine.getState()
        const after = snapshot.ants.map(a => `${a.position.x},${a.position.y}`)
        const uniqueAfter = new Set(after)
        expect(uniqueAfter.size).toBe(snapshot.ants.length)
      })
    )
  })
}) 