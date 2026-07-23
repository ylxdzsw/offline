(function (root) {
    'use strict'

    const STORAGE_KEY = 'offline-games:v1:theme'
    const PREFERENCES = ['system', 'light', 'dark']
    const media = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null
    const listeners = new Set()

    const readPreference = () => {
        try {
            const value = root.localStorage?.getItem(STORAGE_KEY)
            return PREFERENCES.includes(value) ? value : 'system'
        } catch {
            return 'system'
        }
    }

    let preference = readPreference()

    const systemTheme = () => (media && media.matches ? 'dark' : 'light')
    const resolved = () => (preference === 'system' ? systemTheme() : preference)

    const paintMeta = theme => {
        const document = root.document
        if (!document) return
        let meta = document.querySelector('meta[name="theme-color"]')
        if (!meta) {
            meta = document.createElement('meta')
            meta.setAttribute('name', 'theme-color')
            document.head?.append(meta)
        }
        meta.setAttribute('content', theme === 'dark' ? '#1c1c1e' : '#f5f4f2')
    }

    const apply = () => {
        const theme = resolved()
        const document = root.document
        if (document?.documentElement) {
            document.documentElement.dataset.theme = theme
            document.documentElement.style.colorScheme = theme
        }
        paintMeta(theme)
        for (const listener of listeners) listener({preference, theme})
    }

    const setPreference = next => {
        if (!PREFERENCES.includes(next)) return
        preference = next
        try {
            root.localStorage?.setItem(STORAGE_KEY, next)
        } catch {
            /* ignore storage failures; preference still applies for this session */
        }
        apply()
    }

    const subscribe = listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }

    if (media) {
        const onChange = () => {
            if (preference === 'system') apply()
        }
        if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange)
        else if (typeof media.addListener === 'function') media.addListener(onChange)
    }

    apply()

    root.OfflineGames = Object.assign(root.OfflineGames || {}, {
        theme: {
            preferences: PREFERENCES.slice(),
            getPreference: () => preference,
            resolved,
            setPreference,
            subscribe,
            apply,
        },
    })
})(globalThis)
