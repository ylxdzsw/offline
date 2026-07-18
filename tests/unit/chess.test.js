const test=require('node:test')
const assert=require('node:assert/strict')
const engine=require('../../src/chess/engine.js')
const ai=require('../../src/chess/ai.js')

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
