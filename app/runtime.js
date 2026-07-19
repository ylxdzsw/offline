(function (root) {
    'use strict'

    const decode = encoded => {
        const binary = atob(encoded)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
        return new TextDecoder().decode(bytes)
    }

    const createWorker = elementId => {
        const payload = document.getElementById(elementId)
        if (!payload) throw new Error(`Missing worker payload: ${elementId}`)
        const source = payload.textContent.trim().split('.').filter(Boolean).map(decode).join('\n;\n')
        const wasmModule = payload.dataset?.wasmModule || payload.getAttribute?.('data-wasm-module')
        const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))
        let worker
        try {
            worker = new Worker(url)
        } finally {
            URL.revokeObjectURL(url)
        }
        if (wasmModule) {
            const module = root.OfflineGames?.wasm?.module(wasmModule)
            if (!module) {
                worker.terminate()
                throw new Error(`WASM module is not ready: ${wasmModule}`)
            }
            worker.postMessage({__offlineWasmModule: true, name: wasmModule, module})
        }
        return worker
    }

    const randomSeed = () => {
        if (typeof crypto === 'object' && typeof crypto.getRandomValues === 'function') return crypto.getRandomValues(new Uint32Array(1))[0]
        return Math.floor(Math.random() * 0x100000000) >>> 0
    }

    const moveSeed = (gameSeed, ply) => {
        let value = (Number(gameSeed) >>> 0) ^ Math.imul((Number(ply) + 1) >>> 0, 0x9e3779b1)
        value ^= value >>> 16
        value = Math.imul(value, 0x21f0aaad)
        value ^= value >>> 15
        value = Math.imul(value, 0x735a2d97)
        return (value ^ value >>> 15) >>> 0
    }

    const registerServiceWorker = () => {
        if (!('serviceWorker' in navigator) || location.protocol === 'file:') return
        navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration failed', error))
    }

    root.OfflineGames = Object.assign(root.OfflineGames || {}, {runtime: {createWorker, randomSeed, moveSeed, registerServiceWorker}})
    if (root.document) registerServiceWorker()
})(globalThis)
