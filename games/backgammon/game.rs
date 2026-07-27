use std::collections::HashSet;

use backgammon::prelude::{Game, Move as _, Player, Position as LibraryPosition, Roll as _};
use serde::{Deserialize, Serialize};

pub const HUMAN: u8 = 0;
pub const AI: u8 = 1;
pub const BAR: u8 = 24;
pub const OFF: u8 = 25;

#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub struct Position {
    pub board: [i8; 24],
    pub bar: [u8; 2],
    pub off: [u8; 2],
}

#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub struct Step {
    pub from: u8,
    pub to: u8,
    pub die: u8,
    pub hit: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct RequestedStep {
    pub from: u8,
    pub to: u8,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Outcome {
    pub winner: u8,
    pub kind: &'static str,
    pub multiplier: u8,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Turn {
    pub steps: Vec<Step>,
    pub position: Position,
    pub outcome: Option<Outcome>,
}

pub fn other(side: u8) -> u8 {
    if side == HUMAN { AI } else { HUMAN }
}

fn player(side: u8) -> Result<Player, String> {
    match side {
        HUMAN => Ok(Player::Player0),
        AI => Ok(Player::Player1),
        _ => Err("side must be 0 or 1".into()),
    }
}

fn checker_side(value: i8) -> Option<u8> {
    match value.cmp(&0) {
        std::cmp::Ordering::Greater => Some(HUMAN),
        std::cmp::Ordering::Less => Some(AI),
        std::cmp::Ordering::Equal => None,
    }
}

impl Position {
    pub fn initial() -> Self {
        let display = Game::new().get_board();
        Self {
            board: display.board,
            bar: [display.bar.0, display.bar.1],
            off: [display.off.0, display.off.1],
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.board.iter().any(|value| !(-15..=15).contains(value)) {
            return Err("board points must contain between -15 and 15 checkers".into());
        }
        for side in [HUMAN, AI] {
            if self.bar[side as usize] > 15 || self.off[side as usize] > 15 {
                return Err("bar and off counts cannot exceed 15".into());
            }
            let on_board: u16 = self
                .board
                .iter()
                .filter(|value| checker_side(**value) == Some(side))
                .map(|value| value.unsigned_abs() as u16)
                .sum();
            let total =
                on_board + u16::from(self.bar[side as usize]) + u16::from(self.off[side as usize]);
            if total != 15 {
                return Err(format!("side {side} must have exactly 15 checkers"));
            }
        }
        Ok(())
    }

    pub fn pip(&self, side: u8) -> i32 {
        let mut total = i32::from(self.bar[side as usize]) * 25;
        for (index, value) in self.board.iter().copied().enumerate() {
            if checker_side(value) != Some(side) {
                continue;
            }
            let distance = if side == HUMAN { index + 1 } else { 24 - index };
            total += i32::from(value.unsigned_abs()) * distance as i32;
        }
        total
    }

    pub fn outcome(&self) -> Option<Outcome> {
        let winner = [HUMAN, AI]
            .into_iter()
            .find(|side| self.off[*side as usize] == 15)?;
        let loser = other(winner);
        if self.off[loser as usize] > 0 {
            return Some(Outcome {
                winner,
                kind: "regular",
                multiplier: 1,
            });
        }
        let loser_in_winner_home = if winner == HUMAN {
            self.board[..6].iter().any(|value| *value < 0)
        } else {
            self.board[18..].iter().any(|value| *value > 0)
        };
        if self.bar[loser as usize] > 0 || loser_in_winner_home {
            Some(Outcome {
                winner,
                kind: "backgammon",
                multiplier: 3,
            })
        } else {
            Some(Outcome {
                winner,
                kind: "gammon",
                multiplier: 2,
            })
        }
    }
}

fn global_location(side: u8, position: LibraryPosition) -> u8 {
    match position {
        LibraryPosition::Board(field) if side == HUMAN => field as u8 - 1,
        LibraryPosition::Board(field) => 24 - field as u8,
        LibraryPosition::Bar => BAR,
        LibraryPosition::Off => OFF,
    }
}

fn game_for(position: &Position, side: u8, dice: [u8; 2]) -> Result<Game, String> {
    position.validate()?;
    if dice.iter().any(|die| !(1..=6).contains(die)) {
        return Err("dice must contain two values between 1 and 6".into());
    }
    let active = player(side)?;
    let mut game = Game::new();
    game.empty_board().map_err(|error| error.to_string())?;
    for (index, value) in position.board.iter().copied().enumerate() {
        if value > 0 {
            game.set_checkers(Player::Player0, LibraryPosition::Board(index + 1), value)
                .map_err(|error| error.to_string())?;
        } else if value < 0 {
            game.set_checkers(Player::Player1, LibraryPosition::Board(24 - index), -value)
                .map_err(|error| error.to_string())?;
        }
    }
    for current in [HUMAN, AI] {
        let current_player = player(current)?;
        game.set_checkers(
            current_player,
            LibraryPosition::Bar,
            position.bar[current as usize] as i8,
        )
        .map_err(|error| error.to_string())?;
        game.set_checkers(
            current_player,
            LibraryPosition::Off,
            position.off[current as usize] as i8,
        )
        .map_err(|error| error.to_string())?;
    }
    game.set_player(active).map_err(|error| error.to_string())?;
    game.set_dice(active, (dice[0], dice[1]))
        .map_err(|error| error.to_string())?;
    Ok(game)
}

fn owns(position: &Position, side: u8, location: u8) -> bool {
    if location == BAR {
        return position.bar[side as usize] > 0;
    }
    location < 24 && checker_side(position.board[location as usize]) == Some(side)
}

fn ready_to_bear_off(position: &Position, side: u8) -> bool {
    if position.bar[side as usize] > 0 {
        return false;
    }
    position.board.iter().enumerate().all(|(index, value)| {
        checker_side(*value) != Some(side)
            || if side == HUMAN {
                index < 6
            } else {
                index >= 18
            }
    })
}

fn has_farther_checker(position: &Position, side: u8, from: u8) -> bool {
    if side == HUMAN {
        position.board[from as usize + 1..6]
            .iter()
            .any(|value| *value > 0)
    } else {
        position.board[18..from as usize]
            .iter()
            .any(|value| *value < 0)
    }
}

fn apply_step(
    position: &Position,
    side: u8,
    from: u8,
    to: u8,
    die: u8,
) -> Option<(Position, bool)> {
    if !(1..=6).contains(&die) || !owns(position, side, from) {
        return None;
    }
    if position.bar[side as usize] > 0 && from != BAR {
        return None;
    }

    let expected = if from == BAR {
        if side == HUMAN { 24 - die } else { die - 1 }
    } else {
        let distance = if side == HUMAN { from + 1 } else { 24 - from };
        if die < distance {
            if side == HUMAN {
                from - die
            } else {
                from + die
            }
        } else {
            if !ready_to_bear_off(position, side)
                || (die > distance && has_farther_checker(position, side, from))
            {
                return None;
            }
            OFF
        }
    };
    if to != expected {
        return None;
    }

    let mut next = position.clone();
    if from == BAR {
        next.bar[side as usize] -= 1;
    } else {
        next.board[from as usize] -= if side == HUMAN { 1 } else { -1 };
    }

    let mut hit = false;
    if to == OFF {
        next.off[side as usize] += 1;
    } else {
        let occupant = next.board[to as usize];
        if checker_side(occupant) == Some(other(side)) {
            if occupant.unsigned_abs() != 1 {
                return None;
            }
            next.board[to as usize] = 0;
            next.bar[other(side) as usize] += 1;
            hit = true;
        }
        next.board[to as usize] += if side == HUMAN { 1 } else { -1 };
    }
    Some((next, hit))
}

fn annotate(
    position: &Position,
    side: u8,
    dice: &[u8],
    sequence: &[(u8, u8)],
    step_index: usize,
    used: &mut [bool],
    steps: &mut Vec<Step>,
) -> Option<(Vec<Step>, Position)> {
    if step_index == sequence.len() {
        return Some((steps.clone(), position.clone()));
    }
    let (from, to) = sequence[step_index];
    let mut tried = [false; 7];
    for index in 0..dice.len() {
        let die = dice[index];
        if used[index] || tried[die as usize] {
            continue;
        }
        tried[die as usize] = true;
        let Some((next, hit)) = apply_step(position, side, from, to, die) else {
            continue;
        };
        used[index] = true;
        steps.push(Step { from, to, die, hit });
        if let Some(result) = annotate(&next, side, dice, sequence, step_index + 1, used, steps) {
            return Some(result);
        }
        let _ = steps.pop();
        used[index] = false;
    }
    None
}

pub fn legal_turns(position: &Position, side: u8, dice: [u8; 2]) -> Result<Vec<Turn>, String> {
    let active = player(side)?;
    let game = game_for(position, side, dice)?;
    let raw = game
        .available_moves(active)
        .map_err(|error| error.to_string())?;
    let mut expanded = if dice[0] == dice[1] {
        vec![dice[0]; 4]
    } else {
        dice.to_vec()
    };
    expanded.sort_unstable_by(|left, right| right.cmp(left));
    let mut turns = Vec::new();
    let mut seen = HashSet::new();
    for sequence in raw {
        let global: Vec<_> = sequence
            .into_iter()
            .map(|(from, to)| (global_location(side, from), global_location(side, to)))
            .collect();
        let mut used = vec![false; expanded.len()];
        let Some((steps, next)) = annotate(
            position,
            side,
            &expanded,
            &global,
            0,
            &mut used,
            &mut Vec::new(),
        ) else {
            continue;
        };
        let signature: Vec<_> = steps.iter().map(|step| (step.from, step.to)).collect();
        if seen.insert(signature) {
            turns.push(Turn {
                outcome: next.outcome(),
                position: next,
                steps,
            });
        }
    }

    let maximum = turns.iter().map(|turn| turn.steps.len()).max().unwrap_or(0);
    turns.retain(|turn| turn.steps.len() == maximum);
    if maximum == 1 && dice[0] != dice[1] {
        let high = dice[0].max(dice[1]);
        if turns.iter().any(|turn| turn.steps[0].die == high) {
            turns.retain(|turn| turn.steps[0].die == high);
        }
    }
    turns.sort_by(|left, right| {
        left.steps
            .iter()
            .map(|step| (step.from, step.to))
            .cmp(right.steps.iter().map(|step| (step.from, step.to)))
    });
    Ok(turns)
}

pub fn apply_turn(
    position: &Position,
    side: u8,
    dice: [u8; 2],
    requested: &[RequestedStep],
) -> Result<Turn, String> {
    let turns = legal_turns(position, side, dice)?;
    if requested.is_empty() && turns.is_empty() {
        return Ok(Turn {
            steps: Vec::new(),
            position: position.clone(),
            outcome: position.outcome(),
        });
    }
    turns
        .into_iter()
        .find(|turn| {
            turn.steps.len() == requested.len()
                && turn
                    .steps
                    .iter()
                    .zip(requested)
                    .all(|(step, asked)| step.from == asked.from && step.to == asked.to)
        })
        .ok_or_else(|| "illegal or incomplete turn".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn borne_off(side: u8, remaining: &[(usize, i8)]) -> Position {
        let mut position = Position {
            board: [0; 24],
            bar: [0, 0],
            off: [15, 15],
        };
        let count: u8 = remaining
            .iter()
            .filter(|(_, value)| checker_side(*value) == Some(side))
            .map(|(_, value)| value.unsigned_abs())
            .sum();
        position.off[side as usize] -= count;
        for (index, value) in remaining {
            position.board[*index] = *value;
        }
        position
    }

    #[test]
    fn initial_position_uses_the_global_player_zero_view() {
        let position = Position::initial();
        assert_eq!(position.board[0], -2);
        assert_eq!(position.board[5], 5);
        assert_eq!(position.board[23], 2);
        assert_eq!(position.pip(HUMAN), 167);
        assert_eq!(position.pip(AI), 167);
        assert_eq!(legal_turns(&position, HUMAN, [3, 1]).unwrap().len(), 31);
    }

    #[test]
    fn compulsory_use_filters_short_sequences_and_prefers_the_high_die() {
        let two = borne_off(HUMAN, &[(0, 2)]);
        let turns = legal_turns(&two, HUMAN, [1, 2]).unwrap();
        assert!(turns.iter().all(|turn| turn.steps.len() == 2));

        let one = borne_off(HUMAN, &[(3, 1)]);
        let turns = legal_turns(&one, HUMAN, [5, 6]).unwrap();
        assert!(turns.iter().all(|turn| turn.steps.len() == 1));
        assert!(turns.iter().all(|turn| turn.steps[0].die == 6));
    }

    #[test]
    fn doubles_use_four_moves_and_bar_entry_has_priority() {
        let position = Position::initial();
        assert!(
            legal_turns(&position, HUMAN, [6, 6])
                .unwrap()
                .iter()
                .all(|turn| turn.steps.len() == 4)
        );

        let mut bar = position;
        bar.board[23] -= 1;
        bar.bar[HUMAN as usize] = 1;
        assert!(
            legal_turns(&bar, HUMAN, [1, 2])
                .unwrap()
                .iter()
                .all(|turn| turn.steps[0].from == BAR)
        );
    }

    #[test]
    fn overshoot_requires_the_farthest_checker_to_move() {
        let position = borne_off(HUMAN, &[(2, 1), (5, 1)]);
        let turns = legal_turns(&position, HUMAN, [6, 1]).unwrap();
        assert!(turns.iter().all(|turn| {
            !turn
                .steps
                .iter()
                .any(|step| step.from == 2 && step.to == OFF && step.die == 6)
        }));
    }

    #[test]
    fn outcome_distinguishes_regular_gammon_and_backgammon() {
        let mut regular = borne_off(AI, &[(6, -14)]);
        regular.off = [15, 1];
        assert_eq!(regular.outcome().unwrap().kind, "regular");

        let gammon = borne_off(AI, &[(6, -15)]);
        assert_eq!(gammon.outcome().unwrap().kind, "gammon");

        let backgammon = borne_off(AI, &[(3, -15)]);
        assert_eq!(backgammon.outcome().unwrap().kind, "backgammon");
    }

    #[test]
    fn incomplete_or_malformed_turns_are_rejected() {
        let position = Position::initial();
        let legal = legal_turns(&position, HUMAN, [3, 1]).unwrap();
        let first = &legal[0];
        assert!(
            apply_turn(
                &position,
                HUMAN,
                [3, 1],
                &[RequestedStep {
                    from: first.steps[0].from,
                    to: first.steps[0].to,
                }],
            )
            .is_err()
        );
    }
}
