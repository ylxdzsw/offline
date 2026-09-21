(function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || (typeof require === 'function' ? require('../../app/wasm.js') : null)
    const limits = {
        easy: {time: 120, depth: 3, nodes: 18000, rootBand: 35},
        medium: {time: 500, depth: 6, nodes: 180000, rootBand: 18},
        hard: {time: 1400, depth: 9, nodes: 900000, rootBand: 12},
    }
    const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now()
    const hash = state => {
        let value = 2166136261
        const text = `${state.turn}:${state.board.join(',')}:${state.halfmove}`
        for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619)
        return value >>> 0
    }
    const search = (state, difficulty = 'medium', options = {}) => {
        if (typeof options === 'number') options = {seed: options}
        const limit = limits[difficulty] || limits.medium
        const started = now()
        const result = wasm.dispatch('chess', {
            op: 'search', state,
            nodeBudget: options.nodeBudget ?? limit.nodes,
            maxDepth: options.maxDepth ?? limit.depth,
            rootBand: options.rootBand ?? limit.rootBand,
            timeBudget: options.timeBudget ?? (options.nodeBudget == null ? limit.time : 0),
            positions: options.positions ?? [],
            seed: options.seed ?? hash(state),
        })
        return {...result, elapsed: Math.round(now() - started)}
    }

    const api = {search, limits}
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {ChessAI: api})
    if (typeof document === 'undefined' && typeof root.postMessage === 'function') root.onmessage = event => {
        const {id, state, difficulty, seed, options, positions} = event.data
        const result = search(state, difficulty, {...options, positions: positions ?? options?.positions, seed: seed ?? options?.seed})
        root.postMessage({id, move: result.move, stats: {depth: result.depth, nodes: result.nodes, elapsed: result.elapsed}})
    }
    if (typeof module === 'object' && module.exports) module.exports = api
})(typeof self !== 'undefined' ? self : globalThis)
