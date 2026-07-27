const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')

test('curated layouts are valid, distinct, and ordered by solution depth', () => {
    const layouts = engine.layouts()
    assert.deepEqual(layouts.map(layout => layout.id), ['easy', 'medium', 'hard'])
    assert(layouts.every(layout => engine.validate(layout.positions)))
    assert.equal(new Set(layouts.map(layout => layout.positions.join(','))).size, 3)
    assert.equal(engine.hint(layouts[0].positions).distance, 64)
    assert.equal(engine.hint(layouts[1].positions).distance, 68)
    assert.equal(engine.hint(layouts[2].positions).distance, 90)
})

test('legal slides apply without mutating the input position', () => {
    const positions = engine.layout('hard').positions
    const before = positions.slice()
    const moves = engine.legalMoves(positions, 8)
    assert(moves.some(move => move.from === 16 && move.to === 18))
    const next = engine.applyMove(positions, 8, 18)
    assert.deepEqual(positions, before)
    assert.equal(next[8], 18)
    assert(engine.validate(next))
})

test('following optimal hints solves the easy layout', () => {
    let positions = engine.layout('easy').positions
    let steps = 0
    while (!engine.isSolved(positions) && steps < 100) {
        const result = engine.hint(positions)
        assert(result.move)
        assert(engine.rowOf(result.move.from) === engine.rowOf(result.move.to)
            || engine.columnOf(result.move.from) === engine.columnOf(result.move.to))
        const piece = positions.indexOf(result.move.from)
        assert.notEqual(piece, -1)
        positions = engine.applyMove(positions, piece, result.move.to)
        steps++
    }
    assert.equal(steps, 64)
    assert(engine.isSolved(positions))
})

test('overlaps, unknown layouts, and illegal slides are rejected', () => {
    const positions = engine.layout('hard').positions
    const overlapping = positions.slice()
    overlapping[9] = overlapping[8]
    assert.equal(engine.validate(overlapping), false)
    assert.throws(() => engine.layout('missing'), /unknown layout/)
    assert.throws(() => engine.applyMove(positions, 0, engine.GOAL), /illegal slide/)
})
