use std::collections::{HashMap, HashSet};

use crate::game::{HUMAN, Outcome, Position, Turn, legal_turns, other};

const WIN: i32 = 1_000_000;

#[derive(Clone, Copy, Debug)]
pub struct SearchConfig {
    pub node_budget: u32,
    pub max_depth: u8,
    pub branch_limit: usize,
    pub root_band: i32,
    pub seed: u64,
    pub time_budget: f64,
}

#[derive(Clone, Debug)]
pub struct SearchResult {
    pub selected: Option<Turn>,
    pub score: i32,
    pub selected_score: i32,
    pub depth: u8,
    pub nodes: u32,
    pub chance_nodes: u32,
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

fn terminal(outcome: &Outcome, perspective: u8) -> i32 {
    let score = WIN * i32::from(outcome.multiplier);
    if outcome.winner == perspective {
        score
    } else {
        -score
    }
}

fn checkers(position: &Position, side: u8) -> [i32; 24] {
    std::array::from_fn(|point| {
        let value = position.board[if side == HUMAN { point } else { 23 - point }];
        i32::from(if side == HUMAN {
            value.max(0)
        } else {
            (-value).max(0)
        })
    })
}

fn contact(position: &Position) -> bool {
    position.bar.iter().any(|count| *count > 0)
        || position
            .board
            .iter()
            .rposition(|count| *count > 0)
            .zip(position.board.iter().position(|count| *count < 0))
            .is_some_and(|(human, computer)| human > computer)
}

fn structure(position: &Position, side: u8, in_contact: bool) -> i32 {
    let own = checkers(position, side);
    let enemy = checkers(position, other(side));
    let mut value = -position.pip(side) * if in_contact { 4 } else { 8 };
    value += i32::from(position.off[side as usize]) * if in_contact { 40 } else { 25 };
    if !in_contact {
        // Low-point piles waste rolls in a race; spread remaining checkers over the home board.
        for (point, count) in own.iter().enumerate().take(6) {
            value -= (count - 2).max(0) * (6 - point as i32) * 3;
        }
        return value;
    }
    let home_points = own[..6].iter().filter(|count| **count >= 2).count() as i32;
    let enemy_home = enemy[..6].iter().filter(|count| **count >= 2).count() as i32;
    value -= i32::from(position.bar[side as usize]) * (45 + enemy_home * enemy_home * 8);
    let weights = [
        10, 18, 27, 36, 45, 35, 32, 27, 22, 18, 15, 12, 10, 10, 10, 12, 14, 18, 27, 40, 34, 24, 16,
        10,
    ];
    let mut prime = 0_i32;
    for (point, count) in own.iter().copied().enumerate() {
        if count >= 2 {
            value += weights[point];
            prime += 1;
            let start = point + 1 - prime as usize;
            let trapped = enemy[24 - start..].iter().sum::<i32>()
                + i32::from(position.bar[other(side) as usize]);
            if prime >= 2 && trapped > 0 {
                value += prime * prime * trapped.min(3) * 3;
            }
        } else {
            prime = 0;
        }
        value -= (count - 3).max(0) * 7;
        if count == 1 {
            // Count direct hitting dice, respecting the obligation to enter from the bar.
            let mut shots = 0_u8;
            if position.bar[other(side) as usize] > 0 {
                if point < 6 {
                    shots |= 1 << point;
                }
            } else {
                for die in 1..=6 {
                    if point >= die && enemy[23 - (point - die)] > 0 {
                        shots |= 1 << (die - 1);
                    }
                }
            }
            let misses = 6 - shots.count_ones() as i32;
            let hit_rolls = 36 - misses * misses;
            value -= hit_rolls * (12 + (24 - point as i32) * 2 + enemy_home * 6) / 36;
        }
        // Escaping the opponent's home board matters more as their board closes.
        if point >= 18 {
            value -= count * (enemy_home * 4 + 4);
        }
    }
    // A closed home board makes each hit much more valuable.
    value += i32::from(position.bar[other(side) as usize]) * home_points * 8;
    value
}

pub fn evaluate(position: &Position, perspective: u8) -> i32 {
    if let Some(outcome) = position.outcome() {
        return terminal(&outcome, perspective);
    }
    let in_contact = contact(position);
    structure(position, perspective, in_contact)
        - structure(position, other(perspective), in_contact)
}

fn ordered(mut turns: Vec<Turn>, side: u8) -> Vec<Turn> {
    let mut positions = HashSet::new();
    turns.retain(|turn| positions.insert(turn.position.clone()));
    // Evaluate once per unique result, rather than on every sorting comparison.
    turns.sort_by_cached_key(|turn| -evaluate(&turn.position, side));
    turns
}

struct Searcher {
    config: SearchConfig,
    nodes: u32,
    chance_nodes: u32,
    deadline: f64,
    cache: HashMap<(Position, u8, u8), i32>,
}

impl Searcher {
    fn visit(&mut self) -> Result<(), ()> {
        self.nodes = self.nodes.saturating_add(1);
        if self.nodes > self.config.node_budget || crate::clock_ms() >= self.deadline {
            Err(())
        } else {
            Ok(())
        }
    }

    fn expected(
        &mut self,
        position: &Position,
        rolling_side: u8,
        perspective: u8,
        remaining: u8,
    ) -> Result<i32, ()> {
        if remaining == 0 {
            return Ok(evaluate(position, perspective));
        }
        if let Some(value) = self.cache.get(&(position.clone(), rolling_side, remaining)) {
            return Ok(*value);
        }
        self.chance_nodes = self.chance_nodes.saturating_add(1);
        let mut weighted = 0_i64;
        for first in 1..=6 {
            for second in first..=6 {
                let weight = if first == second { 1 } else { 2 };
                let value = self.decision(
                    position,
                    rolling_side,
                    [first, second],
                    perspective,
                    remaining,
                )?;
                weighted += i64::from(value) * weight;
            }
        }
        let value = (weighted / 36) as i32;
        self.cache
            .insert((position.clone(), rolling_side, remaining), value);
        Ok(value)
    }

    fn decision(
        &mut self,
        position: &Position,
        side: u8,
        dice: [u8; 2],
        perspective: u8,
        remaining: u8,
    ) -> Result<i32, ()> {
        self.visit()?;
        let mut turns = legal_turns(position, side, dice).map_err(|_| ())?;
        if turns.is_empty() {
            return if remaining <= 1 {
                Ok(evaluate(position, perspective))
            } else {
                self.expected(position, other(side), perspective, remaining - 1)
            };
        }
        turns = ordered(turns, side);
        if remaining == 1 {
            // The ordering already evaluates every legal result: this is the exact leaf decision.
            return Ok(evaluate(&turns[0].position, perspective));
        }
        turns.truncate(self.config.branch_limit.max(1));
        let maximizing = side == perspective;
        let mut best = if maximizing {
            i32::MIN / 2
        } else {
            i32::MAX / 2
        };
        for turn in turns {
            self.visit()?;
            let value = if let Some(outcome) = turn.outcome.as_ref() {
                terminal(outcome, perspective)
            } else if remaining <= 1 {
                evaluate(&turn.position, perspective)
            } else {
                self.expected(&turn.position, other(side), perspective, remaining - 1)?
            };
            best = if maximizing {
                best.max(value)
            } else {
                best.min(value)
            };
        }
        Ok(best)
    }
}

fn select_root(scores: &[(Turn, i32)], band: i32, seed: u64) -> (Turn, i32, i32) {
    let best = scores.iter().map(|entry| entry.1).max().unwrap();
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

pub fn search(
    position: &Position,
    side: u8,
    dice: [u8; 2],
    config: SearchConfig,
) -> Result<SearchResult, String> {
    let roots = ordered(legal_turns(position, side, dice)?, side);
    if roots.is_empty() {
        return Ok(SearchResult {
            selected: None,
            score: evaluate(position, side),
            selected_score: evaluate(position, side),
            depth: 0,
            nodes: 0,
            chance_nodes: 0,
        });
    }

    let mut searcher = Searcher {
        config,
        nodes: 0,
        chance_nodes: 0,
        deadline: crate::clock_ms() + config.time_budget,
        cache: HashMap::new(),
    };
    let mut selected = roots[0].clone();
    let mut best_score = evaluate(&selected.position, side);
    let mut selected_score = best_score;
    let mut completed_depth = 1;

    for depth in 1..=config.max_depth.max(1) {
        let mut scores = Vec::with_capacity(roots.len());
        let mut interrupted = false;
        let width = if depth == 1 {
            roots.len()
        } else {
            config.branch_limit.max(1)
        };
        for turn in roots.iter().take(width) {
            if searcher.visit().is_err() {
                interrupted = true;
                break;
            }
            let value = if let Some(outcome) = turn.outcome.as_ref() {
                terminal(outcome, side)
            } else if depth == 1 {
                evaluate(&turn.position, side)
            } else {
                match searcher.expected(&turn.position, other(side), side, depth - 1) {
                    Ok(value) => value,
                    Err(()) => {
                        interrupted = true;
                        break;
                    }
                }
            };
            scores.push((turn.clone(), value));
        }
        if interrupted || scores.is_empty() {
            break;
        }
        (selected, best_score, selected_score) =
            select_root(&scores, config.root_band, config.seed ^ u64::from(depth));
        completed_depth = depth;
    }

    Ok(SearchResult {
        selected: Some(selected),
        score: best_score,
        selected_score,
        depth: completed_depth,
        nodes: searcher.nodes,
        chance_nodes: searcher.chance_nodes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(seed: u64) -> SearchConfig {
        SearchConfig {
            node_budget: 20_000,
            max_depth: 2,
            branch_limit: 4,
            root_band: 30,
            seed,
            time_budget: 10_000.0,
        }
    }

    #[test]
    fn a_prime_only_blocks_opponents_that_have_not_passed_it() {
        let mut blocked = Position {
            board: [0; 24],
            bar: [0, 0],
            off: [11, 13],
        };
        blocked.board[4] = 2;
        blocked.board[5] = 2;
        blocked.board[2] = -2;
        let mut escaped = blocked.clone();
        escaped.board[2] = 0;
        escaped.board[6] = -2;
        assert!(structure(&blocked, HUMAN, true) > structure(&escaped, HUMAN, true));
    }

    #[test]
    fn equivalent_move_orders_share_one_search_branch() {
        let legal = legal_turns(&Position::initial(), HUMAN, [3, 1]).unwrap();
        let distinct: HashSet<_> = legal.iter().map(|turn| turn.position.clone()).collect();
        assert!(distinct.len() < legal.len());
        let ordered = ordered(legal.clone(), HUMAN);
        assert_eq!(ordered.len(), distinct.len());
        assert!(ordered.iter().all(|turn| legal.contains(turn)));
    }

    #[test]
    fn evaluation_rewards_a_racing_lead() {
        let mut ahead = Position::initial();
        ahead.board[23] -= 2;
        ahead.board[20] += 2;
        assert!(evaluate(&ahead, HUMAN) > evaluate(&Position::initial(), HUMAN));
    }

    #[test]
    fn seeded_search_is_reproducible_and_visits_chance_nodes() {
        let position = Position::initial();
        let first = search(&position, crate::game::AI, [3, 1], config(42)).unwrap();
        let repeated = search(&position, crate::game::AI, [3, 1], config(42)).unwrap();
        assert_eq!(
            first.selected.as_ref().map(|turn| &turn.steps),
            repeated.selected.as_ref().map(|turn| &turn.steps)
        );
        assert!(first.chance_nodes > 0);
        assert!(first.depth >= 2);
    }

    #[test]
    fn all_sides_are_named_and_the_terminal_scale_dominates() {
        assert_eq!(other(HUMAN), crate::game::AI);
        assert_eq!(other(crate::game::AI), HUMAN);
        let outcome = Outcome {
            winner: crate::game::AI,
            kind: "backgammon",
            multiplier: 3,
        };
        assert!(
            terminal(&outcome, crate::game::AI) > evaluate(&Position::initial(), crate::game::AI)
        );
    }
}
