(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Junqi: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const ROWS = 12, COLS = 5, RED = 'r', BLACK = 'b'
    const FLAG = 'F', MINE = 'M', BOMB = 'B', ENGINEER = '1'
    const TYPES = [FLAG, MINE, MINE, MINE, BOMB, BOMB, '9', '8', '7', '7', '6', '6', '5', '5', '4', '4', '3', '3', '3', '2', '2', '2', ENGINEER, ENGINEER, ENGINEER]
    const RANK = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9}
    const at = (row, column) => row * COLS + column
    const rowOf = index => Math.floor(index / COLS)
    const columnOf = index => index % COLS
    const inside = (row, column) => row >= 0 && row < ROWS && column >= 0 && column < COLS
    const other = side => side === RED ? BLACK : RED
    const CAMPS = new Set([[2,1],[2,3],[3,2],[4,1],[4,3],[7,1],[7,3],[8,2],[9,1],[9,3]].map(([r,c]) => at(r,c)))
    const HQ = new Set([[0,1],[0,3],[11,1],[11,3]].map(([r,c]) => at(r,c)))
    const RAIL = new Set()
    for (const row of [1, 5, 6, 10]) for (let column = 0; column < COLS; column++) RAIL.add(at(row, column))
    for (const column of [0, 4]) for (let row = 1; row <= 10; row++) RAIL.add(at(row, column))
    const isCamp = index => CAMPS.has(index)
    const isHQ = index => HQ.has(index)
    const isRail = index => RAIL.has(index)
    const piece = (side, type, number) => ({id: `${side}${type}${number}`, side, type})
    const shuffle = (values, random) => {
        const result = values.slice()
        for (let index = result.length - 1; index > 0; index--) {
            const target = Math.floor(random() * (index + 1))
            ;[result[index], result[target]] = [result[target], result[index]]
        }
        return result
    }
    const sideRows = side => side === BLACK ? [0,1,2,3,4,5] : [6,7,8,9,10,11]
    const deploymentSquares = side => sideRows(side).flatMap(row => [...Array(COLS).keys()].map(column => at(row, column))).filter(index => !isCamp(index))
    const setupSide = (board, side, random) => {
        const forward = side === BLACK ? 5 : 6
        const rear = side === BLACK ? [0,1] : [10,11]
        const headquarters = side === BLACK ? [at(0,1), at(0,3)] : [at(11,1), at(11,3)]
        const flagAt = headquarters[Math.floor(random() * headquarters.length)]
        const open = new Set(deploymentSquares(side)); open.delete(flagAt)
        let serial = 0
        board[flagAt] = piece(side, FLAG, serial++)
        for (const type of [MINE, MINE, MINE]) {
            const choices = shuffle([...open].filter(index => rear.includes(rowOf(index))), random)
            const target = choices[0]; board[target] = piece(side, type, serial++); open.delete(target)
        }
        for (const type of [BOMB, BOMB]) {
            const choices = shuffle([...open].filter(index => rowOf(index) !== forward), random)
            const target = choices[0]; board[target] = piece(side, type, serial++); open.delete(target)
        }
        const rest = TYPES.filter(type => ![FLAG, MINE, BOMB].includes(type))
        const targets = shuffle([...open], random)
        rest.forEach((type, index) => { board[targets[index]] = piece(side, type, serial++) })
    }
    const initialBoard = (random = Math.random) => {
        const board = Array(ROWS * COLS).fill(null)
        setupSide(board, BLACK, random); setupSide(board, RED, random)
        return board
    }
    const orthogonalNeighbors = index => {
        const row = rowOf(index), column = columnOf(index), found = []
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nextRow = row + dr, nextColumn = column + dc
            if (!inside(nextRow, nextColumn)) continue
            if ((row === 5 && nextRow === 6 || row === 6 && nextRow === 5) && ![0,2,4].includes(column)) continue
            found.push(at(nextRow, nextColumn))
        }
        return found
    }
    const roadNeighbors = index => {
        const found = new Set(orthogonalNeighbors(index))
        const row = rowOf(index), column = columnOf(index)
        for (const camp of CAMPS) if (Math.abs(rowOf(camp) - row) === 1 && Math.abs(columnOf(camp) - column) === 1) found.add(camp)
        if (isCamp(index)) for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) if (inside(row + dr, column + dc)) found.add(at(row + dr, column + dc))
        return [...found]
    }
    const railwayNeighbors = index => orthogonalNeighbors(index).filter(isRail)
    const straightRailTargets = (board, from) => {
        const found = []
        const row = rowOf(from), column = columnOf(from)
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            let r = row + dr, c = column + dc
            while (inside(r,c) && isRail(at(r,c))) {
                const target = at(r,c); found.push(target)
                if (board[target]) break
                r += dr; c += dc
            }
        }
        return found
    }
    const engineerRailTargets = (board, from) => {
        const found = [], queue = [from], seen = new Set([from])
        while (queue.length) {
            const current = queue.shift()
            for (const target of railwayNeighbors(current)) {
                if (seen.has(target)) continue
                seen.add(target); found.push(target)
                if (!board[target]) queue.push(target)
            }
        }
        return found
    }
    const movable = value => value && ![FLAG, MINE].includes(value.type)
    const movesFor = (board, from) => {
        const value = board[from]
        if (!movable(value) || isHQ(from)) return []
        const targets = new Set(roadNeighbors(from))
        if (isRail(from)) for (const target of value.type === ENGINEER ? engineerRailTargets(board, from) : straightRailTargets(board, from)) targets.add(target)
        return [...targets].filter(to => {
            const occupant = board[to]
            if (occupant?.side === value.side) return false
            if (occupant && isCamp(to)) return false
            return true
        }).map(to => ({from, to}))
    }
    const legalMoves = (board, side) => board.flatMap((value, index) => value?.side === side ? movesFor(board, index) : [])
    const battle = (attacker, defender) => {
        if (defender.type === FLAG) return 'attacker'
        if (attacker.type === BOMB || defender.type === BOMB) return 'both'
        if (defender.type === MINE) return attacker.type === ENGINEER ? 'attacker' : 'defender'
        if (RANK[attacker.type] > RANK[defender.type]) return 'attacker'
        if (RANK[attacker.type] < RANK[defender.type]) return 'defender'
        return 'both'
    }
    const applyMove = (board, move) => {
        if (!movesFor(board, move.from).some(candidate => candidate.to === move.to)) throw new Error('illegal move')
        const next = board.slice(), attacker = board[move.from], defender = board[move.to]
        next[move.from] = null
        let result = 'move', revealed = []
        if (!defender) next[move.to] = attacker
        else {
            result = battle(attacker, defender); revealed = [attacker.id, defender.id]
            if (result === 'attacker') next[move.to] = attacker
            else if (result === 'defender') next[move.to] = defender
            else next[move.to] = null
            for (const casualty of [attacker, defender]) if (casualty.type === '9' && !next.some(value => value?.id === casualty.id)) {
                const flag = next.find(value => value?.side === casualty.side && value.type === FLAG)
                if (flag) revealed.push(flag.id)
            }
        }
        return {board: next, result, attacker, defender, revealed}
    }
    const status = (board, turn) => {
        for (const side of [RED, BLACK]) if (!board.some(value => value?.side === side && value.type === FLAG)) return {ended: true, winner: other(side), reason: 'flag'}
        if (!legalMoves(board, turn).length) return {ended: true, winner: other(turn), reason: 'immobile'}
        return {ended: false, winner: null, reason: 'playing'}
    }
    const validateSetup = (board, side) => {
        const values = board.filter(value => value?.side === side)
        const counts = type => values.filter(value => value.type === type).length
        const flagIndex = board.findIndex(value => value?.side === side && value.type === FLAG)
        return values.length === 25 && TYPES.every((type, index) => TYPES.indexOf(type) !== index || counts(type) === TYPES.filter(value => value === type).length)
            && isHQ(flagIndex) && board.every((value, index) => value?.side !== side || !isCamp(index))
            && board.every((value, index) => value?.side !== side || value.type !== MINE || (side === BLACK ? rowOf(index) <= 1 : rowOf(index) >= 10))
    }

    return {ROWS, COLS, RED, BLACK, FLAG, MINE, BOMB, ENGINEER, TYPES, RANK, CAMPS, HQ, RAIL, at, rowOf, columnOf, inside, other, isCamp, isHQ, isRail, deploymentSquares, initialBoard, roadNeighbors, railwayNeighbors, movable, movesFor, legalMoves, battle, applyMove, status, validateSetup}
})
