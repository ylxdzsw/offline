(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Minesweeper: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const MINE = 9
    const U64_MASK = 0xffffffffffffffffn
    const U32_MAX = 0xffffffff
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

    const raise = message => {
        const response = {error: {status: 2, message}}
        throw Object.assign(new Error(message), {status: 2, response})
    }

    const debugString = value => JSON.stringify(value)

    const typeDescription = value => {
        if (value == null || (typeof value === 'number' && !Number.isFinite(value))) return 'null'
        if (typeof value === 'string') return `string ${debugString(value)}`
        if (typeof value === 'boolean') return `boolean \`${value}\``
        if (typeof value === 'number') {
            return `${Number.isInteger(value) ? 'integer' : 'floating point'} \`${value}\``
        }
        if (Array.isArray(value)) return 'sequence'
        if (typeof value === 'object') return 'map'
        return typeDescription(null)
    }

    const invalidType = (value, expected) => raise(
        `invalid type: ${typeDescription(value)}, expected ${expected}`,
    )

    const configFor = difficulty => {
        switch (difficulty) {
        case 'easy': return {width: 9, height: 9, mineCount: 10}
        case 'medium': return {width: 16, height: 16, mineCount: 40}
        case 'hard': return {width: 16, height: 30, mineCount: 99}
        default: return null
        }
    }

    const readString = (value, field) => {
        if (value === undefined) raise(`missing field \`${field}\``)
        if (typeof value !== 'string') invalidType(value, 'a string')
        return value
    }

    const serializedInteger = value => {
        const encoded = JSON.stringify(value)
        return encoded.includes('e') ? BigInt(value) : BigInt(encoded)
    }

    const readUnsigned = (value, field, expected, maximum) => {
        if (value === undefined) raise(`missing field \`${field}\``)
        if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
            invalidType(value, expected)
        }
        const tooLarge = typeof maximum === 'bigint'
            ? serializedInteger(value) > maximum
            : value > maximum
        if (value < 0 || tooLarge) {
            raise(`invalid value: integer \`${value}\`, expected ${expected}`)
        }
        return value === 0 ? 0 : value
    }

    const readBoolean = (value, field) => {
        if (value === undefined) raise(`missing field \`${field}\``)
        if (typeof value !== 'boolean') invalidType(value, 'a boolean')
        return value
    }

    const readArray = (value, field, item) => {
        if (value === undefined) raise(`missing field \`${field}\``)
        if (!Array.isArray(value)) invalidType(value, 'a sequence')
        return Array.from(value, (entry, index) =>
            item(entry === undefined ? null : entry, `${field}[${index}]`))
    }

    const readBoard = value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            invalidType(value, 'struct Board')
        }
        const required = key => own(value, key) ? value[key] : undefined
        const optional = key => own(value, key) && value[key] !== undefined ? value[key] : null
        const outcome = optional('outcome')
        const exploded = optional('exploded')
        if (outcome !== null && typeof outcome !== 'string') invalidType(outcome, 'a string')
        return {
            difficulty: readString(required('difficulty'), 'difficulty'),
            width: readUnsigned(required('width'), 'width', 'usize', U32_MAX),
            height: readUnsigned(required('height'), 'height', 'usize', U32_MAX),
            mineCount: readUnsigned(required('mineCount'), 'mineCount', 'usize', U32_MAX),
            seed: readUnsigned(required('seed'), 'seed', 'u64', U64_MASK),
            cells: readArray(required('cells'), 'cells',
                (entry, field) => readUnsigned(entry, field, 'u8', 0xff)),
            revealed: readArray(required('revealed'), 'revealed', readBoolean),
            flagged: readArray(required('flagged'), 'flagged', readBoolean),
            started: readBoolean(required('started'), 'started'),
            outcome,
            exploded: exploded === null
                ? null
                : readUnsigned(exploded, 'exploded', 'usize', U32_MAX),
        }
    }

    const config = difficulty => {
        difficulty = readString(difficulty, 'difficulty')
        const found = configFor(difficulty)
        if (!found) raise(`unknown difficulty ${debugString(difficulty)}`)
        return {...found}
    }

    const newGame = (difficulty, seed) => {
        const selected = config(difficulty)
        seed = readUnsigned(seed, 'seed', 'u64', U64_MASK)
        const total = selected.width * selected.height
        return {
            difficulty,
            width: selected.width,
            height: selected.height,
            mineCount: selected.mineCount,
            seed,
            cells: [],
            revealed: Array(total).fill(false),
            flagged: Array(total).fill(false),
            started: false,
            outcome: null,
            exploded: null,
        }
    }

    const neighbours = (width, height, index) => {
        const row = Math.floor(index / width)
        const column = index % width
        const nearby = []
        for (let nearRow = Math.max(0, row - 1); nearRow <= Math.min(height - 1, row + 1); nearRow++) {
            for (let nearColumn = Math.max(0, column - 1);
                nearColumn <= Math.min(width - 1, column + 1);
                nearColumn++) {
                const near = nearRow * width + nearColumn
                if (near !== index) nearby.push(near)
            }
        }
        return nearby
    }

    const expectedCells = board => {
        const cells = board.cells.map(cell => cell === MINE ? MINE : 0)
        for (let index = 0; index < cells.length; index++) {
            if (cells[index] === MINE) continue
            cells[index] = neighbours(board.width, board.height, index)
                .filter(near => board.cells[near] === MINE).length
        }
        return cells
    }

    const boardError = board => {
        const expected = configFor(board.difficulty)
        if (!expected) return `unknown difficulty ${debugString(board.difficulty)}`
        if (board.width !== expected.width
            || board.height !== expected.height
            || board.mineCount !== expected.mineCount) {
            return 'board dimensions do not match its difficulty'
        }
        const total = board.width * board.height
        if (board.revealed.length !== total || board.flagged.length !== total) {
            return 'board visibility arrays have the wrong length'
        }
        if (board.revealed.some((revealed, index) => revealed && board.flagged[index])) {
            return 'a cell cannot be both revealed and flagged'
        }
        if (board.flagged.filter(Boolean).length > board.mineCount) {
            return 'board has more flags than mines'
        }
        if (board.started) {
            if (board.cells.length !== total) return 'a started board must contain every cell'
            if (board.cells.filter(cell => cell === MINE).length !== board.mineCount) {
                return 'board has the wrong number of mines'
            }
            const calculated = expectedCells(board)
            if (board.cells.some(cell => cell > MINE)
                || calculated.some((cell, index) => cell !== board.cells[index])) {
                return 'board mine counts are inconsistent'
            }
        } else if (board.cells.length !== 0 || board.revealed.includes(true)) {
            return 'an unstarted board cannot contain mines or revealed cells'
        }
        if (board.outcome === null) {
            const unfinished = !board.started || board.cells.some(
                (cell, index) => cell !== MINE && !board.revealed[index],
            )
            if (board.exploded === null && unfinished) return null
            return 'an unfinished board cannot have an exploded mine'
        }
        if (board.outcome === 'lost') {
            if (board.exploded === null) return 'a lost board must identify the exploded mine'
            if (board.exploded >= total
                || board.cells[board.exploded] !== MINE
                || !board.revealed[board.exploded]) {
                return 'the exploded cell must be a revealed mine'
            }
            return null
        }
        if (board.outcome === 'won') {
            const won = board.exploded === null && board.cells.every(
                (cell, index) => cell === MINE || board.revealed[index],
            )
            if (won) return null
        }
        return `invalid board outcome ${debugString(board.outcome)}`
    }

    const validate = value => boardError(readBoard(value)) === null

    const nextRandom = state => {
        state.value = (state.value + 0x9e3779b97f4a7c15n) & U64_MASK
        let value = state.value
        value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK
        value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & U64_MASK
        return (value ^ (value >> 31n)) & U64_MASK
    }

    const generate = (board, safeIndex) => {
        const total = board.width * board.height
        const safe = Array(total).fill(false)
        safe[safeIndex] = true
        for (const index of neighbours(board.width, board.height, safeIndex)) safe[index] = true
        const candidates = Array.from({length: total}, (_, index) => index)
            .filter(index => !safe[index])
        const mixedIndex = (BigInt(safeIndex) * 0xd6e8feb86659fd93n) & U64_MASK
        const random = {value: (serializedInteger(board.seed) ^ mixedIndex) & U64_MASK}
        for (let end = candidates.length - 1; end > 0; end--) {
            const swap = Number(nextRandom(random) % BigInt(end + 1))
            ;[candidates[end], candidates[swap]] = [candidates[swap], candidates[end]]
        }
        board.cells = Array(total).fill(0)
        for (const index of candidates.slice(0, board.mineCount)) board.cells[index] = MINE
        board.cells = expectedCells(board)
        board.started = true
    }

    const revealArea = (board, start, changed) => {
        const queue = [start]
        for (let cursor = 0; cursor < queue.length; cursor++) {
            const index = queue[cursor]
            if (board.revealed[index] || board.flagged[index] || board.cells[index] === MINE) continue
            board.revealed[index] = true
            changed.push(index)
            if (board.cells[index] === 0) {
                for (const near of neighbours(board.width, board.height, index)) {
                    if (!board.revealed[near] && !board.flagged[near] && board.cells[near] !== MINE) {
                        queue.push(near)
                    }
                }
            }
        }
    }

    const finishIfWon = board => {
        const won = board.cells.every((cell, index) => cell === MINE || board.revealed[index])
        if (!won) return
        board.outcome = 'won'
        for (let index = 0; index < board.cells.length; index++) {
            if (board.cells[index] === MINE) board.flagged[index] = true
        }
    }

    const result = (board, changed = [], flagMismatch = false) => ({board, changed, flagMismatch})

    const actionInput = (value, index) => {
        const board = readBoard(value)
        index = readUnsigned(index, 'index', 'usize', U32_MAX)
        const error = boardError(board)
        if (error) raise(error)
        if (index >= board.width * board.height) raise('cell index is out of range')
        return {board, index}
    }

    const reveal = (value, index) => {
        const input = actionInput(value, index)
        const {board} = input
        index = input.index
        if (board.outcome !== null || board.flagged[index] || board.revealed[index]) {
            return result(board)
        }
        if (!board.started) generate(board, index)
        const changed = []
        if (board.cells[index] === MINE) {
            board.revealed[index] = true
            board.exploded = index
            board.outcome = 'lost'
            changed.push(index)
        } else {
            revealArea(board, index, changed)
            finishIfWon(board)
        }
        return result(board, changed)
    }

    const toggleFlag = (value, index) => {
        const input = actionInput(value, index)
        const {board} = input
        index = input.index
        if (board.outcome !== null || board.revealed[index]) return result(board)
        if (board.flagged[index]) {
            board.flagged[index] = false
        } else if (board.flagged.filter(Boolean).length < board.mineCount) {
            board.flagged[index] = true
        } else {
            return result(board)
        }
        return result(board, [index])
    }

    const chord = (value, index) => {
        const input = actionInput(value, index)
        const {board} = input
        index = input.index
        if (board.outcome !== null
            || !board.started
            || !board.revealed[index]
            || board.cells[index] === 0
            || board.cells[index] === MINE) {
            return result(board)
        }
        const adjacent = neighbours(board.width, board.height, index)
        const flagged = adjacent.filter(near => board.flagged[near]).length
        if (flagged !== board.cells[index]) return result(board, [], true)
        const changed = []
        for (const near of adjacent) {
            if (board.revealed[near] || board.flagged[near]) continue
            if (board.cells[near] === MINE) {
                board.revealed[near] = true
                board.exploded = near
                board.outcome = 'lost'
                changed.push(near)
                break
            }
            revealArea(board, near, changed)
        }
        if (board.outcome === null) finishIfWon(board)
        return result(board, changed)
    }

    return {
        MINE,
        ping: () => ({abi: 1, game: 'minesweeper'}),
        config,
        newGame,
        validate,
        reveal,
        toggleFlag,
        chord,
    }
})
