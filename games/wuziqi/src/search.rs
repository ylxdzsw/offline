use std::collections::HashMap;

use crate::game::{DIRECTIONS, EMPTY, Position, SIZE, at, column_of, inside, other, row_of};

const WIN: i32 = 100_000_000;

#[derive(Clone, Copy, Debug)]
pub(crate) struct SearchConfig {
    pub max_depth: u8,
    pub node_limit: u32,
    pub candidate_limit: usize,
    pub root_band: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SearchResult {
    pub selected: Option<u16>,
    pub depth: u8,
    pub nodes: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Bound {
    Exact,
    Lower,
    Upper,
}

#[derive(Clone, Copy, Debug)]
struct Entry {
    depth: u8,
    score: i32,
    bound: Bound,
    best: Option<u16>,
}

#[derive(Clone, Copy)]
struct SplitMix64(u64);

impl SplitMix64 {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut value = self.0;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^ (value >> 31)
    }
}

impl Position {
    pub(crate) fn winning_moves(&self, side: u8) -> Vec<u16> {
        self.candidates()
            .into_iter()
            .filter(|index| {
                self.apply(*index, side)
                    .is_some_and(|next| next.is_win(*index, side))
            })
            .collect()
    }

    pub(crate) fn hash(&self, side: u8) -> u64 {
        let mut hash = 0xcbf2_9ce4_8422_2325_u64 ^ side as u64;
        for (index, cell) in self
            .board
            .iter()
            .enumerate()
            .filter(|(_, cell)| **cell != EMPTY)
        {
            hash ^= ((index as u64) << 2) | *cell as u64;
            hash = hash.wrapping_mul(0x100_0000_01b3);
        }
        hash
    }
}

fn window_score(own: usize, empty: usize) -> i32 {
    match (own, empty) {
        (5, 0) => WIN,
        (4, 1) => 900_000,
        (3, 2) => 24_000,
        (2, 3) => 1_200,
        (1, 4) => 45,
        _ => 0,
    }
}

fn score_side(position: &Position, side: u8) -> i32 {
    let opponent = other(side);
    let mut score = 0;
    for row in 0..SIZE {
        for column in 0..SIZE {
            for (dr, dc) in DIRECTIONS {
                let end_row = row as i8 + dr * 4;
                let end_column = column as i8 + dc * 4;
                if !inside(end_row, end_column) {
                    continue;
                }
                let mut own = 0;
                let mut empty = 0;
                let mut blocked = false;
                for step in 0..5 {
                    let index = at(
                        (row as i8 + dr * step) as usize,
                        (column as i8 + dc * step) as usize,
                    );
                    match position.board[index as usize] {
                        value if value == side => own += 1,
                        EMPTY => empty += 1,
                        value if value == opponent => {
                            blocked = true;
                            break;
                        }
                        _ => unreachable!(),
                    }
                }
                if !blocked {
                    score += window_score(own, empty);
                }
            }
        }
    }
    score
}

fn move_threat_score(position: &Position, index: u16, side: u8) -> i32 {
    let next = position.apply(index, side).expect("candidate is empty");
    if next.is_win(index, side) {
        return WIN;
    }
    let wins = next.winning_moves(side).len() as i32;
    let opponent_wins = next.winning_moves(other(side)).len() as i32;
    let row = row_of(index) as i32;
    let column = column_of(index) as i32;
    let center = 14 - ((row - 7).abs() + (column - 7).abs());
    let fork = if wins >= 2 {
        8_000_000
    } else {
        wins * 1_200_000
    };
    fork + score_side(&next, side)
        - score_side(&next, other(side)) * 11 / 10
        - opponent_wins * 1_500_000
        + center
}

pub(crate) fn evaluate(position: &Position, side: u8) -> i32 {
    score_side(position, side) - score_side(position, other(side)) * 11 / 10
}

fn forced_candidates(position: &Position, side: u8) -> Option<Vec<u16>> {
    let wins = position.winning_moves(side);
    if !wins.is_empty() {
        return Some(wins);
    }
    let blocks = position.winning_moves(other(side));
    (!blocks.is_empty()).then_some(blocks)
}

fn ordered_candidates(
    position: &Position,
    side: u8,
    limit: usize,
    preferred: Option<u16>,
) -> Vec<u16> {
    if let Some(forced) = forced_candidates(position, side) {
        return forced;
    }
    let mut moves: Vec<_> = position
        .candidates()
        .into_iter()
        .map(|index| (index, move_threat_score(position, index, side)))
        .collect();
    moves.sort_by_key(|(index, score)| (Some(*index) == preferred, *score, -(*index as i32)));
    moves.reverse();
    moves.truncate(limit);
    moves.into_iter().map(|entry| entry.0).collect()
}

struct Searcher<F> {
    config: SearchConfig,
    nodes: u32,
    stopped: F,
    table: HashMap<u64, Entry>,
}

impl<F: FnMut(u32) -> bool> Searcher<F> {
    fn negamax(
        &mut self,
        position: &Position,
        side: u8,
        depth: u8,
        alpha_beta: (i32, i32),
        last_move: Option<u16>,
        ply: u8,
    ) -> Result<i32, ()> {
        let (mut alpha, mut beta) = alpha_beta;
        self.nodes = self.nodes.saturating_add(1);
        if self.nodes > self.config.node_limit
            || (self.nodes & 127 == 0 && (self.stopped)(self.nodes))
        {
            return Err(());
        }
        if let Some(last) = last_move.filter(|index| position.is_win(*index, other(side))) {
            let _ = last;
            return Ok(-WIN + ply as i32);
        }
        if depth == 0 || position.board.iter().all(|cell| *cell != EMPTY) {
            return Ok(evaluate(position, side));
        }
        let key = position.hash(side) ^ ((depth as u64) << 56);
        let original_alpha = alpha;
        let original_beta = beta;
        let cached = self.table.get(&key).copied();
        if let Some(entry) = cached.filter(|entry| entry.depth >= depth) {
            match entry.bound {
                Bound::Exact => return Ok(entry.score),
                Bound::Lower => alpha = alpha.max(entry.score),
                Bound::Upper => beta = beta.min(entry.score),
            }
            if alpha >= beta {
                return Ok(entry.score);
            }
        }
        let moves = ordered_candidates(
            position,
            side,
            self.config.candidate_limit,
            cached.and_then(|entry| entry.best),
        );
        if moves.is_empty() {
            return Ok(0);
        }
        let mut best_score = i32::MIN / 2;
        let mut best_move = None;
        for index in moves {
            let child = position.apply(index, side).expect("candidate is legal");
            let score = -self.negamax(
                &child,
                other(side),
                depth - 1,
                (-beta, -alpha),
                Some(index),
                ply + 1,
            )?;
            if score > best_score {
                best_score = score;
                best_move = Some(index);
            }
            alpha = alpha.max(score);
            if alpha >= beta {
                break;
            }
        }
        let bound = if best_score <= original_alpha {
            Bound::Upper
        } else if best_score >= original_beta {
            Bound::Lower
        } else {
            Bound::Exact
        };
        self.table.insert(
            key,
            Entry {
                depth,
                score: best_score,
                bound,
                best: best_move,
            },
        );
        Ok(best_score)
    }
}

fn select_root(scores: &[(u16, i32)], band: i32, seed: u64) -> u16 {
    let best = scores.iter().map(|entry| entry.1).max().unwrap_or(i32::MIN);
    let pool: Vec<_> = scores
        .iter()
        .filter(|entry| entry.1 >= best - band)
        .collect();
    let mut rng = SplitMix64(seed);
    pool[(rng.next() as usize) % pool.len()].0
}

pub(crate) fn search<F: FnMut(u32) -> bool>(
    position: &Position,
    side: u8,
    config: SearchConfig,
    seed: u64,
    stopped: F,
) -> SearchResult {
    let forced = forced_candidates(position, side);
    if let Some(moves) = forced.as_ref().filter(|moves| moves.len() == 1) {
        return SearchResult {
            selected: Some(moves[0]),
            depth: 1,
            nodes: 1,
        };
    }
    let initial =
        forced.unwrap_or_else(|| ordered_candidates(position, side, config.candidate_limit, None));
    if initial.is_empty() {
        return SearchResult {
            selected: None,
            depth: 0,
            nodes: 0,
        };
    }
    let mut searcher = Searcher {
        config,
        nodes: 0,
        stopped,
        table: HashMap::new(),
    };
    let mut selected = initial[0];
    let mut completed_depth = 0;
    for depth in 1..=config.max_depth {
        let mut scores = Vec::with_capacity(initial.len());
        let mut interrupted = false;
        for index in &initial {
            let child = position.apply(*index, side).expect("candidate is legal");
            match searcher.negamax(
                &child,
                other(side),
                depth - 1,
                (i32::MIN / 2, i32::MAX / 2),
                Some(*index),
                1,
            ) {
                Ok(score) => scores.push((*index, -score)),
                Err(()) => {
                    interrupted = true;
                    break;
                }
            }
        }
        if interrupted || scores.len() != initial.len() {
            break;
        }
        selected = select_root(&scores, config.root_band, seed ^ depth as u64);
        completed_depth = depth;
        if scores.iter().any(|entry| entry.1 >= WIN - 20) {
            break;
        }
    }
    SearchResult {
        selected: Some(selected),
        depth: completed_depth,
        nodes: searcher.nodes,
    }
}

pub(crate) fn config(difficulty: &str) -> SearchConfig {
    match difficulty {
        "easy" => SearchConfig {
            max_depth: 1,
            node_limit: 30_000,
            candidate_limit: 8,
            root_band: 60_000,
        },
        "hard" => SearchConfig {
            max_depth: 5,
            node_limit: 1_500_000,
            candidate_limit: 16,
            root_band: 800,
        },
        _ => SearchConfig {
            max_depth: 3,
            node_limit: 300_000,
            candidate_limit: 12,
            root_band: 8_000,
        },
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;
    use crate::game::{BLACK, CELLS, WHITE};

    fn placed(values: &[(usize, usize, u8)]) -> Position {
        let mut board = [EMPTY; CELLS];
        for (row, column, side) in values {
            board[at(*row, *column) as usize] = *side;
        }
        Position::from_board(&board).unwrap()
    }

    #[test]
    fn immediate_win_is_never_randomized_away() {
        let position = placed(&[(7, 4, WHITE), (7, 5, WHITE), (7, 6, WHITE), (7, 7, WHITE)]);
        for seed in 0..32 {
            let selected = search(&position, WHITE, config("easy"), seed, |_| false)
                .selected
                .unwrap();
            assert!([at(7, 3), at(7, 8)].contains(&selected));
        }
    }

    #[test]
    fn immediate_loss_is_always_blocked() {
        let position = placed(&[(3, 5, BLACK), (4, 5, BLACK), (5, 5, BLACK), (6, 5, BLACK)]);
        for seed in 0..32 {
            let selected = search(&position, WHITE, config("easy"), seed, |_| false)
                .selected
                .unwrap();
            assert!([at(2, 5), at(7, 5)].contains(&selected));
        }
    }

    #[test]
    fn broken_four_gap_is_forced_win() {
        let position = placed(&[(7, 4, BLACK), (7, 5, BLACK), (7, 7, BLACK), (7, 8, BLACK)]);
        for difficulty in ["easy", "medium", "hard"] {
            assert_eq!(
                search(&position, BLACK, config(difficulty), 99, |_| false).selected,
                Some(at(7, 6))
            );
        }
    }

    #[test]
    fn quiet_symmetric_position_varies_by_seed() {
        let position = placed(&[(7, 7, BLACK)]);
        let choices: HashSet<_> = (0..48)
            .map(|seed| {
                search(&position, WHITE, config("easy"), seed, |_| false)
                    .selected
                    .unwrap()
            })
            .collect();
        assert!(choices.len() > 1);
        assert!(
            choices
                .iter()
                .all(|index| position.board[*index as usize] == EMPTY)
        );
    }
}
