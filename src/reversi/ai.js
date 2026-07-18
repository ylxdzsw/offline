(function (root) {
    'use strict'

    const engine = root.OfflineGames.Reversi
    const limits = {
        easy: {time: 80, depth: 2},
        medium: {time: 420, depth: 5},
        hard: {time: 1300, depth: 8},
    }
    const POSITION = [
        120, -28, 18, 8, 8, 18, -28, 120,
        -28, -45, -4, -4, -4, -4, -45, -28,
        18, -4, 12, 3, 3, 12, -4, 18,
        8, -4, 3, 3, 3, 3, -4, 8,
        8, -4, 3, 3, 3, 3, -4, 8,
        18, -4, 12, 3, 3, 12, -4, 18,
        -28, -45, -4, -4, -4, -4, -45, -28,
        120, -28, 18, 8, 8, 18, -28, 120,
    ]
    const CORNERS = new Set([0, 7, 56, 63])
    const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now()
    const terminalScore = (board, side) => {
        const difference = engine.count(board, side) - engine.count(board, engine.other(side))
        return Math.sign(difference) * 1000000 + difference * 1000
    }
    const evaluate = (board, side) => {
        const opponent = engine.other(side)
        const occupied = board.length - engine.count(board, engine.EMPTY)
        const discWeight = occupied > 52 ? 18 : occupied > 40 ? 5 : 1
        let positional = 0
        let frontier = 0
        for (let index = 0; index < board.length; index++) {
            if (board[index] === side) positional += POSITION[index]
            else if (board[index] === opponent) positional -= POSITION[index]
            if (board[index] !== engine.EMPTY) {
                const row = engine.rowOf(index)
                const column = engine.columnOf(index)
                const exposed = engine.DIRECTIONS.some(([dr, dc]) => {
                    const nextRow = row + dr
                    const nextColumn = column + dc
                    return engine.inside(nextRow, nextColumn) && board[engine.at(nextRow, nextColumn)] === engine.EMPTY
                })
                if (exposed) frontier += board[index] === side ? -1 : 1
            }
        }
        const discs = engine.count(board, side) - engine.count(board, opponent)
        const mobility = engine.legalMoves(board, side).length - engine.legalMoves(board, opponent).length
        return positional * 4 + mobility * 16 + frontier * 7 + discs * discWeight
    }
    const movePriority = move => (CORNERS.has(move.index) ? 10000 : 0) + POSITION[move.index] * 20 + move.flips.length
    const ordered = moves => moves.slice().sort((a, b) => movePriority(b) - movePriority(a) || a.index - b.index)

    const search = (board, side, difficulty = 'medium') => {
        const limit = limits[difficulty] || limits.medium
        const started = now()
        const deadline = started + limit.time
        const initial = ordered(engine.legalMoves(board, side))
        if (!initial.length) return {move: null, depth: 0, nodes: 0, elapsed: 0}
        if (initial.some(move => CORNERS.has(move.index))) {
            const move = initial.find(candidate => CORNERS.has(candidate.index))
            return {move: move.index, depth: 1, nodes: initial.length, elapsed: Math.round(now() - started)}
        }

        let nodes = 0
        let bestMove = initial[0].index
        let completedDepth = 0
        const minimax = (position, turn, depth, alpha, beta, passed) => {
            if ((nodes++ & 127) === 0 && now() >= deadline) throw new Error('timeout')
            const moves = ordered(engine.legalMoves(position, turn))
            if (!moves.length) {
                if (passed) return terminalScore(position, side)
                return minimax(position, engine.other(turn), depth, alpha, beta, true)
            }
            if (depth === 0) return evaluate(position, side)
            if (turn === side) {
                let value = -Infinity
                for (const move of moves) {
                    value = Math.max(value, minimax(engine.applyMove(position, move.index, turn), engine.other(turn), depth - 1, alpha, beta, false))
                    alpha = Math.max(alpha, value)
                    if (alpha >= beta) break
                }
                return value
            }
            let value = Infinity
            for (const move of moves) {
                value = Math.min(value, minimax(engine.applyMove(position, move.index, turn), engine.other(turn), depth - 1, alpha, beta, false))
                beta = Math.min(beta, value)
                if (alpha >= beta) break
            }
            return value
        }

        const empties = engine.count(board, engine.EMPTY)
        const maximumDepth = empties <= 12 && difficulty === 'hard' ? empties : limit.depth
        for (let depth = 1; depth <= maximumDepth; depth++) {
            let iterationMove = bestMove
            let iterationScore = -Infinity
            try {
                for (const move of initial) {
                    if (now() >= deadline) throw new Error('timeout')
                    const score = minimax(engine.applyMove(board, move.index, side), engine.other(side), depth - 1, -Infinity, Infinity, false)
                    if (score > iterationScore) {
                        iterationScore = score
                        iterationMove = move.index
                    }
                }
                bestMove = iterationMove
                completedDepth = depth
            } catch (error) {
                if (error.message !== 'timeout') throw error
                break
            }
        }
        return {move: bestMove, depth: completedDepth, nodes, elapsed: Math.round(now() - started)}
    }

    const api = {search, evaluate, limits}
    root.OfflineGames.ReversiAI = api
    if (typeof module === 'object' && module.exports) module.exports = api
    if (typeof document === 'undefined' && typeof root.postMessage === 'function') {
        root.onmessage = event => {
            const {id, board, side, difficulty} = event.data
            const result = search(board, side, difficulty)
            root.postMessage({id, move: result.move, stats: {depth: result.depth, nodes: result.nodes, elapsed: result.elapsed}})
        }
    }
})(typeof self !== 'undefined' ? self : globalThis)
