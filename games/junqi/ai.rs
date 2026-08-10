use std::collections::{HashMap, HashSet};

use serde::Deserialize;

use crate::game::{
    BLACK, BOMB, COLS, ENGINEER, FLAG, MINE, Move, Piece, RED, ROWS, Rng, TYPES, apply_move,
    battle, deployment_squares, is_camp, is_hq, is_rail, legal_moves, other, rank, row_of, status,
};

const UNKNOWN: &str = "?";
const KINDS: [&str; 12] = [
    FLAG, MINE, BOMB, "9", "8", "7", "6", "5", "4", "3", "2", ENGINEER,
];
const COUNTS: [u8; 12] = [1, 3, 2, 1, 1, 2, 2, 2, 2, 3, 3, 3];
const WIN: f64 = 100_000.0;

#[derive(Clone, Debug, Deserialize)]
pub struct Observation {
    pub side: String,
    #[serde(rename = "move")]
    pub movement: Move,
    pub attacker: String,
    #[serde(default)]
    pub defender: Option<String>,
    pub result: String,
    #[serde(default)]
    pub revealed: Vec<String>,
}

#[derive(Clone, Copy)]
pub struct Config {
    pub budget_ms: f64,
    max_samples: usize,
    reply_width: usize,
    continuation_width: usize,
    risk: f64,
    root_band: f64,
}

pub struct SearchInput<'a> {
    pub board: &'a [Option<Piece>],
    pub initial: &'a [Option<Piece>],
    pub events: &'a [Observation],
    pub side: &'a str,
    pub difficulty: &'a str,
    pub revealed: &'a [String],
    pub seed: u64,
}

pub fn config(difficulty: &str) -> Config {
    match difficulty {
        "easy" => Config {
            budget_ms: 90.0,
            max_samples: 4,
            reply_width: 3,
            continuation_width: 0,
            risk: 0.0,
            root_band: 12.0,
        },
        "hard" => Config {
            budget_ms: 1_000.0,
            max_samples: 40,
            reply_width: 12,
            continuation_width: 6,
            risk: 0.18,
            root_band: 0.5,
        },
        _ => Config {
            budget_ms: 320.0,
            max_samples: 14,
            reply_width: 7,
            continuation_width: 3,
            risk: 0.08,
            root_band: 4.0,
        },
    }
}

#[derive(Clone)]
struct BeliefPiece {
    id: String,
    mask: u16,
}

struct PublicInput {
    board: Vec<Option<Piece>>,
    initial: Vec<Option<Piece>>,
    events: Vec<Observation>,
    revealed: Vec<String>,
}

fn kind_index(kind: &str) -> Option<usize> {
    KINDS.iter().position(|candidate| *candidate == kind)
}

fn kind_bit(kind: &str) -> u16 {
    kind_index(kind).map_or(0, |index| 1 << index)
}

fn set_kind(piece: &mut BeliefPiece, kind: &str) {
    piece.mask = kind_bit(kind);
}

fn remove_kinds(piece: &mut BeliefPiece, kinds: &[&str]) {
    for kind in kinds {
        piece.mask &= !kind_bit(kind);
    }
}

fn setup_mask(index: usize, side: &str) -> u16 {
    let mut mask = (1 << KINDS.len()) - 1;
    if !is_hq(index) {
        mask &= !kind_bit(FLAG);
    }
    let rear = if side == BLACK { 0..=1 } else { 10..=11 };
    if !rear.contains(&row_of(index)) {
        mask &= !kind_bit(MINE);
    }
    let forward = if side == BLACK { 5 } else { 6 };
    if row_of(index) == forward {
        mask &= !kind_bit(BOMB);
    }
    mask
}

fn sanitize_board(
    board: &[Option<Piece>],
    side: &str,
    revealed: &HashSet<&str>,
) -> Vec<Option<Piece>> {
    board
        .iter()
        .map(|value| {
            value.as_ref().map(|piece| {
                let mut public = piece.clone();
                if public.side != side {
                    public.kind = if revealed.contains(public.id.as_str()) {
                        FLAG.to_owned()
                    } else {
                        UNKNOWN.to_owned()
                    };
                }
                public
            })
        })
        .collect()
}

fn obscure_enemy_ids(
    board: &[Option<Piece>],
    initial: &[Option<Piece>],
    events: &[Observation],
    side: &str,
    revealed: &[String],
) -> PublicInput {
    let mut aliases = HashMap::new();
    for value in initial.iter().chain(board).flatten() {
        if value.side != side && !aliases.contains_key(&value.id) {
            aliases.insert(value.id.clone(), format!("e{}", aliases.len()));
        }
    }
    let map_board = |source: &[Option<Piece>]| {
        source
            .iter()
            .map(|value| {
                value.as_ref().map(|piece| {
                    let mut opaque = piece.clone();
                    if let Some(alias) = aliases.get(&opaque.id) {
                        opaque.id.clone_from(alias);
                    }
                    opaque
                })
            })
            .collect()
    };
    let map_id = |id: &str| aliases.get(id).cloned().unwrap_or_else(|| id.to_owned());
    let events = events
        .iter()
        .cloned()
        .map(|mut event| {
            event.attacker = map_id(&event.attacker);
            event.defender = event.defender.map(|id| map_id(&id));
            event.revealed = event.revealed.iter().map(|id| map_id(id)).collect();
            event
        })
        .collect();
    PublicInput {
        board: map_board(board),
        initial: map_board(initial),
        events,
        revealed: revealed.iter().map(|id| map_id(id)).collect(),
    }
}

fn piece_index(pieces: &[BeliefPiece], id: &str) -> Option<usize> {
    pieces.iter().position(|piece| piece.id == id)
}

fn filter_battle(piece: &mut BeliefPiece, own_kind: &str, enemy_attacks: bool, result: &str) {
    let mut allowed = 0;
    for (index, kind) in KINDS.iter().enumerate() {
        if piece.mask & (1 << index) == 0 {
            continue;
        }
        let enemy = Piece {
            id: String::new(),
            side: RED.to_owned(),
            kind: (*kind).to_owned(),
        };
        let own = Piece {
            id: String::new(),
            side: BLACK.to_owned(),
            kind: own_kind.to_owned(),
        };
        let outcome = if enemy_attacks {
            battle(&enemy, &own)
        } else {
            battle(&own, &enemy)
        };
        if outcome == result {
            allowed |= 1 << index;
        }
    }
    piece.mask &= allowed;
}

fn replay_event(board: &mut [Option<Piece>], event: &Observation) {
    let attacker = board[event.movement.from].take();
    let defender = board[event.movement.to].take();
    match event.result.as_str() {
        "move" | "attacker" => board[event.movement.to] = attacker,
        "defender" => board[event.movement.to] = defender,
        _ => {}
    }
}

fn belief(
    current: &[Option<Piece>],
    initial: &[Option<Piece>],
    events: &[Observation],
    side: &str,
    revealed: &HashSet<&str>,
) -> (Vec<Option<Piece>>, Vec<BeliefPiece>) {
    let enemy = other(side);
    let public_current = sanitize_board(current, side, revealed);
    let source = if initial.len() == ROWS * COLS {
        initial
    } else {
        current
    };
    let mut public = sanitize_board(source, side, &HashSet::new());
    let enemy_count = public
        .iter()
        .flatten()
        .filter(|piece| piece.side == enemy)
        .count();
    let deployment: HashSet<_> = deployment_squares(enemy).into_iter().collect();
    let legal_setup = enemy_count == TYPES.len()
        && public.iter().enumerate().all(|(index, value)| {
            value
                .as_ref()
                .is_none_or(|piece| piece.side != enemy || deployment.contains(&index))
        });
    let mut pieces: Vec<_> = public
        .iter()
        .enumerate()
        .filter_map(|(index, value)| {
            value.as_ref().and_then(|piece| {
                (piece.side == enemy).then(|| BeliefPiece {
                    id: piece.id.clone(),
                    mask: if legal_setup {
                        setup_mask(index, enemy)
                    } else {
                        (1 << KINDS.len()) - 1
                    },
                })
            })
        })
        .collect();
    for value in public_current.iter().flatten() {
        if value.side == enemy && piece_index(&pieces, &value.id).is_none() {
            pieces.push(BeliefPiece {
                id: value.id.clone(),
                mask: (1 << KINDS.len()) - 1,
            });
        }
    }

    for event in events {
        let enemy_attacks = event.side == enemy;
        let enemy_id = if enemy_attacks {
            Some(event.attacker.as_str())
        } else {
            event.defender.as_deref()
        };
        if enemy_attacks && let Some(index) = piece_index(&pieces, &event.attacker) {
            remove_kinds(&mut pieces[index], &[FLAG, MINE]);
            let mut regular = public.to_vec();
            if let Some(attacker) = regular[event.movement.from].as_mut() {
                attacker.kind = "2".to_owned();
            }
            if !crate::game::moves_for(&regular, event.movement.from).contains(&event.movement) {
                set_kind(&mut pieces[index], ENGINEER);
            }
        }
        if event.defender.is_some()
            && let Some(enemy_id) = enemy_id
            && let Some(index) = piece_index(&pieces, enemy_id)
        {
            let own = if enemy_attacks {
                public[event.movement.to].as_ref()
            } else {
                public[event.movement.from].as_ref()
            };
            if let Some(own) = own.filter(|piece| piece.side == side && piece.kind != UNKNOWN) {
                filter_battle(&mut pieces[index], &own.kind, enemy_attacks, &event.result);
            }
        }

        let enemy_flag_revealed = event
            .revealed
            .iter()
            .find(|id| piece_index(&pieces, id).is_some());
        if let Some(flag) = enemy_flag_revealed
            && let Some(index) = piece_index(&pieces, flag)
        {
            set_kind(&mut pieces[index], FLAG);
            let casualty = if enemy_attacks && matches!(event.result.as_str(), "defender" | "both")
            {
                Some(event.attacker.as_str())
            } else if !enemy_attacks && matches!(event.result.as_str(), "attacker" | "both") {
                event.defender.as_deref()
            } else {
                None
            };
            if let Some(casualty) = casualty
                && let Some(index) = piece_index(&pieces, casualty)
            {
                set_kind(&mut pieces[index], "9");
            }
        }
        replay_event(&mut public, event);
    }
    for id in revealed {
        if let Some(index) = piece_index(&pieces, id) {
            set_kind(&mut pieces[index], FLAG);
        }
    }
    (public_current, pieces)
}

fn sample(pieces: &[BeliefPiece], rng: &mut Rng) -> Option<HashMap<String, String>> {
    for _ in 0..64 {
        let mut assignments = vec![usize::MAX; pieces.len()];
        let mut remaining = COUNTS;
        let mut failed = false;
        for _ in 0..pieces.len() {
            let mut narrowest = usize::MAX;
            let mut choices = Vec::new();
            for (piece_index, piece) in pieces.iter().enumerate() {
                if assignments[piece_index] != usize::MAX {
                    continue;
                }
                let count = (0..KINDS.len())
                    .filter(|kind| piece.mask & (1 << kind) != 0 && remaining[*kind] > 0)
                    .count();
                if count < narrowest {
                    narrowest = count;
                    choices.clear();
                    choices.push(piece_index);
                } else if count == narrowest {
                    choices.push(piece_index);
                }
            }
            if narrowest == 0 || choices.is_empty() {
                failed = true;
                break;
            }
            let selected = choices[rng.index(choices.len())];
            let mut tickets = Vec::new();
            for (kind, count) in remaining.iter().enumerate() {
                if pieces[selected].mask & (1 << kind) != 0 {
                    tickets.extend(std::iter::repeat_n(kind, *count as usize));
                }
            }
            if tickets.is_empty() {
                failed = true;
                break;
            }
            let kind = tickets[rng.index(tickets.len())];
            assignments[selected] = kind;
            remaining[kind] -= 1;
        }
        if !failed {
            return Some(
                pieces
                    .iter()
                    .zip(assignments)
                    .map(|(piece, kind)| (piece.id.clone(), KINDS[kind].to_owned()))
                    .collect(),
            );
        }
    }
    None
}

fn instantiate(
    public: &[Option<Piece>],
    side: &str,
    assignment: &HashMap<String, String>,
) -> Vec<Option<Piece>> {
    public
        .iter()
        .map(|value| {
            value.as_ref().map(|piece| {
                let mut determined = piece.clone();
                if determined.side != side {
                    determined.kind = assignment
                        .get(&determined.id)
                        .cloned()
                        .unwrap_or_else(|| ENGINEER.to_owned());
                }
                determined
            })
        })
        .collect()
}

fn material(kind: &str) -> f64 {
    match kind {
        FLAG => 300.0,
        MINE => 14.0,
        BOMB => 30.0,
        ENGINEER => 10.0,
        _ => 8.0 + rank(kind) as f64 * 5.0,
    }
}

fn evaluate(board: &[Option<Piece>], perspective: &str) -> f64 {
    let mut score = 0.0;
    let mut mines = HashMap::from([(RED, 0_usize), (BLACK, 0)]);
    for piece in board.iter().flatten() {
        if piece.kind == MINE {
            *mines.get_mut(piece.side.as_str()).unwrap() += 1;
        }
    }
    for (index, piece) in board
        .iter()
        .enumerate()
        .filter_map(|(index, value)| value.as_ref().map(|piece| (index, piece)))
    {
        let sign = if piece.side == perspective { 1.0 } else { -1.0 };
        let progress = if piece.side == BLACK {
            row_of(index)
        } else {
            ROWS - 1 - row_of(index)
        } as f64;
        let mut value = material(&piece.kind);
        if piece.kind == ENGINEER {
            value += mines[other(&piece.side)] as f64 * 2.0;
        }
        if is_camp(index) {
            value += 2.0;
        }
        if is_rail(index) && !matches!(piece.kind.as_str(), FLAG | MINE) {
            value += 0.5;
        }
        if !matches!(piece.kind.as_str(), FLAG | MINE) && !is_hq(index) {
            value += progress * 0.35;
        }
        if piece.kind == FLAG {
            let row = row_of(index) as isize;
            let column = (index % COLS) as isize;
            let guards = board
                .iter()
                .enumerate()
                .filter(|(_, value)| value.as_ref().is_some_and(|guard| guard.side == piece.side))
                .filter(|(guard, _)| {
                    (row_of(*guard) as isize - row).abs()
                        + ((*guard % COLS) as isize - column).abs()
                        == 1
                })
                .count();
            value += guards as f64 * 4.0;
        }
        score += sign * value;
    }
    score
}

fn terminal(board: &[Option<Piece>], turn: &str, perspective: &str, ply: usize) -> Option<f64> {
    let outcome = status(board, turn);
    outcome.ended.then(|| {
        if outcome.winner.as_deref() == Some(perspective) {
            WIN - ply as f64
        } else {
            -WIN + ply as f64
        }
    })
}

fn move_priority(board: &[Option<Piece>], movement: Move, side: &str) -> f64 {
    let piece = board[movement.from].as_ref().unwrap();
    let progress = if side == BLACK {
        row_of(movement.to) as f64 - row_of(movement.from) as f64
    } else {
        row_of(movement.from) as f64 - row_of(movement.to) as f64
    };
    let capture = board[movement.to]
        .as_ref()
        .map_or(0.0, |target| material(&target.kind) * 2.0);
    capture
        + progress
        + if is_camp(movement.to) { 2.0 } else { 0.0 }
        + if is_rail(movement.to) && piece.kind != MINE {
            0.5
        } else {
            0.0
        }
}

fn continuation_score(board: &[Option<Piece>], side: &str, config: Config, ply: usize) -> f64 {
    let mut moves = legal_moves(board, side);
    moves.sort_by(|left, right| {
        move_priority(board, *right, side).total_cmp(&move_priority(board, *left, side))
    });
    moves
        .into_iter()
        .take(config.continuation_width)
        .filter_map(|movement| {
            let child = apply_move(board, movement).ok()?.board;
            let score = terminal(&child, other(side), side, ply + 1)
                .unwrap_or_else(|| evaluate(&child, side));
            Some(score)
        })
        .max_by(f64::total_cmp)
        .unwrap_or_else(|| evaluate(board, side))
}

fn root_score(board: &[Option<Piece>], movement: Move, side: &str, config: Config) -> f64 {
    let enemy = other(side);
    let Ok(applied) = apply_move(board, movement) else {
        return -WIN;
    };
    if let Some(score) = terminal(&applied.board, enemy, side, 1) {
        return score;
    }
    let mut replies = legal_moves(&applied.board, enemy);
    replies.sort_by(|left, right| {
        move_priority(&applied.board, *right, enemy).total_cmp(&move_priority(
            &applied.board,
            *left,
            enemy,
        ))
    });
    replies
        .into_iter()
        .take(config.reply_width)
        .filter_map(|reply| {
            let child = apply_move(&applied.board, reply).ok()?.board;
            let score = terminal(&child, side, side, 2).unwrap_or_else(|| evaluate(&child, side));
            Some((child, score))
        })
        .map(|(child, score)| {
            if config.continuation_width == 0 || score.abs() >= WIN - 100.0 {
                score
            } else {
                continuation_score(&child, side, config, 2)
            }
        })
        .min_by(f64::total_cmp)
        .unwrap_or_else(|| evaluate(&applied.board, side))
}

/// Searches only public information. Concealed enemy types are discarded before beliefs are built.
pub fn choose_move(input: SearchInput<'_>, mut stopped: impl FnMut() -> bool) -> Option<Move> {
    let public_input = obscure_enemy_ids(
        input.board,
        input.initial,
        input.events,
        input.side,
        input.revealed,
    );
    let known: HashSet<_> = public_input.revealed.iter().map(String::as_str).collect();
    let (public, pieces) = belief(
        &public_input.board,
        &public_input.initial,
        &public_input.events,
        input.side,
        &known,
    );
    let moves = legal_moves(&public, input.side);
    if moves.is_empty() {
        return None;
    }
    if let Some(capture) = moves.iter().find(|movement| {
        public[movement.to]
            .as_ref()
            .is_some_and(|target| known.contains(target.id.as_str()))
    }) {
        return Some(*capture);
    }
    let config = config(input.difficulty);
    let mut totals = vec![0.0; moves.len()];
    let mut squares = vec![0.0; moves.len()];
    let mut samples = 0_usize;
    let mut rng = Rng::new(input.seed ^ 0x9e37_79b9_7f4a_7c15);
    for sample_index in 0..config.max_samples {
        let Some(assignment) = sample(&pieces, &mut rng) else {
            break;
        };
        let determined = instantiate(&public, input.side, &assignment);
        let mut scores = Vec::with_capacity(moves.len());
        let mut interrupted = false;
        for movement in &moves {
            if sample_index > 0 && stopped() {
                interrupted = true;
                break;
            }
            scores.push(root_score(&determined, *movement, input.side, config));
        }
        if interrupted {
            break;
        }
        for (index, score) in scores.into_iter().enumerate() {
            totals[index] += score;
            squares[index] += score * score;
        }
        samples += 1;
    }
    if samples == 0 {
        return Some(moves[rng.index(moves.len())]);
    }
    let mut scored: Vec<_> = moves
        .into_iter()
        .enumerate()
        .map(|(index, movement)| {
            let mean = totals[index] / samples as f64;
            let variance = (squares[index] / samples as f64 - mean * mean).max(0.0);
            (movement, mean - config.risk * variance.sqrt())
        })
        .collect();
    scored.sort_by(|left, right| {
        right
            .1
            .total_cmp(&left.1)
            .then_with(|| left.0.from.cmp(&right.0.from))
            .then_with(|| left.0.to.cmp(&right.0.to))
    });
    if scored[0].1 >= WIN - 100.0 {
        return Some(scored[0].0);
    }
    let best = scored[0].1;
    let pool: Vec<_> = scored
        .iter()
        .take_while(|(_, score)| best - *score <= config.root_band)
        .map(|(movement, _)| *movement)
        .collect();
    Some(pool[rng.index(pool.len())])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::{at, initial_board};

    fn token(side: &str, kind: &str, id: &str) -> Option<Piece> {
        Some(Piece {
            id: id.to_owned(),
            side: side.to_owned(),
            kind: kind.to_owned(),
        })
    }

    #[test]
    fn known_flag_capture_is_forced_at_every_difficulty() {
        let mut board = vec![None; ROWS * COLS];
        board[at(11, 1)] = token(RED, FLAG, "rf");
        board[at(1, 1)] = token(BLACK, FLAG, "bf");
        board[at(2, 1)] = token(RED, "4", "r4");
        let expected = Move {
            from: at(2, 1),
            to: at(1, 1),
        };
        for difficulty in ["easy", "medium", "hard"] {
            assert_eq!(
                choose_move(
                    SearchInput {
                        board: &board,
                        initial: &board,
                        events: &[],
                        side: RED,
                        difficulty,
                        revealed: &["bf".to_owned()],
                        seed: 7,
                    },
                    || false,
                ),
                Some(expected)
            );
        }
    }

    #[test]
    fn concealed_enemy_rank_cannot_change_any_policy() {
        let mut first = initial_board(91);
        let concealed = first
            .iter()
            .position(|piece| {
                piece
                    .as_ref()
                    .is_some_and(|piece| piece.side == BLACK && piece.kind != FLAG)
            })
            .unwrap();
        let mut second = first.clone();
        first[concealed].as_mut().unwrap().kind = "9".to_owned();
        second[concealed].as_mut().unwrap().kind = ENGINEER.to_owned();
        for difficulty in ["easy", "medium", "hard"] {
            assert_eq!(
                choose_move(
                    SearchInput {
                        board: &first,
                        initial: &first,
                        events: &[],
                        side: RED,
                        difficulty,
                        revealed: &[],
                        seed: 17,
                    },
                    || true,
                ),
                choose_move(
                    SearchInput {
                        board: &second,
                        initial: &second,
                        events: &[],
                        side: RED,
                        difficulty,
                        revealed: &[],
                        seed: 17,
                    },
                    || true,
                ),
            );
        }
    }
}
