(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Chess: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'chess'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_chess.wasm')))
    }
    const call = request => wasm.dispatch(MODULE, request)
    const SIZE = 8, WHITE = 'w', BLACK = 'b'
    const other = side => side === WHITE ? BLACK : WHITE
    const at = (row, column) => row * SIZE + column
    const rowOf = index => Math.floor(index / SIZE)
    const columnOf = index => index % SIZE
    const inside = (row, column) => row >= 0 && row < SIZE && column >= 0 && column < SIZE
    const sideOf = piece => piece?.[0] || null
    const typeOf = piece => piece?.[1] || null
    const initialState = () => call({op: 'initialState'})
    const initialBoard = () => initialState().board
    const isSquareAttacked = (state, index, by) => call({op: 'isSquareAttacked', state, index, side: by})
    const isInCheck = (state, side) => call({op: 'isInCheck', state, side})
    const pseudoMovesFor = (state, from) => call({op: 'pseudoMovesFor', state, from})
    const pseudoMoves = (state, side) => call({op: 'pseudoMoves', state, side})
    const legalMoves = (state, side = state.turn) => call({op: 'legalMoves', state, side})
    const applyMove = (state, move) => call({op: 'applyMove', state, move})
    const positionKey = state => {
        const effective = call({op: 'effectiveEnPassant', state})
        const enPassant = effective < 0 ? '-' : effective
        const castling = Object.entries(state.castling).filter(([, allowed]) => allowed).map(([key]) => key).join('')
        return `${state.turn}:${state.board.map(piece => piece || '--').join('')}:${castling}:${enPassant}`
    }
    const insufficientMaterial = board => call({op: 'insufficientMaterial', board})
    const status = (state, repetitions = {}) => call({op: 'status', state, repetitions: repetitions[positionKey(state)] || 0})

    return {SIZE, WHITE, BLACK, other, at, rowOf, columnOf, inside, sideOf, typeOf, initialBoard, initialState, isSquareAttacked, isInCheck, pseudoMovesFor, pseudoMoves, legalMoves, applyMove, positionKey, insufficientMaterial, status}
})
