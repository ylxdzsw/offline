const test = require('node:test')
const assert = require('node:assert/strict')

const engine = require('./api.js')
const ai = require('./worker.js')

test('initial board has eight pieces per side with correct layout', () => {
    const board = engine.initialBoard()
    assert.equal(board.length, engine.SIZE)
    assert.equal(board.filter(p => engine.sideOf(p) === engine.RED).length, 8)
    assert.equal(board.filter(p => engine.sideOf(p) === engine.BLACK).length, 8)
    assert.equal(board[engine.RED_DEN], engine.EMPTY)
    assert.equal(board[engine.BLACK_DEN], engine.EMPTY)
    for (const t of engine.RED_TRAPS) assert.equal(board[t], engine.EMPTY)
    for (const t of engine.BLACK_TRAPS) assert.equal(board[t], engine.EMPTY)
    assert(board.every((p, i) => !engine.isRiver(i) || p === engine.EMPTY))
})

test('rat can enter river; other pieces cannot', () => {
    const board = engine.initialBoard()
    // Red Rat starts at (6,6); find it and check it has river moves
    const ratPos = board.findIndex(p => p === engine.pieceFor(engine.RED, engine.RAT))
    const moves = engine.movesFor(board, ratPos)
    assert(moves.length > 0)
    // Red Elephant at (6,0) must not have any river destination
    const elephantPos = board.findIndex(p => p === engine.pieceFor(engine.RED, engine.ELEPHANT))
    const eMoves = engine.movesFor(board, elephantPos)
    assert(eMoves.every(m => !engine.isRiver(m.to)))
})

test('tiger jumps over clear river and is blocked when a piece is in the water', () => {
    const board = Array(engine.SIZE).fill(engine.EMPTY)
    board[engine.at(2, 1)] = engine.pieceFor(engine.RED, engine.TIGER)
    const moves = engine.movesFor(board, engine.at(2, 1))
    assert(moves.some(m => m.to === engine.at(6, 1)), 'Tiger should jump col-1 river')

    const blocked = board.slice()
    blocked[engine.at(4, 1)] = engine.pieceFor(engine.BLACK, engine.RAT)
    const blockedMoves = engine.movesFor(blocked, engine.at(2, 1))
    assert(!blockedMoves.some(m => m.to === engine.at(6, 1)), 'jump blocked by Rat in river')
})

test('horizontal river jump works for lion', () => {
    const board = Array(engine.SIZE).fill(engine.EMPTY)
    board[engine.at(3, 0)] = engine.pieceFor(engine.RED, engine.LION)
    const moves = engine.movesFor(board, engine.at(3, 0))
    assert(moves.some(m => m.to === engine.at(3, 3)), 'Lion should jump horizontally over cols 1-2')
})

test('piece cannot enter its own den', () => {
    const board = Array(engine.SIZE).fill(engine.EMPTY)
    board[engine.at(7, 3)] = engine.pieceFor(engine.RED, engine.WOLF)
    const moves = engine.movesFor(board, engine.at(7, 3))
    assert(!moves.some(m => m.to === engine.RED_DEN), 'cannot enter own den')
    assert(moves.some(m => m.to === engine.at(6, 3)), 'can advance away from den')
})

test('trap neutralizes piece rank so any enemy can capture it', () => {
    // Black Elephant on Red trap at (8,4) — effective rank 0
    const board = Array(engine.SIZE).fill(engine.EMPTY)
    board[engine.at(8, 4)] = engine.pieceFor(engine.BLACK, engine.ELEPHANT)
    board[engine.at(7, 4)] = engine.pieceFor(engine.RED, engine.RAT)
    const moves = engine.movesFor(board, engine.at(7, 4))
    assert(moves.some(m => m.to === engine.at(8, 4)), 'Rat should capture trapped Elephant')
})

test('piece recovers its rank when capturing out of an enemy trap', () => {
    const board = Array(engine.SIZE).fill(engine.EMPTY)
    board[engine.at(1, 3)] = engine.pieceFor(engine.RED, engine.WOLF)
    board[engine.at(2, 3)] = engine.pieceFor(engine.BLACK, engine.RAT)
    const moves = engine.movesFor(board, engine.at(1, 3))
    assert(moves.some(m => m.to === engine.at(2, 3)), 'Wolf should recover its rank on leaving the trap')
})

test('rats cannot capture across a river bank', () => {
    const board = Array(engine.SIZE).fill(engine.EMPTY)
    board[engine.at(3, 1)] = engine.pieceFor(engine.RED, engine.RAT)
    board[engine.at(3, 0)] = engine.pieceFor(engine.BLACK, engine.RAT)
    assert(!engine.movesFor(board, engine.at(3, 1)).some(m => m.to === engine.at(3, 0)))
    assert(!engine.movesFor(board, engine.at(3, 0)).some(m => m.to === engine.at(3, 1)))
})

test('applyMove moves the piece and captures correctly', () => {
    const board = Array(engine.SIZE).fill(engine.EMPTY)
    board[engine.at(5, 0)] = engine.pieceFor(engine.RED, engine.WOLF)
    board[engine.at(4, 0)] = engine.pieceFor(engine.BLACK, engine.DOG)
    const next = engine.applyMove(board, {from: engine.at(5, 0), to: engine.at(4, 0)})
    assert.equal(next[engine.at(4, 0)], engine.pieceFor(engine.RED, engine.WOLF))
    assert.equal(next[engine.at(5, 0)], engine.EMPTY)
})

test('status detects den entry win', () => {
    const board = Array(engine.SIZE).fill(engine.EMPTY)
    board[engine.at(1, 3)] = engine.pieceFor(engine.RED, engine.WOLF)
    const next = engine.applyMove(board, {from: engine.at(1, 3), to: engine.BLACK_DEN})
    const s = engine.status(next, engine.BLACK)
    assert(s.ended)
    assert.equal(s.winner, engine.RED)
    assert.equal(s.reason, 'den')
})

test('status detects no-pieces loss', () => {
    const board = Array(engine.SIZE).fill(engine.EMPTY)
    board[engine.at(4, 0)] = engine.pieceFor(engine.RED, engine.WOLF)
    const s = engine.status(board, engine.BLACK)
    assert(s.ended)
    assert.equal(s.winner, engine.RED)
})

test('AI search is reproducible, legal, and takes an immediate den entry', () => {
    // Forced den entry
    const board = Array(engine.SIZE).fill(engine.EMPTY)
    board[engine.at(1, 3)] = engine.pieceFor(engine.RED, engine.WOLF)
    const result = ai.search(board, engine.RED, 'easy', {seed: 7, nodeBudget: 5000, maxDepth: 3})
    assert.equal(result.move.to, engine.BLACK_DEN)

    // Reproducibility on initial board
    const init = engine.initialBoard()
    const opts = {seed: 99, nodeBudget: 20_000, maxDepth: 4, rootBand: 60}
    const r1 = ai.search(init, engine.BLACK, 'medium', opts)
    const r2 = ai.search(init, engine.BLACK, 'medium', opts)
    assert.deepEqual(r1.move, r2.move)
    const legal = engine.legalMoves(init, engine.BLACK)
    assert(legal.some(m => m.from === r1.move.from && m.to === r1.move.to))
})
