const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')

test('public constants describe the three puzzle sizes', () => {
    assert.deepEqual(engine.DIFFICULTIES, ['easy', 'medium', 'hard'])
    assert.deepEqual(engine.SIZES, {easy: 5, medium: 10, hard: 15})
    assert.deepEqual(engine.MARKS, {empty: 0, filled: 1, crossed: 2})
    assert.equal(Object.isFrozen(engine.DIFFICULTIES), true)
    assert.deepEqual(engine.ping(), {abi: 1, game: 'nonogram'})
})

test('seeded puzzles are deterministic and their clues reproduce the solution', () => {
    for (const difficulty of engine.DIFFICULTIES) {
        const seen = new Set()
        for (let seed = 0; seed < 4; seed++) {
            const puzzle = engine.newGame(difficulty, seed)
            assert.equal(puzzle.size, engine.SIZES[difficulty])
            assert.equal(puzzle.solution.length, puzzle.size * puzzle.size)
            assert.deepEqual(
                engine.cluesFromSolution(puzzle.solution, puzzle.size),
                {rowClues: puzzle.rowClues, columnClues: puzzle.columnClues},
            )
            assert.deepEqual(engine.newGame(difficulty, seed), puzzle)
            seen.add(puzzle.solution.join(''))
        }
        assert.equal(seen.size, 4)
    }
})

test('every included puzzle has exactly one solution', () => {
    for (const difficulty of engine.DIFFICULTIES) {
        for (let seed = 0; seed < 4; seed++) {
            const puzzle = engine.newGame(difficulty, seed)
            assert.equal(
                engine.solutionCount(puzzle.rowClues, puzzle.columnClues),
                1,
                `${difficulty} puzzle ${seed}`,
            )
        }
    }
})

test('marking toggles cells without mutating the input and recognizes completion', () => {
    const puzzle = engine.newGame('easy', 0)
    const original = Array(puzzle.size * puzzle.size).fill(engine.MARKS.empty)
    const target = puzzle.solution.indexOf(1)
    const filled = engine.apply(original, puzzle.solution, puzzle.size, target, engine.MARKS.filled)
    assert.equal(filled.previous, engine.MARKS.empty)
    assert.equal(filled.mark, engine.MARKS.filled)
    assert.equal(original[target], engine.MARKS.empty)

    const cleared = engine.apply(filled.cells, puzzle.solution, puzzle.size, target, engine.MARKS.filled)
    assert.equal(cleared.mark, engine.MARKS.empty)

    let cells = puzzle.solution.map(value => value ? engine.MARKS.filled : engine.MARKS.crossed)
    assert.equal(engine.isSolved(cells, puzzle.solution, puzzle.size), true)
    cells = engine.apply(cells, puzzle.solution, puzzle.size, target, engine.MARKS.filled).cells
    assert.equal(engine.isSolved(cells, puzzle.solution, puzzle.size), false)
})

test('line completion reacts as soon as the filled pattern matches the clues', () => {
    const puzzle = engine.newGame('easy', 0)
    const cells = puzzle.solution.map(value => value ? engine.MARKS.filled : engine.MARKS.empty)
    assert.equal(engine.lineComplete(cells, 5, 'row', 0, puzzle.rowClues[0]), true)
    assert.equal(engine.lineComplete(cells, 5, 'column', 0, puzzle.columnClues[0]), true)
    cells[0] = engine.MARKS.filled
    assert.equal(engine.lineComplete(cells, 5, 'row', 0, puzzle.rowClues[0]), false)
})

test('malformed requests carry status-bearing errors', () => {
    const puzzle = engine.newGame('easy', 0)
    assert.equal(engine.validateCells(Array(25).fill(0), 5), true)
    assert.equal(engine.validateCells(Array(24).fill(0), 5), false)
    assert.throws(
        () => engine.newGame('expert', 0),
        error => error.message === 'difficulty must be easy, medium, or hard'
            && error.status === 2
            && error.response.error.status === 2,
    )
    assert.throws(
        () => engine.apply(Array(25).fill(0), puzzle.solution, 5, 25, 1),
        /index must be an integer between 0 and 24/,
    )
    assert.throws(
        () => engine.apply(Array(25).fill(0), puzzle.solution, 5, 0, 3),
        /mark must be filled or crossed/,
    )
})
