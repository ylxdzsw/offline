(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {Chess: api})
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict'

    const SIZE = 8, WHITE = 'w', BLACK = 'b'
    const other = side => side === WHITE ? BLACK : WHITE
    const at = (row,column) => row * SIZE + column
    const rowOf = index => Math.floor(index / SIZE)
    const columnOf = index => index % SIZE
    const inside = (row,column) => row >= 0 && row < SIZE && column >= 0 && column < SIZE
    const sideOf = piece => piece?.[0] || null
    const typeOf = piece => piece?.[1] || null
    const initialBoard = () => {
        const board = Array(64).fill(null), back = ['R','N','B','Q','K','B','N','R']
        for (let column=0;column<SIZE;column++) {
            board[at(0,column)] = BLACK + back[column]; board[at(1,column)] = BLACK+'P'
            board[at(6,column)] = WHITE+'P'; board[at(7,column)] = WHITE + back[column]
        }
        return board
    }
    const initialState = () => ({board:initialBoard(),turn:WHITE,castling:{wK:true,wQ:true,bK:true,bQ:true},enPassant:null,halfmove:0,fullmove:1})
    const add = (moves,state,from,row,column,extra={}) => {
        if (!inside(row,column)) return
        const piece=state.board[from], target=at(row,column), captured=state.board[target]
        if (sideOf(captured)===sideOf(piece) || typeOf(captured)==='K') return
        moves.push({from,to:target,piece,captured,...extra})
    }
    const slide = (moves,state,from,directions) => {
        const row=rowOf(from),column=columnOf(from),side=sideOf(state.board[from])
        for (const [dr,dc] of directions) for (let r=row+dr,c=column+dc;inside(r,c);r+=dr,c+=dc) {
            const target=at(r,c), captured=state.board[target]
            if (!captured) moves.push({from,to:target,piece:state.board[from],captured:null})
            else { if (sideOf(captured)!==side && typeOf(captured)!=='K') moves.push({from,to:target,piece:state.board[from],captured}); break }
        }
    }
    const isSquareAttacked = (state,index,by) => {
        const board=state.board,row=rowOf(index),column=columnOf(index)
        const pawnSourceRow=row+(by===WHITE?1:-1)
        for (const dc of [-1,1]) if (inside(pawnSourceRow,column+dc)&&board[at(pawnSourceRow,column+dc)]===by+'P') return true
        for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) if (inside(row+dr,column+dc)&&board[at(row+dr,column+dc)]===by+'N') return true
        for (const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) if (inside(row+dr,column+dc)&&board[at(row+dr,column+dc)]===by+'K') return true
        for (const [directions,types] of [[[[1,0],[-1,0],[0,1],[0,-1]],['R','Q']],[[[1,1],[1,-1],[-1,1],[-1,-1]],['B','Q']]]) for (const [dr,dc] of directions) {
            for (let r=row+dr,c=column+dc;inside(r,c);r+=dr,c+=dc) {
                const piece=board[at(r,c)]; if (!piece) continue
                if (sideOf(piece)===by&&types.includes(typeOf(piece))) return true
                break
            }
        }
        return false
    }
    const isInCheck = (state,side) => { const king=state.board.indexOf(side+'K'); return king<0||isSquareAttacked(state,king,other(side)) }
    const pseudoMovesFor = (state,from) => {
        const piece=state.board[from]
        if (!piece) return []
        const side=sideOf(piece),type=typeOf(piece),row=rowOf(from),column=columnOf(from),moves=[]
        if (type==='P') {
            const direction=side===WHITE?-1:1,start=side===WHITE?6:1,promotionRow=side===WHITE?0:7,oneRow=row+direction
            if (inside(oneRow,column)&&!state.board[at(oneRow,column)]) {
                const target=at(oneRow,column)
                if (oneRow===promotionRow) for (const promotion of ['Q','R','B','N']) add(moves,state,from,oneRow,column,{promotion})
                else add(moves,state,from,oneRow,column)
                const twoRow=row+2*direction
                if (row===start&&!state.board[at(twoRow,column)]) add(moves,state,from,twoRow,column,{doublePawn:true})
            }
            for (const dc of [-1,1]) {
                const r=row+direction,c=column+dc
                if (!inside(r,c)) continue
                const target=at(r,c),captured=state.board[target]
                if (captured&&sideOf(captured)!==side&&typeOf(captured)!=='K') {
                    if (r===promotionRow) for (const promotion of ['Q','R','B','N']) add(moves,state,from,r,c,{promotion})
                    else add(moves,state,from,r,c)
                } else if (target===state.enPassant) {
                    const capturedAt=at(row,c),victim=state.board[capturedAt]
                    if (victim===other(side)+'P') moves.push({from,to:target,piece,captured:victim,enPassant:true,capturedAt})
                }
            }
        } else if (type==='N') for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(moves,state,from,row+dr,column+dc)
        else if (type==='B') slide(moves,state,from,[[1,1],[1,-1],[-1,1],[-1,-1]])
        else if (type==='R') slide(moves,state,from,[[1,0],[-1,0],[0,1],[0,-1]])
        else if (type==='Q') slide(moves,state,from,[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]])
        else if (type==='K') {
            for (const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) add(moves,state,from,row+dr,column+dc)
            const home=side===WHITE?7:0,enemy=other(side)
            if (from===at(home,4)&&!isInCheck(state,side)) {
                if (state.castling[side+'K']&&state.board[at(home,7)]===side+'R'&&!state.board[at(home,5)]&&!state.board[at(home,6)]&&!isSquareAttacked(state,at(home,5),enemy)&&!isSquareAttacked(state,at(home,6),enemy)) moves.push({from,to:at(home,6),piece,captured:null,castle:'K'})
                if (state.castling[side+'Q']&&state.board[at(home,0)]===side+'R'&&!state.board[at(home,1)]&&!state.board[at(home,2)]&&!state.board[at(home,3)]&&!isSquareAttacked(state,at(home,3),enemy)&&!isSquareAttacked(state,at(home,2),enemy)) moves.push({from,to:at(home,2),piece,captured:null,castle:'Q'})
            }
        }
        return moves
    }
    const applyMove = (state,move) => {
        const board=state.board.slice(),piece=board[move.from],side=sideOf(piece),castling={...state.castling}
        board[move.from]=null
        if (move.enPassant) board[move.capturedAt]=null
        board[move.to]=move.promotion?side+move.promotion:piece
        if (move.castle) {
            const row=rowOf(move.from),rookFrom=move.castle==='K'?at(row,7):at(row,0),rookTo=move.castle==='K'?at(row,5):at(row,3)
            board[rookTo]=board[rookFrom]; board[rookFrom]=null
        }
        if (typeOf(piece)==='K') { castling[side+'K']=false; castling[side+'Q']=false }
        if (typeOf(piece)==='R') {
            if (move.from===at(7,0)) castling.wQ=false; if (move.from===at(7,7)) castling.wK=false
            if (move.from===at(0,0)) castling.bQ=false; if (move.from===at(0,7)) castling.bK=false
        }
        if (typeOf(move.captured)==='R') {
            if (move.to===at(7,0)) castling.wQ=false; if (move.to===at(7,7)) castling.wK=false
            if (move.to===at(0,0)) castling.bQ=false; if (move.to===at(0,7)) castling.bK=false
        }
        const enPassant=move.doublePawn?at((rowOf(move.from)+rowOf(move.to))/2,columnOf(move.from)):null
        return {board,turn:other(side),castling,enPassant,halfmove:typeOf(piece)==='P'||move.captured?0:state.halfmove+1,fullmove:state.fullmove+(side===BLACK?1:0)}
    }
    const pseudoMoves = (state,side) => state.board.flatMap((piece,index)=>sideOf(piece)===side?pseudoMovesFor(state,index):[])
    const legalMoves = (state,side=state.turn) => pseudoMoves(state,side).filter(move=>!isInCheck(applyMove(state,move),side))
    const positionKey = state => {
        const effectiveEnPassant=state.enPassant!=null&&legalMoves(state,state.turn).some(move=>move.enPassant)?state.enPassant:'-'
        return `${state.turn}:${state.board.map(piece=>piece||'--').join('')}:${Object.entries(state.castling).filter(([,allowed])=>allowed).map(([key])=>key).join('')}:${effectiveEnPassant}`
    }
    const insufficientMaterial = board => {
        const pieces=board.map((piece,index)=>({piece,index})).filter(({piece})=>piece&&typeOf(piece)!=='K')
        if (pieces.some(({piece})=>['P','R','Q'].includes(typeOf(piece)))) return false
        if (pieces.length<=1) return true
        return pieces.every(({piece})=>typeOf(piece)==='B')&&new Set(pieces.map(({index})=>(rowOf(index)+columnOf(index))%2)).size===1
    }
    const status = (state,repetitions={}) => {
        const moves=legalMoves(state,state.turn)
        if (!moves.length) return isInCheck(state,state.turn)?{ended:true,winner:other(state.turn),reason:'checkmate'}:{ended:true,winner:null,reason:'stalemate'}
        if ((repetitions[positionKey(state)]||0)>=3) return {ended:true,winner:null,reason:'repetition'}
        if (state.halfmove>=100) return {ended:true,winner:null,reason:'fiftyMove'}
        if (insufficientMaterial(state.board)) return {ended:true,winner:null,reason:'insufficient'}
        return {ended:false,winner:null,reason:isInCheck(state,state.turn)?'check':'playing'}
    }
    return {SIZE,WHITE,BLACK,other,at,rowOf,columnOf,inside,sideOf,typeOf,initialBoard,initialState,isSquareAttacked,isInCheck,pseudoMovesFor,pseudoMoves,legalMoves,applyMove,positionKey,insufficientMaterial,status}
})
