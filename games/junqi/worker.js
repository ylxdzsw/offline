(function (root) {
    'use strict'
    const wasm = root.OfflineGames?.wasm || require('../../app/wasm.js')
    const seed = () => {
        if (typeof crypto === 'object' && crypto.getRandomValues) {
            const values = crypto.getRandomValues(new Uint32Array(2))
            return values[0] * 0x100000000 + values[1]
        }
        return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
    }
    const choose = request => wasm.dispatch('junqi', {
        op: 'aiChoose',
        args: {...request, seed: request.seed ?? seed()},
    })
    const api = {choose}
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {JunqiAI: api})
    if (typeof module === 'object' && module.exports) module.exports = api
    if (typeof root.postMessage === 'function' && typeof root.document === 'undefined') {
        root.addEventListener('message', event => {
            if (event.data?.__offlineWasmModule) return
            root.postMessage({id: event.data.id, move: choose(event.data)})
        })
    }
})(typeof self !== 'undefined' ? self : globalThis)
