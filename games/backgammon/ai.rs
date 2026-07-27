use crate::game::{HUMAN, Outcome, Position, Turn, legal_turns, other};

const WIN: i32 = 1_000_000;

#[derive(Clone, Copy, Debug)]
pub struct SearchConfig {
    pub node_budget: u32,
    pub max_depth: u8,
    pub branch_limit: usize,
    pub root_band: i32,
    pub seed: u64,
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

fn made_points(position: &Position, side: u8) -> i32 {
    position
        .board
        .iter()
        .filter(|value| {
            if side == HUMAN {
                **value >= 2
            } else {
                **value <= -2
            }
        })
        .count() as i32
}

fn blots(position: &Position, side: u8) -> i32 {
    position
        .board
        .iter()
        .filter(|value| {
            if side == HUMAN {
                **value == 1
            } else {
                **value == -1
            }
        })
        .count() as i32
}

pub fn evaluate(position: &Position, perspective: u8) -> i32 {
    if let Some(outcome) = position.outcome() {
        return terminal(&outcome, perspective);
    }
    let opponent = other(perspective);
    let pip = position.pip(opponent) - position.pip(perspective);
    let borne_off =
        i32::from(position.off[perspective as usize]) - i32::from(position.off[opponent as usize]);
    let bars =
        i32::from(position.bar[opponent as usize]) - i32::from(position.bar[perspective as usize]);
    let points = made_points(position, perspective) - made_points(position, opponent);
    let loose = blots(position, opponent) - blots(position, perspective);
    pip * 4 + borne_off * 150 + bars * 55 + points * 12 + loose * 4
}

fn ordered(mut turns: Vec<Turn>, side: u8) -> Vec<Turn> {
    turns.sort_by(|left, right| {
        evaluate(&right.position, side)
            .cmp(&evaluate(&left.position, side))
            .then_with(|| {
                left.steps
                    .iter()
                    .map(|step| (step.from, step.to))
                    .cmp(right.steps.iter().map(|step| (step.from, step.to)))
            })
    });
    turns
}

struct Searcher {
    config: SearchConfig,
    nodes: u32,
    chance_nodes: u32,
}

impl Searcher {
    fn visit(&mut self) -> Result<(), ()> {
        self.nodes = self.nodes.saturating_add(1);
        if self.nodes > self.config.node_budget {
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
        Ok((weighted / 36) as i32)
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
    };
    let mut selected = roots[0].clone();
    let mut best_score = evaluate(&selected.position, side);
    let mut selected_score = best_score;
    let mut completed_depth = 1;

    for depth in 1..=config.max_depth.max(1) {
        let mut scores = Vec::with_capacity(roots.len());
        let mut interrupted = false;
        for turn in &roots {
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
        if interrupted || scores.len() != roots.len() {
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
        }
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
