import { Direction, Position } from '../types/game'

export function turnAnt(current: Direction, turn: 'LEFT' | 'RIGHT'): Direction {
  const directions: Direction[] = ['UP', 'RIGHT', 'DOWN', 'LEFT']
  const idx = directions.indexOf(current)
  const delta = turn === 'LEFT' ? -1 : 1
  return directions[(idx + delta + directions.length) % directions.length]
}

export function moveAnt(position: Position, direction: Direction, gridWidth: number, gridHeight: number): Position {
  const next = { ...position }

  switch (direction) {
    case 'UP':
      next.y = (next.y - 1 + gridHeight) % gridHeight
      break
    case 'RIGHT':
      next.x = (next.x + 1) % gridWidth
      break
    case 'DOWN':
      next.y = (next.y + 1) % gridHeight
      break
    case 'LEFT':
      next.x = (next.x - 1 + gridWidth) % gridWidth
      break
  }

  return next
} 