(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Xiangqi: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const ROWS = 10
    const COLS = 9
    const RED = 'r'
    const BLACK = 'b'
    const other = side => side === RED ? BLACK : RED
    const at = (row, column) => row * COLS + column
    const rowOf = index => Math.floor(index / COLS)
    const columnOf = index => index % COLS
    const inside = (row, column) => row >= 0 && row < ROWS && column >= 0 && column < COLS
    const sideOf = piece => piece ? piece[0] : null
    const typeOf = piece => piece ? piece[1] : null
    const palace = (side, row, column) => column >= 3 && column <= 5 && (side === RED ? row >= 7 && row <= 9 : row >= 0 && row <= 2)

    const initialBoard = () => {
        const board = Array(ROWS * COLS).fill(null)
        const back = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R']
        for (let column = 0; column < COLS; column++) {
            board[at(0, column)] = BLACK + back[column]
            board[at(9, column)] = RED + back[column]
        }
        board[at(2, 1)] = board[at(2, 7)] = BLACK + 'C'
        board[at(7, 1)] = board[at(7, 7)] = RED + 'C'
        for (const column of [0, 2, 4, 6, 8]) {
            board[at(3, column)] = BLACK + 'P'
            board[at(6, column)] = RED + 'P'
        }
        return board
    }

    const pushIfOpen = (moves, board, side, from, row, column) => {
        if (!inside(row, column)) return
        const target = at(row, column)
        if (sideOf(board[target]) !== side) moves.push({from, to: target, piece: board[from], captured: board[target]})
    }

    const pseudoMovesFor = (board, from) => {
        const piece = board[from]
        if (!piece) return []
        const side = sideOf(piece)
        const type = typeOf(piece)
        const row = rowOf(from)
        const column = columnOf(from)
        const moves = []

        if (type === 'K') {
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nextRow = row + dr
                const nextColumn = column + dc
                if (palace(side, nextRow, nextColumn)) pushIfOpen(moves, board, side, from, nextRow, nextColumn)
            }
            for (const direction of [-1, 1]) {
                for (let nextRow = row + direction; inside(nextRow, column); nextRow += direction) {
                    const target = board[at(nextRow, column)]
                    if (!target) continue
                    if (target === other(side) + 'K') pushIfOpen(moves, board, side, from, nextRow, column)
                    break
                }
            }
        } else if (type === 'A') {
            for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
                const nextRow = row + dr
                const nextColumn = column + dc
                if (palace(side, nextRow, nextColumn)) pushIfOpen(moves, board, side, from, nextRow, nextColumn)
            }
        } else if (type === 'E') {
            for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
                const nextRow = row + dr
                const nextColumn = column + dc
                const staysHome = side === RED ? nextRow >= 5 : nextRow <= 4
                if (inside(nextRow, nextColumn) && staysHome && !board[at(row + dr / 2, column + dc / 2)]) {
                    pushIfOpen(moves, board, side, from, nextRow, nextColumn)
                }
            }
        } else if (type === 'H') {
            const jumps = [
                [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
                [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
            ]
            for (const [dr, dc, legRow, legColumn] of jumps) {
                if (!board[at(row + legRow, column + legColumn)]) pushIfOpen(moves, board, side, from, row + dr, column + dc)
            }
        } else if (type === 'R' || type === 'C') {
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                let screened = false
                for (let nextRow = row + dr, nextColumn = column + dc; inside(nextRow, nextColumn); nextRow += dr, nextColumn += dc) {
                    const target = at(nextRow, nextColumn)
                    const occupied = board[target]
                    if (type === 'R') {
                        if (!occupied) moves.push({from, to: target, piece, captured: null})
                        else {
                            if (sideOf(occupied) !== side) moves.push({from, to: target, piece, captured: occupied})
                            break
                        }
                    } else if (!screened) {
                        if (!occupied) moves.push({from, to: target, piece, captured: null})
                        else screened = true
                    } else if (occupied) {
                        if (sideOf(occupied) !== side) moves.push({from, to: target, piece, captured: occupied})
                        break
                    }
                }
            }
        } else if (type === 'P') {
            const direction = side === RED ? -1 : 1
            pushIfOpen(moves, board, side, from, row + direction, column)
            const crossed = side === RED ? row <= 4 : row >= 5
            if (crossed) {
                pushIfOpen(moves, board, side, from, row, column - 1)
                pushIfOpen(moves, board, side, from, row, column + 1)
            }
        }
        return moves
    }

    const pseudoMoves = (board, side) => board.flatMap((piece, index) => sideOf(piece) === side ? pseudoMovesFor(board, index) : [])
    const applyMove = (board, move) => {
        const next = board.slice()
        next[move.to] = next[move.from]
        next[move.from] = null
        return next
    }
    const isInCheck = (board, side) => {
        const king = board.indexOf(side + 'K')
        if (king < 0) return true
        return pseudoMoves(board, other(side)).some(move => move.to === king)
    }
    const legalMoves = (board, side) => pseudoMoves(board, side).filter(move => !isInCheck(applyMove(board, move), side))
    const positionKey = (board, side) => side + ':' + board.map(piece => piece || '--').join('')
    const status = (board, side, repetitions = {}) => {
        const key = positionKey(board, side)
        if ((repetitions[key] || 0) >= 3) return {ended: true, winner: null, reason: 'repetition'}
        const moves = legalMoves(board, side)
        if (!moves.length) return {ended: true, winner: other(side), reason: isInCheck(board, side) ? 'checkmate' : 'stalemate'}
        return {ended: false, winner: null, reason: isInCheck(board, side) ? 'check' : 'playing'}
    }
    const undoMove = (board, move) => {
        const previous = board.slice()
        previous[move.from] = move.piece
        previous[move.to] = move.captured || null
        return previous
    }

    return {
        ROWS, COLS, RED, BLACK, other, at, rowOf, columnOf, sideOf, typeOf,
        initialBoard, pseudoMovesFor, pseudoMoves, legalMoves, applyMove, undoMove,
        isInCheck, positionKey, status,
    }
})
