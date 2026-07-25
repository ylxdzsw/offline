const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')

test('deals are deterministic and use the classic seven-column layout', () => {
    const first = engine.newGame(42, 1)
    assert.deepEqual(first, engine.newGame(42, 1))
    assert.notDeepEqual(first, engine.newGame(43, 1))
    assert.equal(first.stock.length, 24)
    assert.equal(first.waste.length, 0)
    assert.deepEqual(first.foundations, [[], [], [], []])
    assert.deepEqual(first.tableau.map(pile => pile.hidden.length), [0, 1, 2, 3, 4, 5, 6])
    assert(first.tableau.every(pile => pile.visible.length === 1))
    assert.equal(engine.validate(first), true)
})

test('draw one exposes cards and recycling preserves their order', () => {
    let game = engine.newGame(7, 1)
    const original = [...game.stock]
    game = engine.draw(game).game
    assert.equal(game.stock.length, 23)
    assert.deepEqual(game.waste, [original.at(-1)])
    while (game.stock.length) game = engine.draw(game).game
    assert.equal(game.waste.length, 24)
    game = engine.draw(game).game
    assert.equal(game.waste.length, 0)
    assert.deepEqual(game.stock, original)
})

test('draw three exposes groups of three and the final short group', () => {
    let game = engine.newGame(9, 3)
    game = engine.draw(game).game
    assert.equal(game.stock.length, 21)
    assert.equal(game.waste.length, 3)
    for (let index = 0; index < 7; index++) game = engine.draw(game).game
    assert.equal(game.stock.length, 0)
    assert.equal(game.waste.length, 24)
})

test('a legal tableau move transfers its run and flips the source', () => {
    let found = null
    for (let seed = 0; seed < 500 && !found; seed++) {
        const game = engine.newGame(seed, 1)
        for (let from = 1; from < 7 && !found; from++) {
            const card = game.tableau[from].visible[0]
            for (let to = 0; to < 7; to++) {
                if (from === to) continue
                const top = game.tableau[to].visible.at(-1)
                if (engine.rank(card) + 1 === engine.rank(top) && engine.color(card) !== engine.color(top)) {
                    found = {game, from, to}
                    break
                }
            }
        }
    }
    assert(found)
    const result = engine.move(
        found.game,
        {kind: 'tableau', column: found.from, card: 0},
        {kind: 'tableau', column: found.to},
    )
    assert.equal(result.moved, true)
    assert.equal(result.flipped, true)
    assert.equal(result.game.tableau[found.from].hidden.length, found.from - 1)
    assert.equal(result.game.tableau[found.from].visible.length, 1)
    assert.equal(engine.validate(result.game), true)
})

test('aces move to their suit foundation and illegal foundation moves are unchanged', () => {
    let game = engine.newGame(71, 1)
    let result
    for (let draws = 0; draws < 24; draws++) {
        game = engine.draw(game).game
        if (engine.rank(game.waste.at(-1)) === 0) {
            result = engine.move(game, {kind: 'waste'}, {kind: 'foundation', suit: engine.suit(game.waste.at(-1))})
            break
        }
    }
    assert(result?.moved)
    assert.equal(result.game.foundations.flat().length, 1)
    assert.equal(engine.validate(result.game), true)

    const next = result.game.waste.at(-1)
    const wrongSuit = next == null ? 0 : (engine.suit(next) + 1) % 4
    const rejected = engine.move(result.game, {kind: 'waste'}, {kind: 'foundation', suit: wrongSuit})
    assert.equal(rejected.moved, false)
    assert.deepEqual(rejected.game, result.game)
})

test('validation rejects duplicated or missing cards', () => {
    const game = engine.newGame(11, 1)
    game.stock[0] = game.stock[1]
    assert.equal(engine.validate(game), false)
})
