use crate::game::{self, ADVISOR, CANNON, ELEPHANT, HORSE, KING, Move, PAWN, ROOK, State};

const MATE: i32 = 1_000_000;
const INF: i32 = 2_000_000;

#[derive(Clone, Copy, Debug)]
pub struct SearchConfig {
    pub node_budget: u32,
    pub max_depth: u8,
    pub seed: u64,
    pub root_band: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SearchResult {
    pub selected: Option<Move>,
    pub score: i32,
    pub selected_score: i32,
    pub depth: u8,
    pub nodes: u32,
}

struct Searcher {
    budget: u32,
    nodes: u32,
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

fn value(kind: u8) -> i32 {
    match kind {
        KING => 100_000,
        ROOK => 900,
        CANNON => 450,
        HORSE => 400,
        ELEPHANT | ADVISOR => 200,
        PAWN => 100,
        _ => 0,
    }
}

fn positional(piece: u8, index: usize) -> i32 {
    let row = game::row_of(index) as i32;
    let column = game::column_of(index) as i32;
    match game::kind_of(piece) {
        PAWN => {
            let progress = if game::side_of(piece) == game::RED {
                9 - row
            } else {
                row
            };
            progress * 8 + i32::from((2..=6).contains(&column)) * 5
        }
        HORSE | CANNON => 10 - (4 - column).abs() * 2,
        ROOK => 5 - (4 - column).abs(),
        _ => 0,
    }
}

pub fn evaluate(state: &State, side: u8) -> i32 {
    state
        .board
        .iter()
        .copied()
        .enumerate()
        .fold(0, |score, (index, piece)| {
            if piece == 0 {
                score
            } else {
                let amount = value(game::kind_of(piece)) + positional(piece, index);
                score
                    + if game::side_of(piece) == side {
                        amount
                    } else {
                        -amount
                    }
            }
        })
}

fn priority(state: &State, mv: Move) -> i32 {
    let moving = state.board[mv.from as usize];
    let captured = state.board[mv.to as usize];
    if captured == 0 {
        0
    } else {
        value(game::kind_of(captured)) * 10 - value(game::kind_of(moving))
    }
}

fn ordered(state: &State, mut moves: Vec<Move>) -> Vec<Move> {
    moves.sort_by_key(|mv| (std::cmp::Reverse(priority(state, *mv)), mv.from, mv.to));
    moves
}

impl Searcher {
    fn enter(&mut self) -> Result<(), ()> {
        if self.nodes >= self.budget {
            return Err(());
        }
        self.nodes += 1;
        Ok(())
    }

    fn quiescence(
        &mut self,
        state: &State,
        mut alpha: i32,
        beta: i32,
        ply: u8,
        remaining: u8,
    ) -> Result<i32, ()> {
        self.enter()?;
        let moves = game::legal_moves(state, state.turn);
        if moves.is_empty() {
            return Ok(-MATE + i32::from(ply));
        }
        let checked = game::is_in_check(state, state.turn);
        if !checked {
            let standing = evaluate(state, state.turn);
            if standing >= beta {
                return Ok(beta);
            }
            alpha = alpha.max(standing);
            if remaining == 0 {
                return Ok(alpha);
            }
        }
        let forcing = if checked {
            moves
        } else {
            moves
                .into_iter()
                .filter(|mv| state.board[mv.to as usize] != 0)
                .collect()
        };
        for mv in ordered(state, forcing) {
            let score = -self.quiescence(
                &game::apply_move(state, mv),
                -beta,
                -alpha,
                ply + 1,
                remaining.saturating_sub(1),
            )?;
            if score >= beta {
                return Ok(beta);
            }
            alpha = alpha.max(score);
        }
        Ok(alpha)
    }

    fn negamax(
        &mut self,
        state: &State,
        depth: u8,
        mut alpha: i32,
        beta: i32,
        ply: u8,
    ) -> Result<i32, ()> {
        self.enter()?;
        let moves = game::legal_moves(state, state.turn);
        if moves.is_empty() {
            return Ok(-MATE + i32::from(ply));
        }
        if depth == 0 {
            return self.quiescence(state, alpha, beta, ply, 3);
        }
        let mut best = -INF;
        for mv in ordered(state, moves) {
            let score = -self.negamax(
                &game::apply_move(state, mv),
                depth - 1,
                -beta,
                -alpha,
                ply + 1,
            )?;
            best = best.max(score);
            alpha = alpha.max(score);
            if alpha >= beta {
                break;
            }
        }
        Ok(best)
    }
}

pub fn search(state: &State, config: SearchConfig) -> SearchResult {
    let mut root = ordered(state, game::legal_moves(state, state.turn));
    if root.is_empty() {
        return SearchResult {
            selected: None,
            score: 0,
            selected_score: 0,
            depth: 0,
            nodes: 0,
        };
    }
    for &mv in &root {
        let next = game::apply_move(state, mv);
        if game::legal_moves(&next, next.turn).is_empty() {
            return SearchResult {
                selected: Some(mv),
                score: MATE - 1,
                selected_score: MATE - 1,
                depth: 1,
                nodes: root.len() as u32,
            };
        }
    }

    let mut searcher = Searcher {
        budget: config.node_budget.max(root.len() as u32),
        nodes: 0,
    };
    let mut completed_depth = 0;
    let mut scores: Vec<(Move, i32)> = root
        .iter()
        .copied()
        .map(|mv| {
            let next = game::apply_move(state, mv);
            (mv, -evaluate(&next, next.turn))
        })
        .collect();
    for depth in 1..=config.max_depth {
        let mut iteration = Vec::with_capacity(root.len());
        let mut aborted = false;
        let mut root_alpha = -INF;
        for &mv in &root {
            let threshold = root_alpha.saturating_sub(config.root_band.max(0));
            let child_beta = if root_alpha == -INF { INF } else { -threshold };
            match searcher.negamax(&game::apply_move(state, mv), depth - 1, -INF, child_beta, 1) {
                Ok(child_score) => {
                    let mut score = -child_score;
                    if root_alpha != -INF && score == threshold {
                        match searcher.negamax(
                            &game::apply_move(state, mv),
                            depth - 1,
                            -INF,
                            INF,
                            1,
                        ) {
                            Ok(exact) => score = -exact,
                            Err(()) => {
                                aborted = true;
                                break;
                            }
                        }
                    }
                    root_alpha = root_alpha.max(score);
                    iteration.push((mv, score));
                }
                Err(()) => {
                    aborted = true;
                    break;
                }
            }
        }
        if aborted {
            break;
        }
        scores = iteration;
        scores.sort_by_key(|(mv, score)| (std::cmp::Reverse(*score), mv.from, mv.to));
        root = scores.iter().map(|(mv, _)| *mv).collect();
        completed_depth = depth;
        if scores.iter().any(|(_, score)| *score >= MATE - 100) {
            break;
        }
    }
    scores.sort_by_key(|(mv, score)| (std::cmp::Reverse(*score), mv.from, mv.to));
    let best = scores[0].1;
    let eligible: Vec<_> = scores
        .iter()
        .filter(|(_, score)| *score >= best - config.root_band.max(0))
        .collect();
    let selected = if eligible.len() == 1 || config.root_band <= 0 {
        eligible[0]
    } else {
        let mut random = SplitMix64(config.seed);
        eligible[(random.next() as usize) % eligible.len()]
    };
    SearchResult {
        selected: Some(selected.0),
        score: best,
        selected_score: selected.1,
        depth: completed_depth,
        nodes: searcher.nodes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeded_selection_is_reproducible_and_bounded() {
        let mut state = State::initial();
        state.turn = game::BLACK;
        let config = SearchConfig {
            node_budget: 1_500,
            max_depth: 1,
            seed: 17,
            root_band: 60,
        };
        let first = search(&state, config);
        let second = search(&state, config);
        assert_eq!(first, second);
        assert!(first.score - first.selected_score <= config.root_band);
    }

    #[test]
    fn immediate_king_capture_ignores_seed() {
        let mut state = State {
            board: [0; game::ROWS * game::COLS],
            turn: game::RED,
        };
        state.board[game::at(9, 4)] = game::piece(game::RED, KING);
        state.board[game::at(0, 4)] = game::piece(game::BLACK, KING);
        let a = search(
            &state,
            SearchConfig {
                node_budget: 5_000,
                max_depth: 2,
                seed: 1,
                root_band: 500,
            },
        );
        let b = search(
            &state,
            SearchConfig {
                node_budget: 5_000,
                max_depth: 2,
                seed: 99,
                root_band: 500,
            },
        );
        assert_eq!(a.selected, b.selected);
        assert_eq!(
            a.selected,
            Some(Move {
                from: game::at(9, 4) as u8,
                to: game::at(0, 4) as u8
            })
        );
    }
}
