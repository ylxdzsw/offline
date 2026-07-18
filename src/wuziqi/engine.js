(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Wuziqi: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../shared/wasm.js')
    const MODULE = 'wuziqi'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../../engine/target/wasm32-unknown-unknown/release/offline_wuziqi.wasm')))
    }
    const SIZE = 15
    const EMPTY = 0
    const BLACK = 1
    const WHITE = 2
    const call = request => wasm.dispatch(MODULE, request)
    const other = side => side === BLACK ? WHITE : BLACK
    const at = (row, column) => row * SIZE + column
    const rowOf = index => Math.floor(index / SIZE)
    const columnOf = index => index % SIZE
    const inside = (row, column) => row >= 0 && row < SIZE && column >= 0 && column < SIZE
    const initialBoard = () => call({op: 'initialBoard'})
    const legalMoves = board => board.flatMap((value, index) => value === EMPTY ? [index] : [])
    const applyMove = (board, index, side) => call({op: 'applyMove', board, index, side})
    const lineLength = (board, index, side, dr, dc) => {
        const row = rowOf(index), column = columnOf(index)
        let count = 1
        for (const direction of [-1, 1]) {
            let nextRow = row + dr * direction, nextColumn = column + dc * direction
            while (inside(nextRow, nextColumn) && board[at(nextRow, nextColumn)] === side) {
                count++
                nextRow += dr * direction
                nextColumn += dc * direction
            }
        }
        return count
    }
    const isWin = (board, index, side = board[index]) => call({op: 'isWin', board, index, side})
    const winner = board => call({op: 'winner', board})
    const status = (board, lastMove = null) => call({op: 'status', board, lastMove})

    return {SIZE, EMPTY, BLACK, WHITE, other, at, rowOf, columnOf, inside, initialBoard, legalMoves, applyMove, lineLength, isWin, winner, status}
})
