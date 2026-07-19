(function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || (typeof require === 'function' ? require('../../app/wasm.js') : null)
    const limits = {
        easy: {time: 100, depth: 2, nodes: 1200, rootBand: 100},
        medium: {time: 500, depth: 4, nodes: 4500, rootBand: 40},
        hard: {time: 1500, depth: 6, nodes: 13000, rootBand: 14},
    }
    const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now()
    const hash = (board, side) => {
        let value = 2166136261
        const text = `${side}:${board.join(',')}`
        for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619)
        return value >>> 0
    }
    const search = (board, side, difficulty = 'medium', options = {}) => {
        if (typeof options === 'number') options = {seed: options}
        const limit = limits[difficulty] || limits.medium
        const started = now()
        const result = wasm.dispatch('xiangqi', {
            op: 'search', board, side,
            nodeBudget: options.nodeBudget ?? limit.nodes,
            maxDepth: options.maxDepth ?? limit.depth,
            rootBand: options.rootBand ?? limit.rootBand,
            seed: options.seed ?? hash(board, side),
        })
        return {...result, elapsed: Math.round(now() - started)}
    }

    const api = {search, limits}
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {XiangqiAI: api})
    if (typeof document === 'undefined' && typeof root.postMessage === 'function') root.onmessage = event => {
        const {id, board, side, difficulty, seed, options} = event.data
        const result = search(board, side, difficulty, {...options, seed: seed ?? options?.seed})
        root.postMessage({id, move: result.move, stats: {depth: result.depth, nodes: result.nodes, elapsed: result.elapsed}})
    }
    if (typeof module === 'object' && module.exports) module.exports = api
})(typeof self !== 'undefined' ? self : globalThis)
