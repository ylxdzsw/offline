(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Solitaire: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'solitaire'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_solitaire.wasm')))
    }
    const call = (op, args = {}) => wasm.dispatch(MODULE, {op, args})
    const SUITS = ['clubs', 'diamonds', 'hearts', 'spades']
    const SUIT_MARKS = ['♣', '♦', '♥', '♠']
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

    return {
        SUITS,
        SUIT_MARKS,
        RANKS,
        ping: () => call('ping'),
        newGame: (seed, drawCount = 1) => call('newGame', {seed, drawCount}),
        validate: game => call('validate', {game}),
        draw: game => call('draw', {game}),
        move: (game, source, destination) => call('move', {game, source, destination}),
        rank: card => card % 13,
        suit: card => Math.floor(card / 13),
        color: card => [1, 2].includes(Math.floor(card / 13)) ? 'red' : 'black',
    }
})
