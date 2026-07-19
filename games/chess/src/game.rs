pub const SIZE: usize = 8;
pub const WHITE: u8 = 0;
pub const BLACK: u8 = 1;

pub const PAWN: u8 = 1;
pub const KNIGHT: u8 = 2;
pub const BISHOP: u8 = 3;
pub const ROOK: u8 = 4;
pub const QUEEN: u8 = 5;
pub const KING: u8 = 6;

pub const CASTLE_WHITE_KING: u8 = 1;
pub const CASTLE_WHITE_QUEEN: u8 = 2;
pub const CASTLE_BLACK_KING: u8 = 4;
pub const CASTLE_BLACK_QUEEN: u8 = 8;

pub const FLAG_DOUBLE_PAWN: u8 = 1;
pub const FLAG_EN_PASSANT: u8 = 2;
pub const FLAG_CASTLE_KING: u8 = 4;
pub const FLAG_CASTLE_QUEEN: u8 = 8;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct State {
    pub board: [u8; 64],
    pub turn: u8,
    pub castling: u8,
    pub en_passant: i16,
    pub halfmove: u16,
    pub fullmove: u16,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Move {
    pub from: u8,
    pub to: u8,
    pub promotion: u8,
    pub flags: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Playing,
    Check,
    Checkmate(u8),
    Stalemate,
    Repetition,
    FiftyMove,
    Insufficient,
}

#[inline]
pub const fn piece(side: u8, kind: u8) -> u8 {
    kind | (side << 3)
}

#[inline]
pub const fn side_of(value: u8) -> u8 {
    value >> 3
}

#[inline]
pub const fn kind_of(value: u8) -> u8 {
    value & 7
}

#[inline]
pub const fn other(side: u8) -> u8 {
    side ^ 1
}

#[inline]
pub const fn at(row: usize, column: usize) -> usize {
    row * SIZE + column
}

#[inline]
pub const fn row_of(index: usize) -> usize {
    index / SIZE
}

#[inline]
pub const fn column_of(index: usize) -> usize {
    index % SIZE
}

#[inline]
fn inside(row: i8, column: i8) -> bool {
    (0..8).contains(&row) && (0..8).contains(&column)
}

impl State {
    pub fn initial() -> Self {
        let mut board = [0; 64];
        let back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
        for column in 0..8 {
            board[at(0, column)] = piece(BLACK, back[column]);
            board[at(1, column)] = piece(BLACK, PAWN);
            board[at(6, column)] = piece(WHITE, PAWN);
            board[at(7, column)] = piece(WHITE, back[column]);
        }
        Self {
            board,
            turn: WHITE,
            castling: CASTLE_WHITE_KING
                | CASTLE_WHITE_QUEEN
                | CASTLE_BLACK_KING
                | CASTLE_BLACK_QUEEN,
            en_passant: -1,
            halfmove: 0,
            fullmove: 1,
        }
    }
}

fn push(
    moves: &mut Vec<Move>,
    state: &State,
    from: usize,
    row: i8,
    column: i8,
    promotion: u8,
    flags: u8,
) {
    if !inside(row, column) {
        return;
    }
    let to = at(row as usize, column as usize);
    let moving = state.board[from];
    let target = state.board[to];
    if target != 0 && (side_of(target) == side_of(moving) || kind_of(target) == KING) {
        return;
    }
    moves.push(Move {
        from: from as u8,
        to: to as u8,
        promotion,
        flags,
    });
}

fn slide(moves: &mut Vec<Move>, state: &State, from: usize, directions: &[(i8, i8)]) {
    let row = row_of(from) as i8;
    let column = column_of(from) as i8;
    let side = side_of(state.board[from]);
    for &(dr, dc) in directions {
        let mut r = row + dr;
        let mut c = column + dc;
        while inside(r, c) {
            let to = at(r as usize, c as usize);
            let target = state.board[to];
            if target == 0 {
                moves.push(Move {
                    from: from as u8,
                    to: to as u8,
                    promotion: 0,
                    flags: 0,
                });
            } else {
                if side_of(target) != side && kind_of(target) != KING {
                    moves.push(Move {
                        from: from as u8,
                        to: to as u8,
                        promotion: 0,
                        flags: 0,
                    });
                }
                break;
            }
            r += dr;
            c += dc;
        }
    }
}

pub fn is_square_attacked(state: &State, index: usize, by: u8) -> bool {
    let row = row_of(index) as i8;
    let column = column_of(index) as i8;
    let pawn_row = row + if by == WHITE { 1 } else { -1 };
    for dc in [-1, 1] {
        if inside(pawn_row, column + dc)
            && state.board[at(pawn_row as usize, (column + dc) as usize)] == piece(by, PAWN)
        {
            return true;
        }
    }
    for (dr, dc) in [
        (-2, -1),
        (-2, 1),
        (-1, -2),
        (-1, 2),
        (1, -2),
        (1, 2),
        (2, -1),
        (2, 1),
    ] {
        if inside(row + dr, column + dc)
            && state.board[at((row + dr) as usize, (column + dc) as usize)] == piece(by, KNIGHT)
        {
            return true;
        }
    }
    for (dr, dc) in [
        (-1, -1),
        (-1, 0),
        (-1, 1),
        (0, -1),
        (0, 1),
        (1, -1),
        (1, 0),
        (1, 1),
    ] {
        if inside(row + dr, column + dc)
            && state.board[at((row + dr) as usize, (column + dc) as usize)] == piece(by, KING)
        {
            return true;
        }
    }
    for &(dr, dc) in &[(1, 0), (-1, 0), (0, 1), (0, -1)] {
        let mut r = row + dr;
        let mut c = column + dc;
        while inside(r, c) {
            let value = state.board[at(r as usize, c as usize)];
            if value != 0 {
                if side_of(value) == by && matches!(kind_of(value), ROOK | QUEEN) {
                    return true;
                }
                break;
            }
            r += dr;
            c += dc;
        }
    }
    for &(dr, dc) in &[(1, 1), (1, -1), (-1, 1), (-1, -1)] {
        let mut r = row + dr;
        let mut c = column + dc;
        while inside(r, c) {
            let value = state.board[at(r as usize, c as usize)];
            if value != 0 {
                if side_of(value) == by && matches!(kind_of(value), BISHOP | QUEEN) {
                    return true;
                }
                break;
            }
            r += dr;
            c += dc;
        }
    }
    false
}

pub fn is_in_check(state: &State, side: u8) -> bool {
    state
        .board
        .iter()
        .position(|&value| value == piece(side, KING))
        .is_none_or(|king| is_square_attacked(state, king, other(side)))
}

pub fn pseudo_moves_for(state: &State, from: usize) -> Vec<Move> {
    let moving = state.board[from];
    if moving == 0 {
        return Vec::new();
    }
    let side = side_of(moving);
    let kind = kind_of(moving);
    let row = row_of(from) as i8;
    let column = column_of(from) as i8;
    let mut moves = Vec::new();
    match kind {
        PAWN => {
            let direction = if side == WHITE { -1 } else { 1 };
            let start = if side == WHITE { 6 } else { 1 };
            let promotion_row = if side == WHITE { 0 } else { 7 };
            let one = row + direction;
            if inside(one, column) && state.board[at(one as usize, column as usize)] == 0 {
                if one == promotion_row {
                    for promotion in [QUEEN, ROOK, BISHOP, KNIGHT] {
                        push(&mut moves, state, from, one, column, promotion, 0);
                    }
                } else {
                    push(&mut moves, state, from, one, column, 0, 0);
                    let two = row + direction * 2;
                    if row == start && state.board[at(two as usize, column as usize)] == 0 {
                        push(&mut moves, state, from, two, column, 0, FLAG_DOUBLE_PAWN);
                    }
                }
            }
            for dc in [-1, 1] {
                let r = row + direction;
                let c = column + dc;
                if !inside(r, c) {
                    continue;
                }
                let to = at(r as usize, c as usize);
                let target = state.board[to];
                if target != 0 && side_of(target) != side && kind_of(target) != KING {
                    if r == promotion_row {
                        for promotion in [QUEEN, ROOK, BISHOP, KNIGHT] {
                            push(&mut moves, state, from, r, c, promotion, 0);
                        }
                    } else {
                        push(&mut moves, state, from, r, c, 0, 0);
                    }
                } else if state.en_passant == to as i16 {
                    let captured_at = at(row as usize, c as usize);
                    if state.board[captured_at] == piece(other(side), PAWN) {
                        moves.push(Move {
                            from: from as u8,
                            to: to as u8,
                            promotion: 0,
                            flags: FLAG_EN_PASSANT,
                        });
                    }
                }
            }
        }
        KNIGHT => {
            for (dr, dc) in [
                (-2, -1),
                (-2, 1),
                (-1, -2),
                (-1, 2),
                (1, -2),
                (1, 2),
                (2, -1),
                (2, 1),
            ] {
                push(&mut moves, state, from, row + dr, column + dc, 0, 0);
            }
        }
        BISHOP => slide(
            &mut moves,
            state,
            from,
            &[(1, 1), (1, -1), (-1, 1), (-1, -1)],
        ),
        ROOK => slide(&mut moves, state, from, &[(1, 0), (-1, 0), (0, 1), (0, -1)]),
        QUEEN => slide(
            &mut moves,
            state,
            from,
            &[
                (1, 0),
                (-1, 0),
                (0, 1),
                (0, -1),
                (1, 1),
                (1, -1),
                (-1, 1),
                (-1, -1),
            ],
        ),
        KING => {
            for (dr, dc) in [
                (-1, -1),
                (-1, 0),
                (-1, 1),
                (0, -1),
                (0, 1),
                (1, -1),
                (1, 0),
                (1, 1),
            ] {
                push(&mut moves, state, from, row + dr, column + dc, 0, 0);
            }
            let home = if side == WHITE { 7 } else { 0 };
            let king_bit = if side == WHITE {
                CASTLE_WHITE_KING
            } else {
                CASTLE_BLACK_KING
            };
            let queen_bit = if side == WHITE {
                CASTLE_WHITE_QUEEN
            } else {
                CASTLE_BLACK_QUEEN
            };
            if from == at(home, 4) && !is_in_check(state, side) {
                if state.castling & king_bit != 0
                    && state.board[at(home, 7)] == piece(side, ROOK)
                    && state.board[at(home, 5)] == 0
                    && state.board[at(home, 6)] == 0
                    && !is_square_attacked(state, at(home, 5), other(side))
                    && !is_square_attacked(state, at(home, 6), other(side))
                {
                    moves.push(Move {
                        from: from as u8,
                        to: at(home, 6) as u8,
                        promotion: 0,
                        flags: FLAG_CASTLE_KING,
                    });
                }
                if state.castling & queen_bit != 0
                    && state.board[at(home, 0)] == piece(side, ROOK)
                    && state.board[at(home, 1)] == 0
                    && state.board[at(home, 2)] == 0
                    && state.board[at(home, 3)] == 0
                    && !is_square_attacked(state, at(home, 3), other(side))
                    && !is_square_attacked(state, at(home, 2), other(side))
                {
                    moves.push(Move {
                        from: from as u8,
                        to: at(home, 2) as u8,
                        promotion: 0,
                        flags: FLAG_CASTLE_QUEEN,
                    });
                }
            }
        }
        _ => {}
    }
    moves
}

pub fn pseudo_moves(state: &State, side: u8) -> Vec<Move> {
    let mut moves = Vec::new();
    for from in 0..64 {
        if state.board[from] != 0 && side_of(state.board[from]) == side {
            moves.extend(pseudo_moves_for(state, from));
        }
    }
    moves
}

pub fn legal_moves(state: &State, side: u8) -> Vec<Move> {
    pseudo_moves(state, side)
        .into_iter()
        .filter(|&candidate| !is_in_check(&apply_move(state, candidate), side))
        .collect()
}

fn revoke_rook_right(castling: &mut u8, square: usize) {
    let bit = match square {
        56 => CASTLE_WHITE_QUEEN,
        63 => CASTLE_WHITE_KING,
        0 => CASTLE_BLACK_QUEEN,
        7 => CASTLE_BLACK_KING,
        _ => 0,
    };
    *castling &= !bit;
}

pub fn apply_move(state: &State, mv: Move) -> State {
    let mut next = state.clone();
    let from = mv.from as usize;
    let to = mv.to as usize;
    let moving = state.board[from];
    let side = side_of(moving);
    let captured = if mv.flags & FLAG_EN_PASSANT != 0 {
        let captured_at = at(row_of(from), column_of(to));
        let value = next.board[captured_at];
        next.board[captured_at] = 0;
        value
    } else {
        state.board[to]
    };
    next.board[from] = 0;
    next.board[to] = if mv.promotion != 0 {
        piece(side, mv.promotion)
    } else {
        moving
    };
    if mv.flags & (FLAG_CASTLE_KING | FLAG_CASTLE_QUEEN) != 0 {
        let row = row_of(from);
        let king_side = mv.flags & FLAG_CASTLE_KING != 0;
        let rook_from = at(row, if king_side { 7 } else { 0 });
        let rook_to = at(row, if king_side { 5 } else { 3 });
        next.board[rook_to] = next.board[rook_from];
        next.board[rook_from] = 0;
    }
    if kind_of(moving) == KING {
        next.castling &= if side == WHITE {
            !(CASTLE_WHITE_KING | CASTLE_WHITE_QUEEN)
        } else {
            !(CASTLE_BLACK_KING | CASTLE_BLACK_QUEEN)
        };
    }
    if kind_of(moving) == ROOK {
        revoke_rook_right(&mut next.castling, from);
    }
    if captured != 0 && kind_of(captured) == ROOK {
        revoke_rook_right(&mut next.castling, to);
    }
    next.en_passant = if mv.flags & FLAG_DOUBLE_PAWN != 0 {
        at((row_of(from) + row_of(to)) / 2, column_of(from)) as i16
    } else {
        -1
    };
    next.halfmove = if kind_of(moving) == PAWN || captured != 0 {
        0
    } else {
        state.halfmove + 1
    };
    next.fullmove = state.fullmove + u16::from(side == BLACK);
    next.turn = other(side);
    next
}

pub fn effective_en_passant(state: &State) -> i16 {
    if state.en_passant >= 0
        && legal_moves(state, state.turn)
            .iter()
            .any(|mv| mv.flags & FLAG_EN_PASSANT != 0)
    {
        state.en_passant
    } else {
        -1
    }
}

pub fn insufficient_material(board: &[u8; 64]) -> bool {
    let pieces: Vec<(usize, u8)> = board
        .iter()
        .copied()
        .enumerate()
        .filter(|(_, value)| *value != 0 && kind_of(*value) != KING)
        .collect();
    if pieces
        .iter()
        .any(|(_, value)| matches!(kind_of(*value), PAWN | ROOK | QUEEN))
    {
        return false;
    }
    if pieces.len() <= 1 {
        return true;
    }
    pieces.iter().all(|(_, value)| kind_of(*value) == BISHOP)
        && pieces
            .iter()
            .map(|(index, _)| (row_of(*index) + column_of(*index)) & 1)
            .all(|color| color == (row_of(pieces[0].0) + column_of(pieces[0].0)) & 1)
}

pub fn status(state: &State, repetitions: u8) -> Outcome {
    let moves = legal_moves(state, state.turn);
    if moves.is_empty() {
        return if is_in_check(state, state.turn) {
            Outcome::Checkmate(other(state.turn))
        } else {
            Outcome::Stalemate
        };
    }
    if repetitions >= 3 {
        return Outcome::Repetition;
    }
    if state.halfmove >= 100 {
        return Outcome::FiftyMove;
    }
    if insufficient_material(&state.board) {
        return Outcome::Insufficient;
    }
    if is_in_check(state, state.turn) {
        Outcome::Check
    } else {
        Outcome::Playing
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn perft(state: &State, depth: u8) -> u64 {
        if depth == 0 {
            return 1;
        }
        legal_moves(state, state.turn)
            .into_iter()
            .map(|mv| perft(&apply_move(state, mv), depth - 1))
            .sum()
    }

    #[test]
    fn initial_perft_matches_orthodox_chess() {
        let state = State::initial();
        assert_eq!(perft(&state, 1), 20);
        assert_eq!(perft(&state, 2), 400);
        assert_eq!(perft(&state, 3), 8_902);
    }

    #[test]
    fn apply_does_not_mutate_input() {
        let state = State::initial();
        let before = state.clone();
        let mv = legal_moves(&state, WHITE)[0];
        let _ = apply_move(&state, mv);
        assert_eq!(state, before);
    }
}
