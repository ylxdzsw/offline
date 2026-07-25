(function (root) {
    'use strict'

    const wasm = root.OfflineGames?.wasm || (typeof require === 'function' ? require('../../app/wasm.js') : null)
    const hint = positions => {
        const started = typeof performance === 'object' ? performance.now() : Date.now()
        const result = wasm.dispatch('huarong', {op: 'hint', args: {positions}})
        return {...result, elapsed: Math.round((typeof performance === 'object' ? performance.now() : Date.now()) - started)}
    }
    const api = {hint}
    root.OfflineGames.HuarongSearch = api
    if (typeof module === 'object' && module.exports) module.exports = api
    if (typeof document === 'undefined' && typeof root.postMessage === 'function') {
        root.addEventListener('message', event => {
            if (event.data?.__offlineWasmModule) return
            const {id, positions} = event.data
            root.postMessage({id, ...hint(positions)})
        })
    }
})(typeof self !== 'undefined' ? self : globalThis)
