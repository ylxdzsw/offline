use std::collections::HashMap;

use crate::game::{
    LION, Move, RAT, Status, TIGER, col_of, den, effective_rank, is_river, legal_moves, moves_for,
    other, rank_of, row_of, side_of, status,
};

const WIN: i32 = 1_000_000;

// Material values by rank (index 0 unused)
const PIECE_VALUE: [i32; 9] = [0, 340, 170, 210, 240, 270, 390, 420, 310];

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

pub(crate) fn evaluate(board: &[u8], side: u8) -> i32 {
    let enemy = other(side);
    let enemy_den = den(enemy);
    let my_den = den(side);
    let mut score = 0i32;

    for (index, &piece) in board.iter().enumerate() {
        if piece == 0 {
            continue;
        }
        let ps = side_of(piece);
        let rank = rank_of(piece) as usize;
        let val = PIECE_VALUE[rank];

        // Material
        score += if ps == side { val } else { -val };

        // Advancement toward enemy den
        let target = if ps == side { enemy_den } else { my_den };
        let dist = den_dist(index, target);
        let adv = (16 - dist.min(16)) * 5;
        score += if ps == side { adv } else { -adv };

        // Rat bonus: extra reward for being in river (blocks jumps) or near enemy Elephant
        if rank == RAT as usize && is_river(index) {
            let river_bonus = 28;
            score += if ps == side {
                river_bonus
            } else {
                -river_bonus
            };
        }

        // Tiger/Lion: small bonus if jump is available (mobility proxy)
        if rank == TIGER as usize || rank == LION as usize {
            let jump_count = moves_for(board, index)
                .iter()
                .filter(|m| {
                    (row_of(m.from as usize) as i32 - row_of(m.to as usize) as i32).abs() > 1
                        || (col_of(m.from as usize) as i32 - col_of(m.to as usize) as i32).abs() > 1
                })
                .count() as i32;
            let jump_bonus = jump_count * 18;
            score += if ps == side { jump_bonus } else { -jump_bonus };
        }

        // Trap penalty: piece on enemy's trap has reduced effective rank
        if effective_rank(piece, index) == 0 {
            let trap_penalty = val / 2;
            score += if ps == side {
                -trap_penalty
            } else {
                trap_penalty
            };
        }
    }

    // Mobility
    let my_moves = legal_moves(board, side).len() as i32;
    let their_moves = legal_moves(board, enemy).len() as i32;
    score += (my_moves - their_moves) * 3;

    score
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
    let side = side_of(board[from]);
    let adv = den_dist(from, den(other(side))) - den_dist(to, den(other(side)));
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

type BoardKey = ([u64; 5], u8, u16);

fn board_key(board: &[u8], side: u8, ply: u16) -> BoardKey {
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
    (packed, side, ply)
}

struct Searcher {
    config: SearchConfig,
    nodes: u32,
    table: HashMap<BoardKey, Entry>,
}

impl Searcher {
    fn negamax(
        &mut self,
        board: &[u8],
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

        let key = board_key(board, side, ply);
        let original_alpha = alpha;
        let original_beta = beta;
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

        let s = status(board, side);
        match s {
            Status {
                ended: true,
                winner: Some(w),
                ..
            } => {
                return Ok(if w == side {
                    WIN - ply as i32
                } else {
                    -WIN + ply as i32
                });
            }
            Status {
                ended: true,
                winner: None,
                ..
            } => return Ok(0),
            _ => {}
        }

        if depth == 0 {
            return Ok(evaluate(board, side));
        }

        let moves = ordered(
            board,
            legal_moves(board, side),
            cached.as_ref().and_then(|e| e.best.as_ref()),
        );

        let mut score = i32::MIN / 2;
        let mut best = None;
        for mv in moves {
            let mut next = board.to_vec();
            next[mv.to as usize] = next[mv.from as usize];
            next[mv.from as usize] = 0;
            let value = -self.negamax(&next, other(side), depth - 1, -beta, -alpha, ply + 1)?;
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

pub(crate) fn search(board: &[u8], side: u8, config: SearchConfig) -> SearchResult {
    let initial = ordered(board, legal_moves(board, side), None);
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
    let mut selected = initial[0];
    let mut best_score = i32::MIN / 2;
    let mut selected_score = best_score;
    let mut completed_depth = 0;

    for depth in 1..=config.max_depth {
        let roots = ordered(board, initial.clone(), Some(&selected));
        let mut scores = Vec::with_capacity(roots.len());
        let mut interrupted = false;
        for mv in roots {
            let mut child = board.to_vec();
            child[mv.to as usize] = child[mv.from as usize];
            child[mv.from as usize] = 0;
            match searcher.negamax(
                &child,
                other(side),
                depth - 1,
                i32::MIN / 2,
                i32::MAX / 2,
                1,
            ) {
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
    use crate::game::{
        BLACK, ELEPHANT, EMPTY, RED, WOLF, at, initial_board, legal_moves, piece_for,
    };

    fn config(seed: u64) -> SearchConfig {
        SearchConfig {
            node_budget: 30_000,
            max_depth: 5,
            root_band: 80,
            seed,
        }
    }

    #[test]
    fn search_takes_winning_den_entry() {
        let mut board = vec![EMPTY; 63];
        // Red Wolf one step from Black den; add a distant Black piece so "no-pieces" doesn't fire
        board[at(1, 3)] = crate::game::piece_for(RED, crate::game::WOLF);
        board[at(8, 6)] = crate::game::piece_for(BLACK, crate::game::RAT);
        let result = search(&board, RED, config(1));
        let mv = result.selected.unwrap();
        assert_eq!(mv.to as usize, den(BLACK));
    }

    #[test]
    fn search_prefers_winning_over_retreating() {
        // Red Wolf at (1,3) can enter den at (0,3) or retreat — den entry must win
        let mut board = vec![EMPTY; 63];
        board[at(1, 3)] = crate::game::piece_for(RED, WOLF);
        board[at(6, 0)] = crate::game::piece_for(BLACK, ELEPHANT); // gives Black a piece
        let result = search(&board, RED, config(2));
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
        };
        let first = search(&board, BLACK, c);
        let repeat = search(&board, BLACK, c);
        assert_eq!(first.selected, repeat.selected);
        let mv = first.selected.unwrap();
        assert!(legal_moves(&board, BLACK).contains(&mv));
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

        assert_ne!(board_key(&first, RED, 4), board_key(&second, RED, 4));
    }
}
