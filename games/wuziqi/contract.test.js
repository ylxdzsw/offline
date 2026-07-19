const test = require('node:test')
const assert = require('node:assert/strict')

const engine = require('./api.js')
require('./worker.js')
const ai = globalThis.OfflineGames.WuziqiAI

test('five or more stones wins in every direction, including at edges', () => {
    for (const [startRow, startColumn, dr, dc] of [[0, 0, 0, 1], [0, 14, 1, 0], [0, 0, 1, 1], [0, 14, 1, -1]]) {
        let board = engine.initialBoard()
        let last
        for (let step = 0; step < 6; step++) {
            last = engine.at(startRow + dr * step, startColumn + dc * step)
            board = engine.applyMove(board, last, engine.BLACK)
        }
        assert.equal(engine.isWin(board, last, engine.BLACK), true)
        assert.equal(engine.status(board, last).winner, engine.BLACK)
    }
})

test('four stones do not win and occupied intersections are rejected', () => {
    let board = engine.initialBoard()
    for (let column = 0; column < 4; column++) board = engine.applyMove(board, engine.at(7, column), engine.BLACK)
    assert.equal(engine.isWin(board, engine.at(7, 3), engine.BLACK), false)
    assert.throws(() => engine.applyMove(board, engine.at(7, 3), engine.WHITE), /occupied/)
})

test('a full board without a five is a draw', () => {
    const drawBoard = Array.from({length: 225}, (_, index) => {
        const row = Math.floor(index / 15)
        const column = index % 15
        return (row + column * 2) % 4 < 2 ? engine.BLACK : engine.WHITE
    })
    assert.equal(engine.winner(drawBoard), null)
    assert.deepEqual(engine.status(drawBoard), {ended: true, winner: null, reason: 'full'})
})

test('AI takes an immediate win and blocks an immediate loss', () => {
    let winning = engine.initialBoard()
    for (let column = 4; column < 8; column++) winning = engine.applyMove(winning, engine.at(7, column), engine.WHITE)
    assert([engine.at(7, 3), engine.at(7, 8)].includes(ai.search(winning, engine.WHITE, 'easy').move))

    let blocking = engine.initialBoard()
    for (let row = 3; row < 7; row++) blocking = engine.applyMove(blocking, engine.at(row, 5), engine.BLACK)
    const block = ai.search(blocking, engine.WHITE, 'easy').move
    assert([engine.at(2, 5), engine.at(7, 5)].includes(block))
})

test('easy AI returns a legal nearby move within a mobile-friendly bound', () => {
    let board = engine.initialBoard()
    board = engine.applyMove(board, engine.at(7, 7), engine.BLACK)
    const started = Date.now()
    const result = ai.search(board, engine.WHITE, 'easy')
    assert.equal(board[result.move], engine.EMPTY)
    assert(Date.now() - started < 1200)
})
