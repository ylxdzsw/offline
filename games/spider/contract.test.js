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

const clone = value => JSON.parse(JSON.stringify(value))

const dispatchError = (callback, message) => {
    let found = null
    try {
        callback()
    } catch (error) {
        found = error
    }
    assert(found)
    assert.equal(found.message, message)
    assert.equal(found.status, 2)
    assert.deepEqual(found.response, {error: {status: 2, message}})
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

test('the full u64 seed range keeps the Rust SplitMix64 shuffle', () => {
    assert.deepEqual(
        engine.newGame(1000000000000000100, 4),
        engine.newGame(1000000000000000100n, 4),
    )
    const game = engine.newGame(18446744073709551615n, 4)
    assert.deepEqual(game.stock, [
        86, 54, 8, 52, 18, 100, 40, 63, 38, 70, 95, 82, 27, 34, 69, 89, 75,
        16, 80, 78, 76, 5, 32, 17, 25, 15, 84, 11, 72, 31, 20, 35, 98, 92,
        30, 48, 93, 29, 66, 99, 62, 64, 103, 60, 1, 50, 67, 53, 14, 74,
    ])
    assert.deepEqual(game.tableau.map(pile => pile.hidden), [
        [56, 41, 102, 58, 88],
        [57, 73, 47, 49, 22],
        [61, 87, 91, 71, 39],
        [51, 33, 59, 101, 12],
        [6, 85, 2, 77],
        [55, 19, 65, 23],
        [45, 79, 81, 4],
        [97, 96, 24, 28],
        [36, 13, 44, 83],
        [42, 46, 94, 21],
    ])
    assert.deepEqual(game.tableau.map(pile => pile.visible), [
        [10], [7], [0], [90], [43], [9], [3], [37], [26], [68],
    ])
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

test('completion exposes the card behind a collected run', () => {
    const completed = Array.from({length: 6}, (_, group) =>
        Array.from({length: 13}, (_, index) => group * 13 + 12 - index))
    const tableau = Array.from({length: 10}, () => ({hidden: [], visible: []}))
    tableau[0].hidden = Array.from({length: 13}, (_, index) => 7 * 13 + index)
    tableau[0].visible = Array.from({length: 12}, (_, index) => 6 * 13 + 12 - index)
    tableau[1].visible = [6 * 13]
    const game = {suitCount: 1, stock: [], completed, tableau, won: false}
    assert.equal(engine.validate(game), true)

    const result = engine.move(game, {column: 1, card: 0}, {column: 0})
    assert.equal(result.moved, true)
    assert.equal(result.completed, 1)
    assert.equal(result.flipped, true)
    assert.deepEqual(result.game.tableau[0].visible, [103])
    assert.equal(result.game.completed.length, 7)
    assert.equal(result.game.won, false)
    assert.equal(engine.validate(result.game), true)
})

test('actions return independent states and never mutate their input', () => {
    const game = engine.newGame(91, 2)
    game.extra = 'discarded by the state schema'
    const before = clone(game)
    const dealt = engine.deal(game)
    assert.deepEqual(game, before)
    assert.notStrictEqual(dealt.game, game)
    assert.notStrictEqual(dealt.game.stock, game.stock)
    assert.notStrictEqual(dealt.game.tableau[0], game.tableau[0])
    assert.equal('extra' in dealt.game, false)

    const blocked = engine.move(game, {column: 0, card: 99}, {column: 0})
    assert.equal(blocked.moved, false)
    assert.equal(blocked.reason, 'invalidMove')
    assert.deepEqual(game, before)
    assert.notStrictEqual(blocked.game, game)
})

test('validation distinguishes malformed input from invalid game states', () => {
    const wrongSuit = engine.newGame(3, 1)
    wrongSuit.suitCount = 3
    assert.equal(engine.validate(wrongSuit), false)

    const wrongColumns = engine.newGame(3, 1)
    wrongColumns.tableau.pop()
    assert.equal(engine.validate(wrongColumns), false)

    const hiddenTop = engine.newGame(3, 1)
    hiddenTop.tableau[1].visible.push(hiddenTop.tableau[0].visible.pop())
    assert.equal(engine.validate(hiddenTop), false)

    const wrongWinner = engine.newGame(3, 1)
    wrongWinner.won = true
    assert.equal(engine.validate(wrongWinner), false)

    const outOfRange = engine.newGame(3, 1)
    outOfRange.stock[0] = 104
    assert.equal(engine.validate(outOfRange), false)

    dispatchError(() => engine.validate({}), 'game.suitCount must be an unsigned integer')
})

test('domain failures keep the synchronous Wasm error contract', () => {
    dispatchError(() => engine.newGame(1, 3), 'suit count must be 1, 2, or 4')
    dispatchError(() => engine.newGame(-1, 1), 'seed must be an unsigned 64-bit integer')

    const game = engine.newGame(17, 4)
    dispatchError(
        () => engine.move(game, {column: 10, card: 0}, {column: 0}),
        'tableau column is out of range',
    )
    dispatchError(
        () => engine.move(game, {column: 0, card: 1}, {column: 1}),
        'tableau card is out of range',
    )

    const duplicated = engine.newGame(17, 4)
    duplicated.stock[0] = duplicated.stock[1]
    dispatchError(
        () => engine.deal(duplicated),
        `card ${duplicated.stock[1]} appears more than once`,
    )
})
