(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Wuziqi: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const SIZE = 15
    const EMPTY = 0
    const BLACK = 1
    const WHITE = 2
    const other = side => side === BLACK ? WHITE : BLACK
    const at = (row, column) => row * SIZE + column
    const rowOf = index => Math.floor(index / SIZE)
    const columnOf = index => index % SIZE
    const inside = (row, column) => row >= 0 && row < SIZE && column >= 0 && column < SIZE
    const initialBoard = () => Array(SIZE * SIZE).fill(EMPTY)
    const legalMoves = board => board.flatMap((value, index) => value === EMPTY ? [index] : [])
    const applyMove = (board, index, side) => {
        if (board[index] !== EMPTY) throw new Error('occupied intersection')
        const next = board.slice()
        next[index] = side
        return next
    }
    const lineLength = (board, index, side, dr, dc) => {
        const row = rowOf(index)
        const column = columnOf(index)
        let count = 1
        for (const direction of [-1, 1]) {
            let nextRow = row + dr * direction
            let nextColumn = column + dc * direction
            while (inside(nextRow, nextColumn) && board[at(nextRow, nextColumn)] === side) {
                count++
                nextRow += dr * direction
                nextColumn += dc * direction
            }
        }
        return count
    }
    const isWin = (board, index, side = board[index]) => Boolean(side) && [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dr, dc]) => lineLength(board, index, side, dr, dc) >= 5)
    const winner = board => {
        for (let index = 0; index < board.length; index++) if (board[index] && isWin(board, index)) return board[index]
        return null
    }
    const status = (board, lastMove = null) => {
        if (lastMove != null && isWin(board, lastMove)) return {ended: true, winner: board[lastMove], reason: 'five'}
        const found = winner(board)
        if (found) return {ended: true, winner: found, reason: 'five'}
        if (!board.includes(EMPTY)) return {ended: true, winner: null, reason: 'full'}
        return {ended: false, winner: null, reason: 'playing'}
    }
    return {SIZE, EMPTY, BLACK, WHITE, other, at, rowOf, columnOf, inside, initialBoard, legalMoves, applyMove, lineLength, isWin, winner, status}
})
