use std::collections::HashMap;
#[cfg(not(target_arch = "wasm32"))]
use std::sync::OnceLock;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

use crate::game::{
    ELEPHANT, LION, Move, RAT, TIGER, col_of, den, effective_rank, legal_moves, other, rank_of,
    row_of, side_of, terminal,
};

const WIN: i32 = 1_000_000;
const TACTICAL_EXTENSION_PLIES: u16 = 8;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn now_ms() -> f64;
}

fn clock_ms() -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: the page and worker loaders always provide env.now_ms.
    unsafe {
        now_ms()
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        static STARTED: OnceLock<Instant> = OnceLock::new();
        STARTED.get_or_init(Instant::now).elapsed().as_secs_f64() * 1_000.0
    }
}

// Material values by rank (index 0 unused)
const PIECE_VALUE: [i32; 9] = [0, 250, 190, 220, 250, 290, 410, 440, 490];

#[derive(Clone, Copy, Debug)]
pub(crate) struct SearchConfig {
    pub node_budget: u32,
    pub max_depth: u8,
    pub root_band: i32,
    pub seed: u64,
    pub time_budget_ms: f64,
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
        self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
        let mut v = self.0;
        v = (v ^ (v >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        v = (v ^ (v >> 27)).wrapping_mul(0x94d049bb133111eb);
        v ^ (v >> 31)
    }
}

fn den_dist(index: usize, target: usize) -> i32 {
    let dr = (row_of(index) as i32 - row_of(target) as i32).abs();
    let dc = (col_of(index) as i32 - col_of(target) as i32).abs();
    dr + dc
}

// Empty-board routes account for water and jumping, so a lion's river leap costs
// one move rather than the number of squares crossed.
const fn river(index: usize) -> bool {
    let row = index / 7;
    let column = index % 7;
    row >= 3 && row <= 5 && (column == 1 || column == 2 || column == 4 || column == 5)
}
const fn route_distances() -> [[[u8; 63]; 3]; 2] {
    let mut result = [[[63u8; 63]; 3]; 2];
    let mut owner = 0;
    while owner < 2 {
        let target = if owner == 0 { 3 } else { 59 };
        let home = if owner == 0 { 59 } else { 3 };
        let mut kind = 0;
        while kind < 3 {
            let mut queue = [0usize; 63];
            let mut head = 0;
            let mut tail = 1;
            queue[0] = target;
            result[owner][kind][target] = 0;
            while head < tail {
                let from = queue[head];
                head += 1;
                let mut direction = 0;
                while direction < 4 {
                    let dr = [-1, 1, 0, 0][direction];
                    let dc = [0, 0, -1, 1][direction];
                    direction += 1;
                    let mut row = from as i32 / 7 + dr;
                    let mut column = from as i32 % 7 + dc;
                    if row < 0 || row > 8 || column < 0 || column > 6 {
                        continue;
                    }
                    let mut to = (row * 7 + column) as usize;
                    if river(to) && kind != 0 {
                        if kind == 1 {
                            continue;
                        }
                        while river(to) {
                            row += dr;
                            column += dc;
                            to = (row * 7 + column) as usize;
                        }
                    }
                    if to == home || result[owner][kind][to] != 63 {
                        continue;
                    }
                    result[owner][kind][to] = result[owner][kind][from] + 1;
                    queue[tail] = to;
                    tail += 1;
                }
            }
            kind += 1;
        }
        owner += 1;
    }
    result
}
const ROUTES: [[[u8; 63]; 3]; 2] = route_distances();
fn route_distance(piece: u8, index: usize) -> i32 {
    let kind = match rank_of(piece) {
        RAT => 0,
        TIGER | LION => 2,
        _ => 1,
    };
    i32::from(ROUTES[usize::from(side_of(piece) - 1)][kind][index])
}
fn evaluate_with_moves(board: &[u8], side: u8, my_moves: &[Move]) -> i32 {
    let enemy = other(side);
    let enemy_moves = legal_moves(board, enemy);
    let mut totals = [0; 3];
    let mut leaders = [[20i32; 2]; 3];
    for (index, &piece) in board.iter().enumerate() {
        if piece == 0 {
            continue;
        }
        let owner = side_of(piece);
        let rank = rank_of(piece);
        let mut value = PIECE_VALUE[usize::from(rank)];
        if rank == RAT
            && board
                .iter()
                .any(|&p| side_of(p) == other(owner) && rank_of(p) == ELEPHANT)
        {
            value += 80;
        }
        if rank == ELEPHANT
            && !board
                .iter()
                .any(|&p| side_of(p) == other(owner) && rank_of(p) == RAT)
        {
            value += 55;
        }
        let distance = route_distance(piece, index);
        value += (14 - distance) * 7;
        let closest = &mut leaders[usize::from(owner)];
        if distance < closest[0] {
            closest[1] = closest[0];
            closest[0] = distance;
        } else {
            closest[1] = closest[1].min(distance);
        }
        let threats = if owner == side {
            &enemy_moves
        } else {
            my_moves
        };
        if effective_rank(piece, index) == 0 && threats.iter().any(|mv| usize::from(mv.to) == index)
        {
            value -= PIECE_VALUE[usize::from(rank)] / 3;
        }
        if rank == TIGER || rank == LION {
            let moves = if owner == side {
                my_moves
            } else {
                &enemy_moves
            };
            value += moves
                .iter()
                .filter(|mv| {
                    usize::from(mv.from) == index
                        && den_dist(usize::from(mv.from), usize::from(mv.to)) > 1
                })
                .count() as i32
                * 8;
        }
        totals[usize::from(owner)] += value;
    }
    for owner in [side, enemy] {
        let lead = leaders[usize::from(owner)];
        // A coordinated approach matters much more than advancing all eight animals.
        totals[usize::from(owner)] +=
            (10 - lead[0]).max(0).pow(2) * 3 + (8 - lead[1]).max(0).pow(2);
    }
    totals[usize::from(side)] - totals[usize::from(enemy)]
        + (my_moves.len() as i32 - enemy_moves.len() as i32) * 2
}

pub(crate) fn evaluate(board: &[u8], side: u8) -> i32 {
    evaluate_with_moves(board, side, &legal_moves(board, side))
}

fn capture_value(board: &[u8], mv: &Move) -> i32 {
    let defender = board[mv.to as usize];
    if defender == 0 {
        0
    } else {
        PIECE_VALUE[rank_of(defender) as usize]
    }
}

fn priority(board: &[u8], mv: &Move) -> i32 {
    let cap = capture_value(board, mv);
    let attacker_val = PIECE_VALUE[rank_of(board[mv.from as usize]) as usize];
    let to = mv.to as usize;
    let from = mv.from as usize;
    // MVV-LVA: prefer capturing high-value pieces with low-value pieces
    let mvvlva = cap * 10 - attacker_val / 10;
    // Reward advancing toward enemy den
    let adv = route_distance(board[from], from) - route_distance(board[from], to);
    mvvlva + adv * 4
}

fn ordered(board: &[u8], mut moves: Vec<Move>, best: Option<&Move>) -> Vec<Move> {
    moves.sort_by(|a, b| {
        let a_best = best.is_some_and(|c| c == a);
        let b_best = best.is_some_and(|c| c == b);
        b_best
            .cmp(&a_best)
            .then_with(|| priority(board, b).cmp(&priority(board, a)))
            .then_with(|| a.from.cmp(&b.from))
            .then_with(|| a.to.cmp(&b.to))
    });
    moves
}

type PackedBoard = [u64; 5];
type PositionKey = (PackedBoard, u8);
type BoardKey = (PackedBoard, u8, u16, u64);

fn packed_board(board: &[u8]) -> PackedBoard {
    let mut packed = [0u64; 5];
    for (i, &p) in board.iter().enumerate() {
        let bit = i * 5;
        let word = bit / 64;
        let offset = bit % 64;
        packed[word] |= (p as u64) << offset;
        if offset > 59 {
            packed[word + 1] |= (p as u64) >> (64 - offset);
        }
    }
    packed
}

fn position_key(board: &[u8], side: u8) -> PositionKey {
    (packed_board(board), side)
}

fn board_key(board: &[u8], side: u8, ply: u16, repetitions: u64) -> BoardKey {
    (packed_board(board), side, ply, repetitions)
}

fn mix64(mut value: u64) -> u64 {
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

fn repetition_token(key: PositionKey, occurrence: u8) -> u64 {
    key.0.into_iter().fold(
        mix64(u64::from(key.1) << 56 | u64::from(occurrence)),
        |hash, word| mix64(hash ^ word),
    )
}

fn outcome_score(winner: Option<u8>, side: u8, ply: u16) -> i32 {
    match winner {
        Some(winner) if winner == side => WIN - ply as i32,
        Some(_) => -WIN + ply as i32,
        None => 0,
    }
}

struct Searcher {
    config: SearchConfig,
    deadline_ms: f64,
    nodes: u32,
    table: HashMap<BoardKey, Entry>,
    repetitions: HashMap<PositionKey, u8>,
    repetition_hash: u64,
}

impl Searcher {
    fn record(&mut self, key: PositionKey) -> u8 {
        let count = self.repetitions.entry(key).or_default();
        *count = count.saturating_add(1);
        self.repetition_hash ^= repetition_token(key, *count);
        *count
    }

    fn unrecord(&mut self, key: PositionKey) {
        let count = self.repetitions.get_mut(&key).expect("recorded position");
        self.repetition_hash ^= repetition_token(key, *count);
        *count -= 1;
        if *count == 0 {
            self.repetitions.remove(&key);
        }
    }

    fn repetition_count(&self, key: PositionKey) -> u8 {
        self.repetitions.get(&key).copied().unwrap_or(0)
    }

    fn negamax(
        &mut self,
        board: &[u8],
        side: u8,
        depth: u8,
        mut alpha: i32,
        mut beta: i32,
        ply: u16,
    ) -> Result<i32, ()> {
        if self.nodes >= self.config.node_budget {
            return Err(());
        }
        self.nodes += 1;
        if self.nodes.is_multiple_of(1024) && clock_ms() >= self.deadline_ms {
            return Err(());
        }

        if let Some((winner, _)) = terminal(board, side, 0, true) {
            return Ok(outcome_score(winner, side, ply));
        }

        let key = board_key(board, side, ply, self.repetition_hash);
        let cached = self.table.get(&key).cloned();
        if let Some(entry) = cached.as_ref().filter(|e| e.depth >= depth) {
            match entry.bound {
                Bound::Exact => return Ok(entry.score),
                Bound::Lower => alpha = alpha.max(entry.score),
                Bound::Upper => beta = beta.min(entry.score),
            }
            if alpha >= beta {
                return Ok(entry.score);
            }
        }

        let original_alpha = alpha;
        let original_beta = beta;
        let moves = legal_moves(board, side);
        let repetitions = self.repetition_count(position_key(board, side));
        if let Some((winner, _)) = terminal(board, side, repetitions, !moves.is_empty()) {
            return Ok(outcome_score(winner, side, ply));
        }

        if depth == 0 && ply >= u16::from(self.config.max_depth) + TACTICAL_EXTENSION_PLIES {
            return Ok(evaluate_with_moves(board, side, &moves));
        }
        let mut score = i32::MIN / 2;
        let moves = if depth == 0 {
            let den_threat = legal_moves(board, other(side))
                .iter()
                .any(|mv| mv.to as usize == den(side));
            if den_threat {
                moves
            } else {
                score = evaluate_with_moves(board, side, &moves);
                if score >= beta {
                    return Ok(score);
                }
                alpha = alpha.max(score);
                moves
                    .into_iter()
                    .filter(|mv| board[mv.to as usize] != 0 || mv.to as usize == den(other(side)))
                    .collect()
            }
        } else {
            moves
        };
        let moves = ordered(board, moves, cached.as_ref().and_then(|e| e.best.as_ref()));
        let mut best = None;
        for (index, mv) in moves.into_iter().enumerate() {
            let mut next = board.to_vec();
            next[mv.to as usize] = next[mv.from as usize];
            next[mv.from as usize] = 0;
            let next_side = other(side);
            let next_key = position_key(&next, next_side);
            self.record(next_key);
            let result = self
                .negamax(
                    &next,
                    next_side,
                    depth.saturating_sub(1),
                    if index == 0 { -beta } else { -alpha - 1 },
                    -alpha,
                    ply + 1,
                )
                .and_then(|value| {
                    if index > 0 && -value > alpha && -value < beta {
                        self.negamax(
                            &next,
                            next_side,
                            depth.saturating_sub(1),
                            -beta,
                            -alpha,
                            ply + 1,
                        )
                    } else {
                        Ok(value)
                    }
                });
            self.unrecord(next_key);
            let value = -result?;
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
                score,
                bound,
                best,
            },
        );
        Ok(score)
    }
}

fn select_root(scores: &[(Move, i32)], band: i32, seed: u64) -> (Move, i32, i32) {
    let best = scores.iter().map(|e| e.1).max().unwrap_or(i32::MIN / 2);
    let effective_band = if best.abs() >= WIN / 2 {
        0
    } else {
        band.max(0)
    };
    let candidates: Vec<_> = scores
        .iter()
        .filter(|e| e.1 >= best - effective_band)
        .collect();
    let mut rng = SplitMix64(seed);
    let selected = candidates[(rng.next() as usize) % candidates.len()];
    (selected.0, best, selected.1)
}

pub(crate) fn search(
    board: &[u8],
    side: u8,
    positions: &[(Vec<u8>, u8)],
    config: SearchConfig,
) -> SearchResult {
    let initial = ordered(board, legal_moves(board, side), None);
    let deadline_ms = clock_ms() + config.time_budget_ms.max(0.0);
    let mut searcher = Searcher {
        config,
        deadline_ms,
        nodes: 0,
        table: HashMap::new(),
        repetitions: HashMap::new(),
        repetition_hash: 0,
    };
    for (previous, previous_side) in positions {
        searcher.record(position_key(previous, *previous_side));
    }
    let root_key = position_key(board, side);
    if searcher.repetition_count(root_key) == 0 {
        searcher.record(root_key);
    }
    let repetitions = searcher.repetition_count(root_key);
    if let Some((winner, _)) = terminal(board, side, repetitions, !initial.is_empty()) {
        let score = outcome_score(winner, side, 0);
        return SearchResult {
            selected: None,
            score,
            selected_score: score,
            depth: 0,
            nodes: 0,
        };
    }

    let mut fallback_scores = Vec::with_capacity(initial.len());
    for &mv in &initial {
        let mut child = board.to_vec();
        child[mv.to as usize] = child[mv.from as usize];
        child[mv.from as usize] = 0;
        let enemy = other(side);
        let child_key = position_key(&child, enemy);
        let repetitions = searcher.record(child_key);
        let score = if let Some((winner, _)) = terminal(&child, enemy, 0, true) {
            outcome_score(winner, enemy, 1)
        } else {
            let replies = legal_moves(&child, enemy);
            terminal(&child, enemy, repetitions, !replies.is_empty()).map_or_else(
                || evaluate_with_moves(&child, enemy, &replies),
                |(winner, _)| outcome_score(winner, enemy, 1),
            )
        };
        searcher.unrecord(child_key);
        fallback_scores.push((mv, -score));
    }
    let (mut selected, mut best_score, mut selected_score) =
        select_root(&fallback_scores, config.root_band, config.seed);
    if best_score >= WIN - 1 {
        return SearchResult {
            selected: Some(selected),
            score: best_score,
            selected_score,
            depth: 1,
            nodes: 0,
        };
    }

    let mut completed_depth = 0;

    for depth in 1..=config.max_depth {
        let roots = ordered(board, initial.clone(), Some(&selected));
        let mut scores = Vec::with_capacity(roots.len());
        let mut interrupted = false;
        let mut iteration_best = -WIN * 2;
        for (index, mv) in roots.into_iter().enumerate() {
            if clock_ms() >= deadline_ms {
                interrupted = true;
                break;
            }
            let mut child = board.to_vec();
            child[mv.to as usize] = child[mv.from as usize];
            child[mv.from as usize] = 0;
            let next_side = other(side);
            let child_key = position_key(&child, next_side);
            searcher.record(child_key);
            let threshold = iteration_best
                - if iteration_best.abs() >= WIN / 2 {
                    0
                } else {
                    config.root_band
                };
            let result = if index == 0 {
                searcher.negamax(&child, next_side, depth - 1, -WIN * 2, WIN * 2, 1)
            } else {
                searcher
                    .negamax(&child, next_side, depth - 1, -threshold, -threshold + 1, 1)
                    .and_then(|value| {
                        if -value >= threshold {
                            searcher.negamax(&child, next_side, depth - 1, -WIN * 2, WIN * 2, 1)
                        } else {
                            Ok(value)
                        }
                    })
            };
            searcher.unrecord(child_key);
            match result {
                Ok(score) => {
                    iteration_best = iteration_best.max(-score);
                    scores.push((mv, -score));
                }
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
    use crate::game::{
        BLACK, ELEPHANT, EMPTY, RED, WOLF, at, initial_board, legal_moves, piece_for,
    };

    fn config(seed: u64) -> SearchConfig {
        SearchConfig {
            node_budget: 30_000,
            max_depth: 5,
            root_band: 80,
            seed,
            time_budget_ms: 10_000.0,
        }
    }

    #[test]
    fn horizon_resolves_capture_of_a_den_attacker() {
        let mut board = vec![EMPTY; 63];
        board[at(1, 3)] = piece_for(RED, WOLF);
        board[at(1, 2)] = piece_for(BLACK, ELEPHANT);
        let mut searcher = Searcher {
            config: config(7),
            deadline_ms: clock_ms() + 10_000.0,
            nodes: 0,
            table: HashMap::new(),
            repetitions: HashMap::new(),
            repetition_hash: 0,
        };
        let score = searcher
            .negamax(&board, BLACK, 0, -WIN * 2, WIN * 2, 0)
            .unwrap();
        assert_eq!(score, WIN - 1);
    }

    #[test]
    fn search_takes_winning_den_entry() {
        let mut board = vec![EMPTY; 63];
        // Red Wolf one step from Black den; add a distant Black piece so "no-pieces" doesn't fire
        board[at(1, 3)] = crate::game::piece_for(RED, crate::game::WOLF);
        board[at(8, 6)] = crate::game::piece_for(BLACK, crate::game::RAT);
        let result = search(&board, RED, &[], config(1));
        let mv = result.selected.unwrap();
        assert_eq!(mv.to as usize, den(BLACK));
    }

    #[test]
    fn search_prefers_winning_over_retreating() {
        // Red Wolf at (1,3) can enter den at (0,3) or retreat — den entry must win
        let mut board = vec![EMPTY; 63];
        board[at(1, 3)] = crate::game::piece_for(RED, WOLF);
        board[at(6, 0)] = crate::game::piece_for(BLACK, ELEPHANT); // gives Black a piece
        let result = search(&board, RED, &[], config(2));
        let mv = result.selected.unwrap();
        assert_eq!(
            mv.to as usize,
            den(BLACK),
            "Red should enter the unguarded den"
        );
    }

    #[test]
    fn seeded_search_is_reproducible_and_legal() {
        let board = initial_board();
        let c = SearchConfig {
            node_budget: 20_000,
            max_depth: 4,
            root_band: 60,
            seed: 42,
            time_budget_ms: 10_000.0,
        };
        let first = search(&board, BLACK, &[], c);
        let repeat = search(&board, BLACK, &[], c);
        assert_eq!(first.selected, repeat.selected);
        let mv = first.selected.unwrap();
        assert!(legal_moves(&board, BLACK).contains(&mv));
    }

    #[test]
    fn search_scores_a_third_repetition_as_a_draw() {
        let mut board = vec![EMPTY; 63];
        board[at(1, 2)] = piece_for(BLACK, RAT);
        board[at(8, 6)] = piece_for(BLACK, ELEPHANT);
        board[at(1, 3)] = piece_for(RED, WOLF);
        board[at(8, 0)] = piece_for(RED, ELEPHANT);
        let saving_move = Move {
            from: at(1, 2) as u8,
            to: at(1, 3) as u8,
        };
        let repeated = crate::game::apply_move(&board, saving_move).unwrap();
        let history = [
            (board.clone(), BLACK),
            (repeated.clone(), RED),
            (repeated, RED),
        ];
        let mut c = config(7);
        c.root_band = 0;
        let result = search(&board, BLACK, &history, c);
        assert_eq!(result.selected, Some(saving_move));
        assert_eq!(result.score, 0);
        assert_eq!(result.selected_score, 0);
    }

    #[test]
    fn evaluation_rewards_material_advantage() {
        let board = initial_board();
        // Remove a Black Elephant — Red should evaluate higher
        let mut fewer = board.clone();
        let elephant_pos = fewer
            .iter()
            .position(|&p| p == crate::game::piece_for(BLACK, ELEPHANT))
            .unwrap();
        fewer[elephant_pos] = EMPTY;
        assert!(evaluate(&fewer, RED) > evaluate(&board, RED));
    }

    #[test]
    fn board_key_distinguishes_piece_positions() {
        let mut first = vec![EMPTY; 63];
        first[1] = piece_for(RED, RAT);
        first[2] = piece_for(RED, WOLF);

        let mut second = vec![EMPTY; 63];
        second[3] = piece_for(RED, RAT);
        second[0] = piece_for(RED, WOLF);

        assert_ne!(board_key(&first, RED, 4, 0), board_key(&second, RED, 4, 0));
    }

    #[test]
    fn den_routes_value_a_lions_jump_as_one_move() {
        assert_eq!(route_distance(piece_for(BLACK, LION), at(2, 1)), 5);
        assert_eq!(route_distance(piece_for(BLACK, WOLF), at(2, 1)), 8);
    }

    #[test]
    fn unguarded_trap_is_an_attacking_square_not_a_material_loss() {
        let mut board = vec![EMPTY; 63];
        board[at(2, 3)] = piece_for(RED, ELEPHANT);
        board[at(8, 0)] = piece_for(BLACK, RAT);
        let before = evaluate(&board, RED);
        board[at(2, 3)] = EMPTY;
        board[at(1, 3)] = piece_for(RED, ELEPHANT);
        assert!(evaluate(&board, RED) > before);
    }
}
