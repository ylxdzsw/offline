(function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || (typeof require === 'function' ? require('../shared/wasm.js') : null)
    const limits = {
        easy: {time: 80, depth: 2},
        medium: {time: 420, depth: 6},
        hard: {time: 1300, depth: 9},
    }
    const randomSeed = () => {
        if (typeof crypto === 'object' && typeof crypto.getRandomValues === 'function') return crypto.getRandomValues(new Uint32Array(1))[0]
        return Math.floor(Math.random() * 0x100000000)
    }
    const search = (board, side, difficulty = 'medium', seed = randomSeed()) => {
        const started = typeof performance === 'object' ? performance.now() : Date.now()
        const result = wasm.dispatch('reversi', {op: 'search', board, side, difficulty, seed})
        return {...result, elapsed: Math.round((typeof performance === 'object' ? performance.now() : Date.now()) - started)}
    }
    const evaluate = (board, side) => wasm.dispatch('reversi', {op: 'evaluate', board, side})
    const api = {search, evaluate, limits}
    root.OfflineGames.ReversiAI = api
    if (typeof module === 'object' && module.exports) module.exports = api
    if (typeof document === 'undefined' && typeof root.postMessage === 'function') {
        root.addEventListener('message', event => {
            if (event.data?.__offlineWasmModule) return
            const {id, board, side, difficulty, seed} = event.data
            const result = search(board, side, difficulty, seed)
            root.postMessage({id, move: result.move, stats: {depth: result.depth, nodes: result.nodes, elapsed: result.elapsed}})
        })
    }
})(typeof self !== 'undefined' ? self : globalThis)
