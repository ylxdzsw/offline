(function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || (typeof require === 'function' ? require('../../app/wasm.js') : null)
    const limits = {
        easy: {time: 70, simulations: 1000},
        medium: {time: 260, simulations: 6000},
        hard: {time: 720, simulations: 20000},
    }
    const randomSeed = () => {
        if (typeof crypto === 'object' && typeof crypto.getRandomValues === 'function') return crypto.getRandomValues(new Uint32Array(1))[0]
        return Math.floor(Math.random() * 0x100000000)
    }
    const search = (size, moves, difficulty = 'medium', seed = randomSeed()) => {
        const started = typeof performance === 'object' ? performance.now() : Date.now()
        const result = wasm.dispatch('go', {op: 'search', size, moves, difficulty, seed})
        const ended = typeof performance === 'object' ? performance.now() : Date.now()
        return {...result, elapsed: Math.round(ended - started)}
    }
    const api = {search, limits}
    root.OfflineGames.GoAI = api
    if (typeof module === 'object' && module.exports) module.exports = api
    if (typeof document === 'undefined' && typeof root.postMessage === 'function') {
        root.addEventListener('message', event => {
            if (event.data?.__offlineWasmModule) return
            const {id, size, moves, difficulty, seed} = event.data
            const result = search(size, moves, difficulty, seed)
            root.postMessage({
                id,
                move: result.move,
                stats: {
                    simulations: result.simulations,
                    nodes: result.nodes,
                    elapsed: result.elapsed,
                },
            })
        })
    }
})(typeof self !== 'undefined' ? self : globalThis)
