const test=require('node:test')
const assert=require('node:assert/strict')
const engine=require('./api.js')
const ai=require('./worker.js')

const square=name=>engine.at(8-Number(name[1]),name.charCodeAt(0)-97)
const play=(state,from,to,promotion)=>{
    const move=engine.legalMoves(state).find(candidate=>candidate.from===square(from)&&candidate.to===square(to)&&candidate.promotion===promotion)
    assert(move,`${from}-${to} should be legal`)
    return engine.applyMove(state,move)
}
const bare=()=>({board:Array(64).fill(null),turn:engine.WHITE,castling:{wK:false,wQ:false,bK:false,bQ:false},enPassant:null,halfmove:0,fullmove:1})

test('the initial position has 20 legal moves and neither king is checked',()=>{
    const state=engine.initialState()
    assert.equal(engine.legalMoves(state).length,20)
    assert.equal(engine.isInCheck(state,engine.WHITE),false)
    assert.equal(engine.isInCheck(state,engine.BLACK),false)
})

test('castling moves the rook and cannot cross an attacked square',()=>{
    const state=bare();state.board[square('e1')]='wK';state.board[square('h1')]='wR';state.board[square('e8')]='bK';state.castling.wK=true
    const castle=engine.legalMoves(state).find(move=>move.castle==='K')
    assert(castle)
    const next=engine.applyMove(state,castle)
    assert.equal(next.board[square('g1')],'wK');assert.equal(next.board[square('f1')],'wR');assert.equal(next.castling.wK,false)
    state.board[square('f8')]='bR'
    assert(!engine.legalMoves(state).some(move=>move.castle==='K'))
})

test('move application rejects self-check and out-of-board aliases',()=>{
    const state=bare();state.board[square('e1')]='wK';state.board[square('a8')]='bK';state.board[square('e8')]='bR';state.board[square('e2')]='wR'
    const exposesKing={from:square('e2'),to:square('d2')}
    assert(!engine.legalMoves(state).some(move=>move.from===exposesKing.from&&move.to===exposesKing.to))
    assert.throws(()=>engine.applyMove(state,exposesKing),/illegal chess move/)
    assert.throws(()=>engine.pseudoMovesFor(state,256),/invalid from/)
})

test('en passant is available for one move and removes the passed pawn',()=>{
    let state=engine.initialState()
    state=play(state,'e2','e4');state=play(state,'a7','a6');state=play(state,'e4','e5');state=play(state,'d7','d5')
    const capture=engine.legalMoves(state).find(move=>move.from===square('e5')&&move.to===square('d6'))
    assert.equal(capture.enPassant,true)
    state=engine.applyMove(state,capture)
    assert.equal(state.board[square('d5')],null);assert.equal(state.board[square('d6')],'wP')
})

test('all four promotions are generated',()=>{
    const state=bare();state.board[square('e1')]='wK';state.board[square('e8')]='bK';state.board[square('a7')]='wP'
    const promotions=engine.legalMoves(state).filter(move=>move.from===square('a7')).map(move=>move.promotion).sort()
    assert.deepEqual(promotions,['B','N','Q','R'])
})

test("Fool's mate is checkmate and bare kings are an insufficient-material draw",()=>{
    let state=engine.initialState();state=play(state,'f2','f3');state=play(state,'e7','e5');state=play(state,'g2','g4');state=play(state,'d8','h4')
    state.halfmove=100
    assert.deepEqual(engine.status(state),{ended:true,winner:engine.BLACK,reason:'checkmate'})
    const draw=bare();draw.board[square('e1')]='wK';draw.board[square('e8')]='bK'
    assert.deepEqual(engine.status(draw),{ended:true,winner:null,reason:'insufficient'})
})

test('an unusable en-passant square does not change repetition identity',()=>{
    const state=play(engine.initialState(),'e2','e4'),without={...state,enPassant:null}
    assert.equal(engine.positionKey(state),engine.positionKey(without))
    state.board[square('d4')]='bP'
    assert.notEqual(engine.positionKey(state),engine.positionKey({...state,enPassant:null}))
})

test('AI returns a legal move within the easy mobile budget',()=>{
    const state=engine.initialState(),started=Date.now(),result=ai.search(state,'easy')
    assert(engine.legalMoves(state).some(move=>move.from===result.move.from&&move.to===result.move.to))
    assert(Date.now()-started<1200)
})

test('seeded variation is reproducible, bounded, and never changes a forced mate',()=>{
    const opening=engine.initialState(),options={nodeBudget:4000,maxDepth:2,rootBand:120}
    const repeated=ai.search(opening,'easy',{...options,seed:7})
    assert.deepEqual(ai.search(opening,'easy',{...options,seed:7}).move,repeated.move)
    const choices=new Set([...Array(12).keys()].map(seed=>{
        const result=ai.search(opening,'easy',{...options,seed})
        assert(result.score-result.selectedScore<=options.rootBand)
        return `${result.move.from}-${result.move.to}`
    }))
    assert(choices.size>1)

    const mate=bare();mate.board[square('a8')]='bK';mate.board[square('b6')]='wK';mate.board[square('c7')]='wQ'
    const forced=[1,2,99].map(seed=>ai.search(mate,'easy',{nodeBudget:5000,maxDepth:3,rootBand:500,seed}).move)
    assert.deepEqual(forced,[forced[0],forced[0],forced[0]])
})

test('easy AI finds quiet mate preparations and the winning rook underpromotion across seeds',()=>{
    const fixtures=[
        {pieces:{h6:'bK',e5:'wK',g2:'wQ'},from:'e5',to:'f6'},
        {pieces:{h4:'bK',e4:'wK',a5:'wQ'},from:'e4',to:'f3'},
        {pieces:{a7:'bK',c6:'wK',c7:'wP'},from:'c7',to:'c8',promotion:'R'},
    ]
    for(const fixture of fixtures){
        const state=bare()
        for(const [name,piece] of Object.entries(fixture.pieces))state.board[square(name)]=piece
        for(const seed of [1,7,42]){
            const result=ai.search(state,'easy',{seed,nodeBudget:18000})
            assert.equal(result.move.from,square(fixture.from))
            assert.equal(result.move.to,square(fixture.to))
            assert.equal(result.move.promotion,fixture.promotion)
            assert(result.selectedScore>990000,'the selected line must retain the forced mate')
        }
    }
})

test('AI wins a royal fork and rejects a poisoned pawn',()=>{
    const fork=bare()
    for(const [name,piece] of Object.entries({g1:'wK',f7:'bK',f3:'wN',c6:'bQ',a8:'bR'}))fork.board[square(name)]=piece
    const poison=bare()
    for(const [name,piece] of Object.entries({g1:'wK',g8:'bK',d1:'wQ',d8:'bR',d5:'bP'}))poison.board[square(name)]=piece
    for(const seed of [1,7,42]){
        const capture=ai.search(fork,'easy',{seed,nodeBudget:18000}).move
        assert.equal(capture.from,square('f3'));assert.equal(capture.to,square('e5'))
        const move=ai.search(poison,'easy',{seed,nodeBudget:18000}).move
        assert.notEqual(move.to,square('d5'),'Qxd5 loses the queen to the defending rook')
    }
})

test('hard opening variation stays within sound central development',()=>{
    const state=engine.initialState(),choices=new Set(),sound=new Set(['e2-e4','d2-d4','g1-f3','b1-c3'].map(move=>move.split('-').map(square).join('-')))
    for(let seed=0;seed<16;seed++){
        const result=ai.search(state,'hard',{seed,nodeBudget:60000,maxDepth:4})
        const move=`${result.move.from}-${result.move.to}`
        assert(sound.has(move),`unexpected opening move ${move}`)
        assert(result.score-result.selectedScore<=ai.limits.hard.rootBand)
        choices.add(move)
    }
    assert(choices.size>=3,'replays should offer several strong openings')
})

test('a winning AI avoids claiming a third repetition when a better continuation exists',()=>{
    const state=bare()
    for(const [name,piece] of Object.entries({g1:'wK',g8:'bK',d1:'wQ',d5:'bR'}))state.board[square(name)]=piece
    const options={seed:7,nodeBudget:18000,maxDepth:3}
    const capture=ai.search(state,'easy',options).move
    assert.equal(capture.to,square('d5'))
    const repeated=engine.applyMove(state,capture)
    const result=ai.search(state,'easy',{...options,positions:[repeated,repeated,state]})
    assert.notEqual(result.move.to,square('d5'))
    assert(result.selectedScore>0)
})

test('king and rook convert against the defending AI before the fifty-move limit',()=>{
    let state=bare()
    state.board[square('e1')]='wK';state.board[square('d1')]='wR';state.board[square('d5')]='bK'
    const positions=[],counts={}
    let status
    for(let ply=0;ply<80;ply++){
        const key=engine.positionKey(state)
        counts[key]=(counts[key]||0)+1
        status=engine.status(state,counts)
        if(status.ended)break
        const result=ai.search(state,'medium',{seed:91+ply,nodeBudget:20000,maxDepth:5,positions:[...positions,state]})
        positions.push(state)
        state=engine.applyMove(state,result.move)
    }
    assert.deepEqual(status,{ended:true,winner:engine.WHITE,reason:'checkmate'})
})
