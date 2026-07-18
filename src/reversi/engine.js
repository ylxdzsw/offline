(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Reversi: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../shared/wasm.js')
    const MODULE = 'reversi'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../../engine/target/wasm32-unknown-unknown/release/offline_reversi.wasm')))
    }
    const SIZE = 8
    const EMPTY = 0
    const BLACK = 1
    const WHITE = 2
    const DIRECTIONS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
    const call = request => wasm.dispatch(MODULE, request)
    const other = side => side === BLACK ? WHITE : BLACK
    const at = (row, column) => row * SIZE + column
    const rowOf = index => Math.floor(index / SIZE)
    const columnOf = index => index % SIZE
    const inside = (row, column) => row >= 0 && row < SIZE && column >= 0 && column < SIZE
    const initialBoard = () => call({op: 'initialBoard'})
    const flipsForMove = (board, index, side) => call({op: 'flipsForMove', board, index, side})
    const legalMoves = (board, side) => call({op: 'legalMoves', board, side})
    const applyMove = (board, index, side) => call({op: 'applyMove', board, index, side})
    const count = (board, side) => board.reduce((total, value) => total + (value === side ? 1 : 0), 0)
    const status = board => call({op: 'status', board})

    return {SIZE, EMPTY, BLACK, WHITE, DIRECTIONS, other, at, rowOf, columnOf, inside, initialBoard, flipsForMove, legalMoves, applyMove, count, status}
})
