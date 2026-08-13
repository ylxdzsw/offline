use crate::game::{self, ADVISOR, CANNON, ELEPHANT, HORSE, KING, Move, PAWN, ROOK, State};

const MATE: i32 = 1_000_000;
const INF: i32 = 2_000_000;
const MATE_BOUND: i32 = MATE - 10_000;
const MAX_PLY: usize = 96;
const TABLE_SIZE: usize = 1 << 14;
const QUIESCENCE_DEPTH: u8 = 3;
const BOARD_SQUARES: usize = game::ROWS * game::COLS;

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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Bound {
    Exact,
    Lower,
    Upper,
}

#[derive(Clone, Copy, Debug)]
struct Entry {
    key: u64,
    depth: u8,
    score: i32,
    bound: Bound,
    best: Move,
}

struct Searcher {
    budget: u32,
    nodes: u32,
    table: Vec<Option<Entry>>,
    killers: [[Option<Move>; 2]; MAX_PLY],
    history: [u32; BOARD_SQUARES * BOARD_SQUARES],
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

fn center(index: usize) -> i32 {
    let row = game::row_of(index) as i32;
    let column = game::column_of(index) as i32;
    18 - ((row * 2 - 9).abs() + (column * 2 - 8).abs())
}

fn pawn_progress(side: u8, row: usize) -> i32 {
    if side == game::RED {
        6_i32.saturating_sub(row as i32)
    } else {
        (row as i32 - 3).max(0)
    }
}

fn horse_freedom(state: &State, index: usize) -> i32 {
    let row = game::row_of(index) as i8;
    let column = game::column_of(index) as i8;
    [(-1, 0), (1, 0), (0, -1), (0, 1)]
        .into_iter()
        .filter(|(dr, dc)| {
            let row = row + dr;
            let column = column + dc;
            (0..game::ROWS as i8).contains(&row)
                && (0..game::COLS as i8).contains(&column)
                && state.board[game::at(row as usize, column as usize)] == 0
        })
        .count() as i32
}

fn line_activity(state: &State, index: usize, cannon: bool) -> i32 {
    let row = game::row_of(index) as i8;
    let column = game::column_of(index) as i8;
    let side = game::side_of(state.board[index]);
    let mut score = 0;
    for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
        let mut screened = false;
        let mut r = row + dr;
        let mut c = column + dc;
        while (0..game::ROWS as i8).contains(&r) && (0..game::COLS as i8).contains(&c) {
            let target = state.board[game::at(r as usize, c as usize)];
            if !screened {
                if target == 0 {
                    score += if cannon { 1 } else { 2 };
                } else if cannon {
                    screened = true;
                } else {
                    if game::side_of(target) != side {
                        score += 4;
                    }
                    break;
                }
            } else if target != 0 {
                if game::side_of(target) != side {
                    score += 5 + value(game::kind_of(target)) / 100;
                }
                break;
            }
            r += dr;
            c += dc;
        }
    }
    score
}

pub fn evaluate(state: &State, side: u8) -> i32 {
    let mut scores = [0; 2];
    let mut advisors = [0_u8; 2];
    let mut elephants = [0_u8; 2];
    let mut kings = [0_usize; 2];

    for (index, piece) in state.board.iter().copied().enumerate() {
        if piece == 0 {
            continue;
        }
        let piece_side = game::side_of(piece) as usize;
        let kind = game::kind_of(piece);
        let row = game::row_of(index);
        let column = game::column_of(index);
        let positional = match kind {
            PAWN => {
                let progress = pawn_progress(piece_side as u8, row);
                let crossed = if piece_side == game::RED as usize {
                    row <= 4
                } else {
                    row >= 5
                };
                progress * 11 + i32::from(crossed) * 42 + i32::from((2..=6).contains(&column)) * 5
            }
            HORSE => center(index) * 3 + horse_freedom(state, index) * 7,
            CANNON => center(index) + line_activity(state, index, true) * 2,
            ROOK => center(index) / 2 + line_activity(state, index, false) * 3,
            ADVISOR => {
                advisors[piece_side] += 1;
                0
            }
            ELEPHANT => {
                elephants[piece_side] += 1;
                0
            }
            KING => {
                kings[piece_side] = index;
                0
            }
            _ => 0,
        };
        scores[piece_side] += value(kind) + positional;
    }

    for piece_side in 0..2 {
        scores[piece_side] += i32::from(advisors[piece_side]) * 18;
        scores[piece_side] += i32::from(elephants[piece_side]) * 11;
        if advisors[piece_side] == 0 && elephants[piece_side] == 0 {
            scores[piece_side] -= 28;
        }
        let king = kings[piece_side];
        let row = game::row_of(king);
        let column = game::column_of(king);
        let home_row = if piece_side == game::RED as usize {
            9
        } else {
            0
        };
        if row == home_row {
            scores[piece_side] += 12;
        }
        let shelter_row = if piece_side == game::RED as usize {
            row.checked_sub(1)
        } else {
            (row + 1 < game::ROWS).then_some(row + 1)
        };
        if let Some(shelter_row) = shelter_row
            && state.board[game::at(shelter_row, column)] == game::piece(piece_side as u8, PAWN)
        {
            scores[piece_side] += 10;
        }
    }

    scores[side as usize] - scores[game::other(side) as usize]
}

fn position_key(state: &State) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for piece in state.board {
        hash ^= u64::from(piece) + 1;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash ^= u64::from(state.turn) + 1;
    hash.wrapping_mul(0x0000_0100_0000_01b3)
}

fn is_capture(state: &State, mv: Move) -> bool {
    state.board[mv.to as usize] != 0
}

fn tactical_priority(state: &State, mv: Move) -> i32 {
    let captured = state.board[mv.to as usize];
    if captured == 0 {
        0
    } else {
        value(game::kind_of(captured)) * 16 - value(game::kind_of(state.board[mv.from as usize]))
    }
}

fn ordered(
    state: &State,
    mut moves: Vec<Move>,
    best: Option<Move>,
    killers: [Option<Move>; 2],
    history: &[u32; BOARD_SQUARES * BOARD_SQUARES],
) -> Vec<Move> {
    let score = |mv: Move| {
        if best == Some(mv) {
            3_000_000
        } else {
            let tactical = tactical_priority(state, mv);
            if tactical != 0 {
                2_000_000 + tactical
            } else if killers[0] == Some(mv) {
                1_500_000
            } else if killers[1] == Some(mv) {
                1_400_000
            } else {
                history[mv.from as usize * BOARD_SQUARES + mv.to as usize].min(1_000_000) as i32
            }
        }
    };
    moves.sort_by_key(|mv| (std::cmp::Reverse(score(*mv)), mv.from, mv.to));
    moves
}

fn tt_score(score: i32, ply: u8, storing: bool) -> i32 {
    if score >= MATE_BOUND {
        score
            + if storing {
                i32::from(ply)
            } else {
                -i32::from(ply)
            }
    } else if score <= -MATE_BOUND {
        score
            + if storing {
                -i32::from(ply)
            } else {
                i32::from(ply)
            }
    } else {
        score
    }
}

impl Searcher {
    fn enter(&mut self) -> Result<(), ()> {
        if self.nodes >= self.budget {
            return Err(());
        }
        self.nodes += 1;
        Ok(())
    }

    fn entry(&self, key: u64) -> Option<Entry> {
        self.table[key as usize & (TABLE_SIZE - 1)].filter(|entry| entry.key == key)
    }

    fn store(&mut self, entry: Entry) {
        let slot = &mut self.table[entry.key as usize & (TABLE_SIZE - 1)];
        if slot.is_none_or(|current| {
            current.depth < entry.depth
                || (current.depth == entry.depth
                    && (current.key != entry.key || entry.bound == Bound::Exact))
        }) {
            *slot = Some(entry);
        }
    }

    fn record_cutoff(&mut self, mv: Move, depth: u8, ply: u8) {
        let index = usize::from(ply).min(MAX_PLY - 1);
        if self.killers[index][0] != Some(mv) {
            self.killers[index][1] = self.killers[index][0];
            self.killers[index][0] = Some(mv);
        }
        let history = &mut self.history[mv.from as usize * BOARD_SQUARES + mv.to as usize];
        *history = history.saturating_add(u32::from(depth).pow(2));
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
        if remaining == 0 {
            return Ok(evaluate(state, state.turn) - i32::from(checked) * 30);
        }
        if !checked {
            let standing = evaluate(state, state.turn);
            if standing >= beta {
                return Ok(standing);
            }
            alpha = alpha.max(standing);
        }

        let forcing = if checked {
            moves
        } else {
            moves
                .into_iter()
                .filter(|mv| is_capture(state, *mv))
                .collect()
        };
        let forcing = ordered(state, forcing, None, [None; 2], &self.history);
        for mv in forcing {
            let score = -self.quiescence(
                &game::apply_move(state, mv),
                -beta,
                -alpha,
                ply + 1,
                remaining - 1,
            )?;
            if score >= beta {
                return Ok(score);
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
        mut beta: i32,
        ply: u8,
    ) -> Result<i32, ()> {
        if depth == 0 {
            return self.quiescence(state, alpha, beta, ply, QUIESCENCE_DEPTH);
        }
        self.enter()?;

        let key = position_key(state);
        let original_alpha = alpha;
        let original_beta = beta;
        let cached = self.entry(key);
        if let Some(entry) = cached.filter(|entry| entry.depth >= depth) {
            let score = tt_score(entry.score, ply, false);
            match entry.bound {
                Bound::Exact => return Ok(score),
                Bound::Lower => alpha = alpha.max(score),
                Bound::Upper => beta = beta.min(score),
            }
            if alpha >= beta {
                return Ok(score);
            }
        }

        let moves = game::legal_moves(state, state.turn);
        if moves.is_empty() {
            return Ok(-MATE + i32::from(ply));
        }
        let killers = self.killers[usize::from(ply).min(MAX_PLY - 1)];
        let moves = ordered(
            state,
            moves,
            cached.map(|entry| entry.best),
            killers,
            &self.history,
        );

        let mut best_score = -INF;
        let mut best_move = moves[0];
        for (index, mv) in moves.into_iter().enumerate() {
            let next = game::apply_move(state, mv);
            let mut score = if index == 0 {
                -self.negamax(&next, depth - 1, -beta, -alpha, ply + 1)?
            } else {
                -self.negamax(&next, depth - 1, -alpha - 1, -alpha, ply + 1)?
            };
            if index != 0 && score > alpha && score < beta {
                score = -self.negamax(&next, depth - 1, -beta, -alpha, ply + 1)?;
            }
            if score > best_score {
                best_score = score;
                best_move = mv;
            }
            alpha = alpha.max(score);
            if alpha >= beta {
                if !is_capture(state, mv) {
                    self.record_cutoff(mv, depth, ply);
                }
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
        self.store(Entry {
            key,
            depth,
            score: tt_score(best_score, ply, true),
            bound,
            best: best_move,
        });
        Ok(best_score)
    }
}

pub fn search(state: &State, config: SearchConfig) -> SearchResult {
    let mut root = ordered(
        state,
        game::legal_moves(state, state.turn),
        None,
        [None; 2],
        &[0; BOARD_SQUARES * BOARD_SQUARES],
    );
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
        table: vec![None; TABLE_SIZE],
        killers: [[None; 2]; MAX_PLY],
        history: [0; BOARD_SQUARES * BOARD_SQUARES],
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
        for (index, &mv) in root.iter().enumerate() {
            let next = game::apply_move(state, mv);
            let result = if index == 0 {
                searcher
                    .negamax(&next, depth - 1, -INF, INF, 1)
                    .map(|score| -score)
            } else {
                let threshold = root_alpha.saturating_sub(config.root_band.max(0));
                searcher
                    .negamax(&next, depth - 1, -threshold, -threshold + 1, 1)
                    .map(|score| -score)
                    .and_then(|probe| {
                        if probe >= threshold {
                            searcher
                                .negamax(&next, depth - 1, -INF, INF, 1)
                                .map(|score| -score)
                        } else {
                            Ok(probe)
                        }
                    })
            };
            match result {
                Ok(score) => {
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
    let effective_band = if best.abs() >= MATE_BOUND {
        0
    } else {
        config.root_band.max(0)
    };
    let eligible: Vec<_> = scores
        .iter()
        .filter(|(_, score)| *score >= best - effective_band)
        .collect();
    let selected = if eligible.len() == 1 || effective_band == 0 {
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

    fn bare() -> State {
        let mut state = State {
            board: [0; BOARD_SQUARES],
            turn: game::RED,
        };
        state.board[game::at(9, 4)] = game::piece(game::RED, KING);
        state.board[game::at(0, 3)] = game::piece(game::BLACK, KING);
        state
    }

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
        assert!(first.nodes <= config.node_budget);
    }

    #[test]
    fn evaluation_rewards_a_crossed_pawn() {
        let mut state = bare();
        state.board[game::at(6, 0)] = game::piece(game::RED, PAWN);
        let home = evaluate(&state, game::RED);
        state.board[game::at(6, 0)] = 0;
        state.board[game::at(4, 0)] = game::piece(game::RED, PAWN);
        assert!(evaluate(&state, game::RED) > home + 50);
    }

    #[test]
    fn evaluation_rewards_an_active_horse() {
        let mut state = bare();
        state.board[game::at(9, 0)] = game::piece(game::RED, HORSE);
        let corner = evaluate(&state, game::RED);
        state.board[game::at(9, 0)] = 0;
        state.board[game::at(5, 4)] = game::piece(game::RED, HORSE);
        assert!(evaluate(&state, game::RED) > corner);
    }

    #[test]
    fn immediate_king_capture_ignores_seed() {
        let mut state = State {
            board: [0; BOARD_SQUARES],
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
