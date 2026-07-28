(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {SlidingPuzzle: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const SIZES = Object.freeze([3, 4, 5])
    const DIRECTIONS = Object.freeze(['up', 'down', 'left', 'right'])
    const U32_MAX = 0xffffffff

    const fail = message => {
        const response = {error: {status: 2, message}}
        throw Object.assign(new Error(message), {status: 2, response})
    }

    const unsignedInteger = (value, name, maximum = U32_MAX) => {
        if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
            fail(`${name} must be an integer between 0 and ${maximum}`)
        }
        return value
    }

    const boardSize = value => {
        if (!SIZES.includes(value)) fail('size must be 3, 4, or 5')
        return value
    }

    const readBoard = (value, sizeInput) => {
        const size = boardSize(sizeInput)
        const cells = size * size
        if (!Array.isArray(value) || value.length !== cells) {
            fail(`board must contain ${cells} cells`)
        }
        const board = Array.from(value)
        const seen = Array(cells).fill(false)
        for (const tile of board) {
            if (!Number.isInteger(tile) || tile < 0 || tile >= cells) {
                fail(`board tiles must be integers between 0 and ${cells - 1}`)
            }
            if (seen[tile]) fail('board must contain each tile exactly once')
            seen[tile] = true
        }
        return board
    }

    const inversionCountUnchecked = board => {
        let inversions = 0
        for (let left = 0; left < board.length; left++) {
            if (board[left] === 0) continue
            for (let right = left + 1; right < board.length; right++) {
                if (board[right] !== 0 && board[left] > board[right]) inversions++
            }
        }
        return inversions
    }

    const isSolvableUnchecked = (board, size) => {
        const inversions = inversionCountUnchecked(board)
        if (size % 2 === 1) return inversions % 2 === 0
        const blankRowFromBottom = size - Math.floor(board.indexOf(0) / size)
        return (inversions + blankRowFromBottom) % 2 === 1
    }

    const isSolvedUnchecked = board =>
        board.every((tile, index) => tile === (index + 1) % board.length)

    const manhattanDistance = (board, size) => board.reduce((distance, tile, index) => {
        if (tile === 0) return distance
        const goal = tile - 1
        return distance
            + Math.abs(Math.floor(index / size) - Math.floor(goal / size))
            + Math.abs(index % size - goal % size)
    }, 0)

    class Rng {
        constructor(seed) {
            this.state = (seed ^ 0x9e3779b9) >>> 0
            if (this.state === 0) this.state = 0x6d2b79f5
        }

        next() {
            let value = this.state
            value ^= value << 13
            value ^= value >>> 17
            value ^= value << 5
            this.state = value >>> 0
            return this.state
        }

        shuffle(values) {
            for (let index = values.length - 1; index > 0; index--) {
                const target = this.next() % (index + 1)
                ;[values[index], values[target]] = [values[target], values[index]]
            }
        }
    }

    const newGame = (sizeInput, seedInput) => {
        const size = boardSize(sizeInput)
        const seed = unsignedInteger(seedInput, 'seed')
        const solved = Array.from({length: size * size}, (_, index) => (index + 1) % (size * size))
        const rng = new Rng(seed)
        let candidate = solved

        for (let attempt = 0; attempt < 32; attempt++) {
            candidate = solved.slice()
            rng.shuffle(candidate)
            if (!isSolvableUnchecked(candidate, size)) {
                const first = candidate.indexOf(1)
                const second = candidate.indexOf(2)
                ;[candidate[first], candidate[second]] = [candidate[second], candidate[first]]
            }
            if (!isSolvedUnchecked(candidate) && manhattanDistance(candidate, size) >= size * 2) {
                return candidate
            }
        }

        if (isSolvedUnchecked(candidate)) {
            const blank = candidate.length - 1
            ;[candidate[blank], candidate[blank - 1]] = [candidate[blank - 1], candidate[blank]]
        }
        return candidate
    }

    const checkedBoard = (boardInput, sizeInput) => {
        const size = boardSize(sizeInput)
        const board = readBoard(boardInput, size)
        if (!isSolvableUnchecked(board, size)) fail('board must be solvable')
        return {board, size}
    }

    const resultWithoutMove = (board, blank) => ({
        board,
        blank,
        from: null,
        moved: false,
        solved: isSolvedUnchecked(board),
        tile: null,
        to: null,
    })

    const moveUnchecked = (board, size, index) => {
        const blank = board.indexOf(0)
        const rowDistance = Math.abs(Math.floor(index / size) - Math.floor(blank / size))
        const columnDistance = Math.abs(index % size - blank % size)
        if (index === blank || rowDistance + columnDistance !== 1) {
            return resultWithoutMove(board, blank)
        }

        const tile = board[index]
        board[blank] = tile
        board[index] = 0
        return {
            board,
            blank: index,
            from: index,
            moved: true,
            solved: isSolvedUnchecked(board),
            tile,
            to: blank,
        }
    }

    const move = (boardInput, sizeInput, indexInput) => {
        const {board, size} = checkedBoard(boardInput, sizeInput)
        const index = unsignedInteger(indexInput, 'index', board.length - 1)
        return moveUnchecked(board, size, index)
    }

    const moveBlank = (boardInput, sizeInput, directionInput) => {
        const {board, size} = checkedBoard(boardInput, sizeInput)
        if (!DIRECTIONS.includes(directionInput)) fail('direction must be up, down, left, or right')
        const blank = board.indexOf(0)
        const row = Math.floor(blank / size)
        const column = blank % size
        const index = {
            up: row > 0 ? blank - size : null,
            down: row + 1 < size ? blank + size : null,
            left: column > 0 ? blank - 1 : null,
            right: column + 1 < size ? blank + 1 : null,
        }[directionInput]
        return index == null ? resultWithoutMove(board, blank) : moveUnchecked(board, size, index)
    }

    const legalTiles = (boardInput, sizeInput) => {
        const {board, size} = checkedBoard(boardInput, sizeInput)
        const blank = board.indexOf(0)
        const row = Math.floor(blank / size)
        const column = blank % size
        return [
            row > 0 ? blank - size : null,
            column > 0 ? blank - 1 : null,
            column + 1 < size ? blank + 1 : null,
            row + 1 < size ? blank + size : null,
        ].filter(index => index != null)
    }

    const isSolvable = (boardInput, sizeInput) => {
        const size = boardSize(sizeInput)
        return isSolvableUnchecked(readBoard(boardInput, size), size)
    }

    const isSolved = (boardInput, sizeInput) =>
        isSolvedUnchecked(readBoard(boardInput, boardSize(sizeInput)))

    const validate = (boardInput, sizeInput) => {
        try {
            return isSolvable(boardInput, sizeInput)
        } catch {
            return false
        }
    }

    return {
        DIRECTIONS,
        SIZES,
        isSolvable,
        isSolved,
        legalTiles,
        move,
        moveBlank,
        newGame,
        ping: () => ({abi: 1, game: 'sliding'}),
        validate,
    }
})
