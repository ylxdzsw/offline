const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')

test('new games are deterministic and contain exactly two standard tiles', () => {
    const first = engine.newGame(42)
    assert.deepEqual(first, engine.newGame(42))
    assert.notDeepEqual(first.board, engine.newGame(43).board)
    assert.equal(first.board.filter(Boolean).length, 2)
    assert(first.board.every(value => [0, 2, 4].includes(value)))
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
