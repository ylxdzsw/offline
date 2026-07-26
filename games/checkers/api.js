(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Checkers: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'checkers'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_checkers.wasm')))
    }

    const SIZE = 8
    const EMPTY = 0
    const BLACK = 1
    const RED = 2
    const BLACK_MAN = 1
    const BLACK_KING = 2
    const RED_MAN = 3
    const RED_KING = 4
    const call = request => wasm.dispatch(MODULE, request)
    const other = side => side === BLACK ? RED : BLACK
    const at = (row, column) => row * SIZE + column
    const rowOf = index => Math.floor(index / SIZE)
    const columnOf = index => index % SIZE
    const playable = index => (rowOf(index) + columnOf(index)) % 2 === 1
    const sideOf = piece => piece === BLACK_MAN || piece === BLACK_KING ? BLACK
        : piece === RED_MAN || piece === RED_KING ? RED : EMPTY
    const isKing = piece => piece === BLACK_KING || piece === RED_KING
    const king = side => side === BLACK ? BLACK_KING : RED_KING
    const initialBoard = () => call({op: 'initialBoard'})
    const legalMoves = (board, side) => call({op: 'legalMoves', board, side})
    const applyMove = (board, move, side) => call({op: 'applyMove', board, move, side})
    const previewMove = (board, move, steps = move.path.length) => {
        const next = board.slice()
        const piece = next[move.from]
        let current = move.from
        for (let step = 0; step < Math.min(steps, move.path.length); step++) {
            next[current] = EMPTY
            if (move.captures[step] != null) next[move.captures[step]] = EMPTY
            current = move.path[step]
            next[current] = piece
        }
        if (steps >= move.path.length && move.promotes) next[current] = king(sideOf(piece))
        return next
    }
    const positionKey = (board, side) => call({op: 'positionKey', board, side})
    const count = (board, side) => board.reduce((total, piece) => total + Number(sideOf(piece) === side), 0)
    const kingCount = (board, side) => board.reduce((total, piece) => total + Number(sideOf(piece) === side && isKing(piece)), 0)
    const status = (board, turn, halfmove = 0, keys = []) => {
        const key = positionKey(board, turn)
        const repetitions = keys.reduce((total, candidate) => total + Number(candidate === key), 0)
        return call({op: 'status', board, turn, halfmove, repetitions})
    }

    return {
        SIZE, EMPTY, BLACK, RED, BLACK_MAN, BLACK_KING, RED_MAN, RED_KING,
        other, at, rowOf, columnOf, playable, sideOf, isKing, king,
        initialBoard, legalMoves, applyMove, previewMove, positionKey, count, kingCount, status,
    }
})
