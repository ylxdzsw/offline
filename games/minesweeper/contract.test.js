const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')

const mines = board => board.cells
    .map((cell, index) => cell === engine.MINE ? index : -1)
    .filter(index => index >= 0)

test('difficulty presets use classic dimensions and mine counts', () => {
    assert.deepEqual(engine.config('easy'), {width: 9, height: 9, mineCount: 10})
    assert.deepEqual(engine.config('medium'), {width: 16, height: 16, mineCount: 40})
    assert.deepEqual(engine.config('hard'), {width: 16, height: 30, mineCount: 99})
})

test('first reveal deterministically creates a safe opening area', () => {
    const fresh = engine.newGame('medium', 42)
    assert.equal(fresh.started, false)
    assert.deepEqual(fresh.cells, [])
    const first = engine.reveal(fresh, 119).board
    const repeated = engine.reveal(engine.newGame('medium', 42), 119).board
    assert.deepEqual(first, repeated)
    assert.equal(first.cells[119], 0)
    assert.equal(mines(first).length, 40)
    assert.equal(engine.validate(first), true)
    assert(first.revealed.filter(Boolean).length >= 9)
})

test('flags toggle without starting the minefield and block reveal', () => {
    const fresh = engine.newGame('easy', 7)
    const flagged = engine.toggleFlag(fresh, 0).board
    assert.equal(flagged.flagged[0], true)
    assert.equal(flagged.started, false)
    assert.equal(engine.reveal(flagged, 0).changed.length, 0)
    const unflagged = engine.toggleFlag(flagged, 0).board
    assert.equal(unflagged.flagged[0], false)
    assert(engine.reveal(unflagged, 0).changed.length > 0)
})

test('revealing a mine loses immediately and cannot be reversed', () => {
    const started = engine.reveal(engine.newGame('easy', 99), 40).board
    const mine = mines(started)[0]
    const lost = engine.reveal(started, mine).board
    assert.equal(lost.outcome, 'lost')
    assert.equal(lost.exploded, mine)
    assert.equal(lost.revealed[mine], true)
    assert.equal(engine.toggleFlag(lost, mine).changed.length, 0)
})

test('chording requires the displayed number of adjacent flags', () => {
    const board = engine.reveal(engine.newGame('easy', 17), 40).board
    const numbered = board.cells.findIndex((cell, index) => board.revealed[index] && cell > 0)
    const result = engine.chord(board, numbered)
    assert.equal(result.flagMismatch, true)
    assert.deepEqual(result.changed, [])
})
