const test = require('node:test')
const assert = require('node:assert/strict')

const engine = require('./api.js')
require('./worker.js')
const ai = globalThis.OfflineGames.GoAI

const play = (moves, index) => [...moves, {kind: 'play', index}]
const pass = moves => [...moves, {kind: 'pass'}]

const diagramMoves = (rows, turn) => {
    const size = rows.length
    const target = [...rows.join('')].map(cell => cell === 'B' ? engine.BLACK : cell === 'W' ? engine.WHITE : engine.EMPTY)
    const pending = [[], [], []]
    target.forEach((color, index) => { if (color) pending[color].push(index) })
    const reserved = pending[3 - turn].at(-1), moves = []
    let state = engine.state(size, moves)
    while (pending[engine.BLACK].length || pending[engine.WHITE].length) {
        const choice = pending[state.turn].findIndex(index => state.legal.includes(index)
            && (index !== reserved || pending[turn].length === 0))
        moves.push(choice < 0 ? {kind: 'pass'} : {kind: 'play', index: pending[state.turn].splice(choice, 1)[0]})
        state = engine.state(size, moves)
        assert.equal(state.outcome.ended, false)
    }
    assert.deepEqual(state.board, target)
    assert.equal(state.turn, turn)
    assert.equal(state.passes, 0)
    return moves
}

test('publishes the search budgets', () => {
    assert.deepEqual(ai.limits, {
        easy: {time: 280, simulations: 2000},
        medium: {time: 1040, simulations: 12000},
        hard: {time: 3040, simulations: 40000},
        'very-hard': {time: 15200, simulations: 200000},
    })
})

test('defaults to a 13x13 Chinese-rules game', () => {
    assert.equal(engine.DEFAULT_SIZE, 13)
    assert.deepEqual(engine.SIZES, [9, 13, 19])
    const state = engine.state()
    assert.equal(state.size, 13)
    assert.equal(state.board.length, 169)
    assert.ok(state.board.every(value => value === engine.EMPTY))
    assert.equal(state.turn, engine.BLACK)
    assert.equal(state.score.black, 0)
    assert.equal(state.score.white, engine.KOMI)
    assert.equal(state.legal.length, 169)
})

test('captures stones and rejects suicide', () => {
    const size = 9
    let moves = []
    moves = play(moves, engine.at(0, 1, size))
    moves = play(moves, engine.at(1, 1, size))
    moves = play(moves, engine.at(1, 0, size))
    moves = pass(moves)
    moves = play(moves, engine.at(1, 2, size))
    moves = pass(moves)
    const capture = engine.at(2, 1, size)
    const next = engine.play(size, moves, capture)
    moves = play(moves, capture)

    assert.equal(next.board[engine.at(1, 1, size)], engine.EMPTY)
    assert.equal(next.captures.black, 1)
    assert.deepEqual(engine.checkMove(size, moves, engine.at(1, 1, size)), {
        legal: false,
        reason: 'suicide',
    })
})

test('enforces ko and allows play elsewhere', () => {
    const size = 19
    const sequence = [[0, 3], [0, 2], [1, 4], [2, 2], [2, 3], [1, 1], [1, 2], [1, 3]]
    const moves = sequence.reduce((history, [row, column]) =>
        play(history, engine.at(row, column, size)), [])
    assert.deepEqual(engine.checkMove(size, moves, engine.at(1, 2, size)), {
        legal: false,
        reason: 'ko',
    })
    assert.equal(engine.checkMove(size, moves, engine.at(8, 8, size)).legal, true)
})

test('two passes end the game under area scoring', () => {
    const state = engine.state(9, pass(pass([])))
    assert.equal(state.outcome.ended, true)
    assert.equal(state.outcome.reason, 'passes')
    assert.equal(state.outcome.winner, engine.WHITE)
    assert.equal(state.outcome.margin, 7.5)
})

test('search returns standard, legal, deterministic openings', () => {
    const first = ai.search(13, [{kind: 'play', index: 84}], 'medium', 23)
    const second = ai.search(13, [{kind: 'play', index: 84}], 'medium', 23)
    const legal = engine.state(13, [{kind: 'play', index: 84}]).legal
    assert.equal(first.move, second.move)
    assert.ok([42, 48, 120, 126].includes(first.move))
    assert.ok(legal.includes(first.move))
})

test('search evaluates a legal non-opening reply', () => {
    const size = 9
    const moves = [
        {kind: 'play', index: engine.at(4, 4, size)},
        {kind: 'play', index: engine.at(2, 2, size)},
        {kind: 'play', index: engine.at(6, 6, size)},
    ]
    const result = ai.search(size, moves, 'easy', 91)
    assert.ok(result.simulations > 0)
    assert.ok(result.nodes > 0)
    assert.ok(engine.state(size, moves).legal.includes(result.move))
})

test('invalid sizes, records, and post-game moves are rejected', () => {
    assert.throws(() => engine.state(10, []), /size/)
    assert.throws(() => engine.state(9, [{kind: 'play', index: 81}]), /outside/)
    assert.throws(() => engine.state(9, pass(pass([{kind: 'pass'}]))), /end/)
})

test('AI captures and escapes atari at every board size without random blunders', () => {
    const fixtures = [
        {points: [[4,4],[3,4],[0,0],[4,3],[0,2],[4,5]], expected: [5,4]},
        {points: [[3,4],[4,4],[4,3],[0,0],[4,5],[0,2]], expected: [5,4]},
        {points: [[3,4],[4,4],[3,5],[4,5],[4,3],[0,0],[4,6],[0,2],[5,4],[0,4]], expected: [5,5]},
        {points: [[1,0],[1,1],[0,1],[3,1],[1,2]], expected: [2,1]},
        {points: [[3,4],[4,4],[4,3],[3,3],[4,5],[4,2],[5,5],[0,8],[6,4]], expected: [5,3]},
    ]
    for (const size of engine.SIZES) for (const fixture of fixtures) {
        const moves = fixture.points.map(([row, column]) => ({kind: 'play', index: engine.at(row, column, size)}))
        for (const difficulty of ['easy', 'medium', 'hard']) for (const seed of [1, 7, 29]) {
            assert.equal(ai.search(size, moves, difficulty, seed).move, engine.at(...fixture.expected, size),
                `${size}×${size}, ${difficulty}, seed ${seed}, expected ${fixture.expected}`)
        }
    }
})

test('AI reads small-eye life and death and permits proven capturing throw-ins', () => {
    const eye = ['BBBBBWWWW', 'B...BWWWW', 'BBBBBWWWW', 'WWWWWWWWW', 'W.W.WWWWW',
        'WWWWWWWWW', 'WWWWWWWWW', 'WWWWWWWWW', 'WWWWWWWWW']
    const throwIn = ['BWWWWB...', 'BW..WB...', 'BWWWWB...', 'BBBBBB...', '.........',
        '.........', '.........', '.........', '.........']
    for (const [rows, turn, expected] of [[eye, engine.BLACK, [11]], [eye, engine.WHITE, [11]],
        [throwIn, engine.BLACK, [11, 12]]]) {
        const moves = diagramMoves(rows, turn)
        for (const difficulty of ['easy', 'medium', 'hard']) for (const seed of [1, 7, 29]) {
            assert.ok(expected.includes(ai.search(9, moves, difficulty, seed).move), `${turn}, ${difficulty}, ${seed}`)
        }
    }
})


test('AI plays the vital point in a five-point eye instead of passing at every size', () => {
    const template = ['BBBBBBWWW', 'B..BBBWWW', 'B...BBWWW', 'BBBBBBWWW', 'WWWWWWWWW',
        'W.W.WWWWW', 'WWWWWWWWW', 'WWWWWWWWW', 'WWWWWWWWW']
    for (const size of engine.SIZES) {
        const rows = Array.from({length: size}, (_, row) => (template[row] || 'W'.repeat(9)) + 'W'.repeat(size - 9))
        for (const turn of [engine.BLACK, engine.WHITE]) {
            const moves = diagramMoves(rows, turn)
            const expected = turn === engine.BLACK
                ? [engine.at(1, 2, size), engine.at(2, 1, size), engine.at(2, 2, size)]
                : [engine.at(2, 2, size)]
            for (const difficulty of ['easy', 'medium', 'hard']) for (const seed of [1, 7, 29]) {
                assert.ok(expected.includes(ai.search(size, moves, difficulty, seed).move), `${size}, ${turn}, ${difficulty}, ${seed}`)
            }
        }
    }
})


test('AI preserves life when the opponent invades a small eye after the defense', () => {
    const template = ['BBBBBBWWW', 'B..BBBWWW', 'B...BBWWW', 'BBBBBBWWW', 'WWWWWWWWW',
        'W.W.WWWWW', 'WWWWWWWWW', 'WWWWWWWWW', 'WWWWWWWWW']
    for (const size of engine.SIZES) {
        const rows = Array.from({length: size}, (_, row) => (template[row] || 'W'.repeat(9)) + 'W'.repeat(size - 9))
        const moves = diagramMoves(rows, engine.BLACK)
        moves.push({kind: 'play', index: engine.at(1, 2, size)}, {kind: 'play', index: engine.at(2, 2, size)})
        for (const difficulty of ['easy', 'medium', 'hard']) for (const seed of [1, 7, 29]) {
            assert.equal(ai.search(size, moves, difficulty, seed).move, engine.at(2, 1, size))
        }
    }
})
