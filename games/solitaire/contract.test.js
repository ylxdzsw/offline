const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('./api.js')

test('deals are deterministic and use the classic seven-column layout', () => {
    const first = engine.newGame(42, 1)
    assert.deepEqual(first, engine.newGame(42, 1))
    assert.notDeepEqual(first, engine.newGame(43, 1))
    assert.deepEqual(first.stock, [
        6, 28, 12, 39, 40, 0, 26, 25, 22, 4, 46, 36,
        27, 42, 31, 17, 14, 43, 18, 13, 19, 1, 33, 7,
    ])
    assert.deepEqual(first.tableau, [
        {hidden: [], visible: [9]},
        {hidden: [10], visible: [23]},
        {hidden: [8, 21], visible: [47]},
        {hidden: [37, 50, 24], visible: [44]},
        {hidden: [34, 5, 20, 3], visible: [15]},
        {hidden: [2, 30, 41, 49, 29], visible: [51]},
        {hidden: [11, 38, 45, 35, 48, 32], visible: [16]},
    ])
    assert.equal(first.stock.length, 24)
    assert.equal(first.waste.length, 0)
    assert.deepEqual(first.foundations, [[], [], [], []])
    assert.deepEqual(first.tableau.map(pile => pile.hidden.length), [0, 1, 2, 3, 4, 5, 6])
    assert(first.tableau.every(pile => pile.visible.length === 1))
    assert.equal(engine.validate(first), true)
})

test('the direct API retains the Wasm contract and card helpers', () => {
    assert.deepEqual(engine.ping(), {abi: 1, game: 'solitaire'})
    assert.deepEqual(engine.SUITS, ['clubs', 'diamonds', 'hearts', 'spades'])
    assert.equal(engine.rank(0), 0)
    assert.equal(engine.rank(51), 12)
    assert.equal(engine.suit(39), 3)
    assert.equal(engine.color(13), 'red')
    assert.equal(engine.color(39), 'black')
})

test('draw one exposes cards and recycling preserves their order', () => {
    let game = engine.newGame(7, 1)
    const input = structuredClone(game)
    const original = [...game.stock]
    const result = engine.draw(game)
    assert.deepEqual(game, input)
    game = result.game
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
    const original = structuredClone(found.game)
    const result = engine.move(
        found.game,
        {kind: 'tableau', column: found.from, card: 0},
        {kind: 'tableau', column: found.to},
    )
    assert.deepEqual(found.game, original)
    assert.equal(result.moved, true)
    assert.equal(result.flipped, true)
    assert.equal(result.game.tableau[found.from].hidden.length, found.from - 1)
    assert.equal(result.game.tableau[found.from].visible.length, 1)
    assert.equal(engine.validate(result.game), true)
})

test('only kings can enter empty tableau columns', () => {
    const position = card => ({
        drawCount: 1,
        stock: Array.from({length: 52}, (_, candidate) => candidate).filter(candidate => candidate !== card),
        waste: [],
        foundations: [[], [], [], []],
        tableau: [
            {hidden: [], visible: [card]},
            ...Array.from({length: 6}, () => ({hidden: [], visible: []})),
        ],
        won: false,
    })
    const king = engine.move(
        position(12),
        {kind: 'tableau', column: 0, card: 0},
        {kind: 'tableau', column: 1},
    )
    assert.equal(king.moved, true)
    assert.deepEqual(king.game.tableau[1].visible, [12])

    const queen = engine.move(
        position(11),
        {kind: 'tableau', column: 0, card: 0},
        {kind: 'tableau', column: 1},
    )
    assert.equal(queen.moved, false)
    assert.deepEqual(queen.game, position(11))
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

    const missing = engine.newGame(11, 1)
    missing.stock.pop()
    assert.equal(engine.validate(missing), false)
})

test('the final king completes the game', () => {
    const game = {
        drawCount: 1,
        stock: [],
        waste: [],
        foundations: Array.from({length: 4}, (_, suit) =>
            Array.from({length: suit === 3 ? 12 : 13}, (_, rank) => suit * 13 + rank)),
        tableau: [
            {hidden: [], visible: [51]},
            ...Array.from({length: 6}, () => ({hidden: [], visible: []})),
        ],
        won: false,
    }
    assert.equal(engine.validate(game), true)
    const result = engine.move(
        game,
        {kind: 'tableau', column: 0, card: 0},
        {kind: 'foundation', suit: 3},
    )
    assert.equal(result.moved, true)
    assert.equal(result.game.won, true)
    assert.equal(engine.validate(result.game), true)
})

test('invalid inputs preserve dispatch error details and empty-source semantics', () => {
    let drawError
    try {
        engine.newGame(1, 2)
    } catch (error) {
        drawError = error
    }
    assert(drawError)
    assert.equal(drawError.message, 'draw count must be 1 or 3')
    assert.equal(drawError.status, 2)
    assert.deepEqual(drawError.response, {
        error: {message: 'draw count must be 1 or 3', status: 2},
    })

    assert.throws(() => engine.newGame(-1, 1), {
        message: 'invalid value: integer `-1`, expected u64',
    })
    assert.throws(() => engine.validate({}), {message: 'missing field `drawCount`'})

    const game = engine.newGame(1, 1)
    assert.throws(
        () => engine.move(
            game,
            {kind: 'tableau', column: 7, card: 0},
            {kind: 'tableau', column: 0},
        ),
        {message: 'tableau source is out of range'},
    )
    const unchanged = engine.move(
        game,
        {kind: 'waste'},
        {kind: 'tableau', column: 7},
    )
    assert.equal(unchanged.moved, false)
    assert.deepEqual(unchanged.game, game)
})
