(function (root) {
    'use strict'
    const engine = root.OfflineGames.Junqi
    const revealedSet = values => new Set(values || [])
    const knownStrength = (piece, known) => {
        if (!piece || !known.has(piece.id)) return 4.5
        if (piece.type === engine.FLAG) return -20
        if (piece.type === engine.MINE) return 6
        if (piece.type === engine.BOMB) return 7
        return engine.RANK[piece.type]
    }
    const choose = ({board, side, difficulty, revealed}) => {
        const moves = engine.legalMoves(board, side)
        if (!moves.length) return null
        if (difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)]
        const known = revealedSet(revealed)
        const scored = moves.map(move => {
            const own = board[move.from], target = board[move.to]
            let score = Math.random() * (difficulty === 'hard' ? 2 : 7)
            if (target) {
                const enemy = knownStrength(target, known), mineRisk = known.has(target.id) && target.type === engine.MINE
                score += 14 + enemy
                if (own.type === engine.ENGINEER && mineRisk) score += 30
                if (known.has(target.id) && target.type === engine.FLAG) score += 1000
                if (known.has(target.id) && own.type !== engine.BOMB && own.type !== engine.ENGINEER && engine.RANK[own.type] < enemy) score -= 24
            }
            const progress = side === engine.BLACK ? engine.rowOf(move.to) - engine.rowOf(move.from) : engine.rowOf(move.from) - engine.rowOf(move.to)
            score += progress * 1.5
            if (engine.isCamp(move.to)) score += 4
            if (engine.isHQ(move.from)) score -= 3
            return {move, score}
        })
        scored.sort((a,b) => b.score - a.score)
        const pool = difficulty === 'hard' ? scored.slice(0, Math.min(3, scored.length)) : scored.slice(0, Math.min(7, scored.length))
        return pool[Math.floor(Math.random() * pool.length)].move
    }
    const api = {choose}
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {JunqiAI: api})
    if (typeof module === 'object' && module.exports) module.exports = api
    if (typeof root.postMessage === 'function' && typeof root.document === 'undefined') root.onmessage = event => root.postMessage({id: event.data.id, move: choose(event.data)})
})(typeof self !== 'undefined' ? self : globalThis)
