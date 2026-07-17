(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Sudoku: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const SIZE = 9
    const BOX = 3
    const CELLS = SIZE * SIZE
    const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    const CLUES = {easy: 40, medium: 32, hard: 27}
    const rowOf = index => Math.floor(index / SIZE)
    const columnOf = index => index % SIZE
    const boxOf = index => Math.floor(rowOf(index) / BOX) * BOX + Math.floor(columnOf(index) / BOX)
    const peers = index => {
        const values = new Set()
        for (let offset = 0; offset < SIZE; offset++) {
            values.add(rowOf(index) * SIZE + offset)
            values.add(offset * SIZE + columnOf(index))
            values.add((Math.floor(rowOf(index) / BOX) * BOX + Math.floor(offset / BOX)) * SIZE + Math.floor(columnOf(index) / BOX) * BOX + offset % BOX)
        }
        values.delete(index)
        return [...values]
    }
    const candidates = (board, index) => {
        if (board[index]) return []
        const used = new Set(peers(index).map(peer => board[peer]).filter(Boolean))
        return DIGITS.filter(digit => !used.has(digit))
    }
    const conflicts = (board, index) => {
        const value = board[index]
        return value ? peers(index).filter(peer => board[peer] === value) : []
    }
    const isValid = board => Array.isArray(board) && board.length === CELLS
        && board.every((value, index) => Number.isInteger(value) && value >= 0 && value <= 9 && conflicts(board, index).length === 0)
    const solve = (board, limit = 1) => {
        const work = board.slice()
        const solutions = []
        const visit = () => {
            if (solutions.length >= limit) return
            let target = -1
            let options = null
            for (let index = 0; index < CELLS; index++) {
                if (work[index]) continue
                const next = candidates(work, index)
                if (!next.length) return
                if (!options || next.length < options.length) {
                    target = index
                    options = next
                    if (next.length === 1) break
                }
            }
            if (target < 0) {
                solutions.push(work.slice())
                return
            }
            for (const digit of options) {
                work[target] = digit
                visit()
                work[target] = 0
                if (solutions.length >= limit) return
            }
        }
        if (isValid(work)) visit()
        return solutions
    }
    const shuffle = (values, random) => {
        const result = values.slice()
        for (let index = result.length - 1; index > 0; index--) {
            const other = Math.floor(random() * (index + 1))
            ;[result[index], result[other]] = [result[other], result[index]]
        }
        return result
    }
    const completeBoard = (random = Math.random) => {
        const rows = shuffle([0, 1, 2], random).flatMap(band => shuffle([0, 1, 2], random).map(row => band * 3 + row))
        const columns = shuffle([0, 1, 2], random).flatMap(stack => shuffle([0, 1, 2], random).map(column => stack * 3 + column))
        const digits = shuffle(DIGITS, random)
        return rows.flatMap(row => columns.map(column => digits[(row * 3 + Math.floor(row / 3) + column) % SIZE]))
    }
    const generate = (difficulty = 'medium', random = Math.random) => {
        if (!(difficulty in CLUES)) throw new Error('unknown difficulty')
        const solution = completeBoard(random)
        const puzzle = solution.slice()
        let remaining = CELLS
        for (const index of shuffle([...Array(CELLS).keys()], random)) {
            if (remaining <= CLUES[difficulty]) break
            const value = puzzle[index]
            puzzle[index] = 0
            if (solve(puzzle, 2).length !== 1) puzzle[index] = value
            else remaining--
        }
        return {puzzle, solution, clues: remaining}
    }
    const isComplete = (board, solution) => board.every((value, index) => value === solution[index])

    return {SIZE, BOX, CELLS, DIGITS, CLUES, rowOf, columnOf, boxOf, peers, candidates, conflicts, isValid, solve, completeBoard, generate, isComplete}
})
