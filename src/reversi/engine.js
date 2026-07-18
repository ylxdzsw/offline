(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Reversi: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const SIZE = 8
    const EMPTY = 0
    const BLACK = 1
    const WHITE = 2
    const DIRECTIONS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
    const other = side => side === BLACK ? WHITE : BLACK
    const at = (row, column) => row * SIZE + column
    const rowOf = index => Math.floor(index / SIZE)
    const columnOf = index => index % SIZE
    const inside = (row, column) => row >= 0 && row < SIZE && column >= 0 && column < SIZE
    const initialBoard = () => {
        const board = Array(SIZE * SIZE).fill(EMPTY)
        board[at(3, 3)] = WHITE
        board[at(3, 4)] = BLACK
        board[at(4, 3)] = BLACK
        board[at(4, 4)] = WHITE
        return board
    }
    const flipsForMove = (board, index, side) => {
        if (!Number.isInteger(index) || index < 0 || index >= board.length || board[index] !== EMPTY) return []
        const row = rowOf(index)
        const column = columnOf(index)
        const opponent = other(side)
        const flips = []
        for (const [dr, dc] of DIRECTIONS) {
            const line = []
            let nextRow = row + dr
            let nextColumn = column + dc
            while (inside(nextRow, nextColumn) && board[at(nextRow, nextColumn)] === opponent) {
                line.push(at(nextRow, nextColumn))
                nextRow += dr
                nextColumn += dc
            }
            if (line.length && inside(nextRow, nextColumn) && board[at(nextRow, nextColumn)] === side) flips.push(...line)
        }
        return flips
    }
    const legalMoves = (board, side) => board.flatMap((value, index) => {
        if (value !== EMPTY) return []
        const flips = flipsForMove(board, index, side)
        return flips.length ? [{index, flips}] : []
    })
    const applyMove = (board, index, side) => {
        const flips = flipsForMove(board, index, side)
        if (!flips.length) throw new Error('illegal move')
        const next = board.slice()
        next[index] = side
        for (const target of flips) next[target] = side
        return next
    }
    const count = (board, side) => board.reduce((total, value) => total + (value === side ? 1 : 0), 0)
    const status = board => {
        if (legalMoves(board, BLACK).length || legalMoves(board, WHITE).length) return {ended: false, winner: null, reason: 'playing'}
        const black = count(board, BLACK)
        const white = count(board, WHITE)
        return {ended: true, winner: black === white ? null : black > white ? BLACK : WHITE, reason: board.includes(EMPTY) ? 'no-moves' : 'full', black, white}
    }

    return {SIZE, EMPTY, BLACK, WHITE, DIRECTIONS, other, at, rowOf, columnOf, inside, initialBoard, flipsForMove, legalMoves, applyMove, count, status}
})
