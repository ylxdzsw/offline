const test = require('node:test')
const assert = require('node:assert/strict')

const engine = require('./api.js')
const ai = require('./worker.js')

const empty = () => Array(64).fill(engine.EMPTY)
const sameMove = (left, right) => left.from === right.from
    && left.path.length === right.path.length
    && left.path.every((index, step) => index === right.path[step])

test('the opening has twelve pieces per side and seven legal black moves', () => {
    const board = engine.initialBoard()
    assert.equal(engine.count(board, engine.BLACK), 12)
    assert.equal(engine.count(board, engine.RED), 12)
    assert.equal(engine.kingCount(board, engine.BLACK), 0)
    const moves = engine.legalMoves(board, engine.BLACK)
    assert.equal(moves.length, 7)
    assert(moves.every(move => move.path.length === 1 && move.captures.length === 0))
    assert.throws(() => engine.legalMoves(board, 257), /not a valid side/)
})

test('a capture suppresses quiet moves and a full multi-jump applies atomically', () => {
    const board = empty()
    board[40] = engine.BLACK_MAN
    board[42] = engine.BLACK_MAN
    board[35] = engine.RED_MAN
    board[19] = engine.RED_MAN
    const moves = engine.legalMoves(board, engine.BLACK)
    assert.equal(moves.length, 1)
    assert.deepEqual(moves[0], {
        from: 42,
        path: [28, 10],
        captures: [35, 19],
        promotes: false,
    })

    const preview = engine.previewMove(board, moves[0], 1)
    assert.equal(preview[28], engine.BLACK_MAN)
    assert.equal(preview[35], engine.EMPTY)
    assert.equal(preview[19], engine.RED_MAN)

    const next = engine.applyMove(board, moves[0], engine.BLACK)
    assert.equal(next[10], engine.BLACK_MAN)
    assert.equal(engine.count(next, engine.RED), 0)
})

test('men capture forward only and crowning ends the current move', () => {
    const backward = empty()
    backward[26] = engine.BLACK_MAN
    backward[35] = engine.RED_MAN
    assert(engine.legalMoves(backward, engine.BLACK).every(move => move.captures.length === 0))

    const crown = empty()
    crown[17] = engine.BLACK_MAN
    crown[10] = engine.RED_MAN
    crown[12] = engine.RED_MAN
    const move = engine.legalMoves(crown, engine.BLACK)[0]
    assert.deepEqual(move.path, [3])
    assert.deepEqual(move.captures, [10])
    assert.equal(move.promotes, true)
    const next = engine.applyMove(crown, move, engine.BLACK)
    assert.equal(next[3], engine.BLACK_KING)
    assert.equal(next[12], engine.RED_MAN)
})

test('kings move backward and malformed or incomplete moves are rejected', () => {
    const board = empty()
    board[26] = engine.BLACK_KING
    board[35] = engine.RED_MAN
    const capture = engine.legalMoves(board, engine.BLACK).find(move => move.path[0] === 44)
    assert(capture)
    assert.throws(() => engine.applyMove(board, {from: 26, path: [44, 53]}, engine.BLACK), /illegal move/)
    assert.throws(() => engine.applyMove(board, {from: 26, path: []}, engine.BLACK), /cannot be empty/)
})

test('no legal move wins before repetition and forty-move draws', () => {
    const blocked = empty()
    blocked[1] = engine.RED_MAN
    assert.deepEqual(engine.status(blocked, engine.BLACK, 80, []), {
        ended: true,
        winner: engine.RED,
        reason: 'no-moves',
    })

    const board = engine.initialBoard()
    const key = engine.positionKey(board, engine.BLACK)
    assert.deepEqual(engine.status(board, engine.BLACK, 0, [key, key, key]), {
        ended: true,
        winner: null,
        reason: 'repetition',
    })
    assert.deepEqual(engine.status(board, engine.BLACK, 80, [key]), {
        ended: true,
        winner: null,
        reason: 'forty-move',
    })
})

test('AI is reproducible, legal, and takes a forced winning capture within budget', () => {
    const forced = empty()
    forced[42] = engine.BLACK_MAN
    forced[35] = engine.RED_MAN
    const winning = ai.search(forced, engine.BLACK, 'easy', {seed: 7})
    assert.deepEqual(winning.move.path, [28])

    const board = engine.initialBoard()
    const options = {seed: 23, nodeBudget: 12000, maxDepth: 3, rootBand: 120}
    const started = Date.now()
    const first = ai.search(board, engine.RED, 'easy', options)
    const repeated = ai.search(board, engine.RED, 'easy', options)
    assert.deepEqual(first.move, repeated.move)
    assert(engine.legalMoves(board, engine.RED).some(move => sameMove(move, first.move)))
    assert(first.score - first.selectedScore <= options.rootBand)
    assert(Date.now() - started < 1200)
})
