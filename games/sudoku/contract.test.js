const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')

const seeded = seed => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
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
})

test('completion requires the exact generated solution', () => {
    const solution = engine.completeBoard(seeded(7))
    assert.equal(engine.isComplete(solution, solution), true)
    const incomplete = solution.slice(); incomplete[0] = 0
    assert.equal(engine.isComplete(incomplete, solution), false)
})
