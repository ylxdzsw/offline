(function (root) {
    'use strict'

    const engine = root.OfflineGames.Wuziqi
    const WIN = 100000000
    const limits = {
        easy: {time: 100, depth: 1, candidates: 8},
        medium: {time: 500, depth: 3, candidates: 12},
        hard: {time: 1500, depth: 5, candidates: 16},
    }
    const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now()

    const candidates = board => {
        if (board.every(value => value === engine.EMPTY)) return [engine.at(7, 7)]
        const found = new Set()
        for (let index = 0; index < board.length; index++) if (board[index]) {
            const row = engine.rowOf(index)
            const column = engine.columnOf(index)
            for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
                const nextRow = row + dr
                const nextColumn = column + dc
                if (engine.inside(nextRow, nextColumn)) {
                    const target = engine.at(nextRow, nextColumn)
                    if (board[target] === engine.EMPTY) found.add(target)
                }
            }
        }
        return [...found]
    }

    const runScore = (length, openEnds) => {
        if (length >= 5) return WIN
        if (length === 4 && openEnds === 2) return 1000000
        if (length === 4 && openEnds === 1) return 150000
        if (length === 3 && openEnds === 2) return 30000
        if (length === 3 && openEnds === 1) return 4000
        if (length === 2 && openEnds === 2) return 800
        if (length === 2 && openEnds === 1) return 120
        if (length === 1 && openEnds === 2) return 20
        return 0
    }

    const scoreSide = (board, side) => {
        let score = 0
        for (let index = 0; index < board.length; index++) {
            if (board[index] !== side) continue
            const row = engine.rowOf(index)
            const column = engine.columnOf(index)
            for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
                const previousRow = row - dr
                const previousColumn = column - dc
                if (engine.inside(previousRow, previousColumn) && board[engine.at(previousRow, previousColumn)] === side) continue
                let length = 0
                let nextRow = row
                let nextColumn = column
                while (engine.inside(nextRow, nextColumn) && board[engine.at(nextRow, nextColumn)] === side) {
                    length++
                    nextRow += dr
                    nextColumn += dc
                }
                let openEnds = 0
                if (engine.inside(previousRow, previousColumn) && board[engine.at(previousRow, previousColumn)] === engine.EMPTY) openEnds++
                if (engine.inside(nextRow, nextColumn) && board[engine.at(nextRow, nextColumn)] === engine.EMPTY) openEnds++
                score += runScore(length, openEnds)
            }
        }
        return score
    }
    const evaluate = (board, side) => scoreSide(board, side) - scoreSide(board, engine.other(side)) * 1.08
    const quickScore = (board, index, side) => {
        const own = engine.applyMove(board, index, side)
        if (engine.isWin(own, index, side)) return WIN
        const opponent = engine.other(side)
        const block = engine.applyMove(board, index, opponent)
        if (engine.isWin(block, index, opponent)) return WIN / 2
        return evaluate(own, side)
    }
    const orderedCandidates = (board, side, count) => candidates(board)
        .map(index => ({index, score: quickScore(board, index, side)}))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, count)
        .map(entry => entry.index)

    const search = (board, side, difficulty = 'medium') => {
        const limit = limits[difficulty] || limits.medium
        const started = now()
        const deadline = started + limit.time
        let nodes = 0
        let completedDepth = 0
        const available = candidates(board)
        if (!available.length) return {move: null, depth: 0, nodes: 0, elapsed: 0}

        for (const index of available) if (engine.isWin(engine.applyMove(board, index, side), index, side)) {
            return {move: index, depth: 1, nodes: available.length, elapsed: Math.round(now() - started)}
        }
        const opponent = engine.other(side)
        for (const index of available) if (engine.isWin(engine.applyMove(board, index, opponent), index, opponent)) {
            return {move: index, depth: 1, nodes: available.length * 2, elapsed: Math.round(now() - started)}
        }

        let bestMove = orderedCandidates(board, side, limit.candidates)[0]
        const table = new Map()
        const keyOf = (position, turn, depth, ply) => turn + ':' + depth + ':' + ply + ':' + position.join('')
        const negamax = (position, turn, depth, alpha, beta, lastMove, ply) => {
            if ((nodes++ & 127) === 0 && now() >= deadline) throw new Error('timeout')
            if (lastMove != null && engine.isWin(position, lastMove, engine.other(turn))) return -WIN + ply
            if (depth === 0 || !position.includes(engine.EMPTY)) return evaluate(position, turn)
            const key = keyOf(position, turn, depth, ply)
            if (table.has(key)) return table.get(key)
            const moves = orderedCandidates(position, turn, limit.candidates)
            let best = -Infinity
            let cutoff = false
            for (const index of moves) {
                const score = -negamax(engine.applyMove(position, index, turn), engine.other(turn), depth - 1, -beta, -alpha, index, ply + 1)
                if (score > best) best = score
                if (score > alpha) alpha = score
                if (alpha >= beta) {
                    cutoff = true
                    break
                }
            }
            if (!cutoff) table.set(key, best)
            return best
        }

        for (let depth = 1; depth <= limit.depth; depth += 2) {
            let iterationMove = bestMove
            let iterationScore = -Infinity
            try {
                for (const index of orderedCandidates(board, side, limit.candidates)) {
                    if (now() >= deadline) throw new Error('timeout')
                    const score = -negamax(engine.applyMove(board, index, side), opponent, depth - 1, -Infinity, Infinity, index, 1)
                    if (score > iterationScore) {
                        iterationScore = score
                        iterationMove = index
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

    root.OfflineGames.WuziqiAI = {search, limits, candidates}
    if (typeof document === 'undefined' && typeof root.postMessage === 'function') {
        root.onmessage = event => {
            const {id, board, side, difficulty} = event.data
            const result = search(board, side, difficulty)
            root.postMessage({id, move: result.move, stats: {depth: result.depth, nodes: result.nodes, elapsed: result.elapsed}})
        }
    }
})(typeof self !== 'undefined' ? self : globalThis)
