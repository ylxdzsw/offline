(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Junqi: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'junqi'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_junqi.wasm')))
    }
    const call = (op, args = {}) => wasm.dispatch(MODULE, {op, args})
    const ROWS = 12, COLS = 5, RED = 'r', BLACK = 'b'
    const FLAG = 'F', MINE = 'M', BOMB = 'B', ENGINEER = '1'
    const TYPES = [FLAG, MINE, MINE, MINE, BOMB, BOMB, '9', '8', '7', '7', '6', '6', '5', '5', '4', '4', '3', '3', '3', '2', '2', '2', ENGINEER, ENGINEER, ENGINEER]
    const RANK = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9}
    const at = (row, column) => row * COLS + column
    const rowOf = index => Math.floor(index / COLS)
    const columnOf = index => index % COLS
    const inside = (row, column) => row >= 0 && row < ROWS && column >= 0 && column < COLS
    const other = side => side === RED ? BLACK : RED
    const CAMPS = new Set([[2,1],[2,3],[3,2],[4,1],[4,3],[7,1],[7,3],[8,2],[9,1],[9,3]].map(([row,column]) => at(row,column)))
    const HQ = new Set([[0,1],[0,3],[11,1],[11,3]].map(([row,column]) => at(row,column)))
    const RAIL = new Set()
    for (const row of [1,5,6,10]) for (let column=0;column<COLS;column++) RAIL.add(at(row,column))
    for (const column of [0,4]) for (let row=1;row<=10;row++) RAIL.add(at(row,column))
    const isCamp = index => CAMPS.has(index)
    const isHQ = index => HQ.has(index)
    const isRail = index => RAIL.has(index)
    const movable = value => Boolean(value && ![FLAG,MINE].includes(value.type))
    const seedFrom = random => typeof random === 'number' ? random >>> 0 : Math.floor(random() * 0x100000000) >>> 0

    return {
        ROWS, COLS, RED, BLACK, FLAG, MINE, BOMB, ENGINEER, TYPES, RANK, CAMPS, HQ, RAIL,
        at, rowOf, columnOf, inside, other, isCamp, isHQ, isRail, movable,
        deploymentSquares: side => call('deploymentSquares', {side}),
        initialBoard: (random = Math.random) => call('initialBoard', {seed: seedFrom(random)}),
        roadNeighbors: index => call('roadNeighbors', {index}),
        railwayNeighbors: index => call('railwayNeighbors', {index}),
        movesFor: (board, from) => call('movesFor', {board, from}),
        legalMoves: (board, side) => call('legalMoves', {board, side}),
        battle: (attacker, defender) => call('battle', {attacker, defender}),
        applyMove: (board, move) => call('applyMove', {board, move}),
        status: (board, turn) => call('status', {board, turn}),
        validateSetup: (board, side) => call('validateSetup', {board, side}),
    }
})
