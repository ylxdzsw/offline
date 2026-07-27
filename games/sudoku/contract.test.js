const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const engine = require('./api.js')

const seeded = seed => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
}

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const dispatchError = (callback, message) => {
    assert.throws(callback, error => {
        assert.equal(error.message, message)
        assert.equal(error.status, 2)
        assert.deepEqual(error.response, {error: {status: 2, message}})
        return true
    })
}

test('generated puzzles are valid, uniquely solvable, and match their solution', () => {
    for (const [offset, difficulty] of ['easy', 'medium', 'hard'].entries()) {
        const result = engine.generate(difficulty, seeded(42 + offset))
        assert(engine.isValid(result.puzzle))
        assert(engine.isValid(result.solution))
        const solutions = engine.solve(result.puzzle, 2)
        assert.equal(solutions.length, 1)
        assert.deepEqual(solutions[0], result.solution)
        assert(result.clues >= engine.CLUES[difficulty])
        assert.equal(result.clues, result.puzzle.filter(Boolean).length)
        assert(Number.isInteger(result.rating) && result.rating > 0)
    }
})

test('candidate, peer, and conflict rules cover rows, columns, and boxes', () => {
    const board = Array(81).fill(0)
    board[0] = 5
    assert.equal(engine.peers(0).length, 20)
    assert(!engine.candidates(board, 1).includes(5))
    assert(!engine.candidates(board, 9).includes(5))
    assert(!engine.candidates(board, 10).includes(5))
    board[8] = 5
    assert.deepEqual(engine.conflicts(board, 0), [8])
    assert.equal(engine.isValid(board), false)

    const byteBoard = Array(81).fill(0)
    byteBoard[1] = 21
    assert(!engine.candidates(byteBoard, 0).includes(5))
})

test('completion requires the exact generated solution', () => {
    const solution = engine.completeBoard(seeded(7))
    assert.equal(engine.isComplete(solution, solution), true)
    const incomplete = solution.slice()
    incomplete[0] = 0
    assert.equal(engine.isComplete(incomplete, solution), false)
    assert.equal(engine.isComplete([], []), false)
    assert.equal(engine.isComplete(Array(81).fill(1), Array(81).fill(1)), false)
})

test('generation is deterministic and keeps the xorshift zero-seed rule', () => {
    assert.deepEqual(engine.completeBoard(0), engine.completeBoard(1))
    assert.notDeepEqual(engine.completeBoard(1), engine.completeBoard(2))
    assert.equal(digest(engine.completeBoard(42)), '8d78f5be90481ac387d97316f21c96a716b48eb311afccaab0f51ad1accca111')
    assert.deepEqual(
        ['easy', 'medium', 'hard'].map(difficulty => digest(engine.generate(difficulty, 42))),
        [
            '72b82aa8d4250f3f8f4656190287321b69d41201f2e8020ff2125f2d090aaea7',
            '427dfdca41648c480d1fb30bf9b3973776fde996460d3ce6b840c49fe12c382d',
            '2391555cd6f556ce2756fa4066b2f9b2fa7cffa00f9b04a6c61c450a45ae5b24',
        ],
    )
})

test('solve limits and input validation match the public contract', () => {
    const generated = engine.generate('medium', 91)
    assert.deepEqual(engine.solve(generated.puzzle, 0), [])
    assert.equal(engine.solve(Array(81).fill(0), 2).length, 2)
    assert.equal(engine.isValid(Array(80).fill(0)), false)
    assert.deepEqual(engine.solve(Array(80).fill(0)), [])
    assert.throws(() => engine.candidates(Array(80).fill(0), 0), /board must have 81 cells/)
    assert.throws(() => engine.peers(-1), /non-negative 32-bit integer/)
    assert.throws(() => engine.generate('expert', 1), /unknown difficulty/)
    assert.throws(() => engine.isValid(Array(81).fill(1.5)), /unsigned bytes/)
    dispatchError(
        () => engine.solve(generated.solution, 0x100000000),
        'limit must be a non-negative 32-bit integer',
    )
})

test('malformed arrays and difficulty names retain status-bearing errors', () => {
    for (const operation of [
        () => engine.isValid(Array(81)),
        () => engine.solve(Array(81)),
        () => engine.isComplete(Array(81), Array(81)),
    ]) {
        dispatchError(operation, 'board must contain unsigned bytes')
    }
    dispatchError(() => engine.generate('toString', 1), 'unknown difficulty')
})

test('exported constants cannot mutate deterministic engine behavior', () => {
    const expected = digest(engine.generate('medium', 42))
    assert.equal(Reflect.set(engine.CLUES, 'expert', 25), false)
    assert.throws(() => engine.DIGITS.reverse(), TypeError)
    assert.equal(digest(engine.generate('medium', 42)), expected)
    dispatchError(() => engine.generate('expert', 42), 'unknown difficulty')
})
