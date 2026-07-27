const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')

test('public constants and ABI identity remain stable', () => {
    assert.equal(engine.SIZE, 4)
    assert.equal(engine.CELLS, 16)
    assert.equal(engine.TARGET, 2048)
    assert.deepEqual(engine.DIRECTIONS, ['up', 'down', 'left', 'right'])
    assert.equal(Object.isFrozen(engine.DIRECTIONS), true)
    assert.throws(() => engine.DIRECTIONS.push('north'), TypeError)
    assert.throws(
        () => engine.move([2, ...Array(15).fill(0)], 'north', 1),
        /unknown direction "north"/,
    )
    assert.deepEqual(engine.ping(), {abi: 1, game: '2048'})
})

test('new games match Wasm golden vectors across the supported seed range', () => {
    const cases = [
        [0, [0,0,0,0, 0,0,2,0, 2,0,0,0, 0,0,0,0], [{index: 6, value: 2}, {index: 8, value: 2}]],
        [42, [0,0,0,0, 0,0,2,0, 0,0,0,0, 2,0,0,0], [{index: 6, value: 2}, {index: 12, value: 2}]],
        [4294967295, [0,0,0,0, 0,0,0,4, 0,0,2,0, 0,0,0,0], [{index: 7, value: 4}, {index: 10, value: 2}]],
        [4294967296, [2,0,0,0, 0,0,2,0, 0,0,0,0, 0,0,0,0], [{index: 0, value: 2}, {index: 6, value: 2}]],
        [Number.MAX_SAFE_INTEGER, [0,0,0,0, 0,0,2,0, 0,0,0,0, 0,2,0,0], [{index: 13, value: 2}, {index: 6, value: 2}]],
    ]
    for (const [seed, board, spawned] of cases) {
        assert.deepEqual(engine.newGame(seed), {
            board,
            gameOver: false,
            reached2048: false,
            spawned,
        })
        assert.deepEqual(engine.newGame(seed), engine.newGame(seed))
    }
})

test('moves compact, merge each tile once, score, and spawn exactly one tile', () => {
    const board = [2,2,2,2, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    const result = engine.move(board, 'left', 7)
    assert.equal(result.moved, true)
    assert.equal(result.scoreGain, 8)
    assert.deepEqual(result.merged, [0, 1])
    assert(result.spawned)
    const withoutSpawn = result.board.slice()
    withoutSpawn[result.spawned.index] = 0
    assert.deepEqual(withoutSpawn, [4,4,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0])
})

test('directional moves and merge destinations match Wasm golden vectors', () => {
    const board = [2,0,0,2, 0,0,0,0, 0,0,0,0, 2,0,0,2]
    const expected = {
        up: [[4,0,0,4, 0,0,0,0, 2,0,0,0, 0,0,0,0], [0, 3], {index: 8, value: 2}],
        down: [[0,0,0,0, 0,0,2,0, 0,0,0,0, 4,0,0,4], [12, 15], {index: 6, value: 2}],
        left: [[4,0,0,0, 0,0,0,2, 0,0,0,0, 4,0,0,0], [0, 12], {index: 7, value: 2}],
        right: [[0,0,0,4, 0,0,0,2, 0,0,0,0, 0,0,0,4], [3, 15], {index: 7, value: 2}],
    }
    for (const direction of engine.DIRECTIONS) {
        const result = engine.move(board, direction, 1234)
        assert.deepEqual(result.board, expected[direction][0])
        assert.deepEqual(result.merged, expected[direction][1])
        assert.deepEqual(result.spawned, expected[direction][2])
        assert.equal(result.scoreGain, 8)
    }
})

test('invalid moves preserve the board and do not score or spawn', () => {
    const board = [2,4,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    assert.deepEqual(engine.move(board, 'left', 7), {
        board,
        moved: false,
        scoreGain: 0,
        spawned: null,
        merged: [],
        reached2048: false,
        gameOver: false,
    })
})

test('tile spawning is deterministic for a move seed', () => {
    const board = [0,2,0,2, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    assert.deepEqual(engine.move(board, 'left', 1234), engine.move(board, 'left', 1234))
})

test('status detects the 2048 milestone and boards with no legal move', () => {
    const winning = [2048,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    assert.deepEqual(engine.status(winning), {reached2048: true, gameOver: false})
    const blocked = [2,4,2,4, 4,2,4,2, 2,4,2,4, 4,2,4,2]
    assert.deepEqual(engine.status(blocked), {reached2048: false, gameOver: true})
})

test('invalid inputs preserve Wasm error messages and status metadata', () => {
    const cases = [
        [() => engine.status([0]), 'board must have 16 cells'],
        [() => engine.status([3, ...Array(15).fill(0)]), 'board cells must be zero or powers of two'],
        [() => engine.status([-2, ...Array(15).fill(0)]), 'invalid value: integer `-2`, expected u32'],
        [() => engine.status(Array(16)), 'invalid type: null, expected u32'],
        [() => engine.move(Array(16).fill(0), 'north', 1), 'unknown direction "north"'],
        [() => engine.newGame(), 'missing field `seed`'],
        [() => engine.newGame(1.5), 'invalid type: floating point `1.5`, expected u64'],
        [() => engine.newGame(1e21), 'invalid type: floating point `1e+21`, expected u64'],
        [() => engine.newGame('1'), 'invalid type: string "1", expected u64'],
        [() => engine.move([2147483648,2147483648, ...Array(14).fill(0)], 'left', 1), 'tile value overflow'],
    ]
    for (const [operation, message] of cases) {
        assert.throws(operation, error => {
            assert.equal(error.message, message)
            assert.equal(error.status, 2)
            assert.deepEqual(error.response, {error: {message, status: 2}})
            return true
        })
    }
})
