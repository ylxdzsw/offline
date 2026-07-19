(function (root) {
    'use strict'

    const prefix = 'offline-games:v1:'
    let available = true

    const read = game => {
        try {
            const raw = root.localStorage.getItem(prefix + game)
            if (!raw) return null
            const value = JSON.parse(raw)
            return value && value.schema === 1 && value.game === game ? value : null
        } catch {
            available = false
            return null
        }
    }
    const write = (game, value) => {
        try {
            root.localStorage.setItem(prefix + game, JSON.stringify(value))
            return true
        } catch {
            available = false
            return false
        }
    }
    const clear = game => {
        try {
            root.localStorage.removeItem(prefix + game)
        } catch {
            available = false
        }
    }
    const hasProgress = game => {
        const state = read(game)
        return Boolean(state && state.history?.length && !state.outcome)
    }

    root.OfflineGames = Object.assign(root.OfflineGames || {}, {
        storage: {read, write, clear, hasProgress, isAvailable: () => available},
    })
})(globalThis)
