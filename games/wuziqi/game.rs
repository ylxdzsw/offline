use std::collections::HashSet;

pub const SIZE: usize = 15;
pub const CELLS: usize = SIZE * SIZE;
pub const EMPTY: u8 = 0;
pub const BLACK: u8 = 1;
pub const WHITE: u8 = 2;
pub(crate) const DIRECTIONS: [(i8, i8); 4] = [(1, 0), (0, 1), (1, 1), (1, -1)];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Position {
    pub(crate) board: [u8; CELLS],
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Status {
    pub ended: bool,
    pub winner: Option<u8>,
    pub reason: &'static str,
}

impl Position {
    pub fn initial() -> Self {
        Self {
            board: [EMPTY; CELLS],
        }
    }

    pub fn from_board(board: &[u8]) -> Result<Self, &'static str> {
        if board.len() != CELLS || board.iter().any(|cell| *cell > WHITE) {
            return Err("invalid board");
        }
        let mut result = [EMPTY; CELLS];
        result.copy_from_slice(board);
        Ok(Self { board: result })
    }

    pub fn board(&self) -> &[u8; CELLS] {
        &self.board
    }

    pub fn apply(&self, index: u16, side: u8) -> Option<Self> {
        if side != BLACK && side != WHITE
            || index as usize >= CELLS
            || self.board[index as usize] != EMPTY
        {
            return None;
        }
        let mut next = self.clone();
        next.board[index as usize] = side;
        Some(next)
    }

    pub fn line_length(&self, index: u16, side: u8, dr: i8, dc: i8) -> u8 {
        if side == EMPTY || self.board.get(index as usize) != Some(&side) {
            return 0;
        }
        let row = row_of(index) as i8;
        let column = column_of(index) as i8;
        let mut count = 1;
        for direction in [-1, 1] {
            let mut next_row = row + dr * direction;
            let mut next_column = column + dc * direction;
            while inside(next_row, next_column)
                && self.board[at(next_row as usize, next_column as usize) as usize] == side
            {
                count += 1;
                next_row += dr * direction;
                next_column += dc * direction;
            }
        }
        count
    }

    pub fn is_win(&self, index: u16, side: u8) -> bool {
        side != EMPTY
            && DIRECTIONS
                .iter()
                .any(|(dr, dc)| self.line_length(index, side, *dr, *dc) >= 5)
    }

    pub fn winner(&self) -> Option<u8> {
        self.board.iter().enumerate().find_map(|(index, side)| {
            (*side != EMPTY && self.is_win(index as u16, *side)).then_some(*side)
        })
    }

    pub fn status(&self, last_move: Option<u16>) -> Status {
        let winner = last_move
            .filter(|index| (*index as usize) < CELLS)
            .and_then(|index| {
                self.is_win(index, self.board[index as usize])
                    .then_some(self.board[index as usize])
            })
            .or_else(|| self.winner());
        if winner.is_some() {
            return Status {
                ended: true,
                winner,
                reason: "five",
            };
        }
        if self.board.iter().all(|cell| *cell != EMPTY) {
            return Status {
                ended: true,
                winner: None,
                reason: "full",
            };
        }
        Status {
            ended: false,
            winner: None,
            reason: "playing",
        }
    }

    pub fn candidates(&self) -> Vec<u16> {
        if self.board.iter().all(|cell| *cell == EMPTY) {
            return vec![at(7, 7)];
        }
        let mut found = HashSet::new();
        for (index, _) in self
            .board
            .iter()
            .enumerate()
            .filter(|(_, cell)| **cell != EMPTY)
        {
            let row = row_of(index as u16) as i8;
            let column = column_of(index as u16) as i8;
            for dr in -2..=2 {
                for dc in -2..=2 {
                    let next_row = row + dr;
                    let next_column = column + dc;
                    if inside(next_row, next_column) {
                        let target = at(next_row as usize, next_column as usize);
                        if self.board[target as usize] == EMPTY {
                            found.insert(target);
                        }
                    }
                }
            }
        }
        let mut result: Vec<_> = found.into_iter().collect();
        result.sort_unstable();
        result
    }
}

pub const fn other(side: u8) -> u8 {
    if side == BLACK { WHITE } else { BLACK }
}

pub const fn at(row: usize, column: usize) -> u16 {
    (row * SIZE + column) as u16
}

pub const fn row_of(index: u16) -> usize {
    index as usize / SIZE
}

pub const fn column_of(index: u16) -> usize {
    index as usize % SIZE
}

pub(crate) const fn inside(row: i8, column: i8) -> bool {
    row >= 0 && row < SIZE as i8 && column >= 0 && column < SIZE as i8
}

#[cfg(test)]
mod tests {
    use super::*;

    fn placed(values: &[(usize, usize, u8)]) -> Position {
        let mut board = [EMPTY; CELLS];
        for (row, column, side) in values {
            board[at(*row, *column) as usize] = *side;
        }
        Position::from_board(&board).unwrap()
    }

    #[test]
    fn detects_wins_in_all_directions() {
        for (dr, dc) in DIRECTIONS {
            let values: Vec<_> = (0..5)
                .map(|step| {
                    (
                        (7_i8 + dr * step) as usize,
                        (7_i8 + dc * step) as usize,
                        BLACK,
                    )
                })
                .collect();
            let position = placed(&values);
            assert!(position.is_win(at(values[4].0, values[4].1), BLACK));
        }
    }

    #[test]
    fn occupied_move_is_rejected() {
        let position = placed(&[(7, 7, BLACK)]);
        assert!(position.apply(at(7, 7), WHITE).is_none());
    }
}
