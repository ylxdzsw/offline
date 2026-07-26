(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Solitaire: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const SUITS = ['clubs', 'diamonds', 'hearts', 'spades']
    const SUIT_MARKS = ['♣', '♦', '♥', '♠']
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const CARD_COUNT = 52
    const TABLEAU_COLUMNS = 7
    const MASK_64 = (1n << 64n) - 1n
    const GOLDEN_GAMMA = 0x9e3779b97f4a7c15n

    const fail = message => {
        const error = new Error(message)
        error.status = 2
        error.response = {error: {message, status: 2}}
        throw error
    }

    const normalize = value => JSON.parse(JSON.stringify(value))
    const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key)
    const field = (object, key) => {
        if (!has(object, key)) fail(`missing field \`${key}\``)
        return object[key]
    }

    const description = value => {
        if (value === null) return 'null'
        if (Array.isArray(value)) return 'sequence'
        if (typeof value === 'string') return `string "${value}"`
        if (typeof value === 'boolean') return `boolean \`${value}\``
        if (typeof value === 'number') {
            return `${Number.isInteger(value) ? 'integer' : 'floating point'} \`${value}\``
        }
        if (typeof value === 'object') return 'map'
        return typeof value
    }

    const record = (value, expected) => {
        if (value === null || Array.isArray(value) || typeof value !== 'object') {
            fail(`invalid type: ${description(value)}, expected ${expected}`)
        }
        return value
    }

    const sequence = value => {
        if (!Array.isArray(value)) fail(`invalid type: ${description(value)}, expected a sequence`)
        return value
    }

    const unsigned = (value, maximum, expected) => {
        if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
            fail(`invalid type: ${description(value)}, expected ${expected}`)
        }
        if (value < 0 || value > maximum) {
            fail(`invalid value: integer \`${value}\`, expected ${expected}`)
        }
        return value
    }

    const u8 = value => unsigned(value, 0xff, 'u8')
    const usize = value => unsigned(value, 0xffff_ffff, 'usize')
    const boolean = value => {
        if (typeof value !== 'boolean') {
            fail(`invalid type: ${description(value)}, expected a boolean`)
        }
        return value
    }

    const u64 = value => {
        if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
            fail(`invalid type: ${description(value)}, expected u64`)
        }
        if (value < 0) fail(`invalid value: integer \`${value}\`, expected u64`)
        const encoded = JSON.stringify(value)
        if (encoded.includes('e') || encoded.includes('.')) {
            fail(`invalid type: floating point \`${value}\`, expected u64`)
        }
        const parsed = BigInt(encoded)
        if (parsed > MASK_64) fail(`invalid value: integer \`${value}\`, expected u64`)
        return parsed
    }

    const rankOne = card => card % 13 + 1
    const suitOf = card => Math.floor(card / 13)
    const isRed = card => suitOf(card) === 1 || suitOf(card) === 2
    const canStack = (card, destination) =>
        rankOne(card) + 1 === rankOne(destination) && isRed(card) !== isRed(destination)

    const parseCards = value => sequence(value).map(u8)

    const parsePile = value => {
        const pile = record(value, 'struct TableauPile')
        return {
            hidden: parseCards(field(pile, 'hidden')),
            visible: parseCards(field(pile, 'visible')),
        }
    }

    const parseGame = value => {
        const game = record(value, 'struct Game')
        return {
            drawCount: u8(field(game, 'drawCount')),
            stock: parseCards(field(game, 'stock')),
            waste: parseCards(field(game, 'waste')),
            foundations: sequence(field(game, 'foundations')).map(parseCards),
            tableau: sequence(field(game, 'tableau')).map(parsePile),
            won: boolean(field(game, 'won')),
        }
    }

    const parseSource = value => {
        const source = record(value, 'internally tagged enum Source')
        const kind = field(source, 'kind')
        if (typeof kind !== 'string') {
            fail(`invalid type: ${description(kind)}, expected variant identifier`)
        }
        if (kind === 'waste') return {kind}
        if (kind === 'tableau') {
            return {kind, column: usize(field(source, 'column')), card: usize(field(source, 'card'))}
        }
        if (kind === 'foundation') return {kind, suit: usize(field(source, 'suit'))}
        fail(`unknown variant \`${kind}\`, expected one of \`waste\`, \`tableau\`, \`foundation\``)
    }

    const parseDestination = value => {
        const destination = record(value, 'internally tagged enum Destination')
        const kind = field(destination, 'kind')
        if (typeof kind !== 'string') {
            fail(`invalid type: ${description(kind)}, expected variant identifier`)
        }
        if (kind === 'tableau') return {kind, column: usize(field(destination, 'column'))}
        if (kind === 'foundation') return {kind, suit: usize(field(destination, 'suit'))}
        fail(`unknown variant \`${kind}\`, expected \`tableau\` or \`foundation\``)
    }

    const validationError = game => {
        if (game.drawCount !== 1 && game.drawCount !== 3) return 'draw count must be 1 or 3'
        if (game.foundations.length !== 4) return 'there must be four foundations'
        if (game.tableau.length !== TABLEAU_COLUMNS) return 'there must be seven tableau columns'

        const seen = Array(CARD_COUNT).fill(false)
        let count = 0
        const note = card => {
            if (card >= CARD_COUNT) return `card ${card} is out of range`
            if (seen[card]) return `card ${card} appears more than once`
            seen[card] = true
            count += 1
            return null
        }

        for (const card of [...game.stock, ...game.waste]) {
            const error = note(card)
            if (error) return error
        }
        for (let foundationSuit = 0; foundationSuit < game.foundations.length; foundationSuit++) {
            const foundation = game.foundations[foundationSuit]
            for (let index = 0; index < foundation.length; index++) {
                const card = foundation[index]
                if (suitOf(card) !== foundationSuit || rankOne(card) !== index + 1) {
                    return 'foundation cards must rise from ace in suit'
                }
                const error = note(card)
                if (error) return error
            }
        }
        for (const pile of game.tableau) {
            if (pile.hidden.length && !pile.visible.length) {
                return 'a non-empty tableau pile must expose its top card'
            }
            for (let index = 1; index < pile.visible.length; index++) {
                if (!canStack(pile.visible[index], pile.visible[index - 1])) {
                    return 'visible tableau cards must descend in alternating colors'
                }
            }
            for (const card of [...pile.hidden, ...pile.visible]) {
                const error = note(card)
                if (error) return error
            }
        }
        if (count !== CARD_COUNT || seen.some(present => !present)) {
            return 'a game must contain every card exactly once'
        }
        const won = game.foundations.every(foundation => foundation.length === 13)
        if (game.won !== won) return 'won flag does not match the foundations'
        return null
    }

    const requireValid = game => {
        const error = validationError(game)
        if (error) fail(error)
    }

    const mix = value => {
        value ^= value >> 30n
        value = (value * 0xbf58476d1ce4e5b9n) & MASK_64
        value ^= value >> 27n
        value = (value * 0x94d049bb133111ebn) & MASK_64
        return value ^ (value >> 31n)
    }

    const shuffledDeck = seed => {
        const deck = Array.from({length: CARD_COUNT}, (_, card) => card)
        let state = seed
        for (let index = deck.length - 1; index > 0; index--) {
            state = (state + GOLDEN_GAMMA) & MASK_64
            const destination = Number(mix(state) % BigInt(index + 1))
            ;[deck[index], deck[destination]] = [deck[destination], deck[index]]
        }
        return deck
    }

    const newGame = (seed, drawCount = 1) => {
        const args = normalize({seed, drawCount})
        const parsedSeed = u64(field(args, 'seed'))
        const parsedDrawCount = u8(field(args, 'drawCount'))
        if (parsedDrawCount !== 1 && parsedDrawCount !== 3) fail('draw count must be 1 or 3')

        const deck = shuffledDeck(parsedSeed)
        const tableau = Array.from(
            {length: TABLEAU_COLUMNS},
            () => ({hidden: [], visible: []}),
        )
        for (let row = 0; row < TABLEAU_COLUMNS; row++) {
            for (let column = row; column < TABLEAU_COLUMNS; column++) {
                const card = deck.pop()
                tableau[column][row === column ? 'visible' : 'hidden'].push(card)
            }
        }
        const game = {
            drawCount: parsedDrawCount,
            stock: deck,
            waste: [],
            foundations: Array.from({length: 4}, () => []),
            tableau,
            won: false,
        }
        requireValid(game)
        return game
    }

    const validate = game => {
        const args = normalize({game})
        return validationError(parseGame(field(args, 'game'))) === null
    }

    const unchanged = game => ({game, moved: false, flipped: false})

    const draw = game => {
        const args = normalize({game})
        game = parseGame(field(args, 'game'))
        requireValid(game)
        if (!game.stock.length) {
            if (!game.waste.length) return unchanged(game)
            game.stock.push(...game.waste.reverse())
            game.waste = []
            return {game, moved: true, flipped: false}
        }
        for (let count = 0; count < game.drawCount && game.stock.length; count++) {
            game.waste.push(game.stock.pop())
        }
        return {game, moved: true, flipped: false}
    }

    const sourceCards = (game, source) => {
        if (source.kind === 'waste') {
            return game.waste.length ? [game.waste.at(-1)] : []
        }
        if (source.kind === 'tableau') {
            const pile = game.tableau[source.column]
            if (!pile) fail('tableau source is out of range')
            if (source.card >= pile.visible.length) fail('tableau card is out of range')
            return pile.visible.slice(source.card)
        }
        const foundation = game.foundations[source.suit]
        if (!foundation) fail('foundation source is out of range')
        return foundation.length ? [foundation.at(-1)] : []
    }

    const legalDestination = (game, cards, source, destination) => {
        if (!cards.length) return false
        const card = cards[0]
        if (destination.kind === 'tableau') {
            const pile = game.tableau[destination.column]
            if (!pile) fail('tableau destination is out of range')
            if (source.kind === 'tableau' && source.column === destination.column) return false
            return pile.visible.length
                ? canStack(card, pile.visible.at(-1))
                : rankOne(card) === 13
        }
        if (destination.suit >= 4) fail('foundation destination is out of range')
        if (cards.length !== 1 || source.kind === 'foundation') return false
        const foundation = game.foundations[destination.suit]
        return suitOf(card) === destination.suit && rankOne(card) === foundation.length + 1
    }

    const move = (game, source, destination) => {
        const args = normalize({game, source, destination})
        game = parseGame(field(args, 'game'))
        source = parseSource(field(args, 'source'))
        destination = parseDestination(field(args, 'destination'))
        requireValid(game)
        const cards = sourceCards(game, source)
        if (!legalDestination(game, cards, source, destination)) return unchanged(game)

        if (source.kind === 'waste') game.waste.pop()
        else if (source.kind === 'tableau') game.tableau[source.column].visible.length = source.card
        else game.foundations[source.suit].pop()

        if (destination.kind === 'tableau') {
            game.tableau[destination.column].visible.push(...cards)
        } else {
            game.foundations[destination.suit].push(cards[0])
        }

        let flipped = false
        if (source.kind === 'tableau') {
            const pile = game.tableau[source.column]
            if (!pile.visible.length && pile.hidden.length) {
                pile.visible.push(pile.hidden.pop())
                flipped = true
            }
        }
        game.won = game.foundations.every(foundation => foundation.length === 13)
        requireValid(game)
        return {game, moved: true, flipped}
    }

    return {
        SUITS,
        SUIT_MARKS,
        RANKS,
        ping: () => ({abi: 1, game: 'solitaire'}),
        newGame,
        validate,
        draw,
        move,
        rank: card => card % 13,
        suit: card => Math.floor(card / 13),
        color: card => [1, 2].includes(Math.floor(card / 13)) ? 'red' : 'black',
    }
})
