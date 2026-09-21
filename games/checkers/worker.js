(function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || (typeof require === 'function' ? require('../../app/wasm.js') : null)
    const limits = {
        easy: {time: 100, depth: 4, nodes: 18000, rootBand: 32},
        medium: {time: 450, depth: 9, nodes: 260000, rootBand: 18},
        hard: {time: 1400, depth: 15, nodes: 2000000, rootBand: 8},
    }
    const now = () => typeof performance === 'object' ? performance.now() : Date.now()
    const hash = (board, side) => {
        let value = 2166136261
        for (const piece of board) value = Math.imul(value ^ piece, 16777619)
        return Math.imul(value ^ side, 16777619) >>> 0
    }
    const search = (board, side, difficulty = 'medium', options = {}) => {
        if (typeof options === 'number') options = {seed: options}
        const limit = limits[difficulty] || limits.medium
        const started = now()
        const result = wasm.dispatch('checkers', {
            op: 'search', board, side,
            nodeBudget: options.nodeBudget ?? limit.nodes,
            maxDepth: options.maxDepth ?? limit.depth,
            rootBand: options.rootBand ?? limit.rootBand,
            seed: options.seed ?? hash(board, side),
            timeBudget: options.timeBudget ?? limit.time,
            halfmove: options.halfmove ?? 0,
            positions: options.positions ?? [],
        })
        return {...result, elapsed: Math.round(now() - started)}
    }

    const api = {search, limits}
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {CheckersAI: api})
    if (typeof module === 'object' && module.exports) module.exports = api
    if (typeof document === 'undefined' && typeof root.postMessage === 'function') {
        root.addEventListener('message', event => {
            if (event.data?.__offlineWasmModule) return
            const {id, board, side, difficulty, seed, options} = event.data
            const result = search(board, side, difficulty, {...options, seed: seed ?? options?.seed})
            root.postMessage({
                id,
                move: result.move,
                stats: {depth: result.depth, nodes: result.nodes, elapsed: result.elapsed},
            })
        })
    }
})(typeof self !== 'undefined' ? self : globalThis)
