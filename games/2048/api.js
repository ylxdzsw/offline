(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Game2048: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = '2048'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_2048.wasm')))
    }
    const call = (op, args = {}) => wasm.dispatch(MODULE, {op, args})
    const DIRECTIONS = ['up', 'down', 'left', 'right']

    return {
        SIZE: 4,
        CELLS: 16,
        TARGET: 2048,
        DIRECTIONS,
        ping: () => call('ping'),
        newGame: seed => call('newGame', {seed}),
        move: (board, direction, seed) => call('move', {board, direction, seed}),
        status: board => call('status', {board}),
    }
})
