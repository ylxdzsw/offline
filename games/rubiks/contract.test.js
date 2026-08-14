const test = require('node:test')
const assert = require('node:assert/strict')
const cube = require('./api.js')

test('public identity and cube geometry remain stable', () => {
    assert.deepEqual(cube.ping(), {abi: 1, game: 'rubiks'})
    assert.deepEqual(cube.AXES, ['x', 'y', 'z'])
    assert.deepEqual(cube.LAYERS, [-1, 0, 1])
    assert.equal(cube.COORDINATES.length, 26)
    assert.equal(cube.ORIENTATIONS.length, 24)
    assert.equal(cube.isSolved(cube.solved()), true)
})

test('quarter turns, inverses, and half turns compose exactly', () => {
    const moves = [
        {axis: 'x', layer: 1, turns: 1},
        {axis: 'y', layer: -1, turns: -1},
        {axis: 'z', layer: 0, turns: 2},
    ]
    for (const move of moves) {
        const turned = cube.turn(cube.solved(), move)
        assert.equal(cube.isSolved(turned), false)
        assert.deepEqual(cube.turn(turned, cube.inverse(move)), cube.solved())
    }
    const quarter = {axis: 'z', layer: 1, turns: 1}
    assert.deepEqual(cube.apply(cube.solved(), [quarter, quarter, quarter, quarter]), cube.solved())
    assert.deepEqual(
        cube.apply(cube.solved(), [quarter, quarter]),
        cube.turn(cube.solved(), {...quarter, turns: 2}),
    )
})

test('turns preserve every cubie and keep legal orientations', () => {
    let state = cube.solved()
    for (const axis of cube.AXES) {
        for (const layer of cube.LAYERS) state = cube.turn(state, {axis, layer, turns: 1})
    }
    assert.deepEqual([...state.positions].sort((a, b) => a - b), Array.from({length: 26}, (_, index) => index))
    assert(state.orientations.every(value => value >= 0 && value < 24))
    assert.equal(cube.validate(state), true)
})

test('scrambles are deterministic, non-trivial, and avoid adjacent axes', () => {
    for (const seed of [0, 1, 42, 0xffffffff]) {
        const first = cube.newGame(seed)
        assert.deepEqual(first, cube.newGame(seed))
        assert.equal(first.moves.length, 25)
        assert.equal(cube.isSolved(first.state), false)
        first.moves.forEach((move, index) => {
            assert.notEqual(move.axis, first.moves[index - 1]?.axis)
            assert([-1, 1].includes(move.layer))
            assert([-1, 1, 2].includes(move.turns))
        })
    }
    assert.notDeepEqual(cube.newGame(1), cube.newGame(2))
})

test('solved detection ignores only visually irrelevant center spin', () => {
    const spunFace = cube.turn(cube.solved(), {axis: 'x', layer: 1, turns: 1})
    const center = cube.COORDINATES.findIndex(([x, y, z]) => x === 1 && y === 0 && z === 0)
    const centerOnly = cube.solved()
    centerOnly.orientations[center] = spunFace.orientations[center]
    assert.equal(cube.isSolved(centerOnly), true)
    assert.equal(cube.isSolved(spunFace), false)
})

test('malformed states and moves report status-bearing errors', () => {
    const cases = [
        [() => cube.newGame(-1), 'seed must be an integer'],
        [() => cube.turn(cube.solved(), {axis: 'q', layer: 1, turns: 1}), 'move axis'],
        [() => cube.turn(cube.solved(), {axis: 'x', layer: 2, turns: 1}), 'move layer'],
        [() => cube.turn(cube.solved(), {axis: 'x', layer: 1, turns: 0}), 'multiple of four'],
        [() => cube.turn({positions: [], orientations: []}, {axis: 'x', layer: 1, turns: 1}), '26 positions'],
        [() => cube.apply(cube.solved(), null), 'moves must be an array'],
    ]
    for (const [operation, message] of cases) {
        assert.throws(operation, error => {
            assert.match(error.message, new RegExp(message))
            assert.equal(error.status, 2)
            assert.deepEqual(error.response, {error: {status: 2, message: error.message}})
            return true
        })
    }
})
