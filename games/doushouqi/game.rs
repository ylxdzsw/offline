pub const ROWS: usize = 9;
pub const COLS: usize = 7;
pub const EMPTY: u8 = 0;
pub const RED: u8 = 1;
pub const BLACK: u8 = 2;

pub const RAT: u8 = 1;
pub const CAT: u8 = 2;
pub const DOG: u8 = 3;
pub const WOLF: u8 = 4;
pub const LEOPARD: u8 = 5;
pub const TIGER: u8 = 6;
pub const LION: u8 = 7;
pub const ELEPHANT: u8 = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Move {
    pub from: u8,
    pub to: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Status {
    pub ended: bool,
    pub winner: Option<u8>,
    pub reason: String,
}

pub const fn at(row: usize, col: usize) -> usize {
    row * COLS + col
}

pub const fn row_of(index: usize) -> usize {
    index / COLS
}

pub const fn col_of(index: usize) -> usize {
    index % COLS
}

pub const fn inside(row: i32, col: i32) -> bool {
    row >= 0 && row < ROWS as i32 && col >= 0 && col < COLS as i32
}

pub const fn side_of(piece: u8) -> u8 {
    if piece == 0 {
        0
    } else if piece <= 8 {
        RED
    } else {
        BLACK
    }
}

pub const fn rank_of(piece: u8) -> u8 {
    if piece == 0 {
        0
    } else if piece <= 8 {
        piece
    } else {
        piece - 8
    }
}

pub const fn piece_for(side: u8, rank: u8) -> u8 {
    if side == RED { rank } else { rank + 8 }
}

pub const fn other(side: u8) -> u8 {
    if side == RED { BLACK } else { RED }
}

pub const fn den(side: u8) -> usize {
    if side == RED { at(8, 3) } else { at(0, 3) }
}

pub const fn traps(side: u8) -> [usize; 3] {
    if side == RED {
        [at(7, 3), at(8, 2), at(8, 4)]
    } else {
        [at(1, 3), at(0, 2), at(0, 4)]
    }
}

pub fn is_river(index: usize) -> bool {
    let row = row_of(index);
    let col = col_of(index);
    (3..=5).contains(&row) && matches!(col, 1 | 2 | 4 | 5)
}

pub fn effective_rank(piece: u8, index: usize) -> u8 {
    if piece == EMPTY {
        return 0;
    }
    let side = side_of(piece);
    let enemy_traps = traps(other(side));
    if enemy_traps.contains(&index) {
        0
    } else {
        rank_of(piece)
    }
}

pub fn can_capture(board: &[u8], from: usize, to: usize) -> bool {
    let attacker = board[from];
    let defender = board[to];
    if attacker == EMPTY || defender == EMPTY {
        return false;
    }
    if side_of(attacker) == side_of(defender) {
        return false;
    }
    if is_river(from) != is_river(to) {
        return false;
    }
    let att_eff = rank_of(attacker);
    let def_eff = effective_rank(defender, to);
    // Apply Rat/Elephant special rule only when neither piece is neutralized by a trap
    if att_eff > 0 && def_eff > 0 {
        let att_rank = rank_of(attacker);
        let def_rank = rank_of(defender);
        if att_rank == RAT && def_rank == ELEPHANT {
            return !is_river(from); // Rat captures Elephant only from land
        }
        if att_rank == ELEPHANT && def_rank == RAT {
            return false; // Elephant cannot capture Rat
        }
    }
    att_eff >= def_eff
}

fn river_jump(board: &[u8], from: usize, dr: i32, dc: i32) -> Option<usize> {
    let row = row_of(from) as i32;
    let col = col_of(from) as i32;
    let r1 = row + dr;
    let c1 = col + dc;
    if !inside(r1, c1) {
        return None;
    }
    if !is_river(at(r1 as usize, c1 as usize)) {
        return None;
    }
    let mut r = r1;
    let mut c = c1;
    while inside(r, c) {
        let idx = at(r as usize, c as usize);
        if !is_river(idx) {
            break;
        }
        if board[idx] != EMPTY {
            return None; // any piece in the river blocks the jump
        }
        r += dr;
        c += dc;
    }
    if !inside(r, c) {
        return None;
    }
    Some(at(r as usize, c as usize))
}

pub fn moves_for(board: &[u8], from: usize) -> Vec<Move> {
    let piece = board[from];
    if piece == EMPTY {
        return Vec::new();
    }
    let side = side_of(piece);
    let rank = rank_of(piece);
    let row = row_of(from) as i32;
    let col = col_of(from) as i32;
    let my_den = den(side);
    let mut targets: Vec<usize> = Vec::new();

    for (dr, dc) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
        let nr = row + dr;
        let nc = col + dc;
        if !inside(nr, nc) {
            continue;
        }
        let target = at(nr as usize, nc as usize);
        if target == my_den {
            continue;
        }
        if is_river(target) && rank != RAT {
            continue;
        }
        let occupant = board[target];
        if occupant != EMPTY {
            if side_of(occupant) == side {
                continue;
            }
            if !can_capture(board, from, target) {
                continue;
            }
        }
        targets.push(target);
    }

    if rank == TIGER || rank == LION {
        for (dr, dc) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
            if let Some(target) = river_jump(board, from, dr, dc) {
                if target == my_den {
                    continue;
                }
                let occupant = board[target];
                if occupant != EMPTY {
                    if side_of(occupant) == side {
                        continue;
                    }
                    if !can_capture(board, from, target) {
                        continue;
                    }
                }
                targets.push(target);
            }
        }
    }

    targets.sort_unstable();
    targets.dedup();
    targets
        .into_iter()
        .map(|to| Move {
            from: from as u8,
            to: to as u8,
        })
        .collect()
}

pub fn legal_moves(board: &[u8], side: u8) -> Vec<Move> {
    let mut moves: Vec<Move> = board
        .iter()
        .enumerate()
        .filter(|&(_, &p)| side_of(p) == side)
        .flat_map(|(i, _)| moves_for(board, i))
        .collect();
    moves.sort_unstable();
    moves
}

pub fn apply_move(board: &[u8], mv: Move) -> Result<Vec<u8>, String> {
    if !moves_for(board, mv.from as usize).contains(&mv) {
        return Err("illegal move".to_owned());
    }
    let mut next = board.to_vec();
    next[mv.to as usize] = next[mv.from as usize];
    next[mv.from as usize] = EMPTY;
    Ok(next)
}

pub(crate) fn terminal(
    board: &[u8],
    turn: u8,
    repetitions: u8,
    has_moves: bool,
) -> Option<(Option<u8>, &'static str)> {
    if side_of(board[den(RED)]) == BLACK {
        return Some((Some(BLACK), "den"));
    }
    if side_of(board[den(BLACK)]) == RED {
        return Some((Some(RED), "den"));
    }
    if !board.iter().any(|&p| side_of(p) == RED) {
        return Some((Some(BLACK), "no-pieces"));
    }
    if !board.iter().any(|&p| side_of(p) == BLACK) {
        return Some((Some(RED), "no-pieces"));
    }
    if !has_moves {
        return Some((Some(other(turn)), "no-moves"));
    }
    if repetitions >= 3 {
        return Some((None, "repetition"));
    }
    None
}

pub fn status(board: &[u8], turn: u8, repetitions: u8) -> Status {
    if let Some((winner, reason)) = terminal(board, turn, 0, true) {
        return Status {
            ended: true,
            winner,
            reason: reason.to_owned(),
        };
    }
    if let Some((winner, reason)) = terminal(
        board,
        turn,
        repetitions,
        !legal_moves(board, turn).is_empty(),
    ) {
        return Status {
            ended: true,
            winner,
            reason: reason.to_owned(),
        };
    }
    Status {
        ended: false,
        winner: None,
        reason: "playing".to_owned(),
    }
}

pub fn initial_board() -> Vec<u8> {
    let mut board = vec![EMPTY; ROWS * COLS];
    board[at(8, 0)] = piece_for(RED, TIGER);
    board[at(8, 6)] = piece_for(RED, LION);
    board[at(7, 1)] = piece_for(RED, CAT);
    board[at(7, 5)] = piece_for(RED, DOG);
    board[at(6, 0)] = piece_for(RED, ELEPHANT);
    board[at(6, 2)] = piece_for(RED, WOLF);
    board[at(6, 4)] = piece_for(RED, LEOPARD);
    board[at(6, 6)] = piece_for(RED, RAT);
    board[at(0, 0)] = piece_for(BLACK, LION);
    board[at(0, 6)] = piece_for(BLACK, TIGER);
    board[at(1, 1)] = piece_for(BLACK, DOG);
    board[at(1, 5)] = piece_for(BLACK, CAT);
    board[at(2, 0)] = piece_for(BLACK, RAT);
    board[at(2, 2)] = piece_for(BLACK, LEOPARD);
    board[at(2, 4)] = piece_for(BLACK, WOLF);
    board[at(2, 6)] = piece_for(BLACK, ELEPHANT);
    board
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_board_has_the_standard_layout() {
        let board = initial_board();
        let expected = [
            (at(8, 0), RED, TIGER),
            (at(8, 6), RED, LION),
            (at(7, 1), RED, CAT),
            (at(7, 5), RED, DOG),
            (at(6, 0), RED, ELEPHANT),
            (at(6, 2), RED, WOLF),
            (at(6, 4), RED, LEOPARD),
            (at(6, 6), RED, RAT),
            (at(0, 0), BLACK, LION),
            (at(0, 6), BLACK, TIGER),
            (at(1, 1), BLACK, DOG),
            (at(1, 5), BLACK, CAT),
            (at(2, 0), BLACK, RAT),
            (at(2, 2), BLACK, LEOPARD),
            (at(2, 4), BLACK, WOLF),
            (at(2, 6), BLACK, ELEPHANT),
        ];
        for (index, side, rank) in expected {
            assert_eq!(board[index], piece_for(side, rank));
        }
        assert_eq!(
            board.iter().filter(|&&p| p != EMPTY).count(),
            expected.len()
        );
        assert_eq!(board[den(RED)], EMPTY);
        assert_eq!(board[den(BLACK)], EMPTY);
        for &t in &traps(RED) {
            assert_eq!(board[t], EMPTY);
        }
        for &t in &traps(BLACK) {
            assert_eq!(board[t], EMPTY);
        }
        assert!(
            board
                .iter()
                .enumerate()
                .all(|(i, &p)| !is_river(i) || p == EMPTY)
        );
    }

    #[test]
    fn rat_captures_elephant_from_land_only() {
        // Rat in river (col 1 is a valid river column)
        let mut board = vec![EMPTY; ROWS * COLS];
        board[at(4, 1)] = piece_for(RED, RAT);
        board[at(3, 1)] = piece_for(BLACK, ELEPHANT);
        assert!(!can_capture(&board, at(4, 1), at(3, 1)));

        // Rat on land can capture Elephant
        let mut board2 = vec![EMPTY; ROWS * COLS];
        board2[at(6, 0)] = piece_for(RED, RAT);
        board2[at(5, 0)] = piece_for(BLACK, ELEPHANT);
        assert!(can_capture(&board2, at(6, 0), at(5, 0)));
    }

    #[test]
    fn rat_captures_only_within_the_same_terrain() {
        let mut board = vec![EMPTY; ROWS * COLS];
        board[at(3, 1)] = piece_for(RED, RAT);
        board[at(3, 0)] = piece_for(BLACK, RAT);
        assert!(!can_capture(&board, at(3, 1), at(3, 0)));
        assert!(!can_capture(&board, at(3, 0), at(3, 1)));

        board[at(3, 0)] = EMPTY;
        board[at(3, 2)] = piece_for(BLACK, RAT);
        assert!(can_capture(&board, at(3, 1), at(3, 2)));
    }

    #[test]
    fn elephant_cannot_capture_rat_but_can_capture_trapped_rat() {
        let mut board = vec![EMPTY; ROWS * COLS];
        board[at(6, 0)] = piece_for(RED, ELEPHANT);
        board[at(5, 0)] = piece_for(BLACK, RAT);
        assert!(!can_capture(&board, at(6, 0), at(5, 0)));

        // Black Rat on Red's trap at (8,2) — eff rank 0
        let mut board2 = vec![EMPTY; ROWS * COLS];
        board2[at(7, 2)] = piece_for(RED, ELEPHANT);
        board2[at(8, 2)] = piece_for(BLACK, RAT);
        assert!(can_capture(&board2, at(7, 2), at(8, 2)));
    }

    #[test]
    fn tiger_jumps_over_clear_river_and_is_blocked_by_rat() {
        let mut board = vec![EMPTY; ROWS * COLS];
        board[at(2, 1)] = piece_for(RED, TIGER);
        let moves = moves_for(&board, at(2, 1));
        assert!(
            moves.iter().any(|m| m.to == at(6, 1) as u8),
            "tiger should jump to (6,1)"
        );

        board[at(4, 1)] = piece_for(BLACK, RAT);
        let blocked = moves_for(&board, at(2, 1));
        assert!(
            !blocked.iter().any(|m| m.to == at(6, 1) as u8),
            "jump blocked by rat"
        );
    }

    #[test]
    fn trap_neutralizes_elephant_allowing_rat_capture() {
        let mut board = vec![EMPTY; ROWS * COLS];
        // Black Elephant in Red's trap at (8,4) — eff rank 0
        board[at(8, 4)] = piece_for(BLACK, ELEPHANT);
        board[at(7, 4)] = piece_for(RED, RAT);
        // Even from land Rat (rank 1) beats trapped Elephant (eff rank 0): 1 >= 0
        assert!(can_capture(&board, at(7, 4), at(8, 4)));
    }

    #[test]
    fn trapped_piece_recovers_rank_when_capturing_out() {
        let mut board = vec![EMPTY; ROWS * COLS];
        board[at(1, 3)] = piece_for(RED, WOLF);
        board[at(2, 3)] = piece_for(BLACK, RAT);
        assert!(can_capture(&board, at(1, 3), at(2, 3)));
    }

    #[test]
    fn piece_cannot_enter_own_den() {
        let mut board = vec![EMPTY; ROWS * COLS];
        board[at(7, 3)] = piece_for(RED, WOLF); // one step from Red den
        let moves = moves_for(&board, at(7, 3));
        assert!(!moves.iter().any(|m| m.to == den(RED) as u8));
    }

    #[test]
    fn apply_move_illegal_is_rejected() {
        let board = initial_board();
        assert!(
            apply_move(
                &board,
                Move {
                    from: at(0, 0) as u8,
                    to: at(8, 8) as u8
                }
            )
            .is_err()
        );
    }

    #[test]
    fn entering_enemy_den_wins() {
        let mut board = vec![EMPTY; ROWS * COLS];
        board[at(1, 3)] = piece_for(RED, WOLF); // one step above Black den, on Black trap
        let next = apply_move(
            &board,
            Move {
                from: at(1, 3) as u8,
                to: at(0, 3) as u8,
            },
        )
        .unwrap();
        let s = status(&next, BLACK, 0);
        assert!(s.ended);
        assert_eq!(s.winner, Some(RED));
        assert_eq!(s.reason, "den");
    }

    #[test]
    fn third_position_repetition_is_a_draw() {
        let board = initial_board();
        let s = status(&board, RED, 3);
        assert!(s.ended);
        assert_eq!(s.winner, None);
        assert_eq!(s.reason, "repetition");
    }

    #[test]
    fn no_moves_wins_before_repetition_is_considered() {
        let mut board = vec![EMPTY; ROWS * COLS];
        board[at(0, 0)] = piece_for(BLACK, CAT);
        board[at(0, 1)] = piece_for(RED, ELEPHANT);
        board[at(1, 0)] = piece_for(RED, ELEPHANT);
        let s = status(&board, BLACK, 3);
        assert!(s.ended);
        assert_eq!(s.winner, Some(RED));
        assert_eq!(s.reason, "no-moves");
    }
}
