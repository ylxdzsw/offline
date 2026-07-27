(function (root, factory) {
    const api = factory(root)
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Backgammon: api})
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const MODULE = 'backgammon'
    if (typeof module === 'object' && module.exports && !wasm.has(MODULE)) {
        const fs = require('node:fs'), path = require('node:path')
        wasm.installBytes(MODULE, fs.readFileSync(path.join(__dirname, '../target/wasm32-unknown-unknown/release/offline_backgammon.wasm')))
    }

    const HUMAN = 0
    const AI = 1
    const BAR = 24
    const OFF = 25
    const call = request => wasm.dispatch(MODULE, request)
    const other = side => side === HUMAN ? AI : HUMAN
    const initialPosition = () => call({op: 'initialPosition'})
    const legalTurns = (position, side, dice) => call({op: 'legalTurns', position, side, dice})
    const applyTurn = (position, side, dice, steps) => call({op: 'applyTurn', position, side, dice, steps})
    const outcome = position => call({op: 'outcome', position})
    const evaluate = (position, side) => call({op: 'evaluate', position, side})
    const clonePosition = position => ({
        board: position.board.slice(),
        bar: position.bar.slice(),
        off: position.off.slice(),
    })
    const sameTurn = (left, right) => Boolean(left && right)
        && left.steps?.length === right.steps?.length
        && left.steps.every((step, index) => step.from === right.steps[index].from && step.to === right.steps[index].to)
    const preview = (position, side, steps) => {
        const next = clonePosition(position)
        const sign = side === HUMAN ? 1 : -1
        for (const step of steps) {
            if (step.from === BAR) next.bar[side]--
            else next.board[step.from] -= sign
            if (step.to === OFF) {
                next.off[side]++
                continue
            }
            if (next.board[step.to] === -sign) {
                next.board[step.to] = 0
                next.bar[other(side)]++
            }
            next.board[step.to] += sign
        }
        return next
    }
    const countAt = (position, location, side) => {
        if (location === BAR) return position.bar[side]
        if (location === OFF) return position.off[side]
        const value = position.board[location]
        return side === HUMAN ? Math.max(0, value) : Math.max(0, -value)
    }

    return {
        HUMAN, AI, BAR, OFF, other, initialPosition, legalTurns, applyTurn,
        outcome, evaluate, clonePosition, sameTurn, preview, countAt,
    }
})
