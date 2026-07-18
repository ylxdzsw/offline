const test = require('node:test')
const assert = require('node:assert/strict')

const engine = require('../../src/xiangqi/engine.js')
require('../../src/xiangqi/ai.js')
const ai = globalThis.OfflineGames.XiangqiAI

const emptyBoard = () => Array(engine.ROWS * engine.COLS).fill(null)

test('initial position has the standard 44 legal Red moves', () => {
    const board = engine.initialBoard()
    assert.equal(engine.legalMoves(board, engine.RED).length, 44)
    assert.deepEqual(engine.status(board, engine.RED), {ended: false, winner: null, reason: 'playing'})
})

test('horse leg, elephant eye, river, cannon screen, and pawn crossing rules are enforced', () => {
    const board = emptyBoard()
    board[engine.at(9, 4)] = 'rK'
    board[engine.at(0, 3)] = 'bK'
    board[engine.at(7, 4)] = 'rH'
    board[engine.at(6, 4)] = 'rP'
    const horseTargets = engine.pseudoMovesFor(board, engine.at(7, 4)).map(move => move.to)
    assert(!horseTargets.includes(engine.at(5, 3)))
    assert(!horseTargets.includes(engine.at(5, 5)))

    board[engine.at(9, 2)] = 'rE'
    board[engine.at(8, 3)] = 'rP'
    assert(!engine.pseudoMovesFor(board, engine.at(9, 2)).some(move => move.to === engine.at(7, 4)))

    board[engine.at(5, 2)] = 'rE'
    board[engine.at(8, 3)] = null
    assert(engine.pseudoMovesFor(board, engine.at(5, 2)).every(move => engine.rowOf(move.to) >= 5))

    const cannon = emptyBoard()
    cannon[engine.at(9, 4)] = 'rK'
    cannon[engine.at(0, 3)] = 'bK'
    cannon[engine.at(7, 1)] = 'rC'
    cannon[engine.at(5, 1)] = 'rP'
    cannon[engine.at(2, 1)] = 'bH'
    assert(engine.pseudoMovesFor(cannon, engine.at(7, 1)).some(move => move.to === engine.at(2, 1) && move.captured === 'bH'))

    const pawn = emptyBoard()
    pawn[engine.at(9, 4)] = 'rK'
    pawn[engine.at(0, 3)] = 'bK'
    pawn[engine.at(6, 0)] = 'rP'
    assert.deepEqual(engine.pseudoMovesFor(pawn, engine.at(6, 0)).map(move => move.to), [engine.at(5, 0)])
    pawn[engine.at(4, 0)] = 'rP'
    assert(engine.pseudoMovesFor(pawn, engine.at(4, 0)).some(move => move.to === engine.at(4, 1)))
})

test('flying generals and self-check are rejected', () => {
    const board = emptyBoard()
    board[engine.at(9, 4)] = 'rK'
    board[engine.at(0, 4)] = 'bK'
    assert.equal(engine.isInCheck(board, engine.RED), true)
    assert.equal(engine.isInCheck(board, engine.BLACK), true)

    board[engine.at(5, 4)] = 'rR'
    const sideways = engine.legalMoves(board, engine.RED).find(move => move.from === engine.at(5, 4) && move.to === engine.at(5, 3))
    assert.equal(sideways, undefined)
})

test('checkmate, stalemate-as-loss, and threefold draw are distinguished', () => {
    const mate = emptyBoard()
    mate[engine.at(0, 4)] = 'bK'
    mate[engine.at(9, 4)] = 'rK'
    mate[engine.at(1, 3)] = 'rR'
    mate[engine.at(1, 4)] = 'rR'
    mate[engine.at(1, 5)] = 'rR'
    assert.deepEqual(engine.status(mate, engine.BLACK), {ended: true, winner: engine.RED, reason: 'checkmate'})

    const stalemate = emptyBoard()
    stalemate[engine.at(0, 4)] = 'bK'
    stalemate[engine.at(9, 4)] = 'rK'
    stalemate[engine.at(1, 3)] = 'rR'
    stalemate[engine.at(1, 5)] = 'rR'
    stalemate[engine.at(5, 4)] = 'rP'
    assert.deepEqual(engine.status(stalemate, engine.BLACK), {ended: true, winner: engine.RED, reason: 'stalemate'})

    const board = engine.initialBoard()
    const key = engine.positionKey(board, engine.RED)
    assert.deepEqual(engine.status(board, engine.RED, {[key]: 3}), {ended: true, winner: null, reason: 'repetition'})
})

test('undo restores a captured piece exactly', () => {
    const board = engine.initialBoard()
    const move = engine.legalMoves(board, engine.RED).find(candidate => candidate.from === engine.at(6, 0) && candidate.to === engine.at(5, 0))
    assert.deepEqual(engine.undoMove(engine.applyMove(board, move), move), board)
})

test('easy AI returns a legal move within a mobile-friendly bound', () => {
    const board = engine.initialBoard()
    const started = Date.now()
    const result = ai.search(board, engine.BLACK, 'easy')
    const legal = engine.legalMoves(board, engine.BLACK)
    assert(legal.some(move => move.from === result.move.from && move.to === result.move.to))
    assert(Date.now() - started < 1200)
})

test('seeded variation is reproducible, bounded, and forced king capture is invariant', () => {
    const board = engine.initialBoard(), options = {nodeBudget:1200,maxDepth:1,rootBand:120}
    const repeated = ai.search(board,engine.BLACK,'easy',{...options,seed:7})
    assert.deepEqual(ai.search(board,engine.BLACK,'easy',{...options,seed:7}).move,repeated.move)
    const choices = new Set([...Array(12).keys()].map(seed => {
        const result = ai.search(board,engine.BLACK,'easy',{...options,seed})
        assert(result.score-result.selectedScore<=options.rootBand)
        return `${result.move.from}-${result.move.to}`
    }))
    assert(choices.size>1)

    const forced = emptyBoard(); forced[engine.at(9,4)]='rK'; forced[engine.at(0,4)]='bK'
    const moves = [1,2,99].map(seed=>ai.search(forced,engine.RED,'easy',{nodeBudget:1000,maxDepth:2,rootBand:500,seed}).move)
    assert.deepEqual(moves,[moves[0],moves[0],moves[0]])
    assert.deepEqual(moves[0],{from:engine.at(9,4),to:engine.at(0,4),piece:'rK',captured:'bK'})
})
