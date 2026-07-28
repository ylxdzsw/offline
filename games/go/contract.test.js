const test = require('node:test')
const assert = require('node:assert/strict')

const engine = require('./api.js')
require('./worker.js')
const ai = globalThis.OfflineGames.GoAI

const play = (moves, index) => [...moves, {kind: 'play', index}]
const pass = moves => [...moves, {kind: 'pass'}]

test('defaults to a 13x13 Chinese-rules game', () => {
    assert.equal(engine.DEFAULT_SIZE, 13)
    assert.deepEqual(engine.SIZES, [9, 13, 19])
    const state = engine.state()
    assert.equal(state.size, 13)
    assert.equal(state.board.length, 169)
    assert.ok(state.board.every(value => value === engine.EMPTY))
    assert.equal(state.turn, engine.BLACK)
    assert.equal(state.score.black, 0)
    assert.equal(state.score.white, engine.KOMI)
    assert.equal(state.legal.length, 169)
})

test('captures stones and rejects suicide', () => {
    const size = 9
    let moves = []
    moves = play(moves, engine.at(0, 1, size))
    moves = play(moves, engine.at(1, 1, size))
    moves = play(moves, engine.at(1, 0, size))
    moves = pass(moves)
    moves = play(moves, engine.at(1, 2, size))
    moves = pass(moves)
    const capture = engine.at(2, 1, size)
    const next = engine.play(size, moves, capture)
    moves = play(moves, capture)

    assert.equal(next.board[engine.at(1, 1, size)], engine.EMPTY)
    assert.equal(next.captures.black, 1)
    assert.deepEqual(engine.checkMove(size, moves, engine.at(1, 1, size)), {
        legal: false,
        reason: 'suicide',
    })
})

test('enforces ko and allows play elsewhere', () => {
    const size = 19
    const sequence = [[0, 3], [0, 2], [1, 4], [2, 2], [2, 3], [1, 1], [1, 2], [1, 3]]
    const moves = sequence.reduce((history, [row, column]) =>
        play(history, engine.at(row, column, size)), [])
    assert.deepEqual(engine.checkMove(size, moves, engine.at(1, 2, size)), {
        legal: false,
        reason: 'ko',
    })
    assert.equal(engine.checkMove(size, moves, engine.at(8, 8, size)).legal, true)
})

test('two passes end the game under area scoring', () => {
    const state = engine.state(9, pass(pass([])))
    assert.equal(state.outcome.ended, true)
    assert.equal(state.outcome.reason, 'passes')
    assert.equal(state.outcome.winner, engine.WHITE)
    assert.equal(state.outcome.margin, 7.5)
})

test('search returns standard, legal, deterministic openings', () => {
    const first = ai.search(13, [{kind: 'play', index: 84}], 'medium', 23)
    const second = ai.search(13, [{kind: 'play', index: 84}], 'medium', 23)
    const legal = engine.state(13, [{kind: 'play', index: 84}]).legal
    assert.equal(first.move, second.move)
    assert.ok([42, 48, 120, 126].includes(first.move))
    assert.ok(legal.includes(first.move))
})

test('search evaluates a legal non-opening reply', () => {
    const size = 9
    const moves = [
        {kind: 'play', index: engine.at(4, 4, size)},
        {kind: 'play', index: engine.at(2, 2, size)},
        {kind: 'play', index: engine.at(6, 6, size)},
    ]
    const result = ai.search(size, moves, 'easy', 91)
    assert.ok(result.simulations > 0)
    assert.ok(result.nodes > 0)
    assert.ok(engine.state(size, moves).legal.includes(result.move))
})

test('invalid sizes, records, and post-game moves are rejected', () => {
    assert.throws(() => engine.state(10, []), /size/)
    assert.throws(() => engine.state(9, [{kind: 'play', index: 81}]), /outside/)
    assert.throws(() => engine.state(9, pass(pass([{kind: 'pass'}]))), /end/)
})
