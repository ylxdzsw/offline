use serde::{Deserialize, Serialize};

pub const SIZE: usize = 9;
pub const BOX_SIZE: usize = 3;
pub const CELLS: usize = SIZE * SIZE;
pub const DIGITS: [u8; 9] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Generated {
    pub puzzle: Vec<u8>,
    pub solution: Vec<u8>,
    pub clues: usize,
    pub rating: usize,
}

#[derive(Clone)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(seed.max(1))
    }

    fn next(&mut self) -> u64 {
        let mut value = self.0;
        value ^= value << 13;
        value ^= value >> 7;
        value ^= value << 17;
        self.0 = value;
        value
    }

    fn index(&mut self, length: usize) -> usize {
        self.next() as usize % length
    }

    fn shuffle<T>(&mut self, values: &mut [T]) {
        for index in (1..values.len()).rev() {
            let target = self.index(index + 1);
            values.swap(index, target);
        }
    }
}

pub const fn row_of(index: usize) -> usize {
    index / SIZE
}

pub const fn column_of(index: usize) -> usize {
    index % SIZE
}

pub fn peers(index: usize) -> Vec<usize> {
    let mut used = [false; CELLS];
    for offset in 0..SIZE {
        used[row_of(index) * SIZE + offset] = true;
        used[offset * SIZE + column_of(index)] = true;
        used[(row_of(index) / BOX_SIZE * BOX_SIZE + offset / BOX_SIZE) * SIZE
            + column_of(index) / BOX_SIZE * BOX_SIZE
            + offset % BOX_SIZE] = true;
    }
    used[index] = false;
    used.into_iter()
        .enumerate()
        .filter_map(|(index, value)| value.then_some(index))
        .collect()
}

fn candidate_mask(board: &[u8], index: usize) -> u16 {
    if board[index] != 0 {
        return 0;
    }
    let mut mask = 0x3fe;
    for peer in peers(index) {
        mask &= !(1 << board[peer]);
    }
    mask
}

pub fn candidates(board: &[u8], index: usize) -> Vec<u8> {
    let mask = candidate_mask(board, index);
    DIGITS
        .into_iter()
        .filter(|digit| mask & (1 << digit) != 0)
        .collect()
}

pub fn conflicts(board: &[u8], index: usize) -> Vec<usize> {
    let Some(&value) = board.get(index) else {
        return Vec::new();
    };
    if value == 0 {
        return Vec::new();
    }
    peers(index)
        .into_iter()
        .filter(|peer| board[*peer] == value)
        .collect()
}

pub fn is_valid(board: &[u8]) -> bool {
    board.len() == CELLS
        && board.iter().all(|value| *value <= 9)
        && (0..CELLS).all(|index| conflicts(board, index).is_empty())
}

fn select_cell(board: &[u8]) -> Option<(usize, Vec<u8>)> {
    let mut best: Option<(usize, Vec<u8>)> = None;
    for index in 0..CELLS {
        if board[index] != 0 {
            continue;
        }
        let options = candidates(board, index);
        if options.is_empty() {
            return Some((index, options));
        }
        if best
            .as_ref()
            .is_none_or(|(_, current)| options.len() < current.len())
        {
            best = Some((index, options));
            if best.as_ref().unwrap().1.len() == 1 {
                break;
            }
        }
    }
    best
}

fn solve_visit(board: &mut [u8], limit: usize, solutions: &mut Vec<Vec<u8>>, nodes: &mut usize) {
    if solutions.len() >= limit {
        return;
    }
    *nodes += 1;
    let Some((index, options)) = select_cell(board) else {
        solutions.push(board.to_vec());
        return;
    };
    for digit in options {
        board[index] = digit;
        solve_visit(board, limit, solutions, nodes);
        board[index] = 0;
        if solutions.len() >= limit {
            return;
        }
    }
}

pub fn solve(board: &[u8], limit: usize) -> Vec<Vec<u8>> {
    if !is_valid(board) {
        return Vec::new();
    }
    let mut work = board.to_vec();
    let mut solutions = Vec::new();
    let mut nodes = 0;
    solve_visit(&mut work, limit, &mut solutions, &mut nodes);
    solutions
}

fn randomized_fill(board: &mut [u8], rng: &mut Rng) -> bool {
    let Some((index, mut options)) = select_cell(board) else {
        return true;
    };
    rng.shuffle(&mut options);
    for digit in options {
        board[index] = digit;
        if randomized_fill(board, rng) {
            return true;
        }
        board[index] = 0;
    }
    false
}

pub fn complete_board(seed: u64) -> Vec<u8> {
    let mut rng = Rng::new(seed);
    let mut board = vec![0; CELLS];
    randomized_fill(&mut board, &mut rng);
    board
}

fn solve_rating(board: &[u8]) -> usize {
    let mut work = board.to_vec();
    let mut solutions = Vec::new();
    let mut nodes = 0;
    solve_visit(&mut work, 1, &mut solutions, &mut nodes);
    nodes
}

pub fn clue_target(difficulty: &str) -> Result<usize, String> {
    match difficulty {
        "easy" => Ok(40),
        "medium" => Ok(32),
        "hard" => Ok(27),
        _ => Err("unknown difficulty".to_owned()),
    }
}

pub fn generate(difficulty: &str, seed: u64) -> Result<Generated, String> {
    let target = clue_target(difficulty)?;
    let solution = complete_board(seed);
    let mut puzzle = solution.clone();
    let mut rng = Rng::new(seed ^ 0xd1b5_4a32_d192_ed03);
    let mut pairs: Vec<_> = (0..=(CELLS / 2)).collect();
    rng.shuffle(&mut pairs);
    let mut remaining = CELLS;
    for index in pairs {
        let mirror = CELLS - 1 - index;
        let removal = if index == mirror { 1 } else { 2 };
        if remaining.saturating_sub(removal) < target {
            continue;
        }
        let first = puzzle[index];
        let second = puzzle[mirror];
        puzzle[index] = 0;
        puzzle[mirror] = 0;
        if solve(&puzzle, 2).len() == 1 {
            remaining -= removal;
        } else {
            puzzle[index] = first;
            puzzle[mirror] = second;
        }
        if remaining == target {
            break;
        }
    }
    // If symmetric carving stalls, finish with seeded single removals while preserving uniqueness.
    let mut singles: Vec<_> = (0..CELLS).filter(|index| puzzle[*index] != 0).collect();
    rng.shuffle(&mut singles);
    for index in singles {
        if remaining <= target {
            break;
        }
        let value = puzzle[index];
        puzzle[index] = 0;
        if solve(&puzzle, 2).len() == 1 {
            remaining -= 1;
        } else {
            puzzle[index] = value;
        }
    }
    Ok(Generated {
        rating: solve_rating(&puzzle),
        puzzle,
        solution,
        clues: remaining,
    })
}

pub fn is_complete(board: &[u8], solution: &[u8]) -> bool {
    board == solution
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn peers_cover_rows_columns_and_boxes() {
        assert_eq!(peers(0).len(), 20);
        let mut board = vec![0; CELLS];
        board[0] = 5;
        assert!(!candidates(&board, 1).contains(&5));
        assert!(!candidates(&board, 9).contains(&5));
        assert!(!candidates(&board, 10).contains(&5));
    }

    #[test]
    fn generated_puzzles_are_seeded_unique_and_varied() {
        let first = generate("medium", 42).unwrap();
        assert_eq!(first, generate("medium", 42).unwrap());
        assert_ne!(first.solution, generate("medium", 43).unwrap().solution);
        assert!(is_valid(&first.puzzle));
        assert_eq!(solve(&first.puzzle, 2), vec![first.solution.clone()]);
        assert!(first.clues >= clue_target("medium").unwrap());
    }

    #[test]
    fn complete_board_is_not_limited_to_one_fixed_pattern() {
        let boards: Vec<_> = (1..=6).map(complete_board).collect();
        assert!(boards.windows(2).all(|pair| pair[0] != pair[1]));
        assert!(
            boards
                .iter()
                .all(|board| is_valid(board) && !board.contains(&0))
        );
    }
}
