(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Sudoku: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'sudoku'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_sudoku.wasm')))
    }
    const call = (op, args = {}) => wasm.dispatch(MODULE, {op, args})
    const SIZE = 9, BOX = 3, CELLS = 81, DIGITS = [1,2,3,4,5,6,7,8,9]
    const CLUES = {easy: 40, medium: 32, hard: 27}
    const rowOf = index => Math.floor(index / SIZE)
    const columnOf = index => index % SIZE
    const boxOf = index => Math.floor(rowOf(index) / BOX) * BOX + Math.floor(columnOf(index) / BOX)
    const seedFrom = random => typeof random === 'number' ? random >>> 0 : Math.floor(random() * 0x100000000) >>> 0

    return {
        SIZE, BOX, CELLS, DIGITS, CLUES, rowOf, columnOf, boxOf,
        peers: index => call('peers', {index}),
        candidates: (board, index) => call('candidates', {board, index}),
        conflicts: (board, index) => call('conflicts', {board, index}),
        isValid: board => call('isValid', {board}),
        solve: (board, limit = 1) => call('solve', {board, limit}),
        completeBoard: (random = Math.random) => call('completeBoard', {seed: seedFrom(random)}),
        generate: (difficulty = 'medium', random = Math.random) => call('generate', {difficulty, seed: seedFrom(random)}),
        isComplete: (board, solution) => call('isComplete', {board, solution}),
    }
})
