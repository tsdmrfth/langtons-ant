import http from 'http'
import WebSocket from 'ws'
import { WebSocketServer } from './WebSocketServer'
import { GameConfig, Rule } from '../types/game'

describe('WebSocketServer', () => {
  const gameConfig: GameConfig = {
    gridWidth: 50,
    gridHeight: 50,
    tickInterval: 250,
    chunkSize: 10,
    maxPlayers: 10,
    heartbeatInterval: 10000
  }

  let httpServer: http.Server
  let wss: WebSocketServer
  let port: number

  beforeEach(done => {
    httpServer = http.createServer()
    httpServer.listen(0, () => {
      port = (httpServer.address() as any).port as number
      wss = new WebSocketServer(httpServer, gameConfig)
      done()
    })
  })

  afterEach(done => {
    wss.stop()
    httpServer.close(() => done())
  })

  const createClient = () => new WebSocket(`ws://localhost:${port}`)

  it('broadcasts PLAYER_JOIN when a client connects', done => {
    const client = createClient()

    client.on('message', data => {
      const message = JSON.parse(data.toString())
      if (message.type === 'PLAYER_JOIN') {
        expect(message.payload).toHaveProperty('playerId')
        expect(message.payload).toHaveProperty('color')
        client.close()
        done()
      }
    })
  })

  it('broadcasts PLACE_ANT to all clients', done => {
    const clientA = createClient()
    const clientB = createClient()
    const rules: Rule[] = [{ currentColor: '#FFFFFF', newColor: '#000000', turnDirection: 'RIGHT' }]

    let ready = 0
    const checkReady = () => {
      ready += 1
      if (ready === 2) {
        const antPlace = {
          type: 'PLACE_ANT',
          payload: {
            position: { x: 0, y: 0 },
            rules
          }
        }
        clientA.send(JSON.stringify(antPlace))
      }
    }

    clientA.once('message', () => checkReady())
    clientB.once('message', () => checkReady())

    clientB.on('message', data => {
      const message = JSON.parse(data.toString())
      if (message.type === 'PLACE_ANT') {
        expect(message.payload).toHaveProperty('cells')
        expect(message.payload).toHaveProperty('ants')
        clientA.close()
        clientB.close()
        done()
      }
    })
  })

  it('broadcasts RULE_CHANGE updates', done => {
    const client = createClient()
    const rules: Rule[] = [{ currentColor: '#FFFFFF', newColor: '#FF0000', turnDirection: 'LEFT' }]

    let playerId: string | null = null

    client.on('message', data => {
      const message = JSON.parse(data.toString())

      if (message.type === 'PLAYER_JOIN') {
        playerId = message.payload.playerId
        const antPlace = {
          type: 'PLACE_ANT',
          payload: {
            position: { x: 1, y: 1 },
            rules
          }
        }
        client.send(JSON.stringify(antPlace))
      }

      if (message.type === 'PLACE_ANT') {
        const ruleChange = {
          type: 'RULE_CHANGE',
          payload: { rules }
        }
        client.send(JSON.stringify(ruleChange))
      }

      if (message.type === 'RULE_CHANGE') {
        expect(message.payload.playerId).toBe(playerId)
        expect(message.payload.rules).toEqual(rules)
        client.close()
        done()
      }
    })
  })

  it('broadcasts TILE_FLIP snapshots', done => {
    const client = createClient()

    const rules: Rule[] = [{ currentColor: '#FFFFFF', newColor: '#0000FF', turnDirection: 'RIGHT' }]

    enum Phase {
      Joined,
      Placed,
      Flipped
    }

    let phase = Phase.Joined

    client.on('message', data => {
      const message = JSON.parse(data.toString())

      if (phase === Phase.Joined && message.type === 'PLAYER_JOIN') {
        const antPlace = {
          type: 'PLACE_ANT',
          payload: { position: { x: 2, y: 2 }, rules }
        }
        client.send(JSON.stringify(antPlace))
        phase = Phase.Placed
        return
      }

      if (phase === Phase.Placed && message.type === 'PLACE_ANT') {
        const flip = {
          type: 'TILE_FLIP',
          payload: { position: { x: 3, y: 3 } }
        }
        client.send(JSON.stringify(flip))
        phase = Phase.Flipped
        return
      }

      if (phase === Phase.Flipped && message.type === 'TILE_FLIP') {
        expect(message.payload).toHaveProperty('cells')
        client.close()
        done()
      }
    })
  })

  describe('Security', () => {
    it('rejects connections from disallowed origins', done => {
      wss.stop()
      httpServer.close(() => {
        httpServer = http.createServer()
        httpServer.listen(0, () => {
          port = (httpServer.address() as any).port as number
          wss = new WebSocketServer(httpServer, gameConfig, ['http://allowed.com'])
          const client = new WebSocket(`ws://localhost:${port}`, undefined, {
            headers: { Origin: 'http://evil.com' }
          })

          const fail = () => {
            client.terminate()
            wss.stop()
            httpServer.close(() => { })
          }

          client.on('open', () => {
            fail()
            done(new Error('Connection should have been rejected'))
          })

          client.on('error', () => {
            fail()
            done()
          })
        })
      })
    })

    it('sends ERROR when rate limit exceeded', done => {
      const client = createClient()
      const rules: Rule[] = [{ currentColor: '#FFFFFF', newColor: '#000000', turnDirection: 'RIGHT' }]

      let rateErrorReceived = false
      const floodMessages = () => {
        for (let i = 0; i < 31; i++) {
          const payload = {
            type: 'RULE_CHANGE',
            payload: { rules }
          }
          client.send(JSON.stringify(payload))
        }
      }

      client.on('message', data => {
        const message = JSON.parse(data.toString())

        if (message.type === 'PLAYER_JOIN') {
          floodMessages()
        }

        if (message.type === 'ERROR' && message.payload?.message === 'Rate limit exceeded') {
          rateErrorReceived = true
          client.close()
          clearTimeout(timeout)
          done()
        }
      })

      const timeout = setTimeout(() => {
        if (!rateErrorReceived) {
          client.close()
          done(new Error('Rate limit error not received'))
        }
      }, 2000)
    })
  })

  describe('Validation', () => {
    const rule: Rule = { currentColor: '#FFFFFF', newColor: '#000000', turnDirection: 'RIGHT' }

    it('sends ERROR when message has no type', done => {
      const client = createClient()

      client.on('message', data => {
        const message = JSON.parse(data.toString())

        if (message.type === 'PLAYER_JOIN') {
          client.send(JSON.stringify({ payload: {} }))
          return
        }

        if (message.type === 'ERROR') {
          expect(message.payload.message).toMatch(/missing type/i)
          client.close()
          done()
        }
      })
    })

    it('sends ERROR for unknown message type', done => {
      const client = createClient()

      client.on('message', data => {
        const message = JSON.parse(data.toString())

        if (message.type === 'PLAYER_JOIN') {
          const invalid = { type: 'UNKNOWN_TYPE', payload: {} }
          client.send(JSON.stringify(invalid))
          return
        }

        if (message.type === 'ERROR') {
          expect(message.payload.message).toMatch(/invalid message type/i)
          client.close()
          done()
        }
      })
    })

    it('rejects PLACE_ANT with negative coordinates', done => {
      const client = createClient()

      client.on('message', data => {
        const message = JSON.parse(data.toString())

        if (message.type === 'PLAYER_JOIN') {
          const invalidAnt = {
            type: 'PLACE_ANT',
            payload: {
              position: { x: -1, y: 0 },
              rules: [rule]
            }
          }
          client.send(JSON.stringify(invalidAnt))
          return
        }

        if (message.type === 'ERROR') {
          expect(message.payload.message).toMatch(/x and y must be positive/i)
          client.close()
          done()
        }
      })
    })

    it('rejects PLACE_ANT with non-numeric coordinates', done => {
      const client = createClient()

      client.on('message', data => {
        const message = JSON.parse(data.toString())

        if (message.type === 'PLAYER_JOIN') {
          const invalidAnt = {
            type: 'PLACE_ANT',
            payload: {
              position: { x: 'a', y: 0 },
              rules: [rule]
            }
          }
          client.send(JSON.stringify(invalidAnt))
          return
        }

        if (message.type === 'ERROR') {
          expect(message.payload.message).toMatch(/ant position x and y must be numbers/i)
          client.close()
          done()
        }
      })
    })

    it('sends ERROR for empty rules', done => {
      const client = createClient()

      client.on('message', data => {
        const message = JSON.parse(data.toString())

        if (message.type === 'PLAYER_JOIN') {
          const invalid = { type: 'PLACE_ANT', payload: { position: { x: 0, y: 0 }, rules: [] } }
          client.send(JSON.stringify(invalid))
          return
        }

        if (message.type === 'ERROR') {
          expect(message.payload.message).toMatch(/rules must be a non-empty array/i)
          client.close()
          done()
        }
      })
    })

    it('sends ERROR for missing currentColor in rules', done => {
      const client = createClient()

      client.on('message', data => {
        const message = JSON.parse(data.toString())

        if (message.type === 'PLAYER_JOIN') {
          const invalid = {
            type: 'PLACE_ANT', payload: {
              position: { x: 0, y: 0 }, rules: [{
                // currentColor: '#FFFFFF', // missing currentColor
                newColor: '#000000',
                turnDirection: 'LEFT'
              }]
            }
          }
          client.send(JSON.stringify(invalid))
          return
        }

        if (message.type === 'ERROR') {
          expect(message.payload.message).toMatch(/currentColor, newColor, and turnDirection are required/i)
          client.close()
          done()
        }
      })
    })

    it('sends ERROR for missing newColor in rules', done => {
      const client = createClient()

      client.on('message', data => {
        const message = JSON.parse(data.toString())

        if (message.type === 'PLAYER_JOIN') {
          const invalid = {
            type: 'PLACE_ANT', payload: {
              position: { x: 0, y: 0 }, rules: [{
                currentColor: '#FFFFFF',
                // newColor: '#000000', missing newColor
                turnDirection: 'LEFT'
              }]
            }
          }
          client.send(JSON.stringify(invalid))
          return
        }

        if (message.type === 'ERROR') {
          expect(message.payload.message).toMatch(/currentColor, newColor, and turnDirection are required/i)
          client.close()
          done()
        }
      })
    })

    it('sends ERROR for missing turnDirection in rules', done => {
      const client = createClient()

      client.on('message', data => {
        const message = JSON.parse(data.toString())

        if (message.type === 'PLAYER_JOIN') {
          const invalid = {
            type: 'PLACE_ANT', payload: {
              position: { x: 0, y: 0 }, rules: [{
                currentColor: '#FFFFFF',
                newColor: '#000000',
                // turnDirection: 'LEFT', missing turnDirection
              }]
            }
          }
          client.send(JSON.stringify(invalid))
          return
        }

        if (message.type === 'ERROR') {
          expect(message.payload.message).toMatch(/currentColor, newColor, and turnDirection are required/i)
          client.close()
          done()
        }
      })
    })

    it('sends ERROR for invalid turnDirection in rules', done => {
      const client = createClient()

      client.on('message', data => {
        const message = JSON.parse(data.toString())

        if (message.type === 'PLAYER_JOIN') {
          const invalid = {
            type: 'PLACE_ANT', payload: {
              position: { x: 0, y: 0 }, rules: [{
                currentColor: '#FFFFFF',
                newColor: '#000000',
                turnDirection: 'INVALID'
              }]
            }
          }
          client.send(JSON.stringify(invalid))
          return
        }

        if (message.type === 'ERROR') {
          expect(message.payload.message).toMatch(/turnDirection must be LEFT or RIGHT/i)
          client.close()
          done()
        }
      })
    })
  })
}) 