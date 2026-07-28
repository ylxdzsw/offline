const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')

test('public constants and identity describe every supported board size', () => {
    assert.deepEqual(engine.SIZES, [3, 4, 5])
    assert.deepEqual(engine.DIRECTIONS, ['up', 'down', 'left', 'right'])
    assert.equal(Object.isFrozen(engine.SIZES), true)
    assert.equal(Object.isFrozen(engine.DIRECTIONS), true)
    assert.deepEqual(engine.ping(), {abi: 1, game: 'sliding'})
})

test('seeded boards are deterministic, non-trivial, and solvable at every size', () => {
    for (const size of engine.SIZES) {
        for (let seed = 0; seed < 64; seed++) {
            const board = engine.newGame(size, seed)
            assert.equal(board.length, size * size)
            assert.deepEqual([...board].sort((left, right) => left - right), Array.from({length: size * size}, (_, index) => index))
            assert.equal(engine.isSolvable(board, size), true)
            assert.equal(engine.isSolved(board, size), false)
            assert.deepEqual(engine.newGame(size, seed), board)
        }
    }
    assert.notDeepEqual(engine.newGame(4, 1), engine.newGame(4, 2))
})

test('solvability parity handles odd and even boards', () => {
    for (const size of engine.SIZES) {
        const solved = Array.from({length: size * size}, (_, index) => (index + 1) % (size * size))
        const impossible = solved.slice()
        ;[impossible[0], impossible[1]] = [impossible[1], impossible[0]]
        assert.equal(engine.isSolvable(solved, size), true)
        assert.equal(engine.isSolvable(impossible, size), false)
        assert.equal(engine.validate(impossible, size), false)
    }
})

test('only a numbered tile beside the blank can move', () => {
    const solved = [1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,0]
    const original = solved.slice()
    const blocked = engine.move(solved, 4, 0)
    assert.equal(blocked.moved, false)
    assert.deepEqual(blocked.board, original)
    assert.deepEqual(solved, original)

    const moved = engine.move(solved, 4, 14)
    assert.deepEqual(moved, {
        board: [1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,0,15],
        blank: 14,
        from: 14,
        moved: true,
        solved: false,
        tile: 15,
        to: 15,
    })
    assert.deepEqual(engine.legalTiles(moved.board, 4), [10, 13, 15])

    const restored = engine.moveBlank(moved.board, 4, 'right')
    assert.equal(restored.moved, true)
    assert.equal(restored.solved, true)
    assert.deepEqual(restored.board, solved)
})

test('blank movement respects board edges and direction names', () => {
    const board = [1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,0,15]
    assert.equal(engine.moveBlank(board, 4, 'down').moved, false)
    assert.equal(engine.moveBlank(board, 4, 'left').tile, 14)
    assert.equal(engine.moveBlank(board, 4, 'up').tile, 11)
    assert.throws(() => engine.moveBlank(board, 4, 'north'), /direction must be/)
})

test('malformed requests carry status-bearing errors', () => {
    const cases = [
        [() => engine.newGame(2, 1), 'size must be 3, 4, or 5'],
        [() => engine.newGame(4, -1), 'seed must be an integer between 0 and 4294967295'],
        [() => engine.isSolvable([1, 2], 3), 'board must contain 9 cells'],
        [() => engine.isSolvable([1,2,3,4,5,6,7,8,8], 3), 'board must contain each tile exactly once'],
        [() => engine.move([1,2,3,4,5,6,7,8,0], 3, 9), 'index must be an integer between 0 and 8'],
        [() => engine.move([2,1,3,4,5,6,7,8,0], 3, 7), 'board must be solvable'],
    ]
    for (const [operation, message] of cases) {
        assert.throws(operation, error => {
            assert.equal(error.message, message)
            assert.equal(error.status, 2)
            assert.deepEqual(error.response, {error: {status: 2, message}})
            return true
        })
    }
    assert.equal(engine.validate(null, 4), false)
})
