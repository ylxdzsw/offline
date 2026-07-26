use std::collections::HashMap;

use crate::game::{BLACK, Move, Position, is_king, other, row_of, side_of};

const WIN: i32 = 1_000_000;

#[derive(Clone, Copy, Debug)]
pub(crate) struct SearchConfig {
    pub node_budget: u32,
    pub max_depth: u8,
    pub root_band: i32,
    pub seed: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SearchResult {
    pub selected: Option<Move>,
    pub score: i32,
    pub selected_score: i32,
    pub depth: u8,
    pub nodes: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Bound {
    Exact,
    Lower,
    Upper,
}

#[derive(Clone, Debug)]
struct Entry {
    depth: u8,
    score: i32,
    bound: Bound,
    best: Option<Move>,
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

pub(crate) fn evaluate(position: Position, side: u8) -> i32 {
    let mut score = 0;
    let mut occupied = position.occupied();
    while occupied != 0 {
        let index = occupied.trailing_zeros() as u8;
        occupied &= occupied - 1;
        let piece = position.piece_at(index);
        let row = row_of(index) as i32;
        let column = (index % 8) as i32;
        let value = if is_king(piece) {
            180
        } else {
            let advance = if side_of(piece) == BLACK {
                7 - row
            } else {
                row
            };
            100 + advance * 7
        } + if (2..=5).contains(&row) && (2..=5).contains(&column) {
            9
        } else {
            0
        } + if column == 0 || column == 7 { 5 } else { 0 };
        score += if side_of(piece) == side {
            value
        } else {
            -value
        };
    }

    let mine = position.legal_moves(side);
    let theirs = position.legal_moves(other(side));
    score += (mine.len() as i32 - theirs.len() as i32) * 5;
    let capture_weight = |moves: &[Move]| {
        moves
            .iter()
            .map(|mv| mv.captures.len() as i32)
            .max()
            .unwrap_or(0)
            * 14
    };
    score + capture_weight(&mine) - capture_weight(&theirs)
}

fn priority(position: Position, mv: &Move) -> i32 {
    let destination = *mv.path.last().unwrap_or(&mv.from);
    let row = row_of(destination) as i32;
    let column = (destination % 8) as i32;
    mv.captures.len() as i32 * 600
        + i32::from(mv.promotes) * 280
        + i32::from(is_king(position.piece_at(mv.from))) * 20
        + if (2..=5).contains(&row) && (2..=5).contains(&column) {
            12
        } else {
            0
        }
}

fn ordered(position: Position, mut moves: Vec<Move>, best: Option<&Move>) -> Vec<Move> {
    moves.sort_by(|left, right| {
        let left_best = best.is_some_and(|candidate| candidate == left);
        let right_best = best.is_some_and(|candidate| candidate == right);
        right_best
            .cmp(&left_best)
            .then_with(|| priority(position, right).cmp(&priority(position, left)))
            .then_with(|| left.from.cmp(&right.from))
            .then_with(|| left.path.cmp(&right.path))
    });
    moves
}

struct Searcher {
    config: SearchConfig,
    nodes: u32,
    table: HashMap<(u64, u64, u64, u8, u16), Entry>,
}

impl Searcher {
    fn negamax(
        &mut self,
        position: Position,
        side: u8,
        depth: u8,
        mut alpha: i32,
        mut beta: i32,
        ply: u16,
    ) -> Result<i32, ()> {
        self.nodes = self.nodes.saturating_add(1);
        if self.nodes > self.config.node_budget {
            return Err(());
        }

        let key = (position.black, position.red, position.kings, side, ply);
        let original_alpha = alpha;
        let original_beta = beta;
        let cached = self.table.get(&key).cloned();
        if let Some(entry) = cached.as_ref().filter(|entry| entry.depth >= depth) {
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
            position,
            position.legal_moves(side),
            cached.as_ref().and_then(|entry| entry.best.as_ref()),
        );
        if moves.is_empty() {
            return Ok(-WIN + ply as i32);
        }
        if depth == 0 {
            return Ok(evaluate(position, side));
        }

        let mut score = i32::MIN / 2;
        let mut best = None;
        for mv in moves {
            let child = position.apply_legal(&mv, side);
            let value = -self.negamax(child, other(side), depth - 1, -beta, -alpha, ply + 1)?;
            if value > score {
                score = value;
                best = Some(mv.clone());
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

fn select_root(scores: &[(Move, i32)], band: i32, seed: u64) -> (Move, i32, i32) {
    let best = scores
        .iter()
        .map(|entry| entry.1)
        .max()
        .unwrap_or(i32::MIN / 2);
    let effective_band = if best.abs() >= WIN / 2 {
        0
    } else {
        band.max(0)
    };
    let candidates: Vec<_> = scores
        .iter()
        .filter(|entry| entry.1 >= best - effective_band)
        .collect();
    let mut rng = SplitMix64(seed);
    let selected = candidates[(rng.next() as usize) % candidates.len()];
    (selected.0.clone(), best, selected.1)
}

pub(crate) fn search(position: Position, side: u8, config: SearchConfig) -> SearchResult {
    let initial = ordered(position, position.legal_moves(side), None);
    if initial.is_empty() {
        return SearchResult {
            selected: None,
            score: -WIN,
            selected_score: -WIN,
            depth: 0,
            nodes: 0,
        };
    }

    let mut searcher = Searcher {
        config,
        nodes: 0,
        table: HashMap::new(),
    };
    let mut selected = initial[0].clone();
    let mut best_score = -evaluate(position.apply_legal(&selected, side), other(side));
    let mut selected_score = best_score;
    let mut completed_depth = 0;

    for depth in 1..=config.max_depth {
        let roots = ordered(position, initial.clone(), Some(&selected));
        let mut scores = Vec::with_capacity(roots.len());
        let mut interrupted = false;
        for mv in roots {
            let child = position.apply_legal(&mv, side);
            match searcher.negamax(child, other(side), depth - 1, i32::MIN / 2, i32::MAX / 2, 1) {
                Ok(score) => scores.push((mv, -score)),
                Err(()) => {
                    interrupted = true;
                    break;
                }
            }
        }
        if interrupted || scores.len() != initial.len() {
            break;
        }
        (selected, best_score, selected_score) =
            select_root(&scores, config.root_band, config.seed ^ depth as u64);
        completed_depth = depth;
        if best_score >= WIN - 1 {
            break;
        }
    }

    SearchResult {
        selected: Some(selected),
        score: best_score,
        selected_score,
        depth: completed_depth,
        nodes: searcher.nodes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::{BLACK_MAN, EMPTY, RED_MAN};

    fn config(seed: u64) -> SearchConfig {
        SearchConfig {
            node_budget: 20_000,
            max_depth: 4,
            root_band: 80,
            seed,
        }
    }

    #[test]
    fn search_takes_the_forced_winning_capture() {
        let mut board = [EMPTY; 64];
        board[42] = BLACK_MAN;
        board[35] = RED_MAN;
        let position = Position::from_board(&board).unwrap();
        let result = search(position, BLACK, config(7));
        let selected = result.selected.unwrap();
        assert_eq!(selected.path, [28]);
        assert_eq!(selected.captures, [35]);
        assert!(result.score >= WIN / 2);
    }

    #[test]
    fn seeded_opening_choice_is_reproducible_and_legal() {
        let position = Position::initial();
        let first = search(position, BLACK, config(23));
        let repeated = search(position, BLACK, config(23));
        assert_eq!(first.selected, repeated.selected);
        assert!(
            position
                .legal_moves(BLACK)
                .contains(&first.selected.unwrap())
        );
        assert!(first.score - first.selected_score <= 80);
    }

    #[test]
    fn evaluation_rewards_material_advantage() {
        let mut even = [EMPTY; 64];
        even[42] = BLACK_MAN;
        even[21] = RED_MAN;
        let mut ahead = even;
        ahead[23] = RED_MAN;
        assert!(
            evaluate(Position::from_board(&even).unwrap(), BLACK)
                > evaluate(Position::from_board(&ahead).unwrap(), BLACK)
        );
    }
}
