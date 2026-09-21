use crate::game::{self, BISHOP, KING, KNIGHT, Move, PAWN, QUEEN, ROOK, State, WHITE};

const MATE: i32 = 1_000_000;
const INF: i32 = 2_000_000;
const MATE_BOUND: i32 = MATE - 10_000;
const MAX_PLY: usize = 96;
const TABLE_SIZE: usize = 1 << 15;
const PHASE_MAX: i32 = 24;
const QUIESCENCE_DEPTH: u8 = 4;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn now_ms() -> f64;
}

fn clock_ms() -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: the browser and Node loaders supply env.now_ms.
    unsafe {
        now_ms()
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
        START
            .get_or_init(std::time::Instant::now)
            .elapsed()
            .as_secs_f64()
            * 1_000.0
    }
}

#[derive(Clone, Copy, Debug)]
pub struct SearchConfig {
    pub node_budget: u32,
    pub max_depth: u8,
    pub seed: u64,
    pub root_band: i32,
    pub time_budget_ms: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SearchResult {
    pub selected: Option<Move>,
    pub score: i32,
    pub selected_score: i32,
    pub depth: u8,
    pub nodes: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Bound {
    Exact,
    Lower,
    Upper,
}

#[derive(Clone, Copy, Debug)]
struct Entry {
    key: u64,
    depth: u8,
    score: i32,
    bound: Bound,
    best: Move,
}

struct Searcher {
    budget: u32,
    deadline_ms: f64,
    nodes: u32,
    table: Vec<Option<Entry>>,
    killers: [[Option<Move>; 2]; MAX_PLY],
    history: [u32; 64 * 64],
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

fn value(kind: u8) -> i32 {
    match kind {
        PAWN => 100,
        KNIGHT => 320,
        BISHOP => 330,
        ROOK => 500,
        QUEEN => 900,
        KING => 20_000,
        _ => 0,
    }
}

fn phase_weight(kind: u8) -> i32 {
    match kind {
        KNIGHT | BISHOP => 1,
        ROOK => 2,
        QUEEN => 4,
        _ => 0,
    }
}

fn center(index: usize) -> i32 {
    let row = game::row_of(index) as i32;
    let column = game::column_of(index) as i32;
    14 - ((row * 2 - 7).abs() + (column * 2 - 7).abs())
}

fn pawn_progress(side: u8, row: usize) -> i32 {
    if side == WHITE {
        6_i32.saturating_sub(row as i32)
    } else {
        (row as i32 - 1).max(0)
    }
}

fn is_passed_pawn(state: &State, side: u8, index: usize) -> bool {
    let row = game::row_of(index);
    let column = game::column_of(index);
    !state
        .board
        .iter()
        .copied()
        .enumerate()
        .any(|(other, piece)| {
            if piece != game::piece(game::other(side), PAWN) {
                return false;
            }
            let other_row = game::row_of(other);
            game::column_of(other).abs_diff(column) <= 1
                && if side == WHITE {
                    other_row < row
                } else {
                    other_row > row
                }
        })
}

fn mobility(state: &State, index: usize, enemy_pawns: u64, enemy_king: usize) -> (i32, i32) {
    let moving = state.board[index];
    let side = game::side_of(moving);
    let kind = game::kind_of(moving);
    let directions: &[(i32, i32)] = match kind {
        KNIGHT => &[
            (-2, -1),
            (-2, 1),
            (-1, -2),
            (-1, 2),
            (1, -2),
            (1, 2),
            (2, -1),
            (2, 1),
        ],
        BISHOP => &[(-1, -1), (-1, 1), (1, -1), (1, 1)],
        ROOK => &[(-1, 0), (1, 0), (0, -1), (0, 1)],
        QUEEN => &[
            (-1, -1),
            (-1, 1),
            (1, -1),
            (1, 1),
            (-1, 0),
            (1, 0),
            (0, -1),
            (0, 1),
        ],
        _ => return (0, 0),
    };
    let mut mobility = 0;
    let mut pressure = 0;
    for &(dr, dc) in directions {
        let mut row = game::row_of(index) as i32 + dr;
        let mut column = game::column_of(index) as i32 + dc;
        while (0..8).contains(&row) && (0..8).contains(&column) {
            let target = game::at(row as usize, column as usize);
            let occupant = state.board[target];
            if occupant != 0 && game::side_of(occupant) == side {
                break;
            }
            if enemy_pawns & (1_u64 << target) == 0 {
                mobility += 1;
            }
            if game::row_of(target).abs_diff(game::row_of(enemy_king)) <= 1
                && game::column_of(target).abs_diff(game::column_of(enemy_king)) <= 1
            {
                pressure += 1;
            }
            if occupant != 0 || kind == KNIGHT {
                break;
            }
            row += dr;
            column += dc;
        }
    }
    (mobility, pressure)
}

pub fn evaluate(state: &State, side: u8) -> i32 {
    let mut middlegame = [0; 2];
    let mut endgame = [0; 2];
    let mut material = [0; 2];
    let mut pawn_files = [[0_u8; 8]; 2];
    let mut bishops = [0_u8; 2];
    let mut kings = [0_usize; 2];
    let mut has_major = [false; 2];
    let mut phase = 0;
    let mut pawn_attacks = [0_u64; 2];
    let mut undeveloped = [0; 2];

    for (index, piece) in state.board.iter().copied().enumerate() {
        if piece == 0 {
            continue;
        }
        let piece_side = game::side_of(piece) as usize;
        let kind = game::kind_of(piece);
        let row = game::row_of(index);
        let column = game::column_of(index);
        let central = center(index);
        let (base_mg, base_eg, positional_mg, positional_eg) = match kind {
            PAWN => {
                pawn_files[piece_side][column] += 1;
                let progress = pawn_progress(piece_side as u8, row);
                let attack_row = row as i32 + if piece_side == WHITE as usize { -1 } else { 1 };
                for dc in [-1, 1] {
                    let target_file = column as i32 + dc;
                    if (0..8).contains(&attack_row) && (0..8).contains(&target_file) {
                        pawn_attacks[piece_side] |=
                            1_u64 << game::at(attack_row as usize, target_file as usize);
                    }
                }
                let central_advance = progress.min(2)
                    * match column {
                        3 | 4 => 16,
                        2 | 5 => 8,
                        _ => 0,
                    };
                (
                    100,
                    120,
                    progress * 6 + central_advance + i32::from((2..=5).contains(&column)) * 4,
                    progress * 11 + i32::from((2..=5).contains(&column)) * 3,
                )
            }
            KNIGHT => (320, 300, central * 4, central * 3),
            BISHOP => {
                bishops[piece_side] += 1;
                (330, 320, central * 2, central * 2)
            }
            ROOK => {
                has_major[piece_side] = true;
                (500, 520, 0, central)
            }
            QUEEN => {
                has_major[piece_side] = true;
                (900, 900, central, central)
            }
            KING => {
                kings[piece_side] = index;
                (0, 0, 0, 0)
            }
            _ => (0, 0, 0, 0),
        };
        if matches!(kind, KNIGHT | BISHOP)
            && row == if piece_side == WHITE as usize { 7 } else { 0 }
        {
            undeveloped[piece_side] += 1;
            middlegame[piece_side] -= 12;
        }
        middlegame[piece_side] += base_mg + positional_mg;
        endgame[piece_side] += base_eg + positional_eg;
        if kind != KING {
            material[piece_side] += value(kind);
        }
        phase += phase_weight(kind);
    }

    for piece_side in 0..2 {
        for file in 0..8 {
            let count = i32::from(pawn_files[piece_side][file]);
            if count == 0 {
                continue;
            }
            if count > 1 {
                middlegame[piece_side] -= (count - 1) * 13;
                endgame[piece_side] -= (count - 1) * 9;
            }
            let isolated = (file == 0 || pawn_files[piece_side][file - 1] == 0)
                && (file == 7 || pawn_files[piece_side][file + 1] == 0);
            if isolated {
                middlegame[piece_side] -= count * 11;
                endgame[piece_side] -= count * 8;
            }
        }
        if bishops[piece_side] >= 2 {
            middlegame[piece_side] += 28;
            endgame[piece_side] += 36;
        }
    }

    for (index, piece) in state.board.iter().copied().enumerate() {
        if piece == 0 {
            continue;
        }
        let piece_side = game::side_of(piece) as usize;
        let kind = game::kind_of(piece);
        let file = game::column_of(index);
        let enemy = piece_side ^ 1;
        let (freedom, pressure) = mobility(state, index, pawn_attacks[enemy], kings[enemy]);
        let mobility_weight = match kind {
            KNIGHT => 4,
            BISHOP => 5,
            ROOK => 2,
            QUEEN => 1,
            _ => 0,
        };
        middlegame[piece_side] += freedom * mobility_weight + pressure * 5;
        endgame[piece_side] += freedom * mobility_weight;
        if kind == QUEEN
            && undeveloped[piece_side] > 1
            && index != game::at(if piece_side == WHITE as usize { 7 } else { 0 }, 3)
        {
            middlegame[piece_side] -= undeveloped[piece_side] * 12;
        }
        if kind == PAWN && pawn_attacks[piece_side] & (1_u64 << index) != 0 {
            middlegame[piece_side] += 8;
            endgame[piece_side] += 12;
        }
        if kind == PAWN && is_passed_pawn(state, piece_side as u8, index) {
            let progress = pawn_progress(piece_side as u8, game::row_of(index));
            middlegame[piece_side] += 14 + progress * 9;
            endgame[piece_side] += 24 + progress * 18;
        } else if kind == ROOK && pawn_files[piece_side][file] == 0 {
            middlegame[piece_side] += 10;
            endgame[piece_side] += 8;
            if pawn_files[piece_side ^ 1][file] == 0 {
                middlegame[piece_side] += 12;
                endgame[piece_side] += 8;
            }
        }
    }

    for piece_side in 0..2 {
        let king = kings[piece_side];
        let row = game::row_of(king) as i32;
        let column = game::column_of(king) as i32;
        let central = center(king);
        middlegame[piece_side] -= central * 4;
        endgame[piece_side] += central * 5;

        let home = if piece_side == WHITE as usize { 7 } else { 0 };
        if row == home && !(3..=5).contains(&column) {
            middlegame[piece_side] += 24;
        }
        let shelter_row = row + if piece_side == WHITE as usize { -1 } else { 1 };
        if (0..8).contains(&shelter_row) {
            for file in (column - 1).max(0)..=(column + 1).min(7) {
                if state.board[game::at(shelter_row as usize, file as usize)]
                    == game::piece(piece_side as u8, PAWN)
                {
                    middlegame[piece_side] += 11;
                } else {
                    middlegame[piece_side] -= 7;
                }
            }
        }
    }

    for stronger in 0..2 {
        let weaker = stronger ^ 1;
        if has_major[stronger]
            && material[stronger] - material[weaker] >= 400
            && material[weaker] <= 700
        {
            let enemy_king = kings[weaker];
            let king_distance = game::row_of(kings[stronger]).abs_diff(game::row_of(enemy_king))
                + game::column_of(kings[stronger]).abs_diff(game::column_of(enemy_king));
            let enemy_edge = (game::row_of(enemy_king) as i32 * 2 - 7)
                .abs()
                .max((game::column_of(enemy_king) as i32 * 2 - 7).abs());
            endgame[stronger] += enemy_edge * 12 + (14 - king_distance as i32) * 4;
        }
    }

    phase = phase.min(PHASE_MAX);
    let opponent = game::other(side) as usize;
    let side = side as usize;
    let mg = middlegame[side] - middlegame[opponent];
    let eg = endgame[side] - endgame[opponent];
    (mg * phase + eg * (PHASE_MAX - phase)) / PHASE_MAX
}

fn position_key(state: &State) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for piece in state.board {
        hash ^= u64::from(piece) + 1;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    for value in [
        u64::from(state.turn),
        u64::from(state.castling),
        (i32::from(state.en_passant) + 1) as u64,
        u64::from(state.halfmove),
    ] {
        hash ^= value + 1;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn repetition_key(state: &State) -> u64 {
    let mut identity = state.clone();
    identity.halfmove = 0;
    identity.en_passant = game::effective_en_passant(state);
    position_key(&identity)
}

fn is_capture(state: &State, mv: Move) -> bool {
    state.board[mv.to as usize] != 0 || mv.flags & game::FLAG_EN_PASSANT != 0
}

fn tactical_priority(state: &State, mv: Move) -> i32 {
    let moving = state.board[mv.from as usize];
    let captured = if mv.flags & game::FLAG_EN_PASSANT != 0 {
        game::piece(game::other(game::side_of(moving)), PAWN)
    } else {
        state.board[mv.to as usize]
    };
    let capture = if captured == 0 {
        0
    } else {
        value(game::kind_of(captured)) * 16 - value(game::kind_of(moving))
    };
    capture
        + if mv.promotion != 0 {
            value(mv.promotion) + 1_000
        } else {
            0
        }
}

fn ordered(
    state: &State,
    mut moves: Vec<Move>,
    best: Option<Move>,
    killers: [Option<Move>; 2],
    history: &[u32; 64 * 64],
) -> Vec<Move> {
    let score = |mv: Move| {
        if best == Some(mv) {
            3_000_000
        } else {
            let tactical = tactical_priority(state, mv);
            if tactical != 0 {
                2_000_000 + tactical
            } else if killers[0] == Some(mv) {
                1_500_000
            } else if killers[1] == Some(mv) {
                1_400_000
            } else {
                history[mv.from as usize * 64 + mv.to as usize].min(1_000_000) as i32
            }
        }
    };
    moves.sort_by_key(|mv| (std::cmp::Reverse(score(*mv)), mv.from, mv.to, mv.promotion));
    moves
}

fn tt_score(score: i32, ply: u8, storing: bool) -> i32 {
    if score >= MATE_BOUND {
        score
            + if storing {
                i32::from(ply)
            } else {
                -i32::from(ply)
            }
    } else if score <= -MATE_BOUND {
        score
            + if storing {
                -i32::from(ply)
            } else {
                i32::from(ply)
            }
    } else {
        score
    }
}

impl Searcher {
    fn enter(&mut self) -> Result<(), ()> {
        if self.nodes >= self.budget
            || (self.nodes.is_multiple_of(256) && clock_ms() >= self.deadline_ms)
        {
            return Err(());
        }
        self.nodes += 1;
        Ok(())
    }

    fn entry(&self, key: u64) -> Option<Entry> {
        self.table[key as usize & (TABLE_SIZE - 1)].filter(|entry| entry.key == key)
    }

    fn store(&mut self, entry: Entry) {
        let slot = &mut self.table[entry.key as usize & (TABLE_SIZE - 1)];
        if slot.is_none_or(|current| {
            current.depth < entry.depth
                || (current.depth == entry.depth
                    && (current.key != entry.key || entry.bound == Bound::Exact))
        }) {
            *slot = Some(entry);
        }
    }

    fn record_cutoff(&mut self, mv: Move, depth: u8, ply: u8) {
        let index = usize::from(ply).min(MAX_PLY - 1);
        if self.killers[index][0] != Some(mv) {
            self.killers[index][1] = self.killers[index][0];
            self.killers[index][0] = Some(mv);
        }
        let history = &mut self.history[mv.from as usize * 64 + mv.to as usize];
        *history = history.saturating_add(u32::from(depth).pow(2));
    }

    fn quiescence(
        &mut self,
        state: &State,
        mut alpha: i32,
        beta: i32,
        ply: u8,
        remaining: u8,
    ) -> Result<i32, ()> {
        self.enter()?;
        let moves = game::legal_moves(state, state.turn);
        if moves.is_empty() {
            return Ok(if game::is_in_check(state, state.turn) {
                -MATE + i32::from(ply)
            } else {
                0
            });
        }
        if state.halfmove >= 100 || game::insufficient_material(&state.board) {
            return Ok(0);
        }

        let checked = game::is_in_check(state, state.turn);
        if (remaining == 0 && !checked) || usize::from(ply) >= MAX_PLY - 1 {
            return Ok(evaluate(state, state.turn) - i32::from(checked) * 24);
        }
        if !checked {
            let standing = evaluate(state, state.turn);
            if standing >= beta {
                return Ok(standing);
            }
            alpha = alpha.max(standing);
        }

        let forcing = if checked {
            moves
        } else {
            moves
                .into_iter()
                .filter(|mv| is_capture(state, *mv) || mv.promotion != 0)
                .collect()
        };
        let forcing = ordered(state, forcing, None, [None; 2], &self.history);
        for mv in forcing {
            let score = -self.quiescence(
                &game::apply_move(state, mv),
                -beta,
                -alpha,
                ply + 1,
                remaining.saturating_sub(1),
            )?;
            if score >= beta {
                return Ok(score);
            }
            alpha = alpha.max(score);
        }
        Ok(alpha)
    }

    fn negamax(
        &mut self,
        state: &State,
        depth: u8,
        mut alpha: i32,
        mut beta: i32,
        ply: u8,
    ) -> Result<i32, ()> {
        if depth == 0 {
            return self.quiescence(state, alpha, beta, ply, QUIESCENCE_DEPTH);
        }
        self.enter()?;

        let key = position_key(state);
        let original_alpha = alpha;
        let original_beta = beta;
        let cached = self.entry(key);
        if let Some(entry) = cached.filter(|entry| entry.depth >= depth) {
            let score = tt_score(entry.score, ply, false);
            match entry.bound {
                Bound::Exact => return Ok(score),
                Bound::Lower => alpha = alpha.max(score),
                Bound::Upper => beta = beta.min(score),
            }
            if alpha >= beta {
                return Ok(score);
            }
        }

        let moves = game::legal_moves(state, state.turn);
        if moves.is_empty() {
            return Ok(if game::is_in_check(state, state.turn) {
                -MATE + i32::from(ply)
            } else {
                0
            });
        }
        if state.halfmove >= 100 || game::insufficient_material(&state.board) {
            return Ok(0);
        }
        let killers = self.killers[usize::from(ply).min(MAX_PLY - 1)];
        let moves = ordered(
            state,
            moves,
            cached.map(|entry| entry.best),
            killers,
            &self.history,
        );

        let checked = game::is_in_check(state, state.turn);
        let mut best_score = -INF;
        let mut best_move = moves[0];
        for (index, mv) in moves.into_iter().enumerate() {
            let next = game::apply_move(state, mv);
            let reduced = depth >= 3
                && index >= 4
                && !checked
                && !is_capture(state, mv)
                && mv.promotion == 0
                && !game::is_in_check(&next, next.turn);
            let mut score = if index == 0 {
                -self.negamax(&next, depth - 1, -beta, -alpha, ply + 1)?
            } else {
                -self.negamax(
                    &next,
                    depth - 1 - u8::from(reduced),
                    -alpha - 1,
                    -alpha,
                    ply + 1,
                )?
            };
            if reduced && score > alpha {
                score = -self.negamax(&next, depth - 1, -alpha - 1, -alpha, ply + 1)?;
            }
            if index != 0 && score > alpha && score < beta {
                score = -self.negamax(&next, depth - 1, -beta, -alpha, ply + 1)?;
            }
            if score > best_score {
                best_score = score;
                best_move = mv;
            }
            alpha = alpha.max(score);
            if alpha >= beta {
                if !is_capture(state, mv) && mv.promotion == 0 {
                    self.record_cutoff(mv, depth, ply);
                }
                break;
            }
        }

        let bound = if best_score <= original_alpha {
            Bound::Upper
        } else if best_score >= original_beta {
            Bound::Lower
        } else {
            Bound::Exact
        };
        self.store(Entry {
            key,
            depth,
            score: tt_score(best_score, ply, true),
            bound,
            best: best_move,
        });
        Ok(best_score)
    }
}

pub fn search(state: &State, config: SearchConfig, positions: &[State]) -> SearchResult {
    // Once only the defending king remains, precise progress matters more than
    // opening variety: small random detours can waste the fifty-move allowance.
    let bare_king = state.board.iter().copied().all(|piece| {
        piece == 0 || game::side_of(piece) == state.turn || game::kind_of(piece) == KING
    });
    let mating_major = state.board.iter().copied().any(|piece| {
        piece != 0
            && game::side_of(piece) == state.turn
            && matches!(game::kind_of(piece), ROOK | QUEEN)
    });
    let root_band = if bare_king && mating_major {
        0
    } else {
        config.root_band.max(0)
    };
    let mut root = ordered(
        state,
        game::legal_moves(state, state.turn),
        None,
        [None; 2],
        &[0; 64 * 64],
    );
    if root.is_empty() {
        return SearchResult {
            selected: None,
            score: 0,
            selected_score: 0,
            depth: 0,
            nodes: 0,
        };
    }
    for &mv in &root {
        let next = game::apply_move(state, mv);
        if game::legal_moves(&next, next.turn).is_empty() && game::is_in_check(&next, next.turn) {
            return SearchResult {
                selected: Some(mv),
                score: MATE - 1,
                selected_score: MATE - 1,
                depth: 1,
                nodes: root.len() as u32,
            };
        }
    }

    let mut counts = std::collections::HashMap::<u64, usize>::new();
    for previous in positions {
        *counts.entry(repetition_key(previous)).or_default() += 1;
    }
    let repeated: std::collections::HashMap<Move, usize> = root
        .iter()
        .map(|&mv| {
            let next = game::apply_move(state, mv);
            (mv, counts.get(&repetition_key(&next)).copied().unwrap_or(0))
        })
        .collect();
    let root_score = |mv: Move, score: i32| {
        if repeated[&mv] >= 2 {
            0
        } else if score.abs() >= MATE_BOUND {
            score
        } else {
            score - if repeated[&mv] > 0 { 12 } else { 0 }
        }
    };

    let mut searcher = Searcher {
        budget: config.node_budget.max(root.len() as u32),
        deadline_ms: if config.time_budget_ms > 0.0 {
            clock_ms() + config.time_budget_ms
        } else {
            f64::INFINITY
        },
        nodes: 0,
        table: vec![None; TABLE_SIZE],
        killers: [[None; 2]; MAX_PLY],
        history: [0; 64 * 64],
    };
    let mut completed_depth = 0;
    let mut scores: Vec<(Move, i32)> = root
        .iter()
        .copied()
        .map(|mv| {
            let next = game::apply_move(state, mv);
            (mv, root_score(mv, -evaluate(&next, next.turn)))
        })
        .collect();

    for depth in 1..=config.max_depth {
        let mut iteration = Vec::with_capacity(root.len());
        let mut aborted = false;
        let mut root_alpha = -INF;
        for (index, &mv) in root.iter().enumerate() {
            let next = game::apply_move(state, mv);
            let penalty = if repeated[&mv] > 0 { 12 } else { 0 };
            let result = if repeated[&mv] >= 2 {
                Ok(0)
            } else if index == 0 {
                searcher
                    .negamax(&next, depth - 1, -INF, INF, 1)
                    .map(|score| -score)
            } else {
                let threshold = root_alpha.saturating_sub(root_band) + penalty;
                searcher
                    .negamax(&next, depth - 1, -threshold, -threshold + 1, 1)
                    .map(|score| -score)
                    .and_then(|probe| {
                        if probe >= threshold {
                            searcher
                                .negamax(&next, depth - 1, -INF, INF, 1)
                                .map(|score| -score)
                        } else {
                            Ok(probe)
                        }
                    })
            };
            match result {
                Ok(score) => {
                    let score = root_score(mv, score);
                    root_alpha = root_alpha.max(score);
                    iteration.push((mv, score));
                }
                Err(()) => {
                    aborted = true;
                    break;
                }
            }
        }
        if aborted {
            break;
        }
        scores = iteration;
        scores.sort_by_key(|(mv, score)| (std::cmp::Reverse(*score), mv.from, mv.to, mv.promotion));
        root = scores.iter().map(|(mv, _)| *mv).collect();
        completed_depth = depth;
        if scores.iter().any(|(_, score)| *score >= MATE - 100) {
            break;
        }
    }

    scores.sort_by_key(|(mv, score)| (std::cmp::Reverse(*score), mv.from, mv.to, mv.promotion));
    let best = scores[0].1;
    let effective_band = if best.abs() >= MATE_BOUND {
        0
    } else {
        root_band
    };
    let eligible: Vec<_> = scores
        .iter()
        .filter(|(_, score)| *score >= best - effective_band)
        .collect();
    let selected = if eligible.len() == 1 || effective_band == 0 {
        eligible[0]
    } else {
        let mut random = SplitMix64(config.seed);
        let weight = |score: i32| u64::from((effective_band - (best - score) + 1) as u32).pow(2);
        let total: u64 = eligible.iter().map(|entry| weight(entry.1)).sum();
        let mut ticket = random.next() % total;
        eligible
            .iter()
            .copied()
            .find(|entry| {
                let tickets = weight(entry.1);
                if ticket < tickets {
                    true
                } else {
                    ticket -= tickets;
                    false
                }
            })
            .unwrap()
    };
    SearchResult {
        selected: Some(selected.0),
        score: best,
        selected_score: selected.1,
        depth: completed_depth,
        nodes: searcher.nodes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn search(state: &State, config: SearchConfig) -> SearchResult {
        super::search(state, config, &[])
    }

    fn bare() -> State {
        State {
            board: [0; 64],
            turn: WHITE,
            castling: 0,
            en_passant: -1,
            halfmove: 0,
            fullmove: 1,
        }
    }

    #[test]
    fn checked_horizon_searches_the_evasion_before_evaluating() {
        let mut state = bare();
        state.board[game::at(7, 4)] = game::piece(WHITE, KING);
        state.board[game::at(0, 4)] = game::piece(game::BLACK, KING);
        state.board[game::at(6, 4)] = game::piece(game::BLACK, ROOK);
        let mut searcher = Searcher {
            budget: 1_000,
            deadline_ms: f64::INFINITY,
            nodes: 0,
            table: vec![None; TABLE_SIZE],
            killers: [[None; 2]; MAX_PLY],
            history: [0; 64 * 64],
        };
        assert!(evaluate(&state, state.turn) < -400);
        let score = searcher.quiescence(&state, -INF, INF, 1, 0).unwrap();
        assert!(
            score >= -50,
            "the unprotected checking rook can be captured: {score}"
        );
    }

    #[test]
    fn seeded_selection_is_reproducible_and_bounded() {
        let state = State::initial();
        let config = SearchConfig {
            node_budget: 20_000,
            max_depth: 2,
            seed: 7,
            root_band: 80,
            time_budget_ms: 0.0,
        };
        let first = search(&state, config);
        let second = search(&state, config);
        assert_eq!(first, second);
        assert!(first.score - first.selected_score <= config.root_band);
        assert!(first.nodes <= config.node_budget);
    }

    #[test]
    fn evaluation_rewards_advanced_passed_pawns() {
        let mut state = bare();
        state.board[game::at(7, 4)] = game::piece(WHITE, KING);
        state.board[game::at(0, 4)] = game::piece(game::BLACK, KING);
        state.board[game::at(6, 0)] = game::piece(WHITE, PAWN);
        let starting = evaluate(&state, WHITE);
        state.board[game::at(6, 0)] = 0;
        state.board[game::at(2, 0)] = game::piece(WHITE, PAWN);
        assert!(evaluate(&state, WHITE) > starting + 50);
    }

    #[test]
    fn winning_endgame_rewards_an_active_king() {
        let mut state = bare();
        state.board[game::at(0, 0)] = game::piece(game::BLACK, KING);
        state.board[game::at(4, 4)] = game::piece(WHITE, QUEEN);
        state.board[game::at(7, 7)] = game::piece(WHITE, KING);
        let distant = evaluate(&state, WHITE);
        state.board[game::at(7, 7)] = 0;
        state.board[game::at(2, 2)] = game::piece(WHITE, KING);
        assert!(evaluate(&state, WHITE) > distant);
    }

    #[test]
    fn checkmate_precedes_the_fifty_move_draw_in_search() {
        let mut state = bare();
        state.turn = game::BLACK;
        state.halfmove = 100;
        state.board[game::at(0, 0)] = game::piece(game::BLACK, KING);
        state.board[game::at(2, 1)] = game::piece(WHITE, KING);
        state.board[game::at(1, 1)] = game::piece(WHITE, QUEEN);
        let mut searcher = Searcher {
            budget: 1_000,
            deadline_ms: f64::INFINITY,
            nodes: 0,
            table: vec![None; TABLE_SIZE],
            killers: [[None; 2]; MAX_PLY],
            history: [0; 64 * 64],
        };
        assert_eq!(searcher.negamax(&state, 1, -INF, INF, 1), Ok(-MATE + 1));
    }

    #[test]
    fn mate_in_one_ignores_seed() {
        let mut state = bare();
        state.board[game::at(0, 0)] = game::piece(game::BLACK, KING);
        state.board[game::at(2, 1)] = game::piece(WHITE, KING);
        state.board[game::at(1, 2)] = game::piece(WHITE, QUEEN);
        let a = search(
            &state,
            SearchConfig {
                node_budget: 10_000,
                max_depth: 3,
                seed: 1,
                root_band: 500,
                time_budget_ms: 0.0,
            },
        );
        let b = search(
            &state,
            SearchConfig {
                node_budget: 10_000,
                max_depth: 3,
                seed: 99,
                root_band: 500,
                time_budget_ms: 0.0,
            },
        );
        assert_eq!(a.selected, b.selected);
        assert!(a.score >= MATE - 1);
    }
}
