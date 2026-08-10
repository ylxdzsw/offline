const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')
const ai = require('./worker.js')

const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000 }
const token = (side, type, id = side + type) => ({side, type, id})

test('deployment contains the standard armies and obeys restricted squares', () => {
    const board = engine.initialBoard(seeded(21))
    assert.equal(board.filter(Boolean).length, 50)
    assert.equal(engine.validateSetup(board, engine.RED), true)
    assert.equal(engine.validateSetup(board, engine.BLACK), true)
    assert([...engine.CAMPS].every(index => board[index] === null))
})

test('setup validation rejects pieces outside home and restricted piece positions', () => {
    const initial = engine.initialBoard(seeded(21))
    const invalidAt = (type, target) => {
        const board = structuredClone(initial)
        const source = board.findIndex(piece => piece?.side === engine.RED && piece.type === type)
        ;[board[source], board[target]] = [board[target], board[source]]
        return board
    }
    assert.equal(engine.validateSetup(invalidAt(engine.FLAG, engine.at(6,0)), engine.RED), false)
    assert.equal(engine.validateSetup(invalidAt(engine.MINE, engine.at(6,0)), engine.RED), false)
    assert.equal(engine.validateSetup(invalidAt(engine.BOMB, engine.at(6,0)), engine.RED), false)

    const outsideHome = structuredClone(initial)
    const source = outsideHome.findIndex(piece => piece?.side === engine.RED)
    outsideHome[engine.at(4,1)] = outsideHome[source]
    outsideHome[source] = null
    assert.equal(engine.validateSetup(outsideHome, engine.RED), false)
})

test('railways allow straight travel and engineers can turn around corners', () => {
    const board = Array(60).fill(null)
    board[engine.at(5,2)] = token(engine.RED, '5')
    assert(engine.movesFor(board, engine.at(5,2)).some(move => move.to === engine.at(5,4)))
    assert(!engine.movesFor(board, engine.at(5,2)).some(move => move.to === engine.at(10,4)))
    board[engine.at(5,2)] = token(engine.RED, engine.ENGINEER)
    assert(engine.movesFor(board, engine.at(5,2)).some(move => move.to === engine.at(10,4)))
    board[engine.at(5,2)] = token(engine.RED, '5')
    board[engine.at(5,3)] = token(engine.BLACK, '2')
    assert(!engine.movesFor(board, engine.at(5,2)).some(move => move.to === engine.at(5,4)))

    board.fill(null)
    board[engine.at(5,1)] = token(engine.RED, '5')
    assert(!engine.movesFor(board, engine.at(5,1)).some(move => move.to === engine.at(6,1)))
    board[engine.at(5,1)] = null
    board[engine.at(5,2)] = token(engine.RED, '5')
    assert(engine.movesFor(board, engine.at(5,2)).some(move => move.to === engine.at(6,2)))
})

test('camps protect occupants and combat handles ranks, bombs, mines, and flags', () => {
    const camp = engine.at(7,1), from = engine.at(6,1), board = Array(60).fill(null)
    board[from] = token(engine.RED, '8'); board[camp] = token(engine.BLACK, '2')
    assert(!engine.movesFor(board, from).some(move => move.to === camp))
    board[engine.at(11,1)] = token(engine.RED, '7')
    assert.deepEqual(engine.movesFor(board, engine.at(11,1)), [])
    assert.equal(engine.battle(token(engine.RED,'8'), token(engine.BLACK,'7')), 'attacker')
    assert.equal(engine.battle(token(engine.RED,'2'), token(engine.BLACK,'7')), 'defender')
    assert.equal(engine.battle(token(engine.RED,engine.BOMB), token(engine.BLACK,'9')), 'both')
    assert.equal(engine.battle(token(engine.RED,engine.ENGINEER), token(engine.BLACK,engine.MINE)), 'attacker')
    assert.equal(engine.battle(token(engine.RED,'9'), token(engine.BLACK,engine.MINE)), 'defender')
    assert.equal(engine.battle(token(engine.RED,'2'), token(engine.BLACK,engine.FLAG)), 'attacker')

    board.fill(null)
    board[engine.at(5,2)] = token(engine.RED, '2', 'r2')
    board[engine.at(6,2)] = token(engine.BLACK, '9', 'b9')
    assert.deepEqual(engine.applyMove(board, {from:engine.at(5,2),to:engine.at(6,2)}).revealed, [])

    board[engine.at(5,2)] = token(engine.RED, engine.BOMB, 'rb')
    board[engine.at(0,1)] = token(engine.BLACK, engine.FLAG, 'bf')
    assert.deepEqual(
        engine.applyMove(board, {from:engine.at(5,2),to:engine.at(6,2)}).revealed,
        ['bf'],
    )
})

test('capturing the flag ends the game and AI always chooses a legal move', () => {
    const board = Array(60).fill(null)
    board[engine.at(1,1)] = token(engine.BLACK, engine.FLAG, 'bf')
    board[engine.at(2,1)] = token(engine.RED, '4', 'r4')
    board[engine.at(11,1)] = token(engine.RED, engine.FLAG, 'rf')
    const result = engine.applyMove(board, {from:engine.at(2,1),to:engine.at(1,1)})
    assert.deepEqual(engine.status(result.board, engine.BLACK), {ended:true,winner:engine.RED,reason:'flag'})

    const initial = engine.initialBoard(seeded(9))
    for (const difficulty of ['easy','medium','hard']) {
        const move = ai.choose({board:initial, initialBoard:initial, events:[], side:engine.BLACK, difficulty, revealed:[]})
        assert(engine.legalMoves(initial,engine.BLACK).some(candidate => candidate.from === move.from && candidate.to === move.to))
    }
})
