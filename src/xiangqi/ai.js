(function (root) {
    'use strict'

    const engine = root.OfflineGames.Xiangqi
    const values = {K: 100000, R: 900, C: 450, H: 400, E: 200, A: 200, P: 100}
    const MATE = 1000000
    const limits = {
        easy: {time: 100, depth: 2},
        medium: {time: 500, depth: 4},
        hard: {time: 1500, depth: 6},
    }

    const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now()
    const positional = (piece, index) => {
        const row = engine.rowOf(index)
        const column = engine.columnOf(index)
        const type = engine.typeOf(piece)
        const side = engine.sideOf(piece)
        if (type === 'P') {
            const progress = side === engine.RED ? 9 - row : row
            return progress * 8 + (column >= 2 && column <= 6 ? 5 : 0)
        }
        if (type === 'H' || type === 'C') return 10 - Math.abs(4 - column) * 2
        if (type === 'R') return 5 - Math.abs(4 - column)
        return 0
    }
    const evaluate = (board, side) => {
        let score = 0
        for (let index = 0; index < board.length; index++) {
            const piece = board[index]
            if (!piece) continue
            const amount = values[engine.typeOf(piece)] + positional(piece, index)
            score += engine.sideOf(piece) === side ? amount : -amount
        }
        return score
    }
    const orderMoves = moves => moves.slice().sort((a, b) => {
        const aScore = a.captured ? values[engine.typeOf(a.captured)] * 10 - values[engine.typeOf(a.piece)] : 0
        const bScore = b.captured ? values[engine.typeOf(b.captured)] * 10 - values[engine.typeOf(b.piece)] : 0
        return bScore - aScore
    })

    const search = (board, side, difficulty = 'medium') => {
        const limit = limits[difficulty] || limits.medium
        const started = now()
        const deadline = started + limit.time
        const table = new Map()
        let nodes = 0
        let completedDepth = 0
        const rootMoves = orderMoves(engine.legalMoves(board, side))
        if (!rootMoves.length) return {move: null, depth: 0, nodes: 0, elapsed: 0}
        let bestMove = rootMoves[0]

        const timedOut = () => now() >= deadline
        const quiescence = (position, turn, alpha, beta, remaining) => {
            if ((nodes++ & 255) === 0 && timedOut()) throw new Error('timeout')
            const standing = evaluate(position, turn)
            if (standing >= beta) return beta
            if (standing > alpha) alpha = standing
            if (remaining <= 0) return alpha
            const captures = orderMoves(engine.legalMoves(position, turn).filter(move => move.captured))
            for (const move of captures) {
                const score = -quiescence(engine.applyMove(position, move), engine.other(turn), -beta, -alpha, remaining - 1)
                if (score >= beta) return beta
                if (score > alpha) alpha = score
            }
            return alpha
        }
        const negamax = (position, turn, depth, alpha, beta, ply) => {
            if ((nodes++ & 255) === 0 && timedOut()) throw new Error('timeout')
            const key = ply + ':' + engine.positionKey(position, turn)
            const cached = table.get(key)
            if (cached && cached.depth >= depth) return cached.score
            const moves = orderMoves(engine.legalMoves(position, turn))
            if (!moves.length) return -MATE + ply
            if (depth === 0) return quiescence(position, turn, alpha, beta, 3)
            let best = -Infinity
            let cutoff = false
            for (const move of moves) {
                const score = -negamax(engine.applyMove(position, move), engine.other(turn), depth - 1, -beta, -alpha, ply + 1)
                if (score > best) best = score
                if (score > alpha) alpha = score
                if (alpha >= beta) {
                    cutoff = true
                    break
                }
            }
            if (!cutoff) table.set(key, {depth, score: best})
            return best
        }

        for (let depth = 1; depth <= limit.depth; depth++) {
            let iterationMove = bestMove
            let iterationScore = -Infinity
            try {
                for (const move of rootMoves) {
                    if (timedOut()) throw new Error('timeout')
                    const score = -negamax(engine.applyMove(board, move), engine.other(side), depth - 1, -Infinity, Infinity, 1)
                    if (score > iterationScore) {
                        iterationScore = score
                        iterationMove = move
                    }
                }
                bestMove = iterationMove
                completedDepth = depth
                if (iterationScore >= MATE - 100) break
            } catch (error) {
                if (error.message !== 'timeout') throw error
                break
            }
        }
        return {move: bestMove, depth: completedDepth, nodes, elapsed: Math.round(now() - started)}
    }

    root.OfflineGames.XiangqiAI = {search, limits}
    if (typeof document === 'undefined' && typeof root.postMessage === 'function') {
        root.onmessage = event => {
            const {id, board, side, difficulty} = event.data
            const result = search(board, side, difficulty)
            root.postMessage({id, move: result.move, stats: {depth: result.depth, nodes: result.nodes, elapsed: result.elapsed}})
        }
    }
})(typeof self !== 'undefined' ? self : globalThis)
