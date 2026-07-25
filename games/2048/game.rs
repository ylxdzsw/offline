use serde::Serialize;

pub const SIZE: usize = 4;
pub const CELLS: usize = SIZE * SIZE;
pub const TARGET: u32 = 2048;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
}

impl Direction {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "up" => Ok(Self::Up),
            "down" => Ok(Self::Down),
            "left" => Ok(Self::Left),
            "right" => Ok(Self::Right),
            _ => Err(format!("unknown direction {value:?}")),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct Spawn {
    pub index: usize,
    pub value: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub reached_2048: bool,
    pub game_over: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Started {
    pub board: Vec<u32>,
    pub spawned: Vec<Spawn>,
    pub reached_2048: bool,
    pub game_over: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveResult {
    pub board: Vec<u32>,
    pub moved: bool,
    pub score_gain: u64,
    pub spawned: Option<Spawn>,
    pub merged: Vec<usize>,
    pub reached_2048: bool,
    pub game_over: bool,
}

struct Slide {
    board: Vec<u32>,
    score_gain: u64,
    merged: Vec<usize>,
}

pub fn validate_board(board: &[u32]) -> Result<(), String> {
    if board.len() != CELLS {
        return Err("board must have 16 cells".to_owned());
    }
    if board
        .iter()
        .any(|value| *value != 0 && !value.is_power_of_two())
    {
        return Err("board cells must be zero or powers of two".to_owned());
    }
    Ok(())
}

fn line(direction: Direction, lane: usize) -> [usize; SIZE] {
    match direction {
        Direction::Left => std::array::from_fn(|offset| lane * SIZE + offset),
        Direction::Right => std::array::from_fn(|offset| lane * SIZE + SIZE - 1 - offset),
        Direction::Up => std::array::from_fn(|offset| offset * SIZE + lane),
        Direction::Down => std::array::from_fn(|offset| (SIZE - 1 - offset) * SIZE + lane),
    }
}

fn slide(board: &[u32], direction: Direction) -> Result<Slide, String> {
    validate_board(board)?;
    let mut next = vec![0; CELLS];
    let mut score_gain = 0;
    let mut merged = Vec::new();

    for lane in 0..SIZE {
        let indices = line(direction, lane);
        let values: Vec<_> = indices
            .iter()
            .map(|index| board[*index])
            .filter(|value| *value != 0)
            .collect();
        let mut output = Vec::with_capacity(SIZE);
        let mut source = 0;
        while source < values.len() {
            if source + 1 < values.len() && values[source] == values[source + 1] {
                let value = values[source]
                    .checked_mul(2)
                    .ok_or_else(|| "tile value overflow".to_owned())?;
                score_gain += u64::from(value);
                output.push(value);
                merged.push(indices[output.len() - 1]);
                source += 2;
            } else {
                output.push(values[source]);
                source += 1;
            }
        }
        for (offset, value) in output.into_iter().enumerate() {
            next[indices[offset]] = value;
        }
    }

    Ok(Slide {
        board: next,
        score_gain,
        merged,
    })
}

fn mix(mut value: u64) -> u64 {
    value ^= value >> 30;
    value = value.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 27;
    value = value.wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

fn spawn(board: &mut [u32], seed: u64) -> Option<Spawn> {
    let empty: Vec<_> = board
        .iter()
        .enumerate()
        .filter_map(|(index, value)| (*value == 0).then_some(index))
        .collect();
    if empty.is_empty() {
        return None;
    }
    let position_random = mix(seed ^ 0x243f_6a88_85a3_08d3);
    let value_random = mix(seed ^ 0x1319_8a2e_0370_7344);
    let index = empty[(position_random % empty.len() as u64) as usize];
    let value = if value_random.is_multiple_of(10) {
        4
    } else {
        2
    };
    board[index] = value;
    Some(Spawn { index, value })
}

pub fn status(board: &[u32]) -> Result<Status, String> {
    validate_board(board)?;
    let reached_2048 = board.iter().any(|value| *value >= TARGET);
    let has_empty = board.contains(&0);
    let has_merge = (0..SIZE).any(|row| {
        (0..SIZE - 1).any(|column| board[row * SIZE + column] == board[row * SIZE + column + 1])
    }) || (0..SIZE - 1).any(|row| {
        (0..SIZE).any(|column| board[row * SIZE + column] == board[(row + 1) * SIZE + column])
    });
    Ok(Status {
        reached_2048,
        game_over: !has_empty && !has_merge,
    })
}

pub fn new_game(seed: u64) -> Started {
    let mut board = vec![0; CELLS];
    let first = spawn(&mut board, seed).expect("an empty board has space");
    let second =
        spawn(&mut board, mix(seed ^ 0xa409_3822_299f_31d0)).expect("one tile leaves space");
    Started {
        board,
        spawned: vec![first, second],
        reached_2048: false,
        game_over: false,
    }
}

pub fn apply_move(board: &[u32], direction: Direction, seed: u64) -> Result<MoveResult, String> {
    let slide = slide(board, direction)?;
    let moved = slide.board != board;
    if !moved {
        let state = status(board)?;
        return Ok(MoveResult {
            board: board.to_vec(),
            moved: false,
            score_gain: 0,
            spawned: None,
            merged: Vec::new(),
            reached_2048: state.reached_2048,
            game_over: state.game_over,
        });
    }

    let mut next = slide.board;
    let spawned = spawn(&mut next, seed);
    let state = status(&next)?;
    Ok(MoveResult {
        board: next,
        moved: true,
        score_gain: slide.score_gain,
        spawned,
        merged: slide.merged,
        reached_2048: state.reached_2048,
        game_over: state.game_over,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn moved_without_spawn(board: &[u32], direction: Direction) -> Slide {
        slide(board, direction).unwrap()
    }

    #[test]
    fn a_tile_merges_only_once_per_move() {
        let board = [2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let result = moved_without_spawn(&board, Direction::Left);
        assert_eq!(&result.board[..4], [4, 4, 0, 0]);
        assert_eq!(result.score_gain, 8);
        assert_eq!(result.merged, [0, 1]);

        let board = [4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(
            &moved_without_spawn(&board, Direction::Left).board[..4],
            [8, 4, 0, 0]
        );
    }

    #[test]
    fn movement_works_in_every_direction() {
        let board = [2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 2];
        assert_eq!(
            moved_without_spawn(&board, Direction::Left).board,
            [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0]
        );
        assert_eq!(
            moved_without_spawn(&board, Direction::Up).board,
            [4, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        );
    }

    #[test]
    fn new_games_are_seeded_and_start_with_two_tiles() {
        let first = new_game(42);
        assert_eq!(first, new_game(42));
        assert_ne!(first.board, new_game(43).board);
        assert_eq!(first.board.iter().filter(|value| **value != 0).count(), 2);
        assert!(first.board.iter().all(|value| [0, 2, 4].contains(value)));
    }

    #[test]
    fn invalid_moves_do_not_spawn_tiles() {
        let board = [2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let result = apply_move(&board, Direction::Left, 7).unwrap();
        assert!(!result.moved);
        assert_eq!(result.board, board);
        assert_eq!(result.spawned, None);
        assert_eq!(result.score_gain, 0);
    }

    #[test]
    fn status_distinguishes_winning_and_blocked_positions() {
        let mut winning = vec![0; CELLS];
        winning[0] = TARGET;
        assert_eq!(
            status(&winning).unwrap(),
            Status {
                reached_2048: true,
                game_over: false
            }
        );

        let blocked = vec![2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
        assert!(status(&blocked).unwrap().game_over);
    }

    #[test]
    fn spawning_is_close_to_the_standard_ninety_ten_split() {
        let mut fours = 0;
        for seed in 0..1000 {
            let mut board = vec![0; CELLS];
            if spawn(&mut board, seed).unwrap().value == 4 {
                fours += 1;
            }
        }
        assert!((75..=125).contains(&fours), "observed {fours} four tiles");
    }
}
