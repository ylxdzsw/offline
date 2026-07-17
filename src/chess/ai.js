(function (root) {
    'use strict'
    const engine=root.OfflineGames.Chess
    const values={K:20000,Q:900,R:500,B:330,N:320,P:100},MATE=100000
    const limits={easy:{time:100,depth:2},medium:{time:450,depth:3},hard:{time:1200,depth:4}}
    const now=()=>typeof performance!=='undefined'?performance.now():Date.now()
    const evaluate=(state,side)=>{
        let score=0
        for(let index=0;index<64;index++){
            const piece=state.board[index];if(!piece)continue
            const type=engine.typeOf(piece),row=engine.rowOf(index),column=engine.columnOf(index),center=7-(Math.abs(3.5-row)+Math.abs(3.5-column))
            let positional=(type==='N'||type==='B'?center*3:type==='P'?(engine.sideOf(piece)===engine.WHITE?6-row:row-1)*7:0)
            score+=(engine.sideOf(piece)===side?1:-1)*(values[type]+positional)
        }
        return score
    }
    const order=moves=>moves.slice().sort((a,b)=>(b.captured?values[engine.typeOf(b.captured)]*10-values[engine.typeOf(b.piece)]:b.promotion?800:0)-(a.captured?values[engine.typeOf(a.captured)]*10-values[engine.typeOf(a.piece)]:a.promotion?800:0))
    const search=(state,difficulty='medium')=>{
        const limit=limits[difficulty]||limits.medium,started=now(),deadline=started+limit.time,rootSide=state.turn
        let nodes=0,completedDepth=0,bestMove=order(engine.legalMoves(state))[0]||null
        if(!bestMove)return{move:null,depth:0,nodes:0,elapsed:0}
        const timedOut=()=>now()>=deadline
        const negamax=(position,depth,alpha,beta,ply)=>{
            if((nodes++&255)===0&&timedOut())throw new Error('timeout')
            const moves=order(engine.legalMoves(position))
            if(!moves.length)return engine.isInCheck(position,position.turn)?-MATE+ply:0
            if(depth===0)return evaluate(position,position.turn)
            for(const move of moves){const score=-negamax(engine.applyMove(position,move),depth-1,-beta,-alpha,ply+1);if(score>alpha)alpha=score;if(alpha>=beta)break}
            return alpha
        }
        for(let depth=1;depth<=limit.depth;depth++){
            let next=bestMove,best=-Infinity
            try{for(const move of order(engine.legalMoves(state,rootSide))){if(timedOut())throw new Error('timeout');const score=-negamax(engine.applyMove(state,move),depth-1,-Infinity,Infinity,1);if(score>best){best=score;next=move}}bestMove=next;completedDepth=depth;if(best>=MATE-100)break}catch(error){if(error.message!=='timeout')throw error;break}
        }
        return{move:bestMove,depth:completedDepth,nodes,elapsed:Math.round(now()-started)}
    }
    const api={search,limits};root.OfflineGames=Object.assign(root.OfflineGames||{},{ChessAI:api})
    if(typeof document==='undefined'&&typeof root.postMessage==='function')root.onmessage=event=>{const{id,state,difficulty}=event.data;const result=search(state,difficulty);root.postMessage({id,move:result.move,stats:{depth:result.depth,nodes:result.nodes,elapsed:result.elapsed}})}
    if(typeof module==='object'&&module.exports)module.exports=api
})(typeof self!=='undefined'?self:globalThis)
