(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Minesweeper: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'minesweeper'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_minesweeper.wasm')))
    }
    const call = (op, args = {}) => wasm.dispatch(MODULE, {op, args})

    return {
        MINE: 9,
        ping: () => call('ping'),
        config: difficulty => call('config', {difficulty}),
        newGame: (difficulty, seed) => call('newGame', {difficulty, seed}),
        validate: board => call('validate', {board}),
        reveal: (board, index) => call('reveal', {board, index}),
        toggleFlag: (board, index) => call('toggleFlag', {board, index}),
        chord: (board, index) => call('chord', {board, index}),
    }
})
