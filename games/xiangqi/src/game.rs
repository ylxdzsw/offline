pub const ROWS: usize = 10;
pub const COLS: usize = 9;
pub const RED: u8 = 0;
pub const BLACK: u8 = 1;

pub const KING: u8 = 1;
pub const ADVISOR: u8 = 2;
pub const ELEPHANT: u8 = 3;
pub const HORSE: u8 = 4;
pub const ROOK: u8 = 5;
pub const CANNON: u8 = 6;
pub const PAWN: u8 = 7;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct State {
    pub board: [u8; ROWS * COLS],
    pub turn: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Move {
    pub from: u8,
    pub to: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Playing,
    Check,
    Checkmate(u8),
    Stalemate(u8),
    Repetition,
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
    row * COLS + column
}

#[inline]
pub const fn row_of(index: usize) -> usize {
    index / COLS
}

#[inline]
pub const fn column_of(index: usize) -> usize {
    index % COLS
}

#[inline]
fn inside(row: i8, column: i8) -> bool {
    (0..ROWS as i8).contains(&row) && (0..COLS as i8).contains(&column)
}

#[inline]
fn palace(side: u8, row: i8, column: i8) -> bool {
    (3..=5).contains(&column)
        && if side == RED {
            (7..=9).contains(&row)
        } else {
            (0..=2).contains(&row)
        }
}

impl State {
    pub fn initial() -> Self {
        let mut board = [0; ROWS * COLS];
        let back = [
            ROOK, HORSE, ELEPHANT, ADVISOR, KING, ADVISOR, ELEPHANT, HORSE, ROOK,
        ];
        for column in 0..COLS {
            board[at(0, column)] = piece(BLACK, back[column]);
            board[at(9, column)] = piece(RED, back[column]);
        }
        board[at(2, 1)] = piece(BLACK, CANNON);
        board[at(2, 7)] = piece(BLACK, CANNON);
        board[at(7, 1)] = piece(RED, CANNON);
        board[at(7, 7)] = piece(RED, CANNON);
        for column in [0, 2, 4, 6, 8] {
            board[at(3, column)] = piece(BLACK, PAWN);
            board[at(6, column)] = piece(RED, PAWN);
        }
        Self { board, turn: RED }
    }
}

fn push_if_open(moves: &mut Vec<Move>, state: &State, side: u8, from: usize, row: i8, column: i8) {
    if !inside(row, column) {
        return;
    }
    let to = at(row as usize, column as usize);
    let target = state.board[to];
    if target == 0 || side_of(target) != side {
        moves.push(Move {
            from: from as u8,
            to: to as u8,
        });
    }
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
        KING => {
            for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                let r = row + dr;
                let c = column + dc;
                if palace(side, r, c) {
                    push_if_open(&mut moves, state, side, from, r, c);
                }
            }
            for direction in [-1, 1] {
                let mut r = row + direction;
                while inside(r, column) {
                    let value = state.board[at(r as usize, column as usize)];
                    if value != 0 {
                        if value == piece(other(side), KING) {
                            push_if_open(&mut moves, state, side, from, r, column);
                        }
                        break;
                    }
                    r += direction;
                }
            }
        }
        ADVISOR => {
            for (dr, dc) in [(-1, -1), (-1, 1), (1, -1), (1, 1)] {
                let r = row + dr;
                let c = column + dc;
                if palace(side, r, c) {
                    push_if_open(&mut moves, state, side, from, r, c);
                }
            }
        }
        ELEPHANT => {
            for (dr, dc) in [(-2, -2), (-2, 2), (2, -2), (2, 2)] {
                let r = row + dr;
                let c = column + dc;
                let stays_home = if side == RED { r >= 5 } else { r <= 4 };
                if inside(r, c)
                    && stays_home
                    && state.board[at((row + dr / 2) as usize, (column + dc / 2) as usize)] == 0
                {
                    push_if_open(&mut moves, state, side, from, r, c);
                }
            }
        }
        HORSE => {
            for (dr, dc, lr, lc) in [
                (-2, -1, -1, 0),
                (-2, 1, -1, 0),
                (2, -1, 1, 0),
                (2, 1, 1, 0),
                (-1, -2, 0, -1),
                (1, -2, 0, -1),
                (-1, 2, 0, 1),
                (1, 2, 0, 1),
            ] {
                if inside(row + lr, column + lc)
                    && state.board[at((row + lr) as usize, (column + lc) as usize)] == 0
                {
                    push_if_open(&mut moves, state, side, from, row + dr, column + dc);
                }
            }
        }
        ROOK | CANNON => {
            for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                let mut screened = false;
                let mut r = row + dr;
                let mut c = column + dc;
                while inside(r, c) {
                    let to = at(r as usize, c as usize);
                    let target = state.board[to];
                    if kind == ROOK {
                        if target == 0 {
                            moves.push(Move {
                                from: from as u8,
                                to: to as u8,
                            });
                        } else {
                            if side_of(target) != side {
                                moves.push(Move {
                                    from: from as u8,
                                    to: to as u8,
                                });
                            }
                            break;
                        }
                    } else if !screened {
                        if target == 0 {
                            moves.push(Move {
                                from: from as u8,
                                to: to as u8,
                            });
                        } else {
                            screened = true;
                        }
                    } else if target != 0 {
                        if side_of(target) != side {
                            moves.push(Move {
                                from: from as u8,
                                to: to as u8,
                            });
                        }
                        break;
                    }
                    r += dr;
                    c += dc;
                }
            }
        }
        PAWN => {
            let direction = if side == RED { -1 } else { 1 };
            push_if_open(&mut moves, state, side, from, row + direction, column);
            let crossed = if side == RED { row <= 4 } else { row >= 5 };
            if crossed {
                push_if_open(&mut moves, state, side, from, row, column - 1);
                push_if_open(&mut moves, state, side, from, row, column + 1);
            }
        }
        _ => {}
    }
    moves
}

pub fn pseudo_moves(state: &State, side: u8) -> Vec<Move> {
    let mut moves = Vec::new();
    for from in 0..state.board.len() {
        if state.board[from] != 0 && side_of(state.board[from]) == side {
            moves.extend(pseudo_moves_for(state, from));
        }
    }
    moves
}

pub fn apply_move(state: &State, mv: Move) -> State {
    let mut next = state.clone();
    next.board[mv.to as usize] = next.board[mv.from as usize];
    next.board[mv.from as usize] = 0;
    next.turn = other(state.turn);
    next
}

pub fn is_in_check(state: &State, side: u8) -> bool {
    let Some(king) = state
        .board
        .iter()
        .position(|&value| value == piece(side, KING))
    else {
        return true;
    };
    pseudo_moves(state, other(side))
        .iter()
        .any(|mv| mv.to as usize == king)
}

pub fn legal_moves(state: &State, side: u8) -> Vec<Move> {
    pseudo_moves(state, side)
        .into_iter()
        .filter(|&candidate| !is_in_check(&apply_move(state, candidate), side))
        .collect()
}

pub fn status(state: &State, repetitions: u8) -> Outcome {
    if repetitions >= 3 {
        return Outcome::Repetition;
    }
    let moves = legal_moves(state, state.turn);
    if moves.is_empty() {
        return if is_in_check(state, state.turn) {
            Outcome::Checkmate(other(state.turn))
        } else {
            Outcome::Stalemate(other(state.turn))
        };
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
    fn initial_perft_matches_reference_engine() {
        let state = State::initial();
        assert_eq!(perft(&state, 1), 44);
        assert_eq!(perft(&state, 2), 1_920);
        assert_eq!(perft(&state, 3), 79_666);
    }

    #[test]
    fn applying_a_move_preserves_the_input() {
        let state = State::initial();
        let before = state.clone();
        let mv = legal_moves(&state, RED)[0];
        let _ = apply_move(&state, mv);
        assert_eq!(state, before);
    }
}
