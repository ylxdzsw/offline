(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Nonogram: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard'])
    const SIZES = Object.freeze({easy: 5, medium: 10, hard: 15})
    const MARKS = Object.freeze({empty: 0, filled: 1, crossed: 2})
    const U32_MAX = 0xffffffff

    const PATTERNS = Object.freeze({
        easy: Object.freeze([
            Object.freeze(['.###.', '#####', '#####', '.###.', '..#..']),
            Object.freeze(['..#..', '.###.', '#####', '.###.', '..#..']),
            Object.freeze(['#...#', '#...#', '#...#', '.###.', '..#..']),
            Object.freeze(['..#..', '.###.', '..#..', '#####', '.###.']),
        ]),
        medium: Object.freeze([
            Object.freeze([
                '...##.....',
                '..####....',
                '.######..#',
                '##########',
                '.######..#',
                '..####....',
                '...##.....',
                '....#.....',
                '...#......',
                '..........',
            ]),
            Object.freeze([
                '.#......#.',
                '.##....##.',
                '.########.',
                '##.####.##',
                '##########',
                '##.####.##',
                '.########.',
                '..######..',
                '...#..#...',
                '..##..##..',
            ]),
            Object.freeze([
                '..######..',
                '..#....#..',
                '..#....###',
                '..#....#.#',
                '..#....###',
                '..#....#..',
                '..#....#..',
                '..######..',
                '...####...',
                '..........',
            ]),
            Object.freeze([
                '....##....',
                '..######..',
                '.########.',
                '##########',
                '....##....',
                '....##....',
                '....##....',
                '....##....',
                '..#..#....',
                '...##.....',
            ]),
        ]),
        hard: Object.freeze([
            Object.freeze([
                '.......#.......',
                '......###......',
                '.....#####.....',
                '....#######....',
                '....#######....',
                '....##.#.##....',
                '....#######....',
                '....#######....',
                '...#########...',
                '..###.###.###..',
                '.###..###..###.',
                '......###......',
                '.....#####.....',
                '....##...##....',
                '...##.....##...',
            ]),
            Object.freeze([
                '....###.###....',
                '...#########...',
                '..###########..',
                '.###..###..###.',
                '###...###...###',
                '###..#####..###',
                '###############',
                '###############',
                '.#############.',
                '..###########..',
                '...#########...',
                '....###.###....',
                '....##...##....',
                '...##.....##...',
                '..##.......##..',
            ]),
            Object.freeze([
                '.......#.......',
                '......###......',
                '.....#####.....',
                '.......#.......',
                '.......#.......',
                '...#########...',
                '....#######....',
                '.....#####.....',
                '......###......',
                '###############',
                '.#############.',
                '..###########..',
                '...#########...',
                '....#######....',
                '.....#####.....',
            ]),
            Object.freeze([
                '......###......',
                '....#######....',
                '...#########...',
                '..####.#.####..',
                '..###########..',
                '...#########...',
                '....#######....',
                '......###......',
                '.......#.......',
                '.....#####.....',
                '....#######....',
                '...#########...',
                '......###......',
                '......###......',
                '.....#####.....',
            ]),
        ]),
    })

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

    const difficultyOf = value => {
        if (!DIFFICULTIES.includes(value)) fail('difficulty must be easy, medium, or hard')
        return value
    }

    const sizeOf = value => {
        if (!Object.values(SIZES).includes(value)) fail('size must be 5, 10, or 15')
        return value
    }

    const readLine = (line, size, name, maximum = 1) => {
        if (!Array.isArray(line) || line.length !== size
            || !line.every(value => Number.isInteger(value) && value >= 0 && value <= maximum)) {
            fail(`${name} must contain ${size} values between 0 and ${maximum}`)
        }
        return Array.from(line)
    }

    const readClueLine = (line, size, name) => {
        if (!Array.isArray(line)
            || !line.every(value => Number.isInteger(value) && value > 0 && value <= size)
            || line.reduce((sum, value) => sum + value, 0) + Math.max(0, line.length - 1) > size) {
            fail(`${name} contains invalid clues`)
        }
        return Array.from(line)
    }

    const readClues = (lines, size, name) => {
        if (!Array.isArray(lines) || lines.length !== size) {
            fail(`${name} must contain ${size} lines`)
        }
        return lines.map((line, index) => readClueLine(line, size, `${name}[${index}]`))
    }

    const runs = line => {
        if (!Array.isArray(line)) fail('line must be an array')
        const result = []
        let length = 0
        for (const value of line) {
            if (value) {
                length++
            } else if (length) {
                result.push(length)
                length = 0
            }
        }
        if (length) result.push(length)
        return result
    }

    const cluesFromSolution = (solutionInput, sizeInput) => {
        const size = sizeOf(sizeInput)
        const solution = readLine(solutionInput, size * size, 'solution')
        const rowClues = Array.from({length: size}, (_, row) =>
            runs(solution.slice(row * size, (row + 1) * size)))
        const columnClues = Array.from({length: size}, (_, column) =>
            runs(Array.from({length: size}, (_, row) => solution[row * size + column])))
        return {rowClues, columnClues}
    }

    const newGame = (difficultyInput, seedInput) => {
        const difficulty = difficultyOf(difficultyInput)
        const seed = unsignedInteger(seedInput, 'seed')
        const size = SIZES[difficulty]
        const pattern = PATTERNS[difficulty][seed % PATTERNS[difficulty].length]
        const solution = pattern.flatMap(row => [...row].map(cell => cell === '#' ? 1 : 0))
        const {rowClues, columnClues} = cluesFromSolution(solution, size)
        return {
            difficulty,
            puzzle: seed % PATTERNS[difficulty].length,
            size,
            solution,
            rowClues,
            columnClues,
        }
    }

    const readCells = (cells, size) => readLine(cells, size * size, 'cells', MARKS.crossed)
    const readSolution = (solution, size) => readLine(solution, size * size, 'solution')

    const isSolvedUnchecked = (cells, solution) =>
        solution.every((filled, index) => (cells[index] === MARKS.filled) === Boolean(filled))

    const isSolved = (cellsInput, solutionInput, sizeInput) => {
        const size = sizeOf(sizeInput)
        return isSolvedUnchecked(readCells(cellsInput, size), readSolution(solutionInput, size))
    }

    const apply = (cellsInput, solutionInput, sizeInput, indexInput, markInput) => {
        const size = sizeOf(sizeInput)
        const cells = readCells(cellsInput, size)
        const solution = readSolution(solutionInput, size)
        const index = unsignedInteger(indexInput, 'index', cells.length - 1)
        if (![MARKS.filled, MARKS.crossed].includes(markInput)) {
            fail('mark must be filled or crossed')
        }
        const previous = cells[index]
        cells[index] = previous === markInput ? MARKS.empty : markInput
        return {
            cells,
            changed: cells[index] !== previous,
            index,
            mark: cells[index],
            previous,
            solved: isSolvedUnchecked(cells, solution),
        }
    }

    const lineComplete = (cellsInput, sizeInput, axis, indexInput, cluesInput) => {
        const size = sizeOf(sizeInput)
        const cells = readCells(cellsInput, size)
        const index = unsignedInteger(indexInput, 'index', size - 1)
        if (!['row', 'column'].includes(axis)) fail('axis must be row or column')
        const clues = readClueLine(cluesInput, size, 'clues')
        const line = Array.from({length: size}, (_, offset) =>
            cells[axis === 'row' ? index * size + offset : offset * size + index])
        return line.every(mark => mark !== MARKS.empty)
            && JSON.stringify(runs(line.map(mark => mark === MARKS.filled))) === JSON.stringify(clues)
    }

    const lineCandidates = (clues, size) => {
        if (clues.length === 0) return [0]
        const candidates = []
        const visit = (clueIndex, start, mask) => {
            const remaining = clues.slice(clueIndex + 1).reduce((sum, length) => sum + length, 0)
                + Math.max(0, clues.length - clueIndex - 1)
            const lastStart = size - clues[clueIndex] - remaining
            for (let position = start; position <= lastStart; position++) {
                let nextMask = mask
                for (let offset = 0; offset < clues[clueIndex]; offset++) {
                    nextMask |= 1 << (position + offset)
                }
                if (clueIndex + 1 === clues.length) candidates.push(nextMask)
                else visit(clueIndex + 1, position + clues[clueIndex] + 1, nextMask)
            }
        }
        visit(0, 0, 0)
        return candidates
    }

    const solutionCount = (rowCluesInput, columnCluesInput, limitInput = 2) => {
        if (!Array.isArray(rowCluesInput)) fail('rowClues must be an array')
        const size = sizeOf(rowCluesInput.length)
        const rowClues = readClues(rowCluesInput, size, 'rowClues')
        const columnClues = readClues(columnCluesInput, size, 'columnClues')
        const limit = unsignedInteger(limitInput, 'limit', U32_MAX)
        if (limit === 0) return 0

        const rowOptions = rowClues.map(clues => lineCandidates(clues, size))
        const order = Array.from({length: size}, (_, row) => row)
            .sort((left, right) => rowOptions[left].length - rowOptions[right].length)
        const columns = columnClues.map(clues => lineCandidates(clues, size))
        let count = 0

        const visit = (depth, available) => {
            if (count >= limit) return
            if (depth === order.length) {
                count++
                return
            }
            const row = order[depth]
            for (const rowMask of rowOptions[row]) {
                const next = available.map((options, column) =>
                    options.filter(mask => ((mask >> row) & 1) === ((rowMask >> column) & 1)))
                if (next.every(options => options.length > 0)) visit(depth + 1, next)
                if (count >= limit) return
            }
        }
        visit(0, columns)
        return count
    }

    const validateCells = (cellsInput, sizeInput) => {
        try {
            readCells(cellsInput, sizeOf(sizeInput))
            return true
        } catch {
            return false
        }
    }

    const ping = () => ({abi: 1, game: 'nonogram'})

    return Object.freeze({
        DIFFICULTIES,
        MARKS,
        SIZES,
        apply,
        cluesFromSolution,
        isSolved,
        lineComplete,
        newGame,
        ping,
        runs,
        solutionCount,
        validateCells,
    })
})
