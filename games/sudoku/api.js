(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Sudoku: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const SIZE = 9
    const BOX = 3
    const CELLS = SIZE * SIZE
    const DIGITS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const CLUES = Object.freeze({easy: 40, medium: 32, hard: 27})
    const U64_MASK = 0xffffffffffffffffn
    const U32_MASK = 0xffffffffn
    const U32_MAX = 0xffffffff
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
    const rowOf = index => Math.floor(index / SIZE)
    const columnOf = index => index % SIZE
    const boxOf = index => Math.floor(rowOf(index) / BOX) * BOX + Math.floor(columnOf(index) / BOX)

    const PEERS = Array.from({length: CELLS}, (_, index) => {
        const used = Array(CELLS).fill(false)
        for (let offset = 0; offset < SIZE; offset++) {
            used[rowOf(index) * SIZE + offset] = true
            used[offset * SIZE + columnOf(index)] = true
            used[(Math.floor(rowOf(index) / BOX) * BOX + Math.floor(offset / BOX)) * SIZE
                + Math.floor(columnOf(index) / BOX) * BOX + offset % BOX] = true
        }
        used[index] = false
        return used.flatMap((value, peer) => value ? [peer] : [])
    })

    class Rng {
        constructor(seed) {
            this.state = seed > 0 ? BigInt(seed) : 1n
        }
        next() {
            let value = this.state
            value = (value ^ (value << 13n)) & U64_MASK
            value ^= value >> 7n
            value = (value ^ (value << 17n)) & U64_MASK
            this.state = value
            return value
        }
        index(length) {
            // Rust's usize is 32-bit in the wasm32 build.
            return Number(this.next() & U32_MASK) % length
        }
        shuffle(values) {
            for (let index = values.length - 1; index > 0; index--) {
                const target = this.index(index + 1)
                ;[values[index], values[target]] = [values[target], values[index]]
            }
        }
    }

    const fail = message => {
        const response = {error: {status: 2, message}}
        throw Object.assign(new Error(message), {status: 2, response})
    }
    const integer = (value, name) => {
        if (!Number.isSafeInteger(value) || value < 0 || value > U32_MAX) {
            fail(`${name} must be a non-negative 32-bit integer`)
        }
        return value
    }
    const indexOf = index => {
        integer(index, 'index')
        if (index >= CELLS) fail('index must be between 0 and 80')
        return index
    }
    const byteArray = (value, name) => {
        if (!Array.isArray(value)) fail(`${name} must be an array`)
        const result = Array.from(value)
        if (!result.every(item => Number.isInteger(item) && item >= 0 && item <= 255)) {
            fail(`${name} must contain unsigned bytes`)
        }
        return result
    }
    const boardForCell = (board, index) => {
        byteArray(board, 'board')
        if (board.length !== CELLS) fail('board must have 81 cells')
        return indexOf(index)
    }
    const seedFrom = random => typeof random === 'number'
        ? random >>> 0
        : Math.floor(random() * 0x100000000) >>> 0

    const candidateMask = (board, index) => {
        if (board[index] !== 0) return 0
        let mask = 0x3fe
        for (const peer of PEERS[index]) mask &= ~(1 << (board[peer] & 15))
        return mask
    }
    const candidatesUnchecked = (board, index) => {
        const mask = candidateMask(board, index)
        return DIGITS.filter(digit => mask & (1 << digit))
    }
    const conflictsUnchecked = (board, index) => {
        const value = board[index]
        return value === 0 ? [] : PEERS[index].filter(peer => board[peer] === value)
    }
    const isValidUnchecked = board => board.length === CELLS
        && board.every(value => value <= 9)
        && board.every((_, index) => conflictsUnchecked(board, index).length === 0)

    const selectCell = board => {
        let best = null
        for (let index = 0; index < CELLS; index++) {
            if (board[index] !== 0) continue
            const options = candidatesUnchecked(board, index)
            if (options.length === 0) return [index, options]
            if (best === null || options.length < best[1].length) {
                best = [index, options]
                if (options.length === 1) break
            }
        }
        return best
    }

    const solveVisit = (board, limit, solutions, metrics) => {
        if (solutions.length >= limit) return
        metrics.nodes++
        const selected = selectCell(board)
        if (selected === null) {
            solutions.push(board.slice())
            return
        }
        const [index, options] = selected
        for (const digit of options) {
            board[index] = digit
            solveVisit(board, limit, solutions, metrics)
            board[index] = 0
            if (solutions.length >= limit) return
        }
    }

    const solveUnchecked = (board, limit) => {
        if (!isValidUnchecked(board)) return []
        const work = board.slice()
        const solutions = []
        solveVisit(work, limit, solutions, {nodes: 0})
        return solutions
    }

    const randomizedFill = (board, rng) => {
        const selected = selectCell(board)
        if (selected === null) return true
        const [index, options] = selected
        rng.shuffle(options)
        for (const digit of options) {
            board[index] = digit
            if (randomizedFill(board, rng)) return true
            board[index] = 0
        }
        return false
    }

    const completeBoardFromSeed = seed => {
        const rng = new Rng(seed)
        const board = Array(CELLS).fill(0)
        randomizedFill(board, rng)
        return board
    }

    const solveRating = board => {
        const work = board.slice()
        const solutions = []
        const metrics = {nodes: 0}
        solveVisit(work, 1, solutions, metrics)
        return metrics.nodes
    }

    const generateFromSeed = (difficulty, seed) => {
        if (!own(CLUES, difficulty)) fail('unknown difficulty')
        const target = CLUES[difficulty]
        const solution = completeBoardFromSeed(seed)
        const puzzle = solution.slice()
        const rng = new Rng(BigInt(seed) ^ 0xd1b54a32d192ed03n)
        const pairs = Array.from({length: Math.floor(CELLS / 2) + 1}, (_, index) => index)
        rng.shuffle(pairs)
        let remaining = CELLS
        for (const index of pairs) {
            const mirror = CELLS - 1 - index
            const removal = index === mirror ? 1 : 2
            if (Math.max(0, remaining - removal) < target) continue
            const first = puzzle[index]
            const second = puzzle[mirror]
            puzzle[index] = 0
            puzzle[mirror] = 0
            if (solveUnchecked(puzzle, 2).length === 1) {
                remaining -= removal
            } else {
                puzzle[index] = first
                puzzle[mirror] = second
            }
            if (remaining === target) break
        }
        const singles = Array.from({length: CELLS}, (_, index) => index)
            .filter(index => puzzle[index] !== 0)
        rng.shuffle(singles)
        for (const index of singles) {
            if (remaining <= target) break
            const value = puzzle[index]
            puzzle[index] = 0
            if (solveUnchecked(puzzle, 2).length === 1) {
                remaining--
            } else {
                puzzle[index] = value
            }
        }
        return {puzzle, solution, clues: remaining, rating: solveRating(puzzle)}
    }

    const peers = index => PEERS[indexOf(index)].slice()
    const candidates = (board, index) => candidatesUnchecked(board, boardForCell(board, index))
    const conflicts = (board, index) => conflictsUnchecked(board, boardForCell(board, index))
    const isValid = board => isValidUnchecked(byteArray(board, 'board'))
    const solve = (board, limit = 1) => solveUnchecked(byteArray(board, 'board'), integer(limit, 'limit'))
    const completeBoard = (random = Math.random) => completeBoardFromSeed(seedFrom(random))
    const generate = (difficulty = 'medium', random = Math.random) => generateFromSeed(difficulty, seedFrom(random))
    const isComplete = (board, solution) => {
        const checkedBoard = byteArray(board, 'board')
        const checkedSolution = byteArray(solution, 'solution')
        return checkedBoard.length === CELLS
            && checkedSolution.length === CELLS
            && !checkedBoard.includes(0)
            && isValidUnchecked(checkedBoard)
            && isValidUnchecked(checkedSolution)
            && checkedBoard.every((value, index) => value === checkedSolution[index])
    }

    return {SIZE, BOX, CELLS, DIGITS, CLUES, rowOf, columnOf, boxOf, peers, candidates, conflicts, isValid, solve, completeBoard, generate, isComplete}
})
