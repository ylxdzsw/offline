// Development-only comparison tool. Baseline is a directory containing offline_<game>.wasm
// and <game>/{api,worker}.js; save these before changing an engine.
// node scripts/benchmark-ai.cjs backgammon /tmp/offline-ai-baseline 8 medium
// node scripts/benchmark-ai.cjs chess /tmp/offline-ai-baseline 4 medium --nodes 20000 --max-depth 5 --max-plies 180
// node scripts/benchmark-ai.cjs xiangqi /tmp/offline-ai-baseline 2 medium --nodes 13000 --max-plies 120
// node scripts/benchmark-ai.cjs go /tmp/offline-ai-baseline 4 medium --size 13 --seed-start 101
// --nodes disables the Chess/Xiangqi clock cap; Checkers/Dou Shou Qi get a 10-second safety cap.
// Omit it for normal difficulty settings. Capped games remain unfinished, never inferred wins.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const {createRequire} = require('node:module')
const wasm = require('../app/wasm.js')
let nextId = 0
function loadEngine(game, baseline) {
    const name = `${game}-benchmark-${nextId++}`
    const source = baseline ? path.join(baseline, game) : path.join(__dirname, '../games', game)
    const binary = baseline ? path.join(baseline, `offline_${game}.wasm`)
        : path.join(__dirname, '../games/target/wasm32-unknown-unknown/release', `offline_${game}.wasm`)
    wasm.installBytes(name, fs.readFileSync(binary))
    const call = request => wasm.dispatch(name, request)
    const context = vm.createContext({
        console, performance, crypto: globalThis.crypto,
        require: createRequire(path.join(source, 'api.js')),
        module: {exports: {}},
        OfflineGames: {wasm: {has: () => true, dispatch: (_name, request) => call(request)}},
    })
    vm.runInContext(fs.readFileSync(path.join(source, 'api.js'), 'utf8'), context)
    const rules = context.module.exports
    context.module = {exports: {}}
    vm.runInContext(fs.readFileSync(path.join(source, 'worker.js'), 'utf8'), context)
    return {rules, ai: context.module.exports, call}
}
function random(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6d2b79f5 | 0
        let x = Math.imul(seed ^ seed >>> 15, 1 | seed)
        x ^= x + Math.imul(x ^ x >>> 7, 61 | x)
        return ((x ^ x >>> 14) >>> 0) / 4294967296
    }
}
const clone = value => JSON.parse(JSON.stringify(value))
function percentile(values, p) {
    return values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] || 0
}
function classicalGame(game, current, players, rng, difficulty, options, pair, times) {
    const rules = current.rules, chess = game === 'chess', first = chess ? 'w' : 'r'
    let state = chess ? rules.initialState() : {board: rules.initialBoard(), turn: first}
    const positions = [], keys = {}, opening = []
    const key = () => chess ? rules.positionKey(state) : rules.positionKey(state.board, state.turn)
    const moves = () => chess ? rules.legalMoves(state) : rules.legalMoves(state.board, state.turn)
    const status = () => chess ? rules.status(state, keys) : rules.status(state.board, state.turn, keys)
    const play = move => {
        positions.push(clone(state))
        state = chess ? rules.applyMove(state, move)
            : {board: rules.applyMove(state.board, move), turn: rules.other(state.turn)}
        keys[key()] = (keys[key()] || 0) + 1
    }
    keys[key()] = 1
    if (chess) {
        const openings = [
            ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
            ['d2d4', 'd7d5', 'c2c4', 'e7e6'],
            ['c2c4', 'e7e5', 'b1c3', 'g8f6'],
            ['g1f3', 'd7d5', 'g2g3', 'c7c5'],
        ]
        const square = name => (8 - Number(name[1])) * 8 + name.charCodeAt(0) - 97
        for (const text of openings[pair % openings.length]) {
            const move = moves().find(move => move.from === square(text.slice(0, 2)) && move.to === square(text.slice(2)))
            if (!move) throw new Error(`Illegal benchmark opening move: ${text}`)
            play(move); opening.push(text)
        }
    } else {
        for (let index = 0; index < 4; index++) {
            const legal = moves(), move = legal[Math.floor(rng() * legal.length)]
            play(move); opening.push(`${move.from}-${move.to}`)
        }
    }
    let plies = 0, outcome = status()
    while (!outcome.ended && plies < (options.maxPlies ?? 180)) {
        const engine = players[state.turn === first ? 0 : 1]
        const searchOptions = {
            seed: Math.floor(rng() * 0x100000000),
            positions: [...positions, state].map(position => chess ? position : {board: position.board, side: position.turn}),
        }
        if (options.nodeBudget != null) Object.assign(searchOptions, {nodeBudget: options.nodeBudget, maxDepth: options.maxDepth ?? 5, timeBudget: 0})
        else if (options.maxDepth != null) searchOptions.maxDepth = options.maxDepth
        const before = performance.now()
        const result = chess ? engine.ai.search(state, difficulty, searchOptions)
            : engine.ai.search(state.board, state.turn, difficulty, searchOptions)
        times[engine === current ? 'current' : 'previous'].push(performance.now() - before)
        if (!result.move) throw new Error(`${game} returned no move in a playable position`)
        play(result.move); plies++; outcome = status()
    }
    return {
        winner: !outcome.ended ? 'unfinished' : outcome.winner == null ? 'draw'
            : players[outcome.winner === first ? 0 : 1] === current ? 'current' : 'previous',
        reason: outcome.ended ? outcome.reason : 'ply-limit', plies, opening,
    }
}
function boardGame(game, current, players, rng, difficulty, options, times) {
    const rules = current.rules, go = game === 'go', checkers = game === 'checkers'
    const pursuit = checkers || game === 'doushouqi', size = options.size ?? 13
    let board = go ? null : clone(rules.initialBoard()), side = 1, halfmove = 0, plies = 0
    const moves = [], positions = [], keys = []
    if (pursuit) {
        // Identical seeded openings with engine colors swapped in each pair.
        positions.push({board: clone(board), side}); keys.push(rules.positionKey(board, side))
        for (let index = 0; index < 6; index++) {
            const legal = rules.legalMoves(board, side), move = legal[Math.floor(rng() * legal.length)]
            board = checkers ? rules.applyMove(board, move, side) : rules.applyMove(board, move)
            side = rules.other(side)
            positions.push({board: clone(board), side}); keys.push(rules.positionKey(board, side))
        }
    }
    const status = () => go ? rules.state(size, moves).outcome
        : checkers ? rules.status(board, side, halfmove, keys)
        : pursuit ? rules.status(board, side, keys) : rules.status(board)
    const limit = options.maxPlies ?? (go ? size * size * 3 : pursuit ? 320 : 225)
    let outcome = status()
    while (!outcome.ended && plies < limit) {
        if (game === 'reversi' && !rules.legalMoves(board, side).length) {
            side = 3 - side; continue
        }
        const engine = players[side - 1], seed = Math.floor(rng() * 0x100000000)
        const searchOptions = {seed, positions, halfmove}
        if (options.nodeBudget != null) Object.assign(searchOptions, {
            nodeBudget: options.nodeBudget, maxDepth: options.maxDepth ?? 12, timeBudget: 10000,
        })
        else if (options.maxDepth != null) searchOptions.maxDepth = options.maxDepth
        const started = performance.now()
        const result = go ? engine.ai.search(size, moves, difficulty, seed)
            : pursuit ? engine.ai.search(board, side, difficulty, searchOptions)
            : engine.ai.search(board, side, difficulty, seed)
        times[engine === current ? 'current' : 'previous'].push(performance.now() - started)
        if (go) moves.push(result.move == null ? {kind: 'pass'} : {kind: 'play', index: result.move})
        else if (pursuit) {
            if (!result.move) throw new Error(`${game} returned no move in a playable position`)
            if (checkers) halfmove = result.move.captures.length || !rules.isKing(board[result.move.from]) ? 0 : halfmove + 1
            board = checkers ? rules.applyMove(board, result.move, side) : rules.applyMove(board, result.move)
        } else {
            if (result.move == null) throw new Error(`${game} returned no move in a playable position`)
            board = rules.applyMove(board, result.move, side)
        }
        side = 3 - side; plies++
        if (pursuit) { positions.push({board: clone(board), side}); keys.push(rules.positionKey(board, side)) }
        outcome = status()
    }
    return {
        winner: !outcome.ended ? 'unfinished' : outcome.winner == null ? 'draw'
            : players[outcome.winner - 1] === current ? 'current' : 'previous',
        reason: outcome.ended ? outcome.reason : 'ply-limit', plies,
        ...(go ? {size, score: rules.state(size, moves).score} : {}),
    }
}
async function run(game, baseline, pairs = 4, difficulty = 'medium', options = {}) {
    const current = loadEngine(game), previous = loadEngine(game, baseline)
    const results = [], times = {current: [], previous: []}
    const seedStart = options.seedStart ?? (['chess', 'xiangqi'].includes(game) ? 91 : 1)
    for (let pair = 0; pair < pairs; pair++) for (let swap = 0; swap < 2; swap++) {
        const players = swap ? [previous, current] : [current, previous]
        const rng = random(pair + seedStart), seed = () => Math.floor(rng() * 0x100000000)
        let winner = null, plies = 0, reason = 'ply-limit', details = {}
        if (game === 'backgammon') {
            let position = current.rules.initialPosition()
            for (; plies < (options.maxPlies ?? 400); plies++) {
                const side = plies % 2, engine = players[side]
                const dice = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)]
                const before = performance.now()
                const result = engine.ai.search(position, side, dice, difficulty, {seed: seed()})
                times[engine === current ? 'current' : 'previous'].push(performance.now() - before)
                if (result.turn) position = clone(result.turn.position)
                const outcome = current.rules.outcome(position)
                if (outcome) { winner = players[outcome.winner] === current ? 'current' : 'previous'; reason = 'borne-off'; plies++; break }
            }
        } else if (game === 'junqi') {
            const initialBoard = current.rules.initialBoard(pair + seedStart + 18)
            let board = clone(initialBoard), events = [], revealed = []
            const seen = new Map()
            for (; plies < (options.maxPlies ?? 200); plies++) {
                const player = plies % 2, side = player ? 'b' : 'r', engine = players[player]
                const outcome = current.rules.status(board, side)
                if (outcome.ended) { winner = players[outcome.winner === 'r' ? 0 : 1] === current ? 'current' : 'previous'; reason = outcome.reason; break }
                const key = side + JSON.stringify(board)
                seen.set(key, (seen.get(key) || 0) + 1)
                if (seen.get(key) >= 4) { reason = 'repetition-limit'; break }
                const before = performance.now()
                const move = engine.ai.choose({board, initialBoard, events, revealed, side, difficulty, seed: seed()})
                times[engine === current ? 'current' : 'previous'].push(performance.now() - before)
                if (!move) throw new Error('Junqi returned no move in a playable position')
                const attacker = board[move.from], defender = board[move.to]
                const result = current.rules.applyMove(board, move)
                const newlyRevealed = result.revealed.filter(id => !revealed.includes(id))
                events.push({side, move, attacker: attacker.id, defender: defender?.id || null,
                    result: defender ? result.result : 'move', revealed: newlyRevealed})
                revealed.push(...newlyRevealed)
                board = clone(result.board)
            }
            if (!winner) {
                const outcome = current.rules.status(board, plies % 2 ? 'b' : 'r')
                if (outcome.ended) { winner = players[outcome.winner === 'r' ? 0 : 1] === current ? 'current' : 'previous'; reason = outcome.reason }
            }
        } else if (game === 'chess' || game === 'xiangqi') {
            details = classicalGame(game, current, players, rng, difficulty, options, pair, times)
        } else if (['go', 'reversi', 'wuziqi', 'checkers', 'doushouqi'].includes(game)) {
            details = boardGame(game, current, players, rng, difficulty, options, times)
        } else throw new Error(`Unsupported opponent game: ${game}`)
        const result = {pair, swap, winner: winner || 'unfinished', reason, plies, ...details}
        results.push(result)
        console.log(JSON.stringify(result))
    }
    const summary = {game, difficulty, seedStart, options, games: results.length,
        wins: results.filter(r => r.winner === 'current').length,
        losses: results.filter(r => r.winner === 'previous').length,
        draws: results.filter(r => r.winner === 'draw').length,
        unfinished: results.filter(r => r.winner === 'unfinished').length,
        latency: Object.fromEntries(Object.entries(times).map(([key, values]) => [key, {
            moves: values.length, median: percentile(values, .5), p95: percentile(values, .95), max: values.length ? Math.max(...values) : 0,
        }])), results}
    console.log(JSON.stringify(summary, null, 2))
    return summary
}
module.exports = {loadEngine, random, clone, percentile, run}
if (require.main === module) {
    const names = {'--nodes': 'nodeBudget', '--max-depth': 'maxDepth', '--max-plies': 'maxPlies', '--seed-start': 'seedStart', '--size': 'size'}
    const options = {}
    try {
        for (let index = 6; index < process.argv.length; index++) {
            const [flag, inline] = process.argv[index].split('=')
            if (!names[flag]) throw new Error(`Unknown benchmark option: ${flag}`)
            const value = Number(inline ?? process.argv[++index])
            if (!Number.isSafeInteger(value) || value < (flag === '--seed-start' ? 0 : 1)) throw new Error(`Invalid value for ${flag}`)
            options[names[flag]] = value
        }
        if (options.size != null && ![9, 13, 19].includes(options.size)) throw new Error('Go board size must be 9, 13, or 19')
        if (options.nodeBudget != null && !['chess', 'xiangqi', 'checkers', 'doushouqi'].includes(process.argv[2])) {
            throw new Error('--nodes is supported for Chess, Xiangqi, Checkers, and Dou Shou Qi')
        }
        if (options.maxDepth != null && !['chess', 'xiangqi', 'checkers', 'doushouqi'].includes(process.argv[2])) {
            throw new Error('--max-depth is supported for Chess, Xiangqi, Checkers, and Dou Shou Qi')
        }
        const pairs = Number(process.argv[4] || 4)
        if (!Number.isSafeInteger(pairs) || pairs < 1) throw new Error('Pairs must be a positive integer')
        run(process.argv[2], process.argv[3], pairs, process.argv[5] || 'medium', options)
            .catch(error => { console.error(error); process.exitCode = 1 })
    } catch (error) { console.error(error); process.exitCode = 1 }
}
