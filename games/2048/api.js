(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Game2048: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const SIZE = 4
    const CELLS = SIZE * SIZE
    const TARGET = 2048
    const DIRECTIONS = ['up', 'down', 'left', 'right']
    const U32_MAX = 0xffffffff
    const U64_MASK = 0xffffffffffffffffn
    const POSITION_SALT = 0x243f6a8885a308d3n
    const VALUE_SALT = 0x13198a2e03707344n
    const SECOND_SALT = 0xa4093822299f31d0n

    const fail = message => {
        const status = 2
        const response = {error: {message, status}}
        const error = new Error(message)
        Object.assign(error, {status, response})
        throw error
    }

    const invalidType = (value, expected) => {
        if (value == null || (typeof value === 'number' && !Number.isFinite(value))) {
            return fail(`invalid type: null, expected ${expected}`)
        }
        if (typeof value === 'string') return fail(`invalid type: string ${JSON.stringify(value)}, expected ${expected}`)
        if (typeof value === 'boolean') return fail(`invalid type: boolean \`${value}\`, expected ${expected}`)
        if (typeof value === 'number') {
            const kind = Number.isInteger(value) ? 'integer' : 'floating point'
            return fail(`invalid type: ${kind} \`${value}\`, expected ${expected}`)
        }
        if (Array.isArray(value)) return fail(`invalid type: sequence, expected ${expected}`)
        return fail(`invalid type: map, expected ${expected}`)
    }

    const unsignedInteger = (value, bits, field) => {
        const expected = `u${bits}`
        if (value === undefined) {
            if (field) fail(`missing field \`${field}\``)
            invalidType(null, expected)
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) invalidType(value, expected)
        if (!Number.isInteger(value)) fail(`invalid type: floating point \`${value}\`, expected ${expected}`)
        if (value < 0) fail(`invalid value: integer \`${value}\`, expected ${expected}`)
        if (bits === 32) {
            if (value > U32_MAX) fail(`invalid value: integer \`${value}\`, expected u32`)
            return value
        }
        const encoded = JSON.stringify(value)
        if (encoded.includes('e')) {
            fail(`invalid type: floating point \`${encoded}\`, expected u64`)
        }
        const integer = BigInt(encoded)
        if (integer > U64_MASK) {
            fail(`invalid type: floating point \`${value.toExponential()}\`, expected u64`)
        }
        return integer
    }

    const deserializeBoard = board => {
        if (board === undefined) fail('missing field `board`')
        if (!Array.isArray(board)) invalidType(board, 'a sequence')
        return Array.from(board, value => unsignedInteger(value, 32))
    }

    const validateBoard = board => {
        if (board.length !== CELLS) fail('board must have 16 cells')
        if (board.some(value => value !== 0 && !Number.isInteger(Math.log2(value)))) {
            fail('board cells must be zero or powers of two')
        }
    }

    const parseDirection = direction => {
        if (direction === undefined) fail('missing field `direction`')
        if (typeof direction !== 'string') invalidType(direction, 'a string')
        if (!DIRECTIONS.includes(direction)) fail(`unknown direction ${JSON.stringify(direction)}`)
        return direction
    }

    const line = (direction, lane) => Array.from({length: SIZE}, (_, offset) => {
        if (direction === 'left') return lane * SIZE + offset
        if (direction === 'right') return lane * SIZE + SIZE - 1 - offset
        if (direction === 'up') return offset * SIZE + lane
        return (SIZE - 1 - offset) * SIZE + lane
    })

    const slide = (input, direction) => {
        validateBoard(input)
        const board = Array(CELLS).fill(0)
        const merged = []
        let scoreGain = 0
        for (let lane = 0; lane < SIZE; lane += 1) {
            const indices = line(direction, lane)
            const values = indices.map(index => input[index]).filter(Boolean)
            const output = []
            for (let source = 0; source < values.length;) {
                if (source + 1 < values.length && values[source] === values[source + 1]) {
                    const value = values[source] * 2
                    if (value > U32_MAX) fail('tile value overflow')
                    output.push(value)
                    scoreGain += value
                    merged.push(indices[output.length - 1])
                    source += 2
                } else {
                    output.push(values[source])
                    source += 1
                }
            }
            output.forEach((value, offset) => { board[indices[offset]] = value })
        }
        return {board, merged, scoreGain}
    }

    // SplitMix64's finalizer must wrap after each multiply exactly as Rust u64 does.
    const mix = input => {
        let value = input
        value ^= value >> 30n
        value = (value * 0xbf58476d1ce4e5b9n) & U64_MASK
        value ^= value >> 27n
        value = (value * 0x94d049bb133111ebn) & U64_MASK
        return value ^ (value >> 31n)
    }

    const spawn = (board, seed) => {
        const empty = []
        board.forEach((value, index) => { if (value === 0) empty.push(index) })
        if (empty.length === 0) return null
        const positionRandom = mix(seed ^ POSITION_SALT)
        const valueRandom = mix(seed ^ VALUE_SALT)
        const index = empty[Number(positionRandom % BigInt(empty.length))]
        const value = valueRandom % 10n === 0n ? 4 : 2
        board[index] = value
        return {index, value}
    }

    const boardStatus = board => {
        validateBoard(board)
        const reached2048 = board.some(value => value >= TARGET)
        const hasEmpty = board.includes(0)
        let hasMerge = false
        for (let row = 0; row < SIZE && !hasMerge; row += 1) {
            for (let column = 0; column < SIZE - 1; column += 1) {
                if (board[row * SIZE + column] === board[row * SIZE + column + 1]) hasMerge = true
            }
        }
        for (let row = 0; row < SIZE - 1 && !hasMerge; row += 1) {
            for (let column = 0; column < SIZE; column += 1) {
                if (board[row * SIZE + column] === board[(row + 1) * SIZE + column]) hasMerge = true
            }
        }
        return {gameOver: !hasEmpty && !hasMerge, reached2048}
    }

    const newGame = seedInput => {
        const seed = unsignedInteger(seedInput, 64, 'seed')
        const board = Array(CELLS).fill(0)
        const first = spawn(board, seed)
        const second = spawn(board, mix(seed ^ SECOND_SALT))
        return {board, gameOver: false, reached2048: false, spawned: [first, second]}
    }

    const move = (boardInput, directionInput, seedInput) => {
        const input = deserializeBoard(boardInput)
        const direction = parseDirection(directionInput)
        const seed = unsignedInteger(seedInput, 64, 'seed')
        const result = slide(input, direction)
        const moved = result.board.some((value, index) => value !== input[index])
        if (!moved) {
            const state = boardStatus(input)
            return {
                board: input,
                gameOver: state.gameOver,
                merged: [],
                moved: false,
                reached2048: state.reached2048,
                scoreGain: 0,
                spawned: null,
            }
        }
        const spawned = spawn(result.board, seed)
        const state = boardStatus(result.board)
        return {
            board: result.board,
            gameOver: state.gameOver,
            merged: result.merged,
            moved: true,
            reached2048: state.reached2048,
            scoreGain: result.scoreGain,
            spawned,
        }
    }

    const status = boardInput => boardStatus(deserializeBoard(boardInput))

    return {
        SIZE,
        CELLS,
        TARGET,
        DIRECTIONS,
        ping: () => ({abi: 1, game: '2048'}),
        newGame,
        move,
        status,
    }
})
