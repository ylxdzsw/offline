(function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || (typeof require === 'function' ? require('../../app/wasm.js') : null)
    const limits = {
        easy: {nodes: 12000, depth: 2, branches: 3, rootBand: 180},
        medium: {nodes: 50000, depth: 2, branches: 8, rootBand: 35},
        hard: {nodes: 120000, depth: 2, branches: 16, rootBand: 0},
    }
    const now = () => typeof performance === 'object' ? performance.now() : Date.now()
    const hash = (position, side, dice) => {
        let value = 2166136261
        for (const count of [...position.board, ...position.bar, ...position.off, side, ...dice]) {
            value = Math.imul(value ^ (count & 0xff), 16777619)
        }
        return value >>> 0
    }
    const search = (position, side, dice, difficulty = 'medium', options = {}) => {
        const limit = limits[difficulty] || limits.medium
        const started = now()
        const result = wasm.dispatch('backgammon', {
            op: 'search',
            position,
            side,
            dice,
            seed: (Number(options.seed) >>> 0) ^ hash(position, side, dice),
            nodeBudget: options.nodeBudget ?? limit.nodes,
            maxDepth: options.maxDepth ?? limit.depth,
            branchLimit: options.branchLimit ?? limit.branches,
            rootBand: options.rootBand ?? limit.rootBand,
        })
        return {...result, elapsed: Math.round(now() - started)}
    }

    const api = {search, limits}
    if (typeof module === 'object' && module.exports) module.exports = api
    if (typeof root.addEventListener === 'function' && typeof root.postMessage === 'function') {
        root.addEventListener('message', event => {
            const {id, position, side, dice, difficulty, seed} = event.data
            try {
                root.postMessage({id, ...search(position, side, dice, difficulty, {seed})})
            } catch (error) {
                root.postMessage({id, error: error instanceof Error ? error.message : String(error)})
            }
        })
    }
})(typeof self !== 'undefined' ? self : globalThis)
