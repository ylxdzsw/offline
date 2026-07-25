pub const EMPTY: u8 = 0;
pub const BLACK: u8 = 1;
pub const WHITE: u8 = 2;
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
        let bit = 1_u64 << index;
        if side != BLACK && side != WHITE || self.occupied() & bit != 0 {
            return 0;
        }
        let row = (index / 8) as i8;
        let column = (index % 8) as i8;
        let mine = self.pieces(side);
        let theirs = self.pieces(other(side));
        let mut all = 0;
        for (dr, dc) in DIRECTIONS {
            let mut line = 0;
            let mut next_row = row + dr;
            let mut next_column = column + dc;
            while inside(next_row, next_column) {
                let next = (next_row * 8 + next_column) as u8;
                let next_bit = 1_u64 << next;
                if theirs & next_bit != 0 {
                    line |= next_bit;
                } else {
                    if line != 0 && mine & next_bit != 0 {
                        all |= line;
                    }
                    break;
                }
                next_row += dr;
                next_column += dc;
            }
        }
        all
    }

    pub fn legal_moves(self, side: u8) -> Vec<Move> {
        let mut result = Vec::new();
        let mut empty = !self.occupied();
        while empty != 0 {
            let index = empty.trailing_zeros() as u8;
            empty &= empty - 1;
            let flips = self.flips(index, side);
            if flips != 0 {
                result.push(Move {
                    index,
                    flips: bits(flips),
                });
            }
        }
        result
    }

    pub fn apply(self, index: u8, side: u8) -> Option<Self> {
        let flips = self.flips(index, side);
        if flips == 0 {
            return None;
        }
        let placed = 1_u64 << index;
        Some(if side == BLACK {
            Self {
                black: self.black | flips | placed,
                white: self.white & !flips,
            }
        } else {
            Self {
                black: self.black & !flips,
                white: self.white | flips | placed,
            }
        })
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

pub(crate) const fn inside(row: i8, column: i8) -> bool {
    row >= 0 && row < 8 && column >= 0 && column < 8
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
}
