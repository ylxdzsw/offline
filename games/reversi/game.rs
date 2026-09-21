pub const EMPTY: u8 = 0;
pub const BLACK: u8 = 1;
pub const WHITE: u8 = 2;
#[cfg(test)]
pub(crate) const DIRECTIONS: [(i8, i8); 8] = [
    (-1, -1),
    (-1, 0),
    (-1, 1),
    (0, -1),
    (0, 1),
    (1, -1),
    (1, 0),
    (1, 1),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Position {
    pub(crate) black: u64,
    pub(crate) white: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Move {
    pub index: u8,
    pub flips: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Status {
    pub ended: bool,
    pub winner: Option<u8>,
    pub reason: &'static str,
    pub black: Option<u8>,
    pub white: Option<u8>,
}

impl Position {
    pub fn initial() -> Self {
        Self::from_board(&{
            let mut board = [EMPTY; 64];
            board[27] = WHITE;
            board[28] = BLACK;
            board[35] = BLACK;
            board[36] = WHITE;
            board
        })
        .expect("initial board is valid")
    }

    pub fn from_board(board: &[u8]) -> Result<Self, &'static str> {
        if board.len() != 64 || board.iter().any(|cell| *cell > WHITE) {
            return Err("invalid board");
        }
        let mut black = 0;
        let mut white = 0;
        for (index, cell) in board.iter().enumerate() {
            match *cell {
                BLACK => black |= 1_u64 << index,
                WHITE => white |= 1_u64 << index,
                _ => {}
            }
        }
        Ok(Self { black, white })
    }

    pub fn board(self) -> [u8; 64] {
        let mut board = [EMPTY; 64];
        for (index, cell) in board.iter_mut().enumerate() {
            let bit = 1_u64 << index;
            *cell = if self.black & bit != 0 {
                BLACK
            } else if self.white & bit != 0 {
                WHITE
            } else {
                EMPTY
            };
        }
        board
    }

    pub(crate) fn pieces(self, side: u8) -> u64 {
        if side == BLACK {
            self.black
        } else {
            self.white
        }
    }

    pub(crate) fn occupied(self) -> u64 {
        self.black | self.white
    }

    pub fn count(self, side: u8) -> u8 {
        self.pieces(side).count_ones() as u8
    }

    pub fn flips(self, index: u8, side: u8) -> u64 {
        if index >= 64 || side != BLACK && side != WHITE {
            return 0;
        }
        let placed = 1_u64 << index;
        if self.occupied() & placed != 0 {
            return 0;
        }
        let mine = self.pieces(side);
        let theirs = self.pieces(other(side));
        let mut flips = 0;
        for direction in 0..8 {
            let mut ray = shift(placed, direction) & theirs;
            let mut captured = ray;
            while ray != 0 {
                let next = shift(ray, direction);
                if next & mine != 0 {
                    flips |= captured;
                    break;
                }
                ray = next & theirs;
                captured |= ray;
            }
        }
        flips
    }

    pub(crate) fn legal_mask(self, side: u8) -> u64 {
        if side != BLACK && side != WHITE {
            return 0;
        }
        let mine = self.pieces(side);
        let theirs = self.pieces(other(side));
        let empty = !self.occupied();
        let mut moves = 0;
        for direction in 0..8 {
            let mut ray = shift(mine, direction) & theirs;
            for _ in 0..5 {
                ray |= shift(ray, direction) & theirs;
            }
            moves |= shift(ray, direction) & empty;
        }
        moves
    }

    pub fn legal_moves(self, side: u8) -> Vec<Move> {
        let mut legal = self.legal_mask(side);
        let mut result = Vec::with_capacity(legal.count_ones() as usize);
        while legal != 0 {
            let index = legal.trailing_zeros() as u8;
            legal &= legal - 1;
            result.push(Move {
                index,
                flips: bits(self.flips(index, side)),
            });
        }
        result
    }

    fn apply_flips(self, index: u8, flips: u64, side: u8) -> Self {
        let placed = 1_u64 << index;
        if side == BLACK {
            Self {
                black: self.black | flips | placed,
                white: self.white & !flips,
            }
        } else {
            Self {
                black: self.black & !flips,
                white: self.white | flips | placed,
            }
        }
    }

    pub(crate) fn apply_legal(self, mv: &Move, side: u8) -> Self {
        let flips = mv
            .flips
            .iter()
            .fold(0, |mask, index| mask | (1_u64 << index));
        self.apply_flips(mv.index, flips, side)
    }

    pub fn apply(self, index: u8, side: u8) -> Option<Self> {
        let flips = self.flips(index, side);
        (flips != 0).then(|| self.apply_flips(index, flips, side))
    }

    pub fn status(self) -> Status {
        if !self.legal_moves(BLACK).is_empty() || !self.legal_moves(WHITE).is_empty() {
            return Status {
                ended: false,
                winner: None,
                reason: "playing",
                black: None,
                white: None,
            };
        }
        let black = self.count(BLACK);
        let white = self.count(WHITE);
        Status {
            ended: true,
            winner: if black == white {
                None
            } else if black > white {
                Some(BLACK)
            } else {
                Some(WHITE)
            },
            reason: if self.occupied() == u64::MAX {
                "full"
            } else {
                "no-moves"
            },
            black: Some(black),
            white: Some(white),
        }
    }
}

pub const fn other(side: u8) -> u8 {
    if side == BLACK { WHITE } else { BLACK }
}

pub(crate) fn adjacent(bits: u64) -> u64 {
    (0..8).fold(0, |neighbors, direction| neighbors | shift(bits, direction))
}

fn shift(bits: u64, direction: usize) -> u64 {
    const NOT_A: u64 = 0xfefe_fefe_fefe_fefe;
    const NOT_H: u64 = 0x7f7f_7f7f_7f7f_7f7f;
    match direction {
        0 => (bits & NOT_A) >> 9,
        1 => bits >> 8,
        2 => (bits & NOT_H) >> 7,
        3 => (bits & NOT_A) >> 1,
        4 => (bits & NOT_H) << 1,
        5 => (bits & NOT_A) << 7,
        6 => bits << 8,
        _ => (bits & NOT_H) << 9,
    }
}

fn bits(mut value: u64) -> Vec<u8> {
    let mut result = Vec::with_capacity(value.count_ones() as usize);
    while value != 0 {
        result.push(value.trailing_zeros() as u8);
        value &= value - 1;
    }
    result
}

pub fn bits_for_api(value: u64) -> Vec<u8> {
    bits(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_moves_match_contract() {
        let position = Position::initial();
        assert_eq!(position.count(BLACK), 2);
        assert_eq!(position.count(WHITE), 2);
        assert_eq!(
            position
                .legal_moves(BLACK)
                .iter()
                .map(|mv| mv.index)
                .collect::<Vec<_>>(),
            [19, 26, 37, 44]
        );
    }

    #[test]
    fn bitboard_moves_match_independent_rays_through_complete_games() {
        let reference = |position: Position, index: u8, side: u8| {
            let board = position.board();
            if board[index as usize] != EMPTY {
                return 0;
            }
            let mut all = 0;
            for (dr, dc) in DIRECTIONS {
                let mut row = (index / 8) as i8 + dr;
                let mut column = (index % 8) as i8 + dc;
                let mut line = 0;
                while (0..8).contains(&row) && (0..8).contains(&column) {
                    let point = (row * 8 + column) as usize;
                    if board[point] == other(side) {
                        line |= 1_u64 << point;
                    } else {
                        if board[point] == side {
                            all |= line;
                        }
                        break;
                    }
                    row += dr;
                    column += dc;
                }
            }
            all
        };
        let mut seed = 17_u64;
        for _ in 0..8 {
            let mut position = Position::initial();
            let mut side = BLACK;
            for _ in 0..120 {
                let mut expected = 0;
                for index in 0..64 {
                    let flips = reference(position, index, side);
                    assert_eq!(position.flips(index, side), flips);
                    if flips != 0 {
                        expected |= 1_u64 << index;
                    }
                }
                assert_eq!(position.legal_mask(side), expected);
                let legal = position.legal_moves(side);
                if legal.is_empty() {
                    if position.legal_mask(other(side)) == 0 {
                        break;
                    }
                } else {
                    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                    position = position.apply_legal(&legal[seed as usize % legal.len()], side);
                }
                side = other(side);
            }
        }
    }

    #[test]
    fn flips_all_directions() {
        let mut board = [EMPTY; 64];
        for (dr, dc) in DIRECTIONS {
            board[((3 + dr) * 8 + 3 + dc) as usize] = WHITE;
            board[((3 + dr * 2) * 8 + 3 + dc * 2) as usize] = BLACK;
        }
        let position = Position::from_board(&board).unwrap();
        assert_eq!(position.flips(27, BLACK).count_ones(), 8);
        let next = position.apply(27, BLACK).unwrap();
        assert_eq!(next.count(WHITE), 0);
        assert_eq!(next.count(BLACK), 17);
    }

    #[test]
    fn status_distinguishes_full_and_no_moves() {
        let mut full = [BLACK; 64];
        full[0] = WHITE;
        let status = Position::from_board(&full).unwrap().status();
        assert_eq!(status.reason, "full");
        assert_eq!(status.winner, Some(BLACK));
    }

    #[test]
    fn out_of_range_moves_and_invalid_sides_are_rejected() {
        let position = Position::initial();
        assert_eq!(position.flips(64, BLACK), 0);
        assert_eq!(position.flips(19, EMPTY), 0);
        assert!(position.apply(64, BLACK).is_none());
    }
}
