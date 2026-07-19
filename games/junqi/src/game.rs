use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};

pub const ROWS: usize = 12;
pub const COLS: usize = 5;
pub const RED: &str = "r";
pub const BLACK: &str = "b";
pub const FLAG: &str = "F";
pub const MINE: &str = "M";
pub const BOMB: &str = "B";
pub const ENGINEER: &str = "1";
pub const TYPES: [&str; 25] = [
    FLAG, MINE, MINE, MINE, BOMB, BOMB, "9", "8", "7", "7", "6", "6", "5", "5", "4", "4", "3", "3",
    "3", "2", "2", "2", ENGINEER, ENGINEER, ENGINEER,
];

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Piece {
    pub id: String,
    pub side: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Move {
    pub from: usize,
    pub to: usize,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ApplyResult {
    pub board: Vec<Option<Piece>>,
    pub result: String,
    pub attacker: Piece,
    pub defender: Option<Piece>,
    pub revealed: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Status {
    pub ended: bool,
    pub winner: Option<String>,
    pub reason: String,
}

#[derive(Clone)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(seed.max(1))
    }

    pub fn next_u64(&mut self) -> u64 {
        let mut value = self.0;
        value ^= value << 13;
        value ^= value >> 7;
        value ^= value << 17;
        self.0 = value;
        value
    }

    pub fn index(&mut self, length: usize) -> usize {
        (self.next_u64() as usize) % length
    }

    pub fn shuffle<T>(&mut self, values: &mut [T]) {
        for index in (1..values.len()).rev() {
            let target = self.index(index + 1);
            values.swap(index, target);
        }
    }
}

pub const fn at(row: usize, column: usize) -> usize {
    row * COLS + column
}

pub const fn row_of(index: usize) -> usize {
    index / COLS
}

pub const fn column_of(index: usize) -> usize {
    index % COLS
}

pub const fn inside(row: isize, column: isize) -> bool {
    row >= 0 && row < ROWS as isize && column >= 0 && column < COLS as isize
}

pub fn other(side: &str) -> &'static str {
    if side == RED { BLACK } else { RED }
}

pub fn camps() -> Vec<usize> {
    [
        (2, 1),
        (2, 3),
        (3, 2),
        (4, 1),
        (4, 3),
        (7, 1),
        (7, 3),
        (8, 2),
        (9, 1),
        (9, 3),
    ]
    .into_iter()
    .map(|(row, column)| at(row, column))
    .collect()
}

pub fn is_camp(index: usize) -> bool {
    matches!(index, 11 | 13 | 17 | 21 | 23 | 36 | 38 | 42 | 46 | 48)
}

pub fn is_hq(index: usize) -> bool {
    matches!(index, 1 | 3 | 56 | 58)
}

pub fn is_rail(index: usize) -> bool {
    matches!(row_of(index), 1 | 5 | 6 | 10)
        || matches!(column_of(index), 0 | 4) && (1..=10).contains(&row_of(index))
}

pub fn deployment_squares(side: &str) -> Vec<usize> {
    let rows = if side == BLACK { 0..6 } else { 6..12 };
    rows.flat_map(|row| (0..COLS).map(move |column| at(row, column)))
        .filter(|index| !is_camp(*index))
        .collect()
}

fn piece(side: &str, kind: &str, serial: usize) -> Piece {
    Piece {
        id: format!("{side}{kind}{serial}"),
        side: side.to_owned(),
        kind: kind.to_owned(),
    }
}

fn take_random(open: &mut Vec<usize>, rng: &mut Rng, predicate: impl Fn(usize) -> bool) -> usize {
    let candidates: Vec<_> = open
        .iter()
        .enumerate()
        .filter_map(|(slot, index)| predicate(*index).then_some(slot))
        .collect();
    let slot = candidates[rng.index(candidates.len())];
    open.swap_remove(slot)
}

fn setup_side(board: &mut [Option<Piece>], side: &str, rng: &mut Rng) {
    let forward = if side == BLACK { 5 } else { 6 };
    let rear = if side == BLACK { [0, 1] } else { [10, 11] };
    let hq = if side == BLACK {
        [at(0, 1), at(0, 3)]
    } else {
        [at(11, 1), at(11, 3)]
    };
    let flag_at = hq[rng.index(2)];
    let mut open = deployment_squares(side);
    open.retain(|index| *index != flag_at);
    let mut serial = 0;
    board[flag_at] = Some(piece(side, FLAG, serial));
    serial += 1;
    for kind in [MINE, MINE, MINE] {
        let target = take_random(&mut open, rng, |index| rear.contains(&row_of(index)));
        board[target] = Some(piece(side, kind, serial));
        serial += 1;
    }
    for kind in [BOMB, BOMB] {
        let target = take_random(&mut open, rng, |index| row_of(index) != forward);
        board[target] = Some(piece(side, kind, serial));
        serial += 1;
    }
    let mut rest: Vec<_> = TYPES
        .into_iter()
        .filter(|kind| !matches!(*kind, FLAG | MINE | BOMB))
        .collect();
    rng.shuffle(&mut rest);
    rng.shuffle(&mut open);
    for (target, kind) in open.into_iter().zip(rest) {
        board[target] = Some(piece(side, kind, serial));
        serial += 1;
    }
}

pub fn initial_board(seed: u64) -> Vec<Option<Piece>> {
    let mut rng = Rng::new(seed);
    let mut board = vec![None; ROWS * COLS];
    setup_side(&mut board, BLACK, &mut rng);
    setup_side(&mut board, RED, &mut rng);
    board
}

pub fn orthogonal_neighbors(index: usize) -> Vec<usize> {
    let row = row_of(index) as isize;
    let column = column_of(index) as isize;
    let mut found = Vec::new();
    for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
        let next_row = row + dr;
        let next_column = column + dc;
        if !inside(next_row, next_column) {
            continue;
        }
        if ((row == 5 && next_row == 6) || (row == 6 && next_row == 5))
            && ![0, 2, 4].contains(&(column as usize))
        {
            continue;
        }
        found.push(at(next_row as usize, next_column as usize));
    }
    found
}

pub fn road_neighbors(index: usize) -> Vec<usize> {
    let mut found: HashSet<_> = orthogonal_neighbors(index).into_iter().collect();
    let row = row_of(index);
    let column = column_of(index);
    for camp in camps() {
        if row_of(camp).abs_diff(row) == 1 && column_of(camp).abs_diff(column) == 1 {
            found.insert(camp);
        }
    }
    if is_camp(index) {
        for (dr, dc) in [(-1, -1), (-1, 1), (1, -1), (1, 1)] {
            if inside(row as isize + dr, column as isize + dc) {
                found.insert(at(
                    (row as isize + dr) as usize,
                    (column as isize + dc) as usize,
                ));
            }
        }
    }
    let mut values: Vec<_> = found.into_iter().collect();
    values.sort_unstable();
    values
}

pub fn railway_neighbors(index: usize) -> Vec<usize> {
    orthogonal_neighbors(index)
        .into_iter()
        .filter(|index| is_rail(*index))
        .collect()
}

fn straight_rail_targets(board: &[Option<Piece>], from: usize) -> Vec<usize> {
    let row = row_of(from) as isize;
    let column = column_of(from) as isize;
    let mut found = Vec::new();
    for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
        let mut next_row = row + dr;
        let mut next_column = column + dc;
        while inside(next_row, next_column) {
            let target = at(next_row as usize, next_column as usize);
            if !is_rail(target) {
                break;
            }
            found.push(target);
            if board[target].is_some() {
                break;
            }
            next_row += dr;
            next_column += dc;
        }
    }
    found
}

fn engineer_rail_targets(board: &[Option<Piece>], from: usize) -> Vec<usize> {
    let mut found = Vec::new();
    let mut queue = VecDeque::from([from]);
    let mut seen = HashSet::from([from]);
    while let Some(current) = queue.pop_front() {
        for target in railway_neighbors(current) {
            if !seen.insert(target) {
                continue;
            }
            found.push(target);
            if board[target].is_none() {
                queue.push_back(target);
            }
        }
    }
    found
}

pub fn movable(value: Option<&Piece>) -> bool {
    value.is_some_and(|piece| !matches!(piece.kind.as_str(), FLAG | MINE))
}

pub fn moves_for(board: &[Option<Piece>], from: usize) -> Vec<Move> {
    let Some(value) = board.get(from).and_then(Option::as_ref) else {
        return Vec::new();
    };
    if !movable(Some(value)) || is_hq(from) {
        return Vec::new();
    }
    let mut targets: HashSet<_> = road_neighbors(from).into_iter().collect();
    if is_rail(from) {
        let rail_targets = if value.kind == ENGINEER {
            engineer_rail_targets(board, from)
        } else {
            straight_rail_targets(board, from)
        };
        targets.extend(rail_targets);
    }
    let mut moves: Vec<_> = targets
        .into_iter()
        .filter(|to| {
            let occupant = board[*to].as_ref();
            occupant.is_none_or(|piece| piece.side != value.side)
                && !(occupant.is_some() && is_camp(*to))
        })
        .map(|to| Move { from, to })
        .collect();
    moves.sort_by_key(|value| value.to);
    moves
}

pub fn legal_moves(board: &[Option<Piece>], side: &str) -> Vec<Move> {
    board
        .iter()
        .enumerate()
        .filter(|(_, value)| value.as_ref().is_some_and(|piece| piece.side == side))
        .flat_map(|(index, _)| moves_for(board, index))
        .collect()
}

pub(crate) fn rank(kind: &str) -> i32 {
    kind.parse::<i32>().unwrap_or(0)
}

pub fn battle(attacker: &Piece, defender: &Piece) -> &'static str {
    if defender.kind == FLAG {
        "attacker"
    } else if attacker.kind == BOMB || defender.kind == BOMB {
        "both"
    } else if defender.kind == MINE {
        if attacker.kind == ENGINEER {
            "attacker"
        } else {
            "defender"
        }
    } else if rank(&attacker.kind) > rank(&defender.kind) {
        "attacker"
    } else if rank(&attacker.kind) < rank(&defender.kind) {
        "defender"
    } else {
        "both"
    }
}

pub fn apply_move(board: &[Option<Piece>], movement: Move) -> Result<ApplyResult, String> {
    if !moves_for(board, movement.from).contains(&movement) {
        return Err("illegal move".to_owned());
    }
    let mut next = board.to_vec();
    let attacker = next[movement.from].take().expect("legal move has attacker");
    let defender = next[movement.to].take();
    let mut result = "move";
    let mut revealed = Vec::new();
    match defender.as_ref() {
        None => next[movement.to] = Some(attacker.clone()),
        Some(target) => {
            result = battle(&attacker, target);
            revealed.extend([attacker.id.clone(), target.id.clone()]);
            match result {
                "attacker" => next[movement.to] = Some(attacker.clone()),
                "defender" => next[movement.to] = Some(target.clone()),
                _ => {}
            }
            for casualty in [&attacker, target] {
                if casualty.kind == "9"
                    && !next.iter().flatten().any(|piece| piece.id == casualty.id)
                    && let Some(flag) = next
                        .iter()
                        .flatten()
                        .find(|piece| piece.side == casualty.side && piece.kind == FLAG)
                {
                    revealed.push(flag.id.clone());
                }
            }
        }
    }
    Ok(ApplyResult {
        board: next,
        result: result.to_owned(),
        attacker,
        defender,
        revealed,
    })
}

pub fn status(board: &[Option<Piece>], turn: &str) -> Status {
    for side in [RED, BLACK] {
        if !board
            .iter()
            .flatten()
            .any(|piece| piece.side == side && piece.kind == FLAG)
        {
            return Status {
                ended: true,
                winner: Some(other(side).to_owned()),
                reason: "flag".to_owned(),
            };
        }
    }
    if legal_moves(board, turn).is_empty() {
        Status {
            ended: true,
            winner: Some(other(turn).to_owned()),
            reason: "immobile".to_owned(),
        }
    } else {
        Status {
            ended: false,
            winner: None,
            reason: "playing".to_owned(),
        }
    }
}

pub fn validate_setup(board: &[Option<Piece>], side: &str) -> bool {
    let values: Vec<_> = board
        .iter()
        .enumerate()
        .filter(|(_, value)| value.as_ref().is_some_and(|piece| piece.side == side))
        .collect();
    if values.len() != 25 {
        return false;
    }
    for kind in TYPES {
        let expected = TYPES.iter().filter(|value| **value == kind).count();
        let found = values
            .iter()
            .filter(|(_, value)| value.as_ref().is_some_and(|piece| piece.kind == kind))
            .count();
        if found != expected {
            return false;
        }
    }
    values.iter().all(|(index, value)| {
        let piece = value.as_ref().unwrap();
        !is_camp(*index)
            && (piece.kind != FLAG || is_hq(*index))
            && (piece.kind != MINE
                || if side == BLACK {
                    row_of(*index) <= 1
                } else {
                    row_of(*index) >= 10
                })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token(side: &str, kind: &str, id: &str) -> Option<Piece> {
        Some(Piece {
            id: id.to_owned(),
            side: side.to_owned(),
            kind: kind.to_owned(),
        })
    }

    #[test]
    fn seeded_deployments_are_valid_and_reproducible() {
        let board = initial_board(21);
        assert_eq!(board, initial_board(21));
        assert!(validate_setup(&board, RED));
        assert!(validate_setup(&board, BLACK));
        assert!(camps().into_iter().all(|index| board[index].is_none()));
    }

    #[test]
    fn engineers_turn_on_rails_and_regular_pieces_do_not() {
        let mut board = vec![None; ROWS * COLS];
        board[at(5, 2)] = token(RED, "5", "r5");
        assert!(
            moves_for(&board, at(5, 2))
                .iter()
                .any(|movement| movement.to == at(5, 4))
        );
        assert!(
            !moves_for(&board, at(5, 2))
                .iter()
                .any(|movement| movement.to == at(10, 4))
        );
        board[at(5, 2)] = token(RED, ENGINEER, "r1");
        assert!(
            moves_for(&board, at(5, 2))
                .iter()
                .any(|movement| movement.to == at(10, 4))
        );
    }
}
