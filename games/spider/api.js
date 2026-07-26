(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Spider: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const TABLEAU_COLUMNS = 10
    const CARDS = 104
    const RUN_LENGTH = 13
    const RUNS_TO_WIN = 8
    const U64_MASK = (1n << 64n) - 1n
    const GOLDEN_GAMMA = 0x9e3779b97f4a7c15n
    const MIX_FIRST = 0xbf58476d1ce4e5b9n
    const MIX_SECOND = 0x94d049bb133111ebn
    const SUITS = ['clubs', 'diamonds', 'hearts', 'spades']
    const SUIT_MARKS = ['♣', '♦', '♥', '♠']
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

    const fail = message => {
        const response = {error: {status: 2, message}}
        throw Object.assign(new Error(message), {status: 2, response})
    }

    const uint = (value, maximum, name) => {
        if (!Number.isInteger(value) || value < 0 || value > maximum) {
            fail(`${name} must be an unsigned integer`)
        }
        return value === 0 ? 0 : value
    }

    const object = (value, name) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            fail(`${name} must be an object`)
        }
        return value
    }

    const cardList = (value, name) => {
        if (!Array.isArray(value)) fail(`${name} must be an array`)
        const cards = []
        for (let index = 0; index < value.length; index++) {
            cards.push(uint(value[index], 255, `${name}[${index}]`))
        }
        return cards
    }

    const normalizeGame = value => {
        const game = object(value, 'game')
        const suitCount = uint(game.suitCount, 255, 'game.suitCount')
        const stock = cardList(game.stock, 'game.stock')
        if (!Array.isArray(game.completed)) fail('game.completed must be an array')
        const completed = []
        for (let index = 0; index < game.completed.length; index++) {
            completed.push(cardList(game.completed[index], `game.completed[${index}]`))
        }
        if (!Array.isArray(game.tableau)) fail('game.tableau must be an array')
        const tableau = []
        for (let index = 0; index < game.tableau.length; index++) {
            const pile = object(game.tableau[index], `game.tableau[${index}]`)
            tableau.push({
                hidden: cardList(pile.hidden, `game.tableau[${index}].hidden`),
                visible: cardList(pile.visible, `game.tableau[${index}].visible`),
            })
        }
        if (typeof game.won !== 'boolean') fail('game.won must be a boolean')
        return {suitCount, stock, completed, tableau, won: game.won}
    }

    const normalizeSource = value => {
        const source = object(value, 'source')
        return {
            column: uint(source.column, 0xffffffff, 'source.column'),
            card: uint(source.card, 0xffffffff, 'source.card'),
        }
    }

    const normalizeDestination = value => {
        const destination = object(value, 'destination')
        return {column: uint(destination.column, 0xffffffff, 'destination.column')}
    }

    const seed64 = seed => {
        let value
        if (typeof seed === 'bigint') {
            value = seed
        } else if (typeof seed === 'number' && Number.isFinite(seed) && Number.isInteger(seed)) {
            try {
                value = BigInt(JSON.stringify(seed))
            } catch {
                fail('seed must be an unsigned 64-bit integer')
            }
        } else {
            fail('seed must be an unsigned 64-bit integer')
        }
        if (value < 0n || value > U64_MASK) fail('seed must be an unsigned 64-bit integer')
        return value
    }

    const wrap64 = value => value & U64_MASK

    const mix = initial => {
        let value = wrap64(initial ^ (initial >> 30n))
        value = wrap64(value * MIX_FIRST)
        value = wrap64(value ^ (value >> 27n))
        value = wrap64(value * MIX_SECOND)
        return wrap64(value ^ (value >> 31n))
    }

    const shuffledDeck = seed => {
        const deck = Array.from({length: CARDS}, (_, card) => card)
        let state = seed64(seed)
        for (let index = deck.length - 1; index > 0; index--) {
            state = wrap64(state + GOLDEN_GAMMA)
            const destination = Number(mix(state) % BigInt(index + 1))
            ;[deck[index], deck[destination]] = [deck[destination], deck[index]]
        }
        return deck
    }

    const rank = card => card % RUN_LENGTH
    const suit = (card, suitCount) => suitCount === 1
        ? 3
        : suitCount === 2
            ? [3, 2][Math.floor(card / RUN_LENGTH) % 2]
            : Math.floor(card / RUN_LENGTH) % 4

    const isCompleteRun = (cards, suitCount) => cards.length === RUN_LENGTH
        && cards.every((card, index) => rank(card) === RUN_LENGTH - 1 - index)
        && cards.slice(1).every((card, index) => suit(card, suitCount) === suit(cards[index], suitCount))

    const movable = (cards, suitCount) => cards.length > 0 && cards.slice(1).every((card, index) =>
        rank(card) + 1 === rank(cards[index])
        && suit(card, suitCount) === suit(cards[index], suitCount))

    const validationError = game => {
        if (![1, 2, 4].includes(game.suitCount)) return 'suit count must be 1, 2, or 4'
        if (game.tableau.length !== TABLEAU_COLUMNS) return 'there must be ten tableau columns'
        if (game.stock.length % TABLEAU_COLUMNS !== 0) {
            return 'the stock must contain complete ten-card deals'
        }
        if (game.completed.length > RUNS_TO_WIN) {
            return 'there cannot be more than eight completed runs'
        }
        if (game.completed.some(run => !isCompleteRun(run, game.suitCount))) {
            return 'completed runs must descend from king to ace in one suit'
        }

        const seen = new Uint8Array(CARDS)
        let count = 0
        const record = card => {
            if (card >= CARDS) return `card ${card} is out of range`
            if (seen[card]) return `card ${card} appears more than once`
            seen[card] = 1
            count += 1
            return null
        }

        for (const card of game.stock) {
            const error = record(card)
            if (error) return error
        }
        for (const run of game.completed) {
            for (const card of run) {
                const error = record(card)
                if (error) return error
            }
        }
        for (const pile of game.tableau) {
            if (pile.hidden.length > 0 && pile.visible.length === 0) {
                return 'a non-empty tableau pile must expose its top card'
            }
            for (const card of [...pile.hidden, ...pile.visible]) {
                const error = record(card)
                if (error) return error
            }
        }
        if (count !== CARDS || seen.some(present => !present)) {
            return 'a game must contain every card exactly once'
        }
        if (game.won !== (game.completed.length === RUNS_TO_WIN)) {
            return 'won flag does not match the completed runs'
        }
        return null
    }

    const exposeTop = pile => {
        if (pile.visible.length > 0 || pile.hidden.length === 0) return false
        pile.visible.push(pile.hidden.pop())
        return true
    }

    const collectCompleteRuns = game => {
        let completed = 0
        let flipped = false
        for (const pile of game.tableau) {
            if (pile.visible.length < RUN_LENGTH) continue
            const start = pile.visible.length - RUN_LENGTH
            if (!isCompleteRun(pile.visible.slice(start), game.suitCount)) continue
            game.completed.push(pile.visible.splice(start))
            completed += 1
            flipped = exposeTop(pile) || flipped
        }
        game.won = game.completed.length === RUNS_TO_WIN
        return {completed, flipped}
    }

    const unchanged = (game, reason) => ({
        game,
        moved: false,
        flipped: false,
        completed: 0,
        reason,
    })

    const newGame = (seed, requestedSuitCount = 1) => {
        const normalizedSeed = seed64(seed)
        const suitCount = uint(requestedSuitCount, 255, 'suitCount')
        if (![1, 2, 4].includes(suitCount)) fail('suit count must be 1, 2, or 4')
        const deck = shuffledDeck(normalizedSeed)
        const tableau = Array.from({length: TABLEAU_COLUMNS}, () => ({hidden: [], visible: []}))
        for (let row = 0; row < 4; row++) {
            for (const pile of tableau) pile.hidden.push(deck.pop())
        }
        for (const pile of tableau.slice(0, 4)) pile.hidden.push(deck.pop())
        for (const pile of tableau) pile.visible.push(deck.pop())
        const game = {suitCount, stock: deck, completed: [], tableau, won: false}
        const error = validationError(game)
        if (error) fail(error)
        return game
    }

    const validate = value => validationError(normalizeGame(value)) === null

    const move = (value, sourceValue, destinationValue) => {
        const game = normalizeGame(value)
        const source = normalizeSource(sourceValue)
        const destination = normalizeDestination(destinationValue)
        const gameError = validationError(game)
        if (gameError) fail(gameError)
        if (source.column >= TABLEAU_COLUMNS || destination.column >= TABLEAU_COLUMNS) {
            fail('tableau column is out of range')
        }
        if (source.column === destination.column) return unchanged(game, 'invalidMove')
        const sourcePile = game.tableau[source.column]
        if (source.card >= sourcePile.visible.length) fail('tableau card is out of range')
        const cards = sourcePile.visible.slice(source.card)
        if (!movable(cards, game.suitCount)) return unchanged(game, 'mixedRun')
        const destinationPile = game.tableau[destination.column]
        const destinationTop = destinationPile.visible.at(-1)
        if (destinationTop !== undefined && rank(cards[0]) + 1 !== rank(destinationTop)) {
            return unchanged(game, 'invalidMove')
        }

        destinationPile.visible.push(...sourcePile.visible.splice(source.card))
        let flipped = exposeTop(sourcePile)
        const collection = collectCompleteRuns(game)
        flipped = collection.flipped || flipped
        const resultError = validationError(game)
        if (resultError) fail(resultError)
        return {
            game,
            moved: true,
            flipped,
            completed: collection.completed,
            reason: null,
        }
    }

    const deal = value => {
        const game = normalizeGame(value)
        const gameError = validationError(game)
        if (gameError) fail(gameError)
        if (game.stock.length === 0) return unchanged(game, 'stockEmpty')
        if (game.tableau.some(pile => pile.hidden.length === 0 && pile.visible.length === 0)) {
            return unchanged(game, 'emptyColumn')
        }
        if (game.stock.length < TABLEAU_COLUMNS) fail('the stock does not contain a complete deal')
        for (const pile of game.tableau) pile.visible.push(game.stock.pop())
        const collection = collectCompleteRuns(game)
        const resultError = validationError(game)
        if (resultError) fail(resultError)
        return {
            game,
            moved: true,
            flipped: collection.flipped,
            completed: collection.completed,
            reason: null,
        }
    }

    return {
        SUITS,
        SUIT_MARKS,
        RANKS,
        ping: () => ({abi: 1, game: 'spider'}),
        newGame,
        validate,
        move,
        deal,
        rank,
        suit,
        color: (card, suitCount) => [1, 2].includes(suit(card, suitCount)) ? 'red' : 'black',
        movable,
    }
})
