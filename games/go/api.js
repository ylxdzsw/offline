(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Go: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'go'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_go.wasm')))
    }
    const EMPTY = 0
    const BLACK = 1
    const WHITE = 2
    const KOMI = 7.5
    const DEFAULT_SIZE = 13
    const SIZES = [9, 13, 19]
    const call = request => wasm.dispatch(MODULE, request)
    const request = (op, size, moves, extra = {}) => call({op, size, moves, ...extra})
    const state = (size = DEFAULT_SIZE, moves = []) => request('state', size, moves)
    const checkMove = (size, moves, index) => request('checkMove', size, moves, {index})
    const play = (size, moves, index) => request('play', size, moves, {index})
    const pass = (size, moves) => request('pass', size, moves)
    const resign = (size, moves) => request('resign', size, moves)
    const other = side => side === BLACK ? WHITE : BLACK
    const at = (row, column, size = DEFAULT_SIZE) => row * size + column
    const rowOf = (index, size = DEFAULT_SIZE) => Math.floor(index / size)
    const columnOf = (index, size = DEFAULT_SIZE) => index % size

    return {
        EMPTY, BLACK, WHITE, KOMI, DEFAULT_SIZE, SIZES,
        other, at, rowOf, columnOf, state, checkMove, play, pass, resign,
    }
})
