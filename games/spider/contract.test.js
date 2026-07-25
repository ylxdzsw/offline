const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')

const nearlyWon = () => {
    const completed = Array.from({length: 7}, (_, group) =>
        Array.from({length: 13}, (_, index) => group * 13 + 12 - index))
    const tableau = Array.from({length: 10}, () => ({hidden: [], visible: []}))
    tableau[0].visible = Array.from({length: 12}, (_, index) => 7 * 13 + 12 - index)
    tableau[1].visible = [7 * 13]
    return {suitCount: 1, stock: [], completed, tableau, won: false}
}

test('deals are deterministic and use the ten-column digital layout', () => {
    const first = engine.newGame(42, 4)
    assert.deepEqual(first, engine.newGame(42, 4))
    assert.notDeepEqual(first, engine.newGame(43, 4))
    assert.equal(first.stock.length, 50)
    assert.deepEqual(first.tableau.map(pile => pile.hidden.length), [5, 5, 5, 5, 4, 4, 4, 4, 4, 4])
    assert(first.tableau.every(pile => pile.visible.length === 1))
    assert.equal(engine.validate(first), true)
})

test('one-, two-, and four-suit modes expose the expected suits', () => {
    assert.deepEqual(new Set(Array.from({length: 104}, (_, card) => engine.suit(card, 1))), new Set([3]))
    assert.deepEqual(new Set(Array.from({length: 104}, (_, card) => engine.suit(card, 2))), new Set([2, 3]))
    assert.deepEqual(new Set(Array.from({length: 104}, (_, card) => engine.suit(card, 4))), new Set([0, 1, 2, 3]))
})

test('a stock deal places one card on every column', () => {
    const game = engine.newGame(9, 2)
    const before = game.tableau.map(pile => pile.visible.length)
    const result = engine.deal(game)
    assert.equal(result.moved, true)
    assert.equal(result.game.stock.length, 40)
    assert.deepEqual(result.game.tableau.map(pile => pile.visible.length), before.map(length => length + 1))
    assert.equal(engine.validate(result.game), true)
})

test('stock cannot be dealt while a tableau column is empty', () => {
    const game = engine.newGame(11, 1)
    game.tableau[1].visible.push(game.tableau[0].visible.pop())
    game.tableau[1].hidden.push(...game.tableau[0].hidden.splice(0))
    assert.equal(engine.validate(game), true)
    const result = engine.deal(game)
    assert.equal(result.moved, false)
    assert.equal(result.reason, 'emptyColumn')
    assert.deepEqual(result.game, game)
})

test('only a same-suit descending sequence moves as a unit', () => {
    let fixture = null
    for (let seed = 0; seed < 2000 && !fixture; seed++) {
        const candidate = engine.newGame(seed, 4)
        for (let from = 0; from < 10 && !fixture; from++) {
            const card = candidate.tableau[from].visible[0]
            for (let to = 0; to < 10; to++) {
                if (from === to) continue
                const top = candidate.tableau[to].visible.at(-1)
                if (engine.rank(card) + 1 === engine.rank(top)) {
                    fixture = {candidate, from, to}
                    break
                }
            }
        }
    }
    assert(fixture)
    const result = engine.move(
        fixture.candidate,
        {column: fixture.from, card: 0},
        {column: fixture.to},
    )
    assert.equal(result.moved, true)
    assert.equal(result.flipped, true)
    assert.equal(engine.validate(result.game), true)

    let mixed = null
    for (let seed = 0; seed < 2000 && !mixed; seed++) {
        const candidate = engine.newGame(seed, 4)
        for (let first = 0; first < 10 && !mixed; first++) {
            const lower = candidate.tableau[first].visible[0]
            for (let second = 0; second < 10; second++) {
                if (first === second) continue
                const upper = candidate.tableau[second].visible[0]
                if (engine.rank(upper) + 1 !== engine.rank(lower)
                    || engine.suit(upper, 4) === engine.suit(lower, 4)) continue
                candidate.tableau[first].visible.push(upper)
                candidate.tableau[second].visible[0] = candidate.tableau[second].hidden.pop()
                mixed = {candidate, first}
                break
            }
        }
    }
    assert(mixed)
    assert.equal(engine.validate(mixed.candidate), true)
    const rejected = engine.move(mixed.candidate, {column: mixed.first, card: 0}, {column: 9})
    assert.equal(rejected.moved, false)
    assert.equal(rejected.reason, 'mixedRun')
})

test('a completed eighth run is collected automatically', () => {
    const game = nearlyWon()
    assert.equal(engine.validate(game), true)
    const result = engine.move(game, {column: 1, card: 0}, {column: 0})
    assert.equal(result.moved, true)
    assert.equal(result.completed, 1)
    assert.equal(result.game.completed.length, 8)
    assert.equal(result.game.won, true)
    assert.equal(engine.validate(result.game), true)
})

test('validation rejects duplicated or missing cards', () => {
    const game = engine.newGame(12, 4)
    game.stock[0] = game.stock[1]
    assert.equal(engine.validate(game), false)
})
