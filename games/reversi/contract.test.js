const test = require('node:test')
const assert = require('node:assert/strict')

const engine = require('./api.js')
const ai = require('./worker.js')

test('the opening position has the standard discs and four legal black moves', () => {
    const board = engine.initialBoard()
    assert.equal(engine.count(board, engine.BLACK), 2)
    assert.equal(engine.count(board, engine.WHITE), 2)
    assert.deepEqual(engine.legalMoves(board, engine.BLACK).map(move => move.index), [19, 26, 37, 44])
})

test('a move flips bracketed discs in every direction', () => {
    const board = Array(64).fill(engine.EMPTY)
    const center = engine.at(3, 3)
    for (const [dr, dc] of engine.DIRECTIONS) {
        board[engine.at(3 + dr, 3 + dc)] = engine.WHITE
        board[engine.at(3 + dr * 2, 3 + dc * 2)] = engine.BLACK
    }
    const flips = engine.flipsForMove(board, center, engine.BLACK)
    assert.equal(flips.length, 8)
    const next = engine.applyMove(board, center, engine.BLACK)
    assert.equal(engine.count(next, engine.WHITE), 0)
    assert.equal(engine.count(next, engine.BLACK), 17)
})

test('unbracketed and occupied squares are illegal', () => {
    const board = engine.initialBoard()
    assert.deepEqual(engine.flipsForMove(board, 0, engine.BLACK), [])
    assert.throws(() => engine.applyMove(board, 0, engine.BLACK), /illegal move/)
    assert.throws(() => engine.applyMove(board, engine.at(3, 3), engine.BLACK), /illegal move/)
})

test('play continues when only one side can move and ends when neither can', () => {
    const passing = Array(64).fill(engine.BLACK)
    passing[0] = engine.EMPTY
    passing[1] = engine.WHITE
    assert.equal(engine.legalMoves(passing, engine.BLACK).length, 1)
    assert.equal(engine.legalMoves(passing, engine.WHITE).length, 0)
    assert.equal(engine.status(passing).ended, false)
    const ended = Array(64).fill(engine.BLACK)
    ended[0] = engine.WHITE
    assert.deepEqual(engine.status(ended), {ended: true, winner: engine.BLACK, reason: 'full', black: 63, white: 1})
})

test('AI takes an available corner and returns legal moves within the easy budget', () => {
    const corner = Array(64).fill(engine.EMPTY)
    corner[1] = engine.BLACK
    corner[2] = engine.WHITE
    assert.equal(ai.search(corner, engine.WHITE, 'easy').move, 0)

    const board = engine.initialBoard()
    const started = Date.now()
    const result = ai.search(board, engine.WHITE, 'easy')
    assert(engine.legalMoves(board, engine.WHITE).some(move => move.index === result.move))
    assert(Date.now() - started < 1200)
})
