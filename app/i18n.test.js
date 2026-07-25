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

function loadI18n(locale) {
    const location = {
        href: `https://offline.example/index.html?lang=${locale}`,
        search: `?lang=${locale}`,
    }
    const context = vm.createContext({
        URL,
        URLSearchParams,
        location,
        navigator: {languages: [locale]},
    })
    context.globalThis = context
    vm.runInContext(source, context)
    return context.OfflineGames.i18n
}

test('every game has a complete guide in both languages', () => {
    for (const locale of ['en', 'zh']) {
        const i18n = loadI18n(locale)
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
    const en = loadI18n('en')
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
