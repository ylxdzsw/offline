use serde::Serialize;

pub const WIDTH: usize = 4;
pub const HEIGHT: usize = 5;
pub const CELLS: usize = WIDTH * HEIGHT;
pub const PIECES: usize = 10;
pub const CAO_CAO: usize = 0;
pub const GOAL: u8 = 13;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct Slide {
    pub from: u8,
    pub to: u8,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Layout {
    pub id: &'static str,
    pub positions: [u8; PIECES],
}

pub fn piece_size(piece: usize) -> Option<(usize, usize)> {
    match piece {
        0 => Some((2, 2)),
        1 => Some((2, 1)),
        2..=5 => Some((1, 2)),
        6..=9 => Some((1, 1)),
        _ => None,
    }
}

pub fn layout(id: &str) -> Result<Layout, String> {
    let layout = match id {
        "easy" => Layout {
            id: "easy",
            positions: [8, 18, 0, 1, 2, 3, 10, 11, 14, 16],
        },
        "medium" => Layout {
            id: "medium",
            positions: [5, 13, 0, 3, 8, 15, 1, 2, 17, 18],
        },
        "hard" => Layout {
            id: "hard",
            positions: [1, 9, 0, 3, 8, 11, 13, 14, 16, 19],
        },
        _ => return Err(format!("unknown layout {id:?}")),
    };
    validate(&layout.positions)?;
    Ok(layout)
}

pub fn layouts() -> Vec<Layout> {
    ["easy", "medium", "hard"]
        .into_iter()
        .map(|id| layout(id).expect("built-in layouts are valid"))
        .collect()
}

fn cells(position: u8, size: (usize, usize)) -> Result<Vec<usize>, String> {
    let position = usize::from(position);
    if position >= CELLS {
        return Err("piece position is outside the board".to_owned());
    }
    let row = position / WIDTH;
    let column = position % WIDTH;
    let (width, height) = size;
    if column + width > WIDTH || row + height > HEIGHT {
        return Err("piece extends outside the board".to_owned());
    }
    Ok((row..row + height)
        .flat_map(|y| (column..column + width).map(move |x| y * WIDTH + x))
        .collect())
}

pub fn validate(positions: &[u8]) -> Result<(), String> {
    if positions.len() != PIECES {
        return Err(format!("positions must contain {PIECES} pieces"));
    }
    let mut occupied = [false; CELLS];
    for (piece, position) in positions.iter().copied().enumerate() {
        for cell in cells(
            position,
            piece_size(piece).expect("piece index is in range"),
        )? {
            if occupied[cell] {
                return Err("pieces overlap".to_owned());
            }
            occupied[cell] = true;
        }
    }
    Ok(())
}

fn destination(position: u8, dx: i8, dy: i8, distance: usize) -> Option<u8> {
    let row = i16::from(position) / WIDTH as i16;
    let column = i16::from(position) % WIDTH as i16;
    let next_row = row + i16::from(dy) * distance as i16;
    let next_column = column + i16::from(dx) * distance as i16;
    if next_row < 0 || next_column < 0 {
        return None;
    }
    u8::try_from(next_row * WIDTH as i16 + next_column).ok()
}

pub fn legal_moves(positions: &[u8], piece: usize) -> Result<Vec<Slide>, String> {
    validate(positions)?;
    let size = piece_size(piece).ok_or_else(|| "piece index is outside the board".to_owned())?;
    let from = positions[piece];
    let own_cells = cells(from, size)?;
    let mut occupied = [false; CELLS];
    for (other, position) in positions.iter().copied().enumerate() {
        if other == piece {
            continue;
        }
        for cell in cells(
            position,
            piece_size(other).expect("validated piece index is in range"),
        )? {
            occupied[cell] = true;
        }
    }

    let mut moves = Vec::new();
    for (dx, dy) in [(0, -1), (1, 0), (0, 1), (-1, 0)] {
        for distance in 1..CELLS {
            let Some(to) = destination(from, dx, dy, distance) else {
                break;
            };
            let Ok(target_cells) = cells(to, size) else {
                break;
            };
            if target_cells.iter().any(|cell| occupied[*cell]) {
                break;
            }
            if target_cells != own_cells {
                moves.push(Slide { from, to });
            }
        }
    }
    Ok(moves)
}

pub fn apply_move(positions: &[u8], piece: usize, to: u8) -> Result<[u8; PIECES], String> {
    let legal = legal_moves(positions, piece)?;
    if !legal.iter().any(|slide| slide.to == to) {
        return Err("illegal slide".to_owned());
    }
    let mut next: [u8; PIECES] = positions
        .try_into()
        .map_err(|_| format!("positions must contain {PIECES} pieces"))?;
    next[piece] = to;
    Ok(next)
}

pub fn is_solved(positions: &[u8]) -> bool {
    positions.len() == PIECES && positions[CAO_CAO] == GOAL && validate(positions).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_layouts_are_valid() {
        for layout in layouts() {
            validate(&layout.positions).unwrap();
            assert!(!is_solved(&layout.positions));
        }
    }

    #[test]
    fn a_clear_exit_accepts_the_winning_slide() {
        let positions = [9, 1, 0, 3, 8, 11, 5, 6, 16, 19];
        assert_eq!(
            legal_moves(&positions, CAO_CAO).unwrap(),
            [Slide { from: 9, to: 13 }]
        );
        assert!(is_solved(&apply_move(&positions, CAO_CAO, GOAL).unwrap()));
    }

    #[test]
    fn moves_may_slide_more_than_one_cell_but_never_jump() {
        let positions = layout("hard").unwrap().positions;
        let soldier = 8;
        let moves = legal_moves(&positions, soldier).unwrap();
        assert!(moves.contains(&Slide { from: 16, to: 17 }));
        assert!(moves.contains(&Slide { from: 16, to: 18 }));
        assert!(!moves.contains(&Slide { from: 16, to: 19 }));
    }

    #[test]
    fn invalid_positions_and_moves_are_rejected() {
        let mut positions = layout("hard").unwrap().positions;
        positions[9] = positions[8];
        assert_eq!(validate(&positions).unwrap_err(), "pieces overlap");
        assert_eq!(
            apply_move(&layout("hard").unwrap().positions, 0, 13).unwrap_err(),
            "illegal slide"
        );
    }
}
