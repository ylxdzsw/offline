(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Rubiks: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const AXES = Object.freeze(['x', 'y', 'z'])
    const LAYERS = Object.freeze([-1, 0, 1])
    const AXIS_INDEX = Object.freeze({x: 0, y: 1, z: 2})
    const IDENTITY = Object.freeze([1,0,0, 0,1,0, 0,0,1])
    const ROTATIONS = Object.freeze({
        x: Object.freeze([1,0,0, 0,0,-1, 0,1,0]),
        y: Object.freeze([0,0,1, 0,1,0, -1,0,0]),
        z: Object.freeze([0,-1,0, 1,0,0, 0,0,1]),
    })

    const fail = message => {
        const response = {error: {status: 2, message}}
        throw Object.assign(new Error(message), {status: 2, response})
    }

    const multiply = (left, right) => Array.from({length: 9}, (_, index) => {
        const row = Math.floor(index / 3), column = index % 3
        return left[row * 3] * right[column]
            + left[row * 3 + 1] * right[3 + column]
            + left[row * 3 + 2] * right[6 + column]
    })

    const transform = (matrix, vector) => [
        matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
        matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
        matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
    ]

    const matrixKey = matrix => matrix.join(',')
    const buildOrientations = () => {
        const orientations = [Array.from(IDENTITY)]
        const seen = new Set([matrixKey(IDENTITY)])
        for (let cursor = 0; cursor < orientations.length; cursor++) {
            for (const axis of AXES) {
                const next = multiply(ROTATIONS[axis], orientations[cursor])
                const key = matrixKey(next)
                if (!seen.has(key)) {
                    seen.add(key)
                    orientations.push(next)
                }
            }
        }
        return orientations.map(matrix => Object.freeze(matrix))
    }

    const ORIENTATIONS = Object.freeze(buildOrientations())
    const ORIENTATION_INDEX = new Map(ORIENTATIONS.map((matrix, index) => [matrixKey(matrix), index]))
    const COORDINATES = Object.freeze(Array.from({length: 27}, (_, index) => [
        Math.floor(index / 9) - 1,
        Math.floor(index / 3) % 3 - 1,
        index % 3 - 1,
    ]).filter(([x, y, z]) => x || y || z).map(Object.freeze))
    const POSITION_INDEX = new Map(COORDINATES.map((coordinate, index) => [coordinate.join(','), index]))

    const checkedSeed = seed => {
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
            fail('seed must be an integer between 0 and 4294967295')
        }
        return seed >>> 0
    }

    const checkedMove = input => {
        if (!input || typeof input !== 'object' || Array.isArray(input)) fail('move must be an object')
        const axis = input.axis
        const layer = input.layer
        if (!AXES.includes(axis)) fail('move axis must be x, y, or z')
        if (!LAYERS.includes(layer)) fail('move layer must be -1, 0, or 1')
        if (!Number.isInteger(input.turns)) fail('move turns must be an integer')
        let turns = input.turns % 4
        if (turns > 2) turns -= 4
        if (turns < -2) turns += 4
        if (turns === 0) fail('move turns must not be a multiple of four')
        return {axis, layer, turns}
    }

    const checkedState = input => {
        if (!input || typeof input !== 'object' || Array.isArray(input)
            || !Array.isArray(input.positions) || !Array.isArray(input.orientations)
            || input.positions.length !== COORDINATES.length
            || input.orientations.length !== COORDINATES.length) {
            fail('state must contain 26 positions and orientations')
        }
        const positions = Array.from(input.positions)
        const orientations = Array.from(input.orientations)
        if (!positions.every(value => Number.isInteger(value) && value >= 0 && value < COORDINATES.length)
            || new Set(positions).size !== COORDINATES.length) {
            fail('state positions must contain each cubie position exactly once')
        }
        if (!orientations.every(value => Number.isInteger(value) && value >= 0 && value < ORIENTATIONS.length)) {
            fail('state orientations must be valid cube rotations')
        }
        return {positions, orientations}
    }

    const solved = () => ({
        positions: Array.from({length: COORDINATES.length}, (_, index) => index),
        orientations: Array(COORDINATES.length).fill(0),
    })

    const rotationFor = (axis, turns) => {
        let matrix = Array.from(IDENTITY)
        const count = (turns % 4 + 4) % 4
        for (let step = 0; step < count; step++) matrix = multiply(ROTATIONS[axis], matrix)
        return matrix
    }

    const turn = (stateInput, moveInput) => {
        const state = checkedState(stateInput)
        const move = checkedMove(moveInput)
        const axisIndex = AXIS_INDEX[move.axis]
        const rotation = rotationFor(move.axis, move.turns)
        for (let piece = 0; piece < COORDINATES.length; piece++) {
            const coordinate = COORDINATES[state.positions[piece]]
            if (coordinate[axisIndex] !== move.layer) continue
            const nextCoordinate = transform(rotation, coordinate)
            const nextOrientation = multiply(rotation, ORIENTATIONS[state.orientations[piece]])
            state.positions[piece] = POSITION_INDEX.get(nextCoordinate.join(','))
            state.orientations[piece] = ORIENTATION_INDEX.get(matrixKey(nextOrientation))
        }
        return state
    }

    const apply = (stateInput, movesInput) => {
        if (!Array.isArray(movesInput)) fail('moves must be an array')
        return movesInput.reduce((state, move) => turn(state, move), checkedState(stateInput))
    }

    const inverse = moveInput => {
        const move = checkedMove(moveInput)
        return {...move, turns: move.turns === 2 ? 2 : -move.turns}
    }

    const isSolved = stateInput => {
        const state = checkedState(stateInput)
        return COORDINATES.every((home, piece) => {
            if (state.positions[piece] !== piece) return false
            const orientation = ORIENTATIONS[state.orientations[piece]]
            return home.every((coordinate, axis) => {
                if (coordinate === 0) return true
                const normal = [0, 0, 0]
                normal[axis] = coordinate
                return transform(orientation, normal).every((value, index) => value === normal[index])
            })
        })
    }

    class Rng {
        constructor(seed) {
            this.state = (checkedSeed(seed) ^ 0x9e3779b9) >>> 0 || 0x6d2b79f5
        }
        next() {
            let value = this.state
            value ^= value << 13
            value ^= value >>> 17
            value ^= value << 5
            return this.state = value >>> 0
        }
        pick(values) { return values[this.next() % values.length] }
    }

    const scramble = (seedInput, length = 25) => {
        const seed = checkedSeed(seedInput)
        if (!Number.isInteger(length) || length < 1 || length > 100) fail('scramble length must be between 1 and 100')
        const rng = new Rng(seed)
        const moves = []
        while (moves.length < length) {
            const axis = rng.pick(AXES)
            if (moves.at(-1)?.axis === axis) continue
            moves.push({axis, layer: rng.pick([-1, 1]), turns: rng.pick([-1, 1, 2])})
        }
        return moves
    }

    const newGame = seed => {
        const moves = scramble(seed)
        return {moves, state: apply(solved(), moves)}
    }

    return {
        AXES,
        LAYERS,
        COORDINATES,
        ORIENTATIONS,
        apply,
        inverse,
        isSolved,
        newGame,
        ping: () => ({abi: 1, game: 'rubiks'}),
        scramble,
        solved,
        turn,
        validate: state => { try { checkedState(state); return true } catch { return false } },
    }
})
