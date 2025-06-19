import { GameEngine } from '../src/game/GameEngine'
import { GameConfig, Position, Rule } from '../src/types/game'
import { randomInt } from 'crypto'

interface BenchmarkResult {
    grid: number
    players: number
    opsPerSec: number
    memoryMB: number
}

function createEngine(gridSize: number, players: number): GameEngine {
    const config: GameConfig = {
        gridWidth: gridSize,
        gridHeight: gridSize,
        tickInterval: 250,
        chunkSize: 50,
        maxPlayers: players,
        heartbeatInterval: 10000
    }

    const engine = new GameEngine(config)

    for (let i = 0; i < players; i += 1) {
        const player = engine.addPlayer()

        const position: Position = {
            x: randomInt(0, gridSize),
            y: randomInt(0, gridSize)
        }

        const rules: Rule[] = [
            {
                currentColor: '#FFFFFF',
                newColor: player.color,
                turnDirection: 'RIGHT'
            }
        ]

        try {
            engine.placeAnt(player.id, position, rules)
        } catch (error) {
            // Expected error
        }
    }

    return engine
}

function runBenchmark(gridSize: number, players: number, ticks: number): BenchmarkResult {
    console.log(`Running ${ticks.toLocaleString()} ticks for grid size ${gridSize} with ${players} players...`)
    const engine = createEngine(gridSize, players)
    const start = process.hrtime.bigint()

    for (let i = 0; i < ticks; i += 1) {
        engine.tick()
    }

    const end = process.hrtime.bigint()
    const seconds = Number(end - start) / 1e9
    const heapUsed = process.memoryUsage().heapUsed / (1024 * 1024)
    return { grid: gridSize, players, opsPerSec: ticks / seconds, memoryMB: heapUsed }
}

function printResults(results: BenchmarkResult[]): void {
    console.log('\nResults (higher is better):')
    console.table(
        results.map(r => ({
            'Grid (NxN)': `${r.grid}x${r.grid}`,
            Players: r.players,
            'Ops / Sec': Math.round(r.opsPerSec),
            'Heap MB': r.memoryMB.toFixed(1)
        }))
    )
}

async function main(): Promise<void> {
    const GRID_SIZES = [100, 500, 1000, 5000, 10000]
    const PLAYER_COUNTS = [5, 10, 20, 40, 80, 160]
    const TICKS = 10_000

    const results: BenchmarkResult[] = []

    for (const grid of GRID_SIZES) {
        for (const players of PLAYER_COUNTS) {
            results.push(runBenchmark(grid, players, TICKS))
        }
    }

    printResults(results)
}

if (require.main === module) {
    main()
} 