const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')

const mines = board => board.cells
    .map((cell, index) => cell === engine.MINE ? index : -1)
    .filter(index => index >= 0)

const neighbours = (board, index) => {
    const row = Math.floor(index / board.width), column = index % board.width
    const nearby = []
    for (let nearRow = Math.max(0, row - 1); nearRow <= Math.min(board.height - 1, row + 1); nearRow++) {
        for (let nearColumn = Math.max(0, column - 1);
            nearColumn <= Math.min(board.width - 1, column + 1);
            nearColumn++) {
            const near = nearRow * board.width + nearColumn
            if (near !== index) nearby.push(near)
        }
    }
    return nearby
}

test('reports the same public ABI identity without a Wasm runtime', () => {
    assert.deepEqual(engine.ping(), {abi: 1, game: 'minesweeper'})
})

test('difficulty presets use classic dimensions and mine counts', () => {
    assert.deepEqual(engine.config('easy'), {width: 9, height: 9, mineCount: 10})
    assert.deepEqual(engine.config('medium'), {width: 16, height: 16, mineCount: 40})
    assert.deepEqual(engine.config('hard'), {width: 16, height: 30, mineCount: 99})
})

test('first reveal preserves the seeded u64 layout and reveal order', () => {
    const corner = engine.reveal(engine.newGame('easy', 0), 80)
    assert.deepEqual(mines(corner.board), [3, 4, 27, 35, 38, 56, 61, 68, 69, 75])
    assert.deepEqual(corner.changed, [80, 70, 71, 79])

    const unsafeSeed = engine.reveal(
        engine.newGame('easy', 1000000000000000100),
        40,
    ).board
    assert.deepEqual(mines(unsafeSeed), [8, 10, 17, 24, 54, 58, 60, 61, 62, 69])

    const fresh = engine.newGame('medium', 42)
    const untouched = structuredClone(fresh)
    assert.equal(fresh.started, false)
    assert.deepEqual(fresh.cells, [])
    const first = engine.reveal(fresh, 119).board
    const repeated = engine.reveal(engine.newGame('medium', 42), 119).board
    assert.deepEqual(fresh, untouched)
    assert.deepEqual(first, repeated)
    assert.equal(first.cells[119], 0)
    assert(neighbours(first, 119).every(index => first.cells[index] !== engine.MINE))
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

test('revealing every safe cell wins and marks all mines', () => {
    let board = engine.reveal(engine.newGame('easy', 314), 40).board
    for (let index = 0; index < board.cells.length; index++) {
        if (board.cells[index] !== engine.MINE && !board.revealed[index]) {
            board = engine.reveal(board, index).board
        }
    }
    assert.equal(board.outcome, 'won')
    assert.equal(board.flagged.filter(Boolean).length, board.mineCount)
    assert.equal(engine.validate(board), true)
})

test('chording requires the displayed number of adjacent flags', () => {
    const board = engine.reveal(engine.newGame('easy', 17), 40).board
    const numbered = board.cells.findIndex((cell, index) => board.revealed[index] && cell > 0)
    const result = engine.chord(board, numbered)
    assert.equal(result.flagMismatch, true)
    assert.deepEqual(result.changed, [])
})

test('correct chording opens neighbours and wrong flags can explode', () => {
    let board = engine.reveal(engine.newGame('easy', 123), 40).board
    const numbered = board.cells.findIndex((cell, index) =>
        board.revealed[index]
        && cell > 0
        && neighbours(board, index).some(near =>
            !board.revealed[near] && board.cells[near] !== engine.MINE))
    for (const mine of neighbours(board, numbered).filter(near => board.cells[near] === engine.MINE)) {
        board = engine.toggleFlag(board, mine).board
    }
    const before = board.revealed.filter(Boolean).length
    const chorded = engine.chord(board, numbered)
    assert.equal(chorded.flagMismatch, false)
    assert(chorded.board.revealed.filter(Boolean).length > before)

    let wrong = engine.reveal(engine.newGame('easy', 456), 40).board
    const target = wrong.cells.findIndex((cell, index) =>
        wrong.revealed[index]
        && cell > 0
        && neighbours(wrong, index).filter(near =>
            !wrong.revealed[near] && wrong.cells[near] !== engine.MINE).length >= cell)
    const falseFlags = neighbours(wrong, target)
        .filter(near => !wrong.revealed[near] && wrong.cells[near] !== engine.MINE)
        .slice(0, wrong.cells[target])
    for (const index of falseFlags) wrong = engine.toggleFlag(wrong, index).board
    assert.equal(engine.chord(wrong, target).board.outcome, 'lost')
})

test('validation and action errors preserve the existing contract', () => {
    const fresh = engine.newGame('easy', 1)
    assert.equal(engine.validate({...fresh, width: 10}), false)
    assert.equal(engine.validate({...fresh, difficulty: 'unknown'}), false)
    assert.throws(
        () => engine.config('unknown'),
        error => error.message === 'unknown difficulty "unknown"'
            && error.status === 2
            && error.response.error.status === 2,
    )
    assert.throws(
        () => engine.reveal(fresh, 81),
        error => error.message === 'cell index is out of range' && error.status === 2,
    )
    assert.throws(
        () => engine.validate({}),
        error => error.message === 'missing field `difficulty`' && error.status === 2,
    )
})
