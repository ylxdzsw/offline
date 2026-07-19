(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Xiangqi: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'xiangqi'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_xiangqi.wasm')))
    }
    const call = request => wasm.dispatch(MODULE, request)
    const ROWS = 10, COLS = 9, RED = 'r', BLACK = 'b'
    const other = side => side === RED ? BLACK : RED
    const at = (row, column) => row * COLS + column
    const rowOf = index => Math.floor(index / COLS)
    const columnOf = index => index % COLS
    const sideOf = piece => piece ? piece[0] : null
    const typeOf = piece => piece ? piece[1] : null
    const initialBoard = () => call({op: 'initialBoard'})
    const pseudoMovesFor = (board, from) => call({op: 'pseudoMovesFor', board, from, side: sideOf(board[from]) || RED})
    const pseudoMoves = (board, side) => call({op: 'pseudoMoves', board, side})
    const legalMoves = (board, side) => call({op: 'legalMoves', board, side})
    const applyMove = (board, move) => call({op: 'applyMove', board, side: sideOf(board[move.from]), move})
    const undoMove = (board, move) => {
        const previous = board.slice()
        previous[move.from] = move.piece
        previous[move.to] = move.captured || null
        return previous
    }
    const isInCheck = (board, side) => call({op: 'isInCheck', board, side})
    const positionKey = (board, side) => side + ':' + board.map(piece => piece || '--').join('')
    const status = (board, side, repetitions = {}) => call({op: 'status', board, side, repetitions: repetitions[positionKey(board, side)] || 0})

    return {ROWS, COLS, RED, BLACK, other, at, rowOf, columnOf, sideOf, typeOf, initialBoard, pseudoMovesFor, pseudoMoves, legalMoves, applyMove, undoMove, isInCheck, positionKey, status}
})
