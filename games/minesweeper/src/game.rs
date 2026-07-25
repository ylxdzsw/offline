use std::collections::VecDeque;

use serde::{Deserialize, Serialize};

const MINE: u8 = 9;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub width: usize,
    pub height: usize,
    pub mine_count: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub difficulty: String,
    pub width: usize,
    pub height: usize,
    pub mine_count: usize,
    pub seed: u64,
    pub cells: Vec<u8>,
    pub revealed: Vec<bool>,
    pub flagged: Vec<bool>,
    pub started: bool,
    pub outcome: Option<String>,
    pub exploded: Option<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub board: Board,
    pub changed: Vec<usize>,
    pub flag_mismatch: bool,
}

pub fn config(difficulty: &str) -> Result<Config, String> {
    match difficulty {
        "easy" => Ok(Config {
            width: 9,
            height: 9,
            mine_count: 10,
        }),
        "medium" => Ok(Config {
            width: 16,
            height: 16,
            mine_count: 40,
        }),
        // The classic expert board transposed for a portrait-first application.
        "hard" => Ok(Config {
            width: 16,
            height: 30,
            mine_count: 99,
        }),
        _ => Err(format!("unknown difficulty {difficulty:?}")),
    }
}

pub fn new_game(difficulty: &str, seed: u64) -> Result<Board, String> {
    let config = config(difficulty)?;
    let total = config.width * config.height;
    Ok(Board {
        difficulty: difficulty.to_owned(),
        width: config.width,
        height: config.height,
        mine_count: config.mine_count,
        seed,
        cells: Vec::new(),
        revealed: vec![false; total],
        flagged: vec![false; total],
        started: false,
        outcome: None,
        exploded: None,
    })
}

fn total(board: &Board) -> usize {
    board.width * board.height
}

fn neighbours(width: usize, height: usize, index: usize) -> impl Iterator<Item = usize> {
    let row = index / width;
    let column = index % width;
    let row_start = row.saturating_sub(1);
    let row_end = (row + 1).min(height - 1);
    let column_start = column.saturating_sub(1);
    let column_end = (column + 1).min(width - 1);
    (row_start..=row_end).flat_map(move |near_row| {
        (column_start..=column_end).filter_map(move |near_column| {
            let near = near_row * width + near_column;
            (near != index).then_some(near)
        })
    })
}

fn expected_cells(board: &Board) -> Vec<u8> {
    let mut cells = board
        .cells
        .iter()
        .map(|cell| u8::from(*cell == MINE) * MINE)
        .collect::<Vec<_>>();
    for (index, cell) in cells.iter_mut().enumerate() {
        if *cell == MINE {
            continue;
        }
        *cell = neighbours(board.width, board.height, index)
            .filter(|near| board.cells[*near] == MINE)
            .count() as u8;
    }
    cells
}

pub fn validate(board: &Board) -> Result<(), String> {
    let expected = config(&board.difficulty)?;
    if board.width != expected.width
        || board.height != expected.height
        || board.mine_count != expected.mine_count
    {
        return Err("board dimensions do not match its difficulty".to_owned());
    }
    let cell_count = total(board);
    if board.revealed.len() != cell_count || board.flagged.len() != cell_count {
        return Err("board visibility arrays have the wrong length".to_owned());
    }
    if board
        .revealed
        .iter()
        .zip(&board.flagged)
        .any(|(revealed, flagged)| *revealed && *flagged)
    {
        return Err("a cell cannot be both revealed and flagged".to_owned());
    }
    if board.flagged.iter().filter(|flag| **flag).count() > board.mine_count {
        return Err("board has more flags than mines".to_owned());
    }
    if board.started {
        if board.cells.len() != cell_count {
            return Err("a started board must contain every cell".to_owned());
        }
        if board.cells.iter().filter(|cell| **cell == MINE).count() != board.mine_count {
            return Err("board has the wrong number of mines".to_owned());
        }
        if board.cells.iter().any(|cell| *cell > MINE) || expected_cells(board) != board.cells {
            return Err("board mine counts are inconsistent".to_owned());
        }
    } else if !board.cells.is_empty() || board.revealed.contains(&true) {
        return Err("an unstarted board cannot contain mines or revealed cells".to_owned());
    }
    match board.outcome.as_deref() {
        None if board.exploded.is_none()
            && (!board.started
                || (0..cell_count)
                    .filter(|index| board.cells[*index] != MINE)
                    .any(|index| !board.revealed[index])) => {}
        Some("lost") => {
            let exploded = board
                .exploded
                .ok_or_else(|| "a lost board must identify the exploded mine".to_owned())?;
            if exploded >= cell_count
                || board.cells.get(exploded) != Some(&MINE)
                || !board.revealed[exploded]
            {
                return Err("the exploded cell must be a revealed mine".to_owned());
            }
        }
        Some("won")
            if board.exploded.is_none()
                && (0..cell_count)
                    .filter(|index| board.cells[*index] != MINE)
                    .all(|index| board.revealed[index]) => {}
        Some(value) => return Err(format!("invalid board outcome {value:?}")),
        None => return Err("an unfinished board cannot have an exploded mine".to_owned()),
    }
    Ok(())
}

fn next_random(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
    let mut value = *state;
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

fn generate(board: &mut Board, safe_index: usize) {
    let cell_count = total(board);
    let mut safe = vec![false; cell_count];
    safe[safe_index] = true;
    for index in neighbours(board.width, board.height, safe_index) {
        safe[index] = true;
    }
    let mut candidates = (0..cell_count)
        .filter(|index| !safe[*index])
        .collect::<Vec<_>>();
    let mut random = board.seed ^ (safe_index as u64).wrapping_mul(0xd6e8_feb8_6659_fd93);
    for end in (1..candidates.len()).rev() {
        let swap = (next_random(&mut random) % (end as u64 + 1)) as usize;
        candidates.swap(end, swap);
    }
    board.cells = vec![0; cell_count];
    for index in candidates.into_iter().take(board.mine_count) {
        board.cells[index] = MINE;
    }
    board.cells = expected_cells(board);
    board.started = true;
}

fn reveal_area(board: &mut Board, start: usize, changed: &mut Vec<usize>) {
    let mut queue = VecDeque::from([start]);
    while let Some(index) = queue.pop_front() {
        if board.revealed[index] || board.flagged[index] || board.cells[index] == MINE {
            continue;
        }
        board.revealed[index] = true;
        changed.push(index);
        if board.cells[index] == 0 {
            for near in neighbours(board.width, board.height, index) {
                if !board.revealed[near] && !board.flagged[near] && board.cells[near] != MINE {
                    queue.push_back(near);
                }
            }
        }
    }
}

fn finish_if_won(board: &mut Board) {
    let won = (0..total(board))
        .filter(|index| board.cells[*index] != MINE)
        .all(|index| board.revealed[index]);
    if won {
        board.outcome = Some("won".to_owned());
        for index in 0..total(board) {
            if board.cells[index] == MINE {
                board.flagged[index] = true;
            }
        }
    }
}

fn result(board: Board, changed: Vec<usize>, flag_mismatch: bool) -> ActionResult {
    ActionResult {
        board,
        changed,
        flag_mismatch,
    }
}

fn check_index(board: &Board, index: usize) -> Result<(), String> {
    validate(board)?;
    if index >= total(board) {
        return Err("cell index is out of range".to_owned());
    }
    Ok(())
}

pub fn reveal(mut board: Board, index: usize) -> Result<ActionResult, String> {
    check_index(&board, index)?;
    if board.outcome.is_some() || board.flagged[index] || board.revealed[index] {
        return Ok(result(board, Vec::new(), false));
    }
    if !board.started {
        generate(&mut board, index);
    }
    let mut changed = Vec::new();
    if board.cells[index] == MINE {
        board.revealed[index] = true;
        board.exploded = Some(index);
        board.outcome = Some("lost".to_owned());
        changed.push(index);
    } else {
        reveal_area(&mut board, index, &mut changed);
        finish_if_won(&mut board);
    }
    Ok(result(board, changed, false))
}

pub fn toggle_flag(mut board: Board, index: usize) -> Result<ActionResult, String> {
    check_index(&board, index)?;
    if board.outcome.is_some() || board.revealed[index] {
        return Ok(result(board, Vec::new(), false));
    }
    if board.flagged[index] {
        board.flagged[index] = false;
    } else if board.flagged.iter().filter(|flag| **flag).count() < board.mine_count {
        board.flagged[index] = true;
    } else {
        return Ok(result(board, Vec::new(), false));
    }
    Ok(result(board, vec![index], false))
}

pub fn chord(mut board: Board, index: usize) -> Result<ActionResult, String> {
    check_index(&board, index)?;
    if board.outcome.is_some()
        || !board.started
        || !board.revealed[index]
        || board.cells[index] == 0
        || board.cells[index] == MINE
    {
        return Ok(result(board, Vec::new(), false));
    }
    let adjacent = neighbours(board.width, board.height, index).collect::<Vec<_>>();
    let flagged = adjacent.iter().filter(|near| board.flagged[**near]).count();
    if flagged != board.cells[index] as usize {
        return Ok(result(board, Vec::new(), true));
    }
    let mut changed = Vec::new();
    for near in adjacent {
        if board.revealed[near] || board.flagged[near] {
            continue;
        }
        if board.cells[near] == MINE {
            board.revealed[near] = true;
            board.exploded = Some(near);
            board.outcome = Some("lost".to_owned());
            changed.push(near);
            break;
        }
        reveal_area(&mut board, near, &mut changed);
    }
    if board.outcome.is_none() {
        finish_if_won(&mut board);
    }
    Ok(result(board, changed, false))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mine_indices(board: &Board) -> Vec<usize> {
        board
            .cells
            .iter()
            .enumerate()
            .filter_map(|(index, cell)| (*cell == MINE).then_some(index))
            .collect()
    }

    #[test]
    fn difficulties_match_the_classic_board_sizes() {
        assert_eq!(
            config("easy").unwrap(),
            Config {
                width: 9,
                height: 9,
                mine_count: 10
            }
        );
        assert_eq!(config("medium").unwrap().mine_count, 40);
        assert_eq!(
            config("hard").unwrap().width * config("hard").unwrap().height,
            480
        );
        assert_eq!(config("hard").unwrap().mine_count, 99);
    }

    #[test]
    fn first_reveal_has_a_safe_neighbourhood_and_is_deterministic() {
        let first = reveal(new_game("medium", 42).unwrap(), 119).unwrap().board;
        let repeated = reveal(new_game("medium", 42).unwrap(), 119).unwrap().board;
        assert_eq!(first, repeated);
        assert_eq!(first.cells[119], 0);
        assert!(neighbours(first.width, first.height, 119).all(|index| first.cells[index] != MINE));
        assert_eq!(mine_indices(&first).len(), 40);
        assert!(first.revealed.iter().filter(|value| **value).count() >= 9);
        validate(&first).unwrap();
    }

    #[test]
    fn different_seeds_make_different_minefields() {
        let first = reveal(new_game("easy", 1).unwrap(), 40).unwrap().board;
        let second = reveal(new_game("easy", 2).unwrap(), 40).unwrap().board;
        assert_ne!(mine_indices(&first), mine_indices(&second));
    }

    #[test]
    fn flags_are_reversible_but_reveals_are_not() {
        let board = new_game("easy", 7).unwrap();
        let flagged = toggle_flag(board, 0).unwrap().board;
        assert!(flagged.flagged[0]);
        let still_covered = reveal(flagged.clone(), 0).unwrap().board;
        assert!(!still_covered.revealed[0]);
        let unflagged = toggle_flag(still_covered, 0).unwrap().board;
        assert!(!unflagged.flagged[0]);
        let revealed = reveal(unflagged, 0).unwrap().board;
        assert!(revealed.revealed[0]);
        assert!(toggle_flag(revealed, 0).unwrap().changed.is_empty());
    }

    #[test]
    fn revealing_a_mine_loses_the_game() {
        let started = reveal(new_game("easy", 99).unwrap(), 40).unwrap().board;
        let mine = mine_indices(&started)[0];
        let lost = reveal(started, mine).unwrap().board;
        assert_eq!(lost.outcome.as_deref(), Some("lost"));
        assert_eq!(lost.exploded, Some(mine));
        assert!(lost.revealed[mine]);
        validate(&lost).unwrap();
    }

    #[test]
    fn revealing_every_safe_cell_wins_and_marks_the_remaining_mines() {
        let mut board = reveal(new_game("easy", 314).unwrap(), 40).unwrap().board;
        for index in 0..total(&board) {
            if board.cells[index] != MINE && !board.revealed[index] {
                board = reveal(board, index).unwrap().board;
            }
        }
        assert_eq!(board.outcome.as_deref(), Some("won"));
        assert_eq!(
            board.flagged.iter().filter(|flag| **flag).count(),
            board.mine_count
        );
        validate(&board).unwrap();
    }

    #[test]
    fn correct_chord_opens_neighbours_and_wrong_flags_can_explode() {
        let mut board = reveal(new_game("easy", 123).unwrap(), 40).unwrap().board;
        let numbered = (0..total(&board))
            .find(|index| {
                board.revealed[*index]
                    && board.cells[*index] > 0
                    && neighbours(board.width, board.height, *index)
                        .any(|near| !board.revealed[near] && board.cells[near] != MINE)
            })
            .unwrap();
        let nearby_mines = neighbours(board.width, board.height, numbered)
            .filter(|near| board.cells[*near] == MINE)
            .collect::<Vec<_>>();
        for mine in nearby_mines {
            board = toggle_flag(board, mine).unwrap().board;
        }
        let before = board.revealed.iter().filter(|value| **value).count();
        let chorded = chord(board, numbered).unwrap();
        assert!(!chorded.flag_mismatch);
        assert!(
            chorded
                .board
                .revealed
                .iter()
                .filter(|value| **value)
                .count()
                > before
        );

        let mut wrong = reveal(new_game("easy", 456).unwrap(), 40).unwrap().board;
        let target = (0..total(&wrong))
            .find(|index| {
                wrong.revealed[*index]
                    && wrong.cells[*index] > 0
                    && neighbours(wrong.width, wrong.height, *index)
                        .filter(|near| !wrong.revealed[*near] && wrong.cells[*near] != MINE)
                        .count()
                        >= wrong.cells[*index] as usize
            })
            .unwrap();
        let needed = wrong.cells[target] as usize;
        let false_flags = neighbours(wrong.width, wrong.height, target)
            .filter(|near| !wrong.revealed[*near] && wrong.cells[*near] != MINE)
            .take(needed)
            .collect::<Vec<_>>();
        assert_eq!(false_flags.len(), needed);
        for index in false_flags {
            wrong = toggle_flag(wrong, index).unwrap().board;
        }
        let chorded = chord(wrong, target).unwrap().board;
        assert_eq!(chorded.outcome.as_deref(), Some("lost"));
    }

    #[test]
    fn chord_requires_the_matching_number_of_flags() {
        let board = reveal(new_game("easy", 17).unwrap(), 40).unwrap().board;
        let numbered = (0..total(&board))
            .find(|index| board.revealed[*index] && board.cells[*index] > 0)
            .unwrap();
        let result = chord(board, numbered).unwrap();
        assert!(result.flag_mismatch);
        assert!(result.changed.is_empty());
    }
}
