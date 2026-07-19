const test = require('node:test')
const assert = require('node:assert/strict')

const withThemeEnv = run => {
    const previous = {
        document: globalThis.document,
        localStorage: globalThis.localStorage,
        matchMedia: globalThis.matchMedia,
        OfflineGames: globalThis.OfflineGames,
    }
    const store = new Map()
    let mediaMatches = false
    const mediaListeners = new Set()
    const documentElement = { dataset: {}, style: {} }
    const meta = { content: '#f7f6f2', setAttribute(name, value) { if (name === 'content') this.content = value }, getAttribute(name) { return name === 'content' ? this.content : null } }
    try {
        globalThis.localStorage = {
            getItem: key => store.has(key) ? store.get(key) : null,
            setItem: (key, value) => store.set(key, String(value)),
            removeItem: key => store.delete(key),
        }
        globalThis.matchMedia = query => ({
            get matches() {
                return query.includes('dark') ? mediaMatches : !mediaMatches
            },
            media: query,
            addEventListener: (_type, listener) => mediaListeners.add(listener),
            removeEventListener: (_type, listener) => mediaListeners.delete(listener),
            addListener: listener => mediaListeners.add(listener),
            removeListener: listener => mediaListeners.delete(listener),
            dispatchEvent() { return true },
        })
        globalThis.document = {
            documentElement,
            head: { append() {} },
            querySelector: selector => selector === 'meta[name="theme-color"]' ? meta : null,
            createElement: () => meta,
        }
        delete require.cache[require.resolve('./theme.js')]
        delete globalThis.OfflineGames
        require('./theme.js')
        return run({
            theme: globalThis.OfflineGames.theme,
            documentElement,
            meta,
            setSystemDark(value) {
                mediaMatches = value
                for (const listener of mediaListeners) listener({ matches: value })
            },
        })
    } finally {
        globalThis.document = previous.document
        globalThis.localStorage = previous.localStorage
        globalThis.matchMedia = previous.matchMedia
        globalThis.OfflineGames = previous.OfflineGames
        delete require.cache[require.resolve('./theme.js')]
    }
}

test('theme defaults to system and follows prefers-color-scheme', () => {
    withThemeEnv(({ theme, documentElement, setSystemDark }) => {
        assert.equal(theme.getPreference(), 'system')
        assert.equal(theme.resolved(), 'light')
        assert.equal(documentElement.dataset.theme, 'light')
        setSystemDark(true)
        assert.equal(theme.resolved(), 'dark')
        assert.equal(documentElement.dataset.theme, 'dark')
    })
})

test('theme preference overrides system and persists', () => {
    withThemeEnv(({ theme, documentElement, meta, setSystemDark }) => {
        theme.setPreference('dark')
        assert.equal(theme.getPreference(), 'dark')
        assert.equal(theme.resolved(), 'dark')
        assert.equal(documentElement.dataset.theme, 'dark')
        assert.equal(meta.content, '#171816')
        setSystemDark(false)
        assert.equal(theme.resolved(), 'dark')
        theme.setPreference('light')
        assert.equal(documentElement.dataset.theme, 'light')
        assert.equal(meta.content, '#f7f6f2')
        assert.equal(globalThis.localStorage.getItem('offline-games:v1:theme'), 'light')
    })
})
