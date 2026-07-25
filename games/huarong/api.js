(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Huarong: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'huarong'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_huarong.wasm')))
    }
    const call = (op, args = {}) => wasm.dispatch(MODULE, {op, args})
    const WIDTH = 4, HEIGHT = 5, CELLS = 20, PIECES = 10, CAO_CAO = 0, GOAL = 13
    const SIZES = [[2,2], [2,1], [1,2], [1,2], [1,2], [1,2], [1,1], [1,1], [1,1], [1,1]]
    const rowOf = index => Math.floor(index / WIDTH)
    const columnOf = index => index % WIDTH

    return {
        WIDTH, HEIGHT, CELLS, PIECES, CAO_CAO, GOAL, SIZES, rowOf, columnOf,
        ping: () => call('ping'),
        layouts: () => call('layouts'),
        layout: id => call('layout', {id}),
        validate: positions => call('validate', {positions}),
        legalMoves: (positions, piece) => call('legalMoves', {positions, piece}),
        applyMove: (positions, piece, to) => call('applyMove', {positions, piece, to}),
        isSolved: positions => call('isSolved', {positions}),
        hint: positions => call('hint', {positions}),
    }
})
