use std::collections::HashSet;

use crate::game::{
    BLACK, BOMB, ENGINEER, FLAG, Move, Piece, Rng, battle, is_camp, is_hq, is_rail, legal_moves,
    rank, row_of,
};

fn known_battle_score(attacker: &Piece, defender: &Piece) -> f64 {
    let own_value = if attacker.kind == BOMB {
        7.0
    } else {
        rank(&attacker.kind) as f64
    };
    let enemy_value = if defender.kind == FLAG {
        50.0
    } else if defender.kind == BOMB {
        7.0
    } else {
        rank(&defender.kind) as f64
    };
    match battle(attacker, defender) {
        "attacker" => 18.0 + enemy_value,
        "defender" => -15.0 - own_value,
        _ => enemy_value - own_value,
    }
}

/// Information-safe root policy. Concealed enemy ranks affect neither scores nor tie breaking.
pub fn choose_move(
    board: &[Option<Piece>],
    side: &str,
    difficulty: &str,
    revealed: &[String],
    seed: u64,
) -> Option<Move> {
    let moves = legal_moves(board, side);
    if moves.is_empty() {
        return None;
    }
    let known: HashSet<_> = revealed.iter().map(String::as_str).collect();
    let personality = ((seed >> 17) & 1023) as f64 / 1023.0;
    let mut scored: Vec<_> = moves
        .into_iter()
        .map(|movement| {
            let own = board[movement.from].as_ref().unwrap();
            let target = board[movement.to].as_ref();
            let progress = if side == BLACK {
                row_of(movement.to) as f64 - row_of(movement.from) as f64
            } else {
                row_of(movement.from) as f64 - row_of(movement.to) as f64
            };
            let mut score = progress * (1.0 + personality);
            if is_camp(movement.to) {
                score += 4.0 - personality;
            }
            if is_rail(movement.to) {
                score += 0.8;
            }
            if is_hq(movement.from) {
                score -= 3.0;
            }
            if let Some(enemy) = target {
                if known.contains(enemy.id.as_str()) {
                    score += known_battle_score(own, enemy);
                    if enemy.kind == FLAG {
                        score += 1_000_000.0;
                    }
                } else {
                    // Expected-value pressure without inspecting the concealed rank.
                    score += 7.0 + personality * 3.0;
                    if own.kind == ENGINEER {
                        score += 1.5;
                    }
                    if rank(&own.kind) >= 8 {
                        score -= 2.5 * (1.0 - personality);
                    }
                }
            }
            (movement, score)
        })
        .collect();
    scored.sort_by(|left, right| {
        right
            .1
            .total_cmp(&left.1)
            .then_with(|| left.0.from.cmp(&right.0.from))
            .then_with(|| left.0.to.cmp(&right.0.to))
    });
    if scored[0].1 >= 900_000.0 {
        return Some(scored[0].0);
    }
    let regret = match difficulty {
        "hard" => 0.75,
        "easy" => 7.0,
        _ => 3.0,
    };
    let best = scored[0].1;
    let pool: Vec<_> = scored
        .iter()
        .take_while(|(_, score)| best - *score <= regret)
        .map(|(movement, _)| *movement)
        .collect();
    let mut rng = Rng::new(seed ^ 0x9e37_79b9_7f4a_7c15);
    Some(pool[rng.index(pool.len())])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::{RED, ROWS, at, initial_board};

    fn token(side: &str, kind: &str, id: &str) -> Option<Piece> {
        Some(Piece {
            id: id.to_owned(),
            side: side.to_owned(),
            kind: kind.to_owned(),
        })
    }

    #[test]
    fn known_flag_capture_is_forced_for_every_seed() {
        let mut board = vec![None; ROWS * 5];
        board[at(11, 1)] = token(RED, FLAG, "rf");
        board[at(1, 1)] = token(BLACK, FLAG, "bf");
        board[at(2, 1)] = token(RED, "4", "r4");
        let expected = Move {
            from: at(2, 1),
            to: at(1, 1),
        };
        for seed in 1..32 {
            assert_eq!(
                choose_move(&board, RED, "easy", &["bf".to_owned()], seed),
                Some(expected)
            );
        }
    }

    #[test]
    fn concealed_enemy_rank_cannot_change_the_policy() {
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
        for seed in 1..24 {
            assert_eq!(
                choose_move(&first, RED, "hard", &[], seed),
                choose_move(&second, RED, "hard", &[], seed),
            );
        }
    }
}
