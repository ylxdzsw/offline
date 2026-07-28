use std::collections::HashSet;

use goban::pieces::stones::{Color, Point, Stone};
use goban::rules::Move;

use crate::game::{Position, Record};

#[derive(Clone, Copy, Debug)]
pub struct SearchConfig {
    pub budget_ms: f64,
    pub simulation_limit: u32,
    pub root_limit: usize,
    pub selection_band: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SearchResult {
    pub selected: Option<u16>,
    pub simulations: u32,
    pub nodes: u32,
}

#[derive(Clone, Copy, Debug)]
struct Candidate {
    index: u16,
    prior: f32,
    wins: f32,
    visits: u32,
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

    fn index(&mut self, length: usize) -> usize {
        (self.next() as usize) % length
    }

    fn unit(&mut self) -> f32 {
        (self.next() >> 40) as f32 / (1_u32 << 24) as f32
    }
}

pub const fn config(difficulty: &str) -> SearchConfig {
    match difficulty.as_bytes() {
        b"easy" => SearchConfig {
            budget_ms: 70.0,
            simulation_limit: 18,
            root_limit: 12,
            selection_band: 0.16,
        },
        b"hard" => SearchConfig {
            budget_ms: 720.0,
            simulation_limit: 260,
            root_limit: 42,
            selection_band: 0.02,
        },
        _ => SearchConfig {
            budget_ms: 260.0,
            simulation_limit: 90,
            root_limit: 26,
            selection_band: 0.07,
        },
    }
}

pub fn search<F: FnMut() -> bool>(
    position: &Position,
    config: SearchConfig,
    seed: u64,
    mut stopped: F,
) -> SearchResult {
    let mut rng = SplitMix64(seed);
    let mut nodes = 0;
    let mut moves = sensible_moves(position, false);
    if moves.is_empty() {
        return SearchResult {
            selected: None,
            simulations: 0,
            nodes,
        };
    }

    if position
        .records
        .iter()
        .filter(|record| matches!(record, Record::Play(_)))
        .count()
        < 2
        && let Some(index) = opening_move(position, &moves, &mut rng)
    {
        return SearchResult {
            selected: Some(index),
            simulations: 0,
            nodes: 1,
        };
    }

    moves.sort_by(|left, right| {
        move_prior(position, *right)
            .total_cmp(&move_prior(position, *left))
            .then_with(|| left.cmp(right))
    });
    moves.truncate(config.root_limit.min(moves.len()));
    let mut candidates: Vec<_> = moves
        .into_iter()
        .map(|index| Candidate {
            index,
            prior: move_prior(position, index),
            wins: 0.0,
            visits: 0,
        })
        .collect();
    let root_side = position.game.turn();
    let mut simulations = 0;

    while simulations < config.simulation_limit && !stopped() {
        let choice = select_candidate(&candidates, simulations);
        let candidate = &mut candidates[choice];
        let mut game = position.game.clone();
        game.play(Move::from(position.coord(candidate.index)));
        nodes += 1;
        let result = playout(&mut game, position.size, root_side, &mut rng, &mut nodes);
        candidate.wins += result;
        candidate.visits += 1;
        simulations += 1;
    }

    candidates.sort_by(|left, right| {
        let left_value = candidate_value(*left);
        let right_value = candidate_value(*right);
        right_value
            .total_cmp(&left_value)
            .then_with(|| left.index.cmp(&right.index))
    });
    let best = candidate_value(candidates[0]);
    let selectable = candidates
        .iter()
        .take_while(|candidate| candidate_value(**candidate) >= best - config.selection_band)
        .count()
        .max(1);
    let selected = candidates[rng.index(selectable)].index;
    SearchResult {
        selected: Some(selected),
        simulations,
        nodes,
    }
}

fn select_candidate(candidates: &[Candidate], total: u32) -> usize {
    if let Some(index) = candidates
        .iter()
        .position(|candidate| candidate.visits == 0)
    {
        return index;
    }
    let logarithm = (total.max(1) as f32).ln();
    candidates
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| {
            let value = |candidate: &Candidate| {
                candidate.wins / candidate.visits as f32
                    + (1.4 * logarithm / candidate.visits as f32).sqrt()
                    + candidate.prior * 0.002
            };
            value(left).total_cmp(&value(right))
        })
        .map_or(0, |(index, _)| index)
}

fn candidate_value(candidate: Candidate) -> f32 {
    if candidate.visits == 0 {
        candidate.prior * 0.01
    } else {
        candidate.wins / candidate.visits as f32 + candidate.prior * 0.001
    }
}

fn playout(
    game: &mut goban::rules::game::Game,
    size: u8,
    root_side: Color,
    rng: &mut SplitMix64,
    nodes: &mut u32,
) -> f32 {
    let area = size as usize * size as usize;
    let mut passes = 0;
    for ply in 0..area + area / 2 {
        let occupied = game.goban().number_of_stones();
        let occupied = occupied.0 as usize + occupied.1 as usize;
        let late = occupied * 3 > area || ply > area;
        let mut moves: Vec<_> = game
            .legals()
            .filter(|coord| !fills_eye(game, *coord))
            .collect();
        if late {
            let settled = settled_points(game);
            moves.retain(|coord| !settled.contains(coord) || game.will_capture(*coord));
        }
        if moves.is_empty() {
            game.play(Move::Pass);
            passes += 1;
            if passes == 2 {
                break;
            }
            continue;
        }
        passes = 0;
        let sample = moves.len().min(7);
        let mut selected = moves[rng.index(moves.len())];
        let mut score = f32::NEG_INFINITY;
        for _ in 0..sample {
            let coord = moves[rng.index(moves.len())];
            let value = playout_prior(game, coord) + rng.unit() * 2.0;
            if value > score {
                score = value;
                selected = coord;
            }
        }
        game.play(Move::from(selected));
        *nodes = nodes.saturating_add(1);
    }
    let (black, white) = game.calculate_score();
    let difference = if root_side == Color::Black {
        black - white
    } else {
        white - black
    };
    if difference > 0.0 {
        1.0
    } else if difference < 0.0 {
        0.0
    } else {
        0.5
    }
}

fn sensible_moves(position: &Position, force_territory_filter: bool) -> Vec<u16> {
    let area = position.area();
    let stones = position.game.goban().number_of_stones();
    let occupied = stones.0 as usize + stones.1 as usize;
    let filter_territory = force_territory_filter || occupied * 3 > area;
    let settled = filter_territory.then(|| settled_points(&position.game));
    position
        .game
        .legals()
        .filter(|coord| !fills_eye(&position.game, *coord))
        .filter(|coord| {
            settled
                .as_ref()
                .is_none_or(|points| !points.contains(coord) || position.game.will_capture(*coord))
        })
        .map(|coord| position.index(coord))
        .collect()
}

fn settled_points(game: &goban::rules::game::Game) -> HashSet<(u8, u8)> {
    let (black, white) = game.goban().get_territories();
    black
        .chain(white)
        .map(|point| point.coord)
        .collect::<HashSet<_>>()
}

fn fills_eye(game: &goban::rules::game::Game, coord: (u8, u8)) -> bool {
    game.check_eye(Stone {
        coord,
        color: game.turn(),
    })
}

fn opening_move(position: &Position, legal: &[u16], rng: &mut SplitMix64) -> Option<u16> {
    let far = match position.size {
        9 => 6,
        13 => 9,
        19 => 15,
        _ => return None,
    };
    let near = if position.size == 9 { 2 } else { 3 };
    let middle = position.size / 2;
    let points = [
        (near, near),
        (far, far),
        (near, far),
        (far, near),
        (middle, middle),
    ];
    let available: Vec<_> = points
        .into_iter()
        .map(|coord| position.index(coord))
        .filter(|index| legal.contains(index))
        .collect();
    (!available.is_empty()).then(|| available[rng.index(available.len())])
}

fn move_prior(position: &Position, index: u16) -> f32 {
    let coord = position.coord(index);
    let before = position.game.prisoners();
    let side = position.game.turn();
    let mut game = position.game.clone();
    game.play(Move::from(coord));
    let after = game.prisoners();
    let captures = if side == Color::Black {
        after.0 - before.0
    } else {
        after.1 - before.1
    };
    let liberties = group_liberties(&game, coord, side);
    let neighbors: Vec<_> = position.game.goban().get_connected_points(coord).collect();
    let friendly = neighbors
        .iter()
        .filter(|point| point.color == Some(side))
        .count() as f32;
    let opponent = neighbors
        .iter()
        .filter(|point| point.color == Some(!side))
        .count() as f32;
    let edge = coord
        .0
        .min(coord.1)
        .min(position.size - 1 - coord.0)
        .min(position.size - 1 - coord.1) as f32;
    captures as f32 * 42.0
        + liberties as f32 * 4.2
        + opponent * 4.0
        + friendly * 1.5
        + edge.min(3.0) * 2.0
        - (liberties == 1) as u8 as f32 * 18.0
}

fn playout_prior(game: &goban::rules::game::Game, coord: (u8, u8)) -> f32 {
    let before = game.prisoners();
    let side = game.turn();
    let mut child = game.clone();
    child.play(Move::from(coord));
    let after = child.prisoners();
    let captures = if side == Color::Black {
        after.0 - before.0
    } else {
        after.1 - before.1
    };
    captures as f32 * 24.0 + group_liberties(&child, coord, side) as f32
}

fn group_liberties(game: &goban::rules::game::Game, coord: (u8, u8), color: Color) -> usize {
    let group = game.goban().get_group_from_point(Point {
        coord,
        color: Some(color),
    });
    group
        .iter()
        .flat_map(|point| game.goban().get_connected_points(point.coord))
        .filter(|point| point.color.is_none())
        .map(|point| point.coord)
        .collect::<HashSet<_>>()
        .len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opening_search_uses_a_standard_point() {
        let position = Position::from_records(13, &[]).unwrap();
        let result = search(&position, config("medium"), 7, || false);
        let standard = [42, 48, 84, 120, 126];
        assert!(standard.contains(&result.selected.unwrap()));
    }

    #[test]
    fn search_returns_a_legal_move_after_the_opening() {
        let position =
            Position::from_records(9, &[Record::Play(40), Record::Play(20), Record::Play(60)])
                .unwrap();
        let legal = position.legal_moves();
        let result = search(
            &position,
            SearchConfig {
                budget_ms: 1.0,
                simulation_limit: 2,
                root_limit: 4,
                selection_band: 0.0,
            },
            11,
            || false,
        );
        assert!(legal.contains(&result.selected.unwrap()));
    }
}
