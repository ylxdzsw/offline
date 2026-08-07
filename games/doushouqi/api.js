(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Doushouqi: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'doushouqi'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_doushouqi.wasm')))
    }
    const call = (op, args = {}) => wasm.dispatch(MODULE, {op, ...args})

    const ROWS = 9, COLS = 7
    const EMPTY = 0, RED = 1, BLACK = 2
    const RAT = 1, CAT = 2, DOG = 3, WOLF = 4, LEOPARD = 5, TIGER = 6, LION = 7, ELEPHANT = 8
    const SIZE = ROWS * COLS

    const at = (row, col) => row * COLS + col
    const rowOf = index => Math.floor(index / COLS)
    const colOf = index => index % COLS
    const inside = (row, col) => row >= 0 && row < ROWS && col >= 0 && col < COLS
    const other = side => side === RED ? BLACK : RED

    const sideOf = piece => piece === 0 ? 0 : piece <= 8 ? RED : BLACK
    const rankOf = piece => piece === 0 ? 0 : piece <= 8 ? piece : piece - 8
    const pieceFor = (side, rank) => side === RED ? rank : rank + 8

    const RED_DEN = at(8, 3)
    const BLACK_DEN = at(0, 3)
    const den = side => side === RED ? RED_DEN : BLACK_DEN
    const RED_TRAPS = new Set([at(7, 3), at(8, 2), at(8, 4)])
    const BLACK_TRAPS = new Set([at(1, 3), at(0, 2), at(0, 4)])
    const traps = side => side === RED ? RED_TRAPS : BLACK_TRAPS

    const isRiver = index => {
        const row = rowOf(index), col = colOf(index)
        return row >= 3 && row <= 5 && (col === 1 || col === 2 || col === 4 || col === 5)
    }

    const initialBoard = () => call('initialBoard')
    const legalMoves = (board, side) => call('legalMoves', {board, side})
    const movesFor = (board, from) => call('movesFor', {board, from})
    const applyMove = (board, move) => call('applyMove', {board, move})
    const status = (board, turn) => call('status', {board, turn})

    return {
        ROWS, COLS, SIZE, EMPTY, RED, BLACK,
        RAT, CAT, DOG, WOLF, LEOPARD, TIGER, LION, ELEPHANT,
        RED_DEN, BLACK_DEN, RED_TRAPS, BLACK_TRAPS,
        at, rowOf, colOf, inside, other, sideOf, rankOf, pieceFor, den, traps, isRiver,
        initialBoard, legalMoves, movesFor, applyMove, status,
    }
})
