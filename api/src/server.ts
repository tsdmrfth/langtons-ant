import express, { Request, Response } from 'express'
import { createServer } from 'http'
import { DEFAULT_GAME_CONFIG } from './config'
import { WebSocketServer } from './websocket/WebSocketServer'

const app = express()
const port = process.env.PORT || 3000

const server = createServer(app)
const wss = new WebSocketServer(server, DEFAULT_GAME_CONFIG)
app.use(express.json())

app.get('/health', (_: Request, response: Response) => {
  response.json({ status: 'ok' })
})

server.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  wss.stop()
  server.close(() => {
    console.log('HTTP server closed')
  })
}) 