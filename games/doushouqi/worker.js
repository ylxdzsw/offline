(function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || (typeof require === 'function' ? require('../../app/wasm.js') : null)
    const limits = {
        easy:   {time: 100,  depth: 4, nodes: 20_000, rootBand: 45},
        medium: {time: 450,  depth: 9, nodes: 300_000, rootBand: 24},
        hard:   {time: 1400, depth: 13, nodes: 2_000_000, rootBand: 12},
    }
    const now = () => typeof performance === 'object' ? performance.now() : Date.now()
    const hash = (board, side) => {
        let v = 2166136261
        for (const p of board) v = Math.imul(v ^ p, 16777619)
        return Math.imul(v ^ side, 16777619) >>> 0
    }
    const search = (board, side, difficulty = 'medium', options = {}) => {
        if (typeof options === 'number') options = {seed: options}
        const limit = limits[difficulty] || limits.medium
        const started = now()
        const result = wasm.dispatch('doushouqi', {
            op: 'search', board, side,
            nodeBudget: options.nodeBudget ?? limit.nodes,
            maxDepth:   options.maxDepth ?? limit.depth,
            rootBand:   options.rootBand ?? limit.rootBand,
            seed:       options.seed ?? hash(board, side),
            timeBudget: options.timeBudget ?? limit.time,
            positions:  options.positions ?? [],
        })
        return {...result, elapsed: Math.round(now() - started)}
    }

    const api = {search, limits}
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {DoushouqiAI: api})
    if (typeof module === 'object' && module.exports) module.exports = api
    if (typeof document === 'undefined' && typeof root.postMessage === 'function') {
        root.addEventListener('message', event => {
            if (event.data?.__offlineWasmModule) return
            const {id, board, side, difficulty, options} = event.data
            const result = search(board, side, difficulty, options || {})
            root.postMessage({
                id,
                move: result.move,
                stats: {depth: result.depth, nodes: result.nodes, elapsed: result.elapsed},
            })
        })
    }
})(typeof self !== 'undefined' ? self : globalThis)
