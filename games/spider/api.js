(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Spider: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'spider'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_spider.wasm')))
    }
    const call = (op, args = {}) => wasm.dispatch(MODULE, {op, args})
    const SUITS = ['clubs', 'diamonds', 'hearts', 'spades']
    const SUIT_MARKS = ['♣', '♦', '♥', '♠']
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const suit = (card, suitCount) => suitCount === 1
        ? 3
        : suitCount === 2
            ? [3, 2][Math.floor(card / 13) % 2]
            : Math.floor(card / 13) % 4

    return {
        SUITS,
        SUIT_MARKS,
        RANKS,
        ping: () => call('ping'),
        newGame: (seed, suitCount = 1) => call('newGame', {seed, suitCount}),
        validate: game => call('validate', {game}),
        move: (game, source, destination) => call('move', {game, source, destination}),
        deal: game => call('deal', {game}),
        rank: card => card % 13,
        suit,
        color: (card, suitCount) => [1, 2].includes(suit(card, suitCount)) ? 'red' : 'black',
        movable: (cards, suitCount) => cards.length > 0 && cards.slice(1).every((card, index) =>
            card % 13 + 1 === cards[index] % 13
            && suit(card, suitCount) === suit(cards[index], suitCount)),
    }
})
