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
        const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))
        try {
            return new Worker(url)
        } finally {
            URL.revokeObjectURL(url)
        }
    }

    const registerServiceWorker = () => {
        if (!('serviceWorker' in navigator) || location.protocol === 'file:') return
        navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration failed', error))
    }

    root.OfflineGames = Object.assign(root.OfflineGames || {}, {runtime: {createWorker, registerServiceWorker}})
    if (root.document) registerServiceWorker()
})(globalThis)
