use std::collections::HashMap;

use crate::game::{DIRECTIONS, Move, Position, inside, other};

const WIN: i32 = 1_000_000;
const POSITION: [i16; 64] = [
    120, -28, 18, 8, 8, 18, -28, 120, -28, -45, -4, -4, -4, -4, -45, -28, 18, -4, 12, 3, 3, 12, -4,
    18, 8, -4, 3, 3, 3, 3, -4, 8, 8, -4, 3, 3, 3, 3, -4, 8, 18, -4, 12, 3, 3, 12, -4, 18, -28, -45,
    -4, -4, -4, -4, -45, -28, 120, -28, 18, 8, 8, 18, -28, 120,
];

#[derive(Clone, Copy, Debug)]
pub(crate) struct SearchConfig {
    pub max_depth: u8,
    pub node_limit: u32,
    pub root_band: i32,
    pub exact_empties: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SearchResult {
    pub selected: Option<u8>,
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
    best: Option<u8>,
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

fn edge_stability(position: Position, side: u8) -> i32 {
    let mine = position.pieces(side);
    let mut stable = 0_u64;
    for (corner, step_a, step_b) in [(0, 1, 8), (7, -1, 8), (56, 1, -8), (63, -1, -8)] {
        if mine & (1_u64 << corner) == 0 {
            continue;
        }
        stable |= 1_u64 << corner;
        for step in [step_a, step_b] {
            let mut index = corner as i16 + step;
            for _ in 1..8 {
                if mine & (1_u64 << index) == 0 {
                    break;
                }
                stable |= 1_u64 << index;
                index += step;
            }
        }
    }
    stable.count_ones() as i32
}

pub(crate) fn evaluate(position: Position, side: u8) -> i32 {
    let opponent = other(side);
    let occupied = position.occupied().count_ones() as i32;
    let empties = 64 - occupied;
    let mine = position.pieces(side);
    let theirs = position.pieces(opponent);
    let mut positional = 0;
    let mut frontier = 0;
    for (index, weight) in POSITION.iter().enumerate() {
        let bit = 1_u64 << index;
        if position.occupied() & bit == 0 {
            continue;
        }
        let sign = if mine & bit != 0 { 1 } else { -1 };
        positional += sign * *weight as i32;
        let row = (index / 8) as i8;
        let column = (index % 8) as i8;
        if DIRECTIONS.iter().any(|(dr, dc)| {
            let nr = row + dr;
            let nc = column + dc;
            inside(nr, nc) && position.occupied() & (1_u64 << (nr * 8 + nc)) == 0
        }) {
            frontier -= sign;
        }
    }
    let discs = mine.count_ones() as i32 - theirs.count_ones() as i32;
    let mobility =
        position.legal_moves(side).len() as i32 - position.legal_moves(opponent).len() as i32;
    let stability = edge_stability(position, side) - edge_stability(position, opponent);
    let parity = if empties % 2 == 1 { 1 } else { -1 };
    let disc_weight = if empties <= 10 {
        32
    } else if empties <= 22 {
        8
    } else {
        1
    };
    positional * 5 + mobility * 18 + frontier * 9 + stability * 34 + discs * disc_weight + parity
}

fn terminal(position: Position, side: u8) -> i32 {
    let difference = position.count(side) as i32 - position.count(other(side)) as i32;
    difference.signum() * WIN + difference * 1_000
}

fn priority(mv: &Move) -> i32 {
    POSITION[mv.index as usize] as i32 * 32 + mv.flips.len() as i32
}

fn ordered(mut moves: Vec<Move>, best: Option<u8>) -> Vec<Move> {
    moves.sort_by_key(|mv| {
        (
            if Some(mv.index) == best { 1 } else { 0 },
            priority(mv),
            -(mv.index as i32),
        )
    });
    moves.reverse();
    moves
}

struct Searcher<F> {
    config: SearchConfig,
    nodes: u32,
    stopped: F,
    table: HashMap<(u64, u64, u8, bool), Entry>,
}

impl<F: FnMut(u32) -> bool> Searcher<F> {
    fn negamax(
        &mut self,
        position: Position,
        side: u8,
        depth: u8,
        mut alpha: i32,
        mut beta: i32,
        passed: bool,
    ) -> Result<i32, ()> {
        self.nodes = self.nodes.saturating_add(1);
        if self.nodes > self.config.node_limit
            || (self.nodes & 255 == 0 && (self.stopped)(self.nodes))
        {
            return Err(());
        }
        let key = (position.black, position.white, side, passed);
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
        let moves = ordered(
            position.legal_moves(side),
            cached.and_then(|entry| entry.best),
        );
        if moves.is_empty() {
            if passed {
                return Ok(terminal(position, side));
            }
            return Ok(-self.negamax(position, other(side), depth, -beta, -alpha, true)?);
        }
        if depth == 0 {
            return Ok(evaluate(position, side));
        }
        let mut score = i32::MIN / 2;
        let mut best = None;
        for mv in moves {
            let child = position.apply(mv.index, side).expect("legal move");
            let value = -self.negamax(child, other(side), depth - 1, -beta, -alpha, false)?;
            if value > score {
                score = value;
                best = Some(mv.index);
            }
            alpha = alpha.max(value);
            if alpha >= beta {
                break;
            }
        }
        let bound = if score <= original_alpha {
            Bound::Upper
        } else if score >= original_beta {
            Bound::Lower
        } else {
            Bound::Exact
        };
        self.table.insert(
            key,
            Entry {
                depth,
                score,
                bound,
                best,
            },
        );
        Ok(score)
    }
}

fn select_root(scores: &[(u8, i32)], band: i32, seed: u64) -> u8 {
    let best = scores.iter().map(|entry| entry.1).max().unwrap_or(i32::MIN);
    let candidates: Vec<_> = scores
        .iter()
        .filter(|entry| entry.1 >= best - band)
        .collect();
    let mut rng = SplitMix64(seed);
    candidates[(rng.next() as usize) % candidates.len()].0
}

pub(crate) fn search<F: FnMut(u32) -> bool>(
    position: Position,
    side: u8,
    config: SearchConfig,
    seed: u64,
    stopped: F,
) -> SearchResult {
    let initial = ordered(position.legal_moves(side), None);
    if initial.is_empty() {
        return SearchResult {
            selected: None,
            depth: 0,
            nodes: 0,
        };
    }
    if let Some(corner) = initial.iter().find(|mv| [0, 7, 56, 63].contains(&mv.index)) {
        return SearchResult {
            selected: Some(corner.index),
            depth: 1,
            nodes: initial.len() as u32,
        };
    }
    let empties = 64 - position.occupied().count_ones() as u8;
    let target_depth = if empties <= config.exact_empties {
        empties
    } else {
        config.max_depth
    };
    let mut searcher = Searcher {
        config,
        nodes: 0,
        stopped,
        table: HashMap::new(),
    };
    let mut selected = initial[0].index;
    let mut completed_depth = 0;
    for depth in 1..=target_depth {
        let mut scores = Vec::with_capacity(initial.len());
        let mut interrupted = false;
        for mv in &initial {
            let child = position.apply(mv.index, side).expect("legal move");
            match searcher.negamax(
                child,
                other(side),
                depth - 1,
                i32::MIN / 2,
                i32::MAX / 2,
                false,
            ) {
                Ok(score) => scores.push((mv.index, -score)),
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
            max_depth: 2,
            node_limit: 35_000,
            root_band: 180,
            exact_empties: 0,
        },
        "hard" => SearchConfig {
            max_depth: 9,
            node_limit: 2_500_000,
            root_band: 4,
            exact_empties: 13,
        },
        _ => SearchConfig {
            max_depth: 6,
            node_limit: 450_000,
            root_band: 28,
            exact_empties: 8,
        },
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;
    use crate::game::{BLACK, EMPTY, WHITE};

    #[test]
    fn corner_is_invariant_even_with_variation() {
        let mut board = [EMPTY; 64];
        board[1] = BLACK;
        board[2] = WHITE;
        let position = Position::from_board(&board).unwrap();
        for seed in 0..20 {
            assert_eq!(
                search(position, WHITE, config("easy"), seed, |_| false).selected,
                Some(0)
            );
        }
    }

    #[test]
    fn symmetric_opening_varies_by_seed_but_stays_legal() {
        let position = Position::initial();
        let legal: Vec<_> = position
            .legal_moves(WHITE)
            .iter()
            .map(|mv| mv.index)
            .collect();
        let selected: HashSet<_> = (0..32)
            .map(|seed| {
                search(position, WHITE, config("easy"), seed, |_| false)
                    .selected
                    .unwrap()
            })
            .collect();
        assert!(selected.len() > 1);
        assert!(selected.iter().all(|mv| legal.contains(mv)));
    }

    #[test]
    fn exact_endgame_takes_available_last_move() {
        let mut board = [BLACK; 64];
        board[0] = EMPTY;
        board[1] = WHITE;
        let position = Position::from_board(&board).unwrap();
        let result = search(position, BLACK, config("hard"), 7, |_| false);
        assert_eq!(result.selected, Some(0));
    }
}
