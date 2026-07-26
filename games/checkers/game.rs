pub const SIZE: usize = 8;
pub const EMPTY: u8 = 0;
pub const BLACK: u8 = 1;
pub const RED: u8 = 2;
pub const BLACK_MAN: u8 = 1;
pub const BLACK_KING: u8 = 2;
pub const RED_MAN: u8 = 3;
pub const RED_KING: u8 = 4;
pub const DRAW_PLIES: u16 = 80;

const BLACK_DIRECTIONS: [(i8, i8); 2] = [(-1, -1), (-1, 1)];
const RED_DIRECTIONS: [(i8, i8); 2] = [(1, -1), (1, 1)];
const KING_DIRECTIONS: [(i8, i8); 4] = [(-1, -1), (-1, 1), (1, -1), (1, 1)];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Position {
    pub(crate) black: u64,
    pub(crate) red: u64,
    pub(crate) kings: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Move {
    pub from: u8,
    pub path: Vec<u8>,
    pub captures: Vec<u8>,
    pub promotes: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Playing,
    Win(u8),
    Repetition,
    FortyMove,
}

pub const fn other(side: u8) -> u8 {
    if side == BLACK { RED } else { BLACK }
}

pub const fn side_of(piece: u8) -> u8 {
    match piece {
        BLACK_MAN | BLACK_KING => BLACK,
        RED_MAN | RED_KING => RED,
        _ => EMPTY,
    }
}

pub const fn is_king(piece: u8) -> bool {
    matches!(piece, BLACK_KING | RED_KING)
}

pub const fn king(side: u8) -> u8 {
    if side == BLACK { BLACK_KING } else { RED_KING }
}

pub const fn row_of(index: u8) -> i8 {
    (index / SIZE as u8) as i8
}

pub const fn column_of(index: u8) -> i8 {
    (index % SIZE as u8) as i8
}

pub const fn at(row: i8, column: i8) -> u8 {
    (row * SIZE as i8 + column) as u8
}

pub const fn inside(row: i8, column: i8) -> bool {
    row >= 0 && row < SIZE as i8 && column >= 0 && column < SIZE as i8
}

pub const fn playable(index: u8) -> bool {
    (row_of(index) + column_of(index)) & 1 == 1
}

fn directions(piece: u8) -> &'static [(i8, i8)] {
    if is_king(piece) {
        &KING_DIRECTIONS
    } else if side_of(piece) == BLACK {
        &BLACK_DIRECTIONS
    } else {
        &RED_DIRECTIONS
    }
}

fn promotion_row(side: u8) -> i8 {
    if side == BLACK { 0 } else { 7 }
}

impl Position {
    pub fn initial() -> Self {
        let mut board = [EMPTY; 64];
        for index in 0_u8..64 {
            if !playable(index) {
                continue;
            }
            board[index as usize] = match row_of(index) {
                0..=2 => RED_MAN,
                5..=7 => BLACK_MAN,
                _ => EMPTY,
            };
        }
        Self::from_board(&board).expect("the initial checkers board is valid")
    }

    pub fn from_board(board: &[u8]) -> Result<Self, &'static str> {
        if board.len() != 64 {
            return Err("board must contain 64 cells");
        }
        let mut position = Self {
            black: 0,
            red: 0,
            kings: 0,
        };
        for (index, piece) in board.iter().copied().enumerate() {
            if piece > RED_KING {
                return Err("board contains an invalid piece");
            }
            if piece != EMPTY && !playable(index as u8) {
                return Err("pieces must stay on dark squares");
            }
            position.set_piece(index as u8, piece);
        }
        if position.count(BLACK) > 12 || position.count(RED) > 12 {
            return Err("a side cannot have more than 12 pieces");
        }
        Ok(position)
    }

    pub fn board(self) -> [u8; 64] {
        let mut board = [EMPTY; 64];
        for index in 0_u8..64 {
            board[index as usize] = self.piece_at(index);
        }
        board
    }

    pub fn piece_at(self, index: u8) -> u8 {
        let bit = 1_u64 << index;
        let side = if self.black & bit != 0 {
            BLACK
        } else if self.red & bit != 0 {
            RED
        } else {
            return EMPTY;
        };
        if self.kings & bit != 0 {
            king(side)
        } else if side == BLACK {
            BLACK_MAN
        } else {
            RED_MAN
        }
    }

    pub(crate) fn pieces(self, side: u8) -> u64 {
        if side == BLACK { self.black } else { self.red }
    }

    pub(crate) fn occupied(self) -> u64 {
        self.black | self.red
    }

    pub fn count(self, side: u8) -> u8 {
        self.pieces(side).count_ones() as u8
    }

    fn clear(&mut self, index: u8) {
        let bit = !(1_u64 << index);
        self.black &= bit;
        self.red &= bit;
        self.kings &= bit;
    }

    fn set_piece(&mut self, index: u8, piece: u8) {
        self.clear(index);
        let bit = 1_u64 << index;
        match side_of(piece) {
            BLACK => self.black |= bit,
            RED => self.red |= bit,
            _ => return,
        }
        if is_king(piece) {
            self.kings |= bit;
        }
    }

    fn capture_steps(self, from: u8, piece: u8) -> Vec<(u8, u8)> {
        let row = row_of(from);
        let column = column_of(from);
        let side = side_of(piece);
        let mut result = Vec::new();
        for &(dr, dc) in directions(piece) {
            let jumped_row = row + dr;
            let jumped_column = column + dc;
            let landing_row = row + dr * 2;
            let landing_column = column + dc * 2;
            if !inside(landing_row, landing_column) {
                continue;
            }
            let jumped = at(jumped_row, jumped_column);
            let landing = at(landing_row, landing_column);
            if side_of(self.piece_at(jumped)) == other(side) && self.piece_at(landing) == EMPTY {
                result.push((landing, jumped));
            }
        }
        result
    }

    fn capture_sequences(
        self,
        origin: u8,
        current: u8,
        piece: u8,
        path: &mut Vec<u8>,
        captures: &mut Vec<u8>,
        result: &mut Vec<Move>,
    ) {
        for (landing, captured) in self.capture_steps(current, piece) {
            let mut next = self;
            next.clear(current);
            next.clear(captured);
            next.set_piece(landing, piece);
            path.push(landing);
            captures.push(captured);

            let promotes = !is_king(piece) && row_of(landing) == promotion_row(side_of(piece));
            let continuation = if promotes {
                Vec::new()
            } else {
                next.capture_steps(landing, piece)
            };
            if continuation.is_empty() {
                result.push(Move {
                    from: origin,
                    path: path.clone(),
                    captures: captures.clone(),
                    promotes,
                });
            } else {
                next.capture_sequences(origin, landing, piece, path, captures, result);
            }

            path.pop();
            captures.pop();
        }
    }

    pub fn legal_moves(self, side: u8) -> Vec<Move> {
        if ![BLACK, RED].contains(&side) {
            return Vec::new();
        }
        let mut captures = Vec::new();
        let mut pieces = self.pieces(side);
        while pieces != 0 {
            let from = pieces.trailing_zeros() as u8;
            pieces &= pieces - 1;
            let piece = self.piece_at(from);
            self.capture_sequences(
                from,
                from,
                piece,
                &mut Vec::new(),
                &mut Vec::new(),
                &mut captures,
            );
        }
        if !captures.is_empty() {
            sort_moves(&mut captures);
            return captures;
        }

        let mut moves = Vec::new();
        let mut pieces = self.pieces(side);
        while pieces != 0 {
            let from = pieces.trailing_zeros() as u8;
            pieces &= pieces - 1;
            let piece = self.piece_at(from);
            let row = row_of(from);
            let column = column_of(from);
            for &(dr, dc) in directions(piece) {
                let next_row = row + dr;
                let next_column = column + dc;
                if !inside(next_row, next_column) {
                    continue;
                }
                let to = at(next_row, next_column);
                if self.piece_at(to) == EMPTY {
                    moves.push(Move {
                        from,
                        path: vec![to],
                        captures: Vec::new(),
                        promotes: !is_king(piece) && next_row == promotion_row(side),
                    });
                }
            }
        }
        sort_moves(&mut moves);
        moves
    }

    pub(crate) fn apply_legal(self, mv: &Move, side: u8) -> Self {
        let mut next = self;
        let piece = self.piece_at(mv.from);
        debug_assert_eq!(side_of(piece), side);
        let mut current = mv.from;
        for (step, &landing) in mv.path.iter().enumerate() {
            next.clear(current);
            if let Some(&captured) = mv.captures.get(step) {
                next.clear(captured);
            }
            next.set_piece(landing, piece);
            current = landing;
        }
        if mv.promotes {
            next.set_piece(current, king(side));
        }
        next
    }

    pub fn position_key(self, side: u8) -> String {
        format!(
            "{side}:{:016x}:{:016x}:{:016x}",
            self.black, self.red, self.kings
        )
    }

    pub fn outcome(self, turn: u8, halfmove: u16, repetitions: u8) -> Outcome {
        if self.legal_moves(turn).is_empty() {
            Outcome::Win(other(turn))
        } else if repetitions >= 3 {
            Outcome::Repetition
        } else if halfmove >= DRAW_PLIES {
            Outcome::FortyMove
        } else {
            Outcome::Playing
        }
    }
}

fn sort_moves(moves: &mut [Move]) {
    moves.sort_by(|left, right| {
        left.from
            .cmp(&right.from)
            .then_with(|| left.path.cmp(&right.path))
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty() -> [u8; 64] {
        [EMPTY; 64]
    }

    #[test]
    fn initial_position_has_standard_material_and_perft() {
        let position = Position::initial();
        assert_eq!(position.count(BLACK), 12);
        assert_eq!(position.count(RED), 12);
        assert_eq!(position.legal_moves(BLACK).len(), 7);
        let depth_two: usize = position
            .legal_moves(BLACK)
            .iter()
            .map(|mv| position.apply_legal(mv, BLACK).legal_moves(RED).len())
            .sum();
        assert_eq!(depth_two, 49);
    }

    #[test]
    fn capture_is_compulsory_and_full_multi_jump_is_one_move() {
        let mut board = empty();
        board[40] = BLACK_MAN;
        board[42] = BLACK_MAN;
        board[35] = RED_MAN;
        board[19] = RED_MAN;
        let position = Position::from_board(&board).unwrap();
        let moves = position.legal_moves(BLACK);
        assert_eq!(moves.len(), 1);
        assert_eq!(moves[0].from, 42);
        assert_eq!(moves[0].path, [28, 10]);
        assert_eq!(moves[0].captures, [35, 19]);
        let next = position.apply_legal(&moves[0], BLACK);
        assert_eq!(next.piece_at(10), BLACK_MAN);
        assert_eq!(next.count(RED), 0);
    }

    #[test]
    fn men_move_and_capture_forward_only() {
        let mut board = empty();
        board[26] = BLACK_MAN;
        board[35] = RED_MAN;
        let moves = Position::from_board(&board).unwrap().legal_moves(BLACK);
        assert!(moves.iter().all(|mv| mv.captures.is_empty()));
        assert!(moves.iter().all(|mv| mv.path[0] < mv.from));
    }

    #[test]
    fn crowning_ends_the_move_before_a_backward_capture() {
        let mut board = empty();
        board[17] = BLACK_MAN;
        board[10] = RED_MAN;
        board[12] = RED_MAN;
        let position = Position::from_board(&board).unwrap();
        let mv = &position.legal_moves(BLACK)[0];
        assert_eq!(mv.path, [3]);
        assert_eq!(mv.captures, [10]);
        assert!(mv.promotes);
        let next = position.apply_legal(mv, BLACK);
        assert_eq!(next.piece_at(3), BLACK_KING);
        assert_eq!(next.piece_at(12), RED_MAN);
    }

    #[test]
    fn kings_can_capture_backward() {
        let mut board = empty();
        board[26] = BLACK_KING;
        board[35] = RED_MAN;
        let moves = Position::from_board(&board).unwrap().legal_moves(BLACK);
        assert!(
            moves
                .iter()
                .any(|mv| mv.path == [44] && mv.captures == [35])
        );
    }

    #[test]
    fn no_moves_wins_before_draw_conditions_are_considered() {
        let mut board = empty();
        board[1] = RED_MAN;
        let position = Position::from_board(&board).unwrap();
        assert_eq!(position.outcome(BLACK, DRAW_PLIES, 3), Outcome::Win(RED));
        assert_eq!(
            Position::initial().outcome(BLACK, 0, 3),
            Outcome::Repetition
        );
        assert_eq!(
            Position::initial().outcome(BLACK, DRAW_PLIES, 1),
            Outcome::FortyMove
        );
    }
}
