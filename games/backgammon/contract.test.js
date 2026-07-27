const test = require('node:test')
const assert = require('node:assert/strict')

const engine = require('./api.js')
const ai = require('./worker.js')

const race = (human, computer) => {
    const position = {board: Array(24).fill(0), bar: [0, 0], off: [15, 15]}
    for (const [index, count] of human) {
        position.board[index] += count
        position.off[engine.HUMAN] -= count
    }
    for (const [index, count] of computer) {
        position.board[index] -= count
        position.off[engine.AI] -= count
    }
    return position
}

test('the standard opening is symmetric and uses both dice', () => {
    const position = engine.initialPosition()
    assert.deepEqual(position.bar, [0, 0])
    assert.deepEqual(position.off, [0, 0])
    assert.equal(position.board.filter(value => value > 0).reduce((sum, value) => sum + value, 0), 15)
    assert.equal(position.board.filter(value => value < 0).reduce((sum, value) => sum - value, 0), 15)
    const turns = engine.legalTurns(position, engine.HUMAN, [3, 1])
    assert.equal(turns.length, 31)
    assert(turns.every(turn => turn.steps.length === 2))
    const applied = engine.applyTurn(position, engine.HUMAN, [3, 1], turns[0].steps)
    assert.deepEqual(applied.position, turns[0].position)
    assert.throws(() => engine.applyTurn(position, engine.HUMAN, [3, 1], turns[0].steps.slice(0, 1)), /incomplete turn/)
})

test('maximum dice use, the higher die, and all four doubles are compulsory', () => {
    const two = race([[0, 2]], [])
    assert(engine.legalTurns(two, engine.HUMAN, [1, 2]).every(turn => turn.steps.length === 2))

    const one = race([[3, 1]], [])
    const higher = engine.legalTurns(one, engine.HUMAN, [5, 6])
    assert(higher.every(turn => turn.steps.length === 1 && turn.steps[0].die === 6))

    const openingDoubles = engine.legalTurns(engine.initialPosition(), engine.HUMAN, [6, 6])
    assert(openingDoubles.every(turn => turn.steps.length === 4))
})

test('bar checkers enter first and a blot is hit onto the opponent bar', () => {
    const position = race([[23, 14]], [[22, 1]])
    position.board[23]--
    position.bar[engine.HUMAN] = 1
    const turns = engine.legalTurns(position, engine.HUMAN, [2, 1])
    assert(turns.length > 0)
    assert(turns.every(turn => turn.steps[0].from === engine.BAR))
    const hit = turns.find(turn => turn.steps[0].to === 22)
    assert(hit)
    assert.equal(hit.steps[0].hit, true)
    assert.equal(hit.position.bar[engine.AI], 1)
})

test('bearing off rejects an overshoot while a farther checker remains', () => {
    const position = race([[2, 1], [5, 1]], [])
    const turns = engine.legalTurns(position, engine.HUMAN, [6, 1])
    assert(turns.every(turn => !turn.steps.some(step =>
        step.from === 2 && step.to === engine.OFF && step.die === 6)))
})

test('regular wins, gammons, and backgammons carry one, two, and three points', () => {
    const regular = race([], [[6, 14]])
    assert.deepEqual(engine.outcome(regular), {winner: engine.HUMAN, kind: 'regular', multiplier: 1})

    const gammon = race([], [[6, 15]])
    assert.deepEqual(engine.outcome(gammon), {winner: engine.HUMAN, kind: 'gammon', multiplier: 2})

    const backgammon = race([], [[3, 15]])
    assert.deepEqual(engine.outcome(backgammon), {winner: engine.HUMAN, kind: 'backgammon', multiplier: 3})
})

test('expectiminimax is deterministic, legal, and evaluates chance rolls', () => {
    const position = engine.initialPosition()
    const options = {seed: 23, nodeBudget: 12000, maxDepth: 2, branchLimit: 3, rootBand: 180}
    const first = ai.search(position, engine.AI, [3, 1], 'easy', options)
    const repeated = ai.search(position, engine.AI, [3, 1], 'easy', options)
    assert(engine.sameTurn(first.turn, repeated.turn))
    assert(engine.legalTurns(position, engine.AI, [3, 1]).some(turn => engine.sameTurn(turn, first.turn)))
    assert.equal(first.depth, 2)
    assert(first.chanceNodes > 0)
})

test('malformed positions and dice fail at the ABI boundary', () => {
    const position = engine.initialPosition()
    assert.throws(() => engine.legalTurns({...position, board: [1]}, engine.HUMAN, [1, 2]), /invalid position/)
    assert.throws(() => engine.legalTurns(position, engine.HUMAN, [0, 7]), /between 1 and 6/)
    assert.throws(() => engine.legalTurns(position, 9, [1, 2]), /not a valid side/)
})
