#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;
use std::{
    cmp::Reverse,
    collections::{BinaryHeap, HashMap},
    sync::OnceLock,
};

use crate::game::{BLACK, Move, Position, is_king, other, row_of, side_of};

const WIN: i32 = 1_000_000;

#[derive(Clone, Copy, Default)]
struct KingEnding {
    winner: u8,
    distance: u16,
}

// Solve the 31,744 one- and two-kings-against-one positions once. A pursuit
// bonus alone can preserve an extra king without ever forcing the capture.
// Retrograde distance gives every winning move a concrete progress measure.
fn king_endings() -> &'static HashMap<(Position, u8), KingEnding> {
    static TABLE: OnceLock<HashMap<(Position, u8), KingEnding>> = OnceLock::new();
    TABLE.get_or_init(|| {
        let squares: Vec<u8> = (0..64)
            .filter(|&index| crate::game::playable(index))
            .collect();
        let mut states = Vec::new();
        let mut indices = HashMap::new();
        for &black_index in &squares {
            for &red_index in &squares {
                if red_index == black_index {
                    continue;
                }
                for second in std::iter::once(None).chain(
                    squares
                        .iter()
                        .copied()
                        .filter(|&index| index > red_index && index != black_index)
                        .map(Some),
                ) {
                    let black = 1_u64 << black_index;
                    let red = (1_u64 << red_index) | second.map_or(0, |index| 1_u64 << index);
                    let position = Position {
                        black,
                        red,
                        kings: black | red,
                    };
                    for side in [BLACK, other(BLACK)] {
                        indices.insert((position, side), states.len());
                        states.push((position, side));
                    }
                }
            }
        }
        let mut parents = vec![Vec::new(); states.len()];
        let mut remaining = vec![0; states.len()];
        let mut entries = vec![KingEnding::default(); states.len()];
        let mut queue = BinaryHeap::new();
        for (index, &(position, side)) in states.iter().enumerate() {
            let moves = position.legal_moves(side);
            remaining[index] = moves.len();
            if moves.is_empty() {
                entries[index].winner = other(side);
            }
            for mv in moves {
                let next = position.apply_legal(&mv, side);
                if next.pieces(other(side)) == 0 {
                    entries[index] = KingEnding {
                        winner: side,
                        distance: 1,
                    };
                } else {
                    parents[indices[&(next, other(side))]].push(index);
                }
            }
            if entries[index].winner != 0 {
                queue.push(Reverse((entries[index].distance, index)));
            }
        }
        while let Some(Reverse((distance, child))) = queue.pop() {
            let winner = entries[child].winner;
            for &parent in &parents[child] {
                if entries[parent].winner != 0 {
                    continue;
                }
                remaining[parent] -= 1;
                if states[parent].1 == winner || remaining[parent] == 0 {
                    entries[parent] = KingEnding {
                        winner,
                        distance: distance + 1,
                    };
                    queue.push(Reverse((distance + 1, parent)));
                }
            }
        }
        states.into_iter().zip(entries).collect()
    })
}

fn king_ending(position: Position, side: u8) -> KingEnding {
    let flipped = position.black.count_ones() > position.red.count_ones();
    let (normalized, turn) = if flipped {
        (
            Position {
                black: position.red,
                red: position.black,
                kings: position.kings,
            },
            other(side),
        )
    } else {
        (position, side)
    };
    let mut entry = king_endings()[&(normalized, turn)];
    if flipped && entry.winner != 0 {
        entry.winner = other(entry.winner);
    }
    entry
}

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn now_ms() -> f64;
}
fn clock_ms() -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: the shared Wasm loader supplies a monotonic clock.
    unsafe {
        now_ms()
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        static START: OnceLock<Instant> = OnceLock::new();
        START.get_or_init(Instant::now).elapsed().as_secs_f64() * 1000.0
    }
}
fn stored_score(score: i32, ply: u16) -> i32 {
    if score >= WIN / 2 {
        score + i32::from(ply)
    } else if score <= -WIN / 2 {
        score - i32::from(ply)
    } else {
        score
    }
}
fn restored_score(score: i32, ply: u16) -> i32 {
    stored_score(score, 0)
        - if score >= WIN / 2 {
            i32::from(ply)
        } else if score <= -WIN / 2 {
            -i32::from(ply)
        } else {
            0
        }
}
fn token(position: Position, side: u8, count: u8) -> u64 {
    let mut rng = SplitMix64(
        position.black
            ^ position.red.rotate_left(17)
            ^ position.kings.rotate_left(39)
            ^ (u64::from(side) << 4)
            ^ u64::from(count),
    );
    rng.next()
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct SearchConfig {
    pub node_budget: u32,
    pub max_depth: u8,
    pub root_band: i32,
    pub seed: u64,
    pub time_budget_ms: f64,
    pub halfmove: u16,
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
    let mut totals = [0i32; 3];
    let mut material = [0i32; 3];
    let mut occupied = position.occupied();
    let total = occupied.count_ones() as i32;
    while occupied != 0 {
        let index = occupied.trailing_zeros() as u8;
        occupied &= occupied - 1;
        let piece = position.piece_at(index);
        let owner = side_of(piece);
        let row = i32::from(row_of(index));
        let column = i32::from(index % 8);
        let center = 7 - (row * 2 - 7).abs().max((column * 2 - 7).abs());
        let value = if is_king(piece) {
            material[owner as usize] += 185;
            185 + center * 4
        } else {
            material[owner as usize] += 100;
            let advance = if owner == BLACK { 7 - row } else { row };
            let mut value = 100 + advance * (if total <= 10 { 5 } else { 2 });
            // Keep a home-row guard while enemy men still need to crown.
            if advance == 0 && position.pieces(other(owner)) & !position.kings != 0 {
                value += 12;
            }
            if advance >= 5 {
                value += (advance - 4) * 9;
            }
            value + center * 2
        };
        totals[owner as usize] += value;
    }
    let enemy = other(side);
    let mut score = totals[side as usize] - totals[enemy as usize];
    score +=
        (position.legal_moves(side).len() as i32 - position.legal_moves(enemy).len() as i32) * 3;
    // With an extra king, close the distance and restrict the lone defender instead
    // of choosing equivalent central squares until the repetition rule fires.
    if total <= 10 {
        for owner in [side, enemy] {
            let advantage = material[owner as usize] - material[other(owner) as usize];
            if advantage < 70 {
                continue;
            }
            let mut kings = position.pieces(owner) & position.kings;
            let targets = position.pieces(other(owner));
            let mut pursuit = 0;
            while kings != 0 {
                let from = kings.trailing_zeros() as u8;
                kings &= kings - 1;
                let mut opponents = targets;
                let mut distance = 8;
                while opponents != 0 {
                    let to = opponents.trailing_zeros() as u8;
                    opponents &= opponents - 1;
                    distance = distance.min(
                        (i32::from(row_of(from)) - i32::from(row_of(to)))
                            .abs()
                            .max((i32::from(from % 8) - i32::from(to % 8)).abs()),
                    );
                }
                pursuit += (7 - distance) * 6;
            }
            score += if owner == side { pursuit } else { -pursuit };
        }
        score += (material[side as usize] - material[enemy as usize]) * (24 - total) / 48;
    }
    score
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
    deadline: f64,
    nodes: u32,
    table: HashMap<(Position, u8, u16, u64), Entry>,
    repetitions: HashMap<(Position, u8), u8>,
    repetition_hash: u64,
}

impl Searcher {
    fn record(&mut self, position: Position, side: u8) {
        let count = self.repetitions.entry((position, side)).or_default();
        *count += 1;
        self.repetition_hash ^= token(position, side, *count);
    }
    fn unrecord(&mut self, position: Position, side: u8) {
        let count = self.repetitions.get_mut(&(position, side)).unwrap();
        self.repetition_hash ^= token(position, side, *count);
        *count -= 1;
        if *count == 0 {
            self.repetitions.remove(&(position, side));
        }
    }
    #[allow(clippy::too_many_arguments)]
    fn child(
        &mut self,
        position: Position,
        side: u8,
        mv: &Move,
        depth: u8,
        window: (i32, i32),
        ply: u16,
        halfmove: u16,
    ) -> Result<i32, ()> {
        let next = position.apply_legal(mv, side);
        let quiet = mv.captures.is_empty() && is_king(position.piece_at(mv.from));
        let halfmove = if quiet { halfmove.saturating_add(1) } else { 0 };
        self.record(next, other(side));
        let result = self.negamax(
            next,
            other(side),
            depth,
            -window.1,
            -window.0,
            ply + 1,
            halfmove,
        );
        self.unrecord(next, other(side));
        result.map(|score| -score)
    }
    #[allow(clippy::too_many_arguments)]
    fn negamax(
        &mut self,
        position: Position,
        side: u8,
        depth: u8,
        mut alpha: i32,
        mut beta: i32,
        ply: u16,
        halfmove: u16,
    ) -> Result<i32, ()> {
        if self.nodes >= self.config.node_budget {
            return Err(());
        }
        self.nodes += 1;
        if self.nodes.is_multiple_of(256) && clock_ms() >= self.deadline {
            return Err(());
        }
        let moves = position.legal_moves(side);
        if moves.is_empty() {
            return Ok(-WIN + i32::from(ply));
        }
        if halfmove >= crate::game::DRAW_PLIES
            || self
                .repetitions
                .get(&(position, side))
                .copied()
                .unwrap_or(0)
                >= 3
        {
            return Ok(0);
        }
        let context = if halfmove == 0 {
            0
        } else {
            self.repetition_hash
        };
        let key = (position, side, halfmove, context);
        let cached = self.table.get(&key).cloned();
        if let Some(entry) = cached.as_ref().filter(|entry| entry.depth >= depth) {
            let value = restored_score(entry.score, ply);
            match entry.bound {
                Bound::Exact => return Ok(value),
                Bound::Lower => alpha = alpha.max(value),
                Bound::Upper => beta = beta.min(value),
            }
            if alpha >= beta {
                return Ok(value);
            }
        }
        let original_alpha = alpha;
        let original_beta = beta;
        if depth == 0 && moves[0].captures.is_empty() {
            return Ok(evaluate(position, side));
        }
        let moves = ordered(
            position,
            moves,
            cached.as_ref().and_then(|entry| entry.best.as_ref()),
        );
        let mut score = -WIN * 2;
        let mut best = None;
        for (index, mv) in moves.into_iter().enumerate() {
            let next_depth = depth.saturating_sub(1);
            let mut value = if index == 0 {
                self.child(
                    position,
                    side,
                    &mv,
                    next_depth,
                    (alpha, beta),
                    ply,
                    halfmove,
                )?
            } else {
                self.child(
                    position,
                    side,
                    &mv,
                    next_depth,
                    (alpha, alpha + 1),
                    ply,
                    halfmove,
                )?
            };
            if index > 0 && value > alpha && value < beta {
                value = self.child(
                    position,
                    side,
                    &mv,
                    next_depth,
                    (alpha, beta),
                    ply,
                    halfmove,
                )?;
            }
            if value > score {
                score = value;
                best = Some(mv);
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
                score: stored_score(score, ply),
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

pub(crate) fn search(
    position: Position,
    side: u8,
    positions: &[(Position, u8)],
    config: SearchConfig,
) -> SearchResult {
    let initial = ordered(position, position.legal_moves(side), None);
    let mut searcher = Searcher {
        config,
        deadline: clock_ms() + config.time_budget_ms,
        nodes: 0,
        table: HashMap::new(),
        repetitions: HashMap::new(),
        repetition_hash: 0,
    };
    for &(previous, turn) in positions {
        searcher.record(previous, turn);
    }
    if !searcher.repetitions.contains_key(&(position, side)) {
        searcher.record(position, side);
    }
    if initial.is_empty()
        || config.halfmove >= crate::game::DRAW_PLIES
        || searcher.repetitions[&(position, side)] >= 3
    {
        let score = if initial.is_empty() { -WIN } else { 0 };
        return SearchResult {
            selected: None,
            score,
            selected_score: score,
            depth: 0,
            nodes: 0,
        };
    }
    if position.occupied() == position.kings
        && position.occupied().count_ones() <= 3
        && config.time_budget_ms > 0.0
    {
        let scores: Vec<_> = initial
            .iter()
            .map(|mv| {
                let child = position.apply_legal(mv, side);
                let score = if child.legal_moves(other(side)).is_empty() {
                    WIN - 1
                } else if searcher
                    .repetitions
                    .get(&(child, other(side)))
                    .copied()
                    .unwrap_or(0)
                    >= 2
                {
                    0
                } else {
                    let entry = king_ending(child, other(side));
                    let clock = if mv.captures.is_empty() {
                        config.halfmove + 1
                    } else {
                        0
                    };
                    if entry.winner == 0
                        || clock + entry.distance > crate::game::DRAW_PLIES
                        || clock >= crate::game::DRAW_PLIES
                    {
                        0
                    } else if entry.winner == side {
                        WIN - i32::from(entry.distance) - 1
                    } else {
                        -WIN + i32::from(entry.distance) + 1
                    }
                };
                (mv.clone(), score)
            })
            .collect();
        let (selected, score, selected_score) = select_root(&scores, config.root_band, config.seed);
        return SearchResult {
            selected: Some(selected),
            score,
            selected_score,
            depth: 0,
            nodes: initial.len() as u32,
        };
    }
    let fallback: Vec<_> = initial
        .iter()
        .map(|mv| {
            let child = position.apply_legal(mv, side);
            let value = if child.legal_moves(other(side)).is_empty() {
                WIN - 1
            } else {
                -evaluate(child, other(side))
            };
            (mv.clone(), value)
        })
        .collect();
    let (mut selected, mut best_score, mut selected_score) =
        select_root(&fallback, config.root_band, config.seed);
    let mut completed_depth = 0;
    for depth in 1..=config.max_depth {
        let roots = ordered(position, initial.clone(), Some(&selected));
        let mut scores = Vec::with_capacity(roots.len());
        let mut interrupted = false;
        let mut best = -WIN * 2;
        for (index, mv) in roots.into_iter().enumerate() {
            if clock_ms() >= searcher.deadline {
                interrupted = true;
                break;
            }
            let threshold = best
                - if best.abs() >= WIN / 2 {
                    0
                } else {
                    config.root_band
                };
            let result = if index == 0 {
                searcher.child(
                    position,
                    side,
                    &mv,
                    depth - 1,
                    (-WIN * 2, WIN * 2),
                    0,
                    config.halfmove,
                )
            } else {
                searcher
                    .child(
                        position,
                        side,
                        &mv,
                        depth - 1,
                        (threshold - 1, threshold),
                        0,
                        config.halfmove,
                    )
                    .and_then(|value| {
                        if value >= threshold {
                            searcher.child(
                                position,
                                side,
                                &mv,
                                depth - 1,
                                (-WIN * 2, WIN * 2),
                                0,
                                config.halfmove,
                            )
                        } else {
                            Ok(value)
                        }
                    })
            };
            match result {
                Ok(value) => {
                    best = best.max(value);
                    scores.push((mv, value));
                }
                Err(()) => {
                    interrupted = true;
                    break;
                }
            }
        }
        if interrupted {
            break;
        }
        (selected, best_score, selected_score) =
            select_root(&scores, config.root_band, config.seed);
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
            time_budget_ms: 10000.0,
            halfmove: 0,
        }
    }

    #[test]
    fn horizon_resolves_compulsory_captures() {
        let mut board = [EMPTY; 64];
        board[42] = BLACK_MAN;
        board[35] = RED_MAN;
        let position = Position::from_board(&board).unwrap();
        let mut searcher = Searcher {
            config: config(7),
            deadline: clock_ms() + 10000.0,
            nodes: 0,
            table: HashMap::new(),
            repetitions: HashMap::new(),
            repetition_hash: 0,
        };
        let score = searcher
            .negamax(position, BLACK, 0, -WIN * 2, WIN * 2, 0, 0)
            .unwrap();
        assert_eq!(score, WIN - 1);
    }

    #[test]
    fn search_takes_the_forced_winning_capture() {
        let mut board = [EMPTY; 64];
        board[42] = BLACK_MAN;
        board[35] = RED_MAN;
        let position = Position::from_board(&board).unwrap();
        let result = search(position, BLACK, &[], config(7));
        let selected = result.selected.unwrap();
        assert_eq!(selected.path, [28]);
        assert_eq!(selected.captures, [35]);
        assert!(result.score >= WIN / 2);
    }

    #[test]
    fn seeded_opening_choice_is_reproducible_and_legal() {
        let position = Position::initial();
        let first = search(position, BLACK, &[], config(23));
        let repeated = search(position, BLACK, &[], config(23));
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

    #[test]
    fn winning_side_avoids_a_known_third_repetition() {
        let mut board = [EMPTY; 64];
        board[42] = crate::game::BLACK_KING;
        board[46] = crate::game::BLACK_KING;
        board[7] = crate::game::RED_KING;
        let position = Position::from_board(&board).unwrap();
        let mut limits = config(3);
        limits.root_band = 0;
        let first = search(position, BLACK, &[], limits).selected.unwrap();
        let repeated = position.apply_legal(&first, BLACK);
        let result = search(
            position,
            BLACK,
            &[(repeated, crate::game::RED), (repeated, crate::game::RED)],
            limits,
        );
        assert_ne!(result.selected, Some(first));
        assert!(result.selected_score > 0);
        limits.halfmove = 79;
        let drawn = search(position, BLACK, &[], limits);
        assert_eq!(drawn.score, 0);
    }

    #[test]
    fn root_scouting_preserves_exact_compulsory_capture_minimax() {
        fn minimax(position: Position, side: u8, depth: u8, ply: u16) -> i32 {
            let moves = position.legal_moves(side);
            if moves.is_empty() {
                return -WIN + i32::from(ply);
            }
            if depth == 0 && moves[0].captures.is_empty() {
                return evaluate(position, side);
            }
            moves
                .iter()
                .map(|mv| {
                    -minimax(
                        position.apply_legal(mv, side),
                        other(side),
                        depth.saturating_sub(1),
                        ply + 1,
                    )
                })
                .max()
                .unwrap()
        }
        let position = Position::initial();
        let expected = minimax(position, BLACK, 4, 0);
        let mut limits = config(11);
        limits.node_budget = 100_000;
        limits.root_band = 8;
        let result = search(position, BLACK, &[], limits);
        assert_eq!(result.depth, 4);
        assert_eq!(result.score, expected);
        let child = position.apply_legal(&result.selected.unwrap(), BLACK);
        assert_eq!(result.selected_score, -minimax(child, other(BLACK), 3, 1));
    }

    #[test]
    fn extra_king_converts_instead_of_repeating_until_the_quiet_clock_expires() {
        for flip in [false, true] {
            let mut board = [EMPTY; 64];
            board[1] = if flip {
                crate::game::RED_KING
            } else {
                crate::game::BLACK_KING
            };
            for index in [24, 26] {
                board[index] = if flip {
                    crate::game::BLACK_KING
                } else {
                    crate::game::RED_KING
                };
            }
            let stronger = if flip { BLACK } else { other(BLACK) };
            let mut position = Position::from_board(&board).unwrap();
            let mut side = stronger;
            let mut limits = config(7);
            let mut history = vec![(position, side)];
            let mut previous_distance = u16::MAX;
            for _ in 0..80 {
                if position.legal_moves(side).is_empty() {
                    assert_eq!(other(side), stronger);
                    break;
                }
                let ending = king_ending(position, side);
                assert_eq!(ending.winner, stronger);
                assert!(ending.distance < previous_distance);
                previous_distance = ending.distance;
                let mv = search(position, side, &history, limits).selected.unwrap();
                limits.halfmove = if mv.captures.is_empty() {
                    limits.halfmove + 1
                } else {
                    0
                };
                position = position.apply_legal(&mv, side);
                side = other(side);
                history.push((position, side));
            }
            assert!(position.legal_moves(side).is_empty());
        }
    }
}
