const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const gamesRoot = path.join(__dirname, '../games')
const games = fs.readdirSync(gamesRoot, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(gamesRoot, entry.name, 'Cargo.toml')))
    .map(entry => entry.name)
const source = fs.readFileSync(path.join(__dirname, 'i18n.js'), 'utf8')

function loadI18n({preference, languages = ['en'], storageError = false} = {}) {
    const store = new Map()
    if (preference) store.set('offline-games:v1:language', preference)
    let reloads = 0
    const location = {
        reload() { reloads++ },
    }
    const documentElement = {lang: 'en'}
    const localStorage = {
        getItem(key) {
            if (storageError) throw new Error('storage unavailable')
            return store.has(key) ? store.get(key) : null
        },
        setItem(key, value) {
            if (storageError) throw new Error('storage unavailable')
            store.set(key, String(value))
        },
    }
    const context = vm.createContext({
        document: {documentElement},
        localStorage,
        location,
        navigator: {languages},
    })
    context.globalThis = context
    vm.runInContext(source, context)
    return {
        i18n: context.OfflineGames.i18n,
        documentElement,
        store,
        reloads: () => reloads,
    }
}

test('every game has a complete guide in both languages', () => {
    for (const locale of ['en', 'zh']) {
        const {i18n} = loadI18n({preference: locale})
        assert.equal(i18n.locale, locale)
        for (const id of games) {
            const guide = i18n.guide(id)
            assert.ok(guide, `${locale}/${id} guide`)
            assert.equal(guide.quick.length, 3, `${locale}/${id} quick start`)
            assert.ok(guide.visual.length > 20, `${locale}/${id} illustration caption`)
            assert.ok(guide.sections.length >= 3, `${locale}/${id} rule groups`)
            assert.ok(
                guide.sections.reduce((count, group) => count + group.items.length, 0) >= 8,
                `${locale}/${id} rule coverage`,
            )
            assert.ok(guide.sections.every(group =>
                group.title && group.items.length >= 2 && group.items.every(Boolean)),
            `${locale}/${id} rule group content`)
            assert.ok(guide.tips.length >= 3, `${locale}/${id} beginner tips`)
        }
    }
})

test('variant-specific rules are documented rather than implied', () => {
    const {i18n: en} = loadI18n({preference: 'en'})
    const allRules = id => en.guide(id).sections.flatMap(section => section.items).join(' ')

    assert.match(allRules('xiangqi'), /horse leg/i)
    assert.match(allRules('xiangqi'), /third occurrence/i)
    assert.match(allRules('wuziqi'), /freestyle/i)
    assert.match(allRules('sudoku'), /one solution/i)
    assert.match(allRules('2048'), /2–2–2–2/)
    assert.match(allRules('junqi'), /opens in placement/i)
    assert.match(allRules('junqi'), /Flag must stay in a headquarters/i)
    assert.match(allRules('junqi'), /Engineer defeats a Mine/i)
    assert.match(allRules('chess'), /En passant/)
    assert.match(allRules('chess'), /insufficient mating material/i)
    assert.match(allRules('reversi'), /passes automatically/i)
    assert.match(allRules('minesweeper'), /There is no Undo/i)
    assert.match(allRules('minesweeper'), /may sometimes require a guess/i)
    assert.match(allRules('spider'), /same suit/i)
    assert.match(allRules('spider'), /empty column/i)
})

test('saved language overrides browser detection', () => {
    const {i18n, documentElement} = loadI18n({preference: 'en', languages: ['zh-CN']})
    assert.equal(i18n.locale, 'en')
    assert.equal(documentElement.lang, 'en')
})

test('browser language is used when there is no saved preference', () => {
    const {i18n, documentElement} = loadI18n({languages: ['zh-HK', 'en']})
    assert.equal(i18n.locale, 'zh')
    assert.equal(documentElement.lang, 'zh-CN')
})

test('changing language persists the preference and reloads without a URL rewrite', () => {
    const {i18n, store, reloads} = loadI18n({languages: ['en']})
    assert.equal(i18n.setLocale('en'), true)
    assert.equal(store.get('offline-games:v1:language'), 'en')
    assert.equal(reloads(), 0)
    assert.equal(i18n.setLocale('zh'), true)
    assert.equal(store.get('offline-games:v1:language'), 'zh')
    assert.equal(reloads(), 1)
    assert.equal(i18n.setLocale('fr'), false)
    assert.equal(reloads(), 1)
})

test('storage failures retain the detected language', () => {
    const {i18n, reloads} = loadI18n({languages: ['zh-CN'], storageError: true})
    assert.equal(i18n.locale, 'zh')
    assert.equal(i18n.setLocale('en'), false)
    assert.equal(reloads(), 0)
})
