use crate::game::{BLACK, EMPTY, KOMI, Position, Record, WHITE};

const MAX_AREA: usize = 19 * 19;
const PASS: u16 = u16::MAX;

#[derive(Clone, Copy, Debug)]
pub struct SearchConfig {
    pub budget_ms: f64,
    pub simulation_limit: u32,
    pub widening: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SearchResult {
    pub selected: Option<u16>,
    pub simulations: u32,
    pub nodes: u32,
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

#[derive(Clone, Copy)]
struct BoardState {
    cells: [u8; MAX_AREA],
    turn: u8,
    ko: Option<u16>,
    passes: u8,
    hash: u64,
    last_move: Option<u16>,
}

#[derive(Clone)]
struct FastBoard {
    state: BoardState,
    history: Vec<u64>,
    size: u8,
}

#[derive(Clone, Copy, Debug)]
struct MoveInfo {
    captured: u16,
    liberties: u16,
    stones: u16,
}

#[derive(Clone, Copy)]
struct Candidate {
    index: u16,
    prior: f32,
}

struct Node {
    side: u8,
    children: Vec<usize>,
    unexpanded: Vec<Candidate>,
    initialized: bool,
    visits: u32,
    value_sum: f32,
    rave_visits: u32,
    rave_value_sum: f32,
    prior: f32,
    move_from_parent: Option<u16>,
}

impl Node {
    fn root(side: u8) -> Self {
        Self {
            side,
            children: Vec::new(),
            unexpanded: Vec::new(),
            initialized: false,
            visits: 0,
            value_sum: 0.0,
            rave_visits: 0,
            rave_value_sum: 0.0,
            prior: 0.0,
            move_from_parent: None,
        }
    }

    fn child(side: u8, candidate: Candidate) -> Self {
        Self {
            side,
            children: Vec::new(),
            unexpanded: Vec::new(),
            initialized: false,
            visits: 0,
            value_sum: 0.0,
            rave_visits: 0,
            rave_value_sum: 0.0,
            prior: candidate.prior,
            move_from_parent: Some(candidate.index),
        }
    }
}

pub const fn config(difficulty: &str) -> SearchConfig {
    match difficulty.as_bytes() {
        b"easy" => SearchConfig {
            budget_ms: 70.0,
            simulation_limit: 1_000,
            widening: 1.25,
        },
        b"hard" => SearchConfig {
            budget_ms: 720.0,
            simulation_limit: 20_000,
            widening: 2.0,
        },
        _ => SearchConfig {
            budget_ms: 260.0,
            simulation_limit: 6_000,
            widening: 1.6,
        },
    }
}

pub fn search<F: FnMut() -> bool>(
    position: &Position,
    config: SearchConfig,
    seed: u64,
    mut stopped: F,
) -> SearchResult {
    let root_board = FastBoard::from_position(position);
    let mut rng = SplitMix64(seed);
    let mut root_candidates = candidates(&root_board, &mut rng);
    if root_candidates.is_empty() {
        return SearchResult {
            selected: None,
            simulations: 0,
            nodes: 1,
        };
    }
    if let Some(index) = safe_capture(&root_board, &root_candidates) {
        return SearchResult {
            selected: Some(index),
            simulations: 0,
            nodes: 1,
        };
    }

    let played = position
        .records
        .iter()
        .filter(|record| matches!(record, Record::Play(_)))
        .count();
    if played < 2
        && let Some(index) = opening_move(position.size, &root_candidates, &mut rng)
    {
        return SearchResult {
            selected: Some(index),
            simulations: 0,
            nodes: 1,
        };
    }

    let mut root = Node::root(root_board.turn());
    root.initialized = true;
    root.unexpanded = std::mem::take(&mut root_candidates);
    let mut nodes = vec![root];
    let mut simulations = 0;

    while simulations < config.simulation_limit && !stopped() {
        run_simulation(&root_board, &mut nodes, config, &mut rng, &mut stopped);
        simulations += 1;
    }

    let root = &nodes[0];
    let selected = root
        .children
        .iter()
        .copied()
        .max_by(|left, right| {
            nodes[*left]
                .visits
                .cmp(&nodes[*right].visits)
                .then_with(|| nodes[*left].prior.total_cmp(&nodes[*right].prior))
                .then_with(|| {
                    nodes[*right]
                        .move_from_parent
                        .cmp(&nodes[*left].move_from_parent)
                })
        })
        .and_then(|index| nodes[index].move_from_parent)
        .or_else(|| nodes[0].unexpanded.last().map(|candidate| candidate.index));

    SearchResult {
        selected: selected.filter(|index| *index != PASS),
        simulations,
        nodes: nodes.len() as u32,
    }
}

fn safe_capture(board: &FastBoard, candidates: &[Candidate]) -> Option<u16> {
    candidates
        .iter()
        .filter_map(|candidate| {
            let info = board.probe(candidate.index)?;
            (info.captured > 0 && info.liberties > 1).then_some((
                candidate.index,
                info.captured,
                info.liberties,
            ))
        })
        .max_by_key(|(index, captured, liberties)| (*captured, *liberties, u16::MAX - *index))
        .map(|(index, _, _)| index)
}

fn run_simulation<F: FnMut() -> bool>(
    root_board: &FastBoard,
    nodes: &mut Vec<Node>,
    config: SearchConfig,
    rng: &mut SplitMix64,
    stopped: &mut F,
) {
    let mut board = root_board.clone();
    let mut path = vec![0_usize];
    let mut played_moves = Vec::with_capacity(board.area());

    loop {
        let node_index = *path.last().unwrap();
        if !nodes[node_index].initialized {
            nodes[node_index].unexpanded = candidates(&board, rng);
            nodes[node_index].initialized = true;
        }

        let allowed =
            (1.0 + config.widening * (nodes[node_index].visits.max(1) as f32).sqrt()) as usize;
        if !nodes[node_index].unexpanded.is_empty() && nodes[node_index].children.len() < allowed {
            let candidate = nodes[node_index].unexpanded.pop().unwrap();
            let side = board.turn();
            if board.play_candidate(candidate.index).is_none() {
                continue;
            }
            played_moves.push((side, candidate.index));
            let child_index = nodes.len();
            nodes.push(Node::child(board.turn(), candidate));
            nodes[node_index].children.push(child_index);
            path.push(child_index);
            break;
        }

        if nodes[node_index].children.is_empty() {
            break;
        }
        let Some(child_index) = select_child(node_index, nodes) else {
            break;
        };
        let Some(index) = nodes[child_index].move_from_parent else {
            break;
        };
        let side = board.turn();
        if board.play_candidate(index).is_none() {
            break;
        }
        played_moves.push((side, index));
        path.push(child_index);
    }

    let tree_moves = played_moves.len();
    playout(&mut board, rng, stopped, &mut played_moves);
    let (black, white) = board.area_score();
    let winner = if black > white {
        BLACK
    } else if white > black {
        WHITE
    } else {
        EMPTY
    };
    backpropagate(nodes, &path, &played_moves, tree_moves, winner);
}

fn select_child(parent_index: usize, nodes: &[Node]) -> Option<usize> {
    let parent = &nodes[parent_index];
    let logarithm = (parent.visits.max(1) as f32).ln();
    parent.children.iter().copied().max_by(|left, right| {
        let value = |index: usize| {
            let child = &nodes[index];
            let direct = if child.visits == 0 {
                0.5
            } else {
                1.0 - child.value_sum / child.visits as f32
            };
            let rave = if child.rave_visits == 0 {
                direct
            } else {
                child.rave_value_sum / child.rave_visits as f32
            };
            let visits = child.visits as f32;
            let rave_visits = child.rave_visits as f32;
            let beta = if rave_visits == 0.0 {
                0.0
            } else {
                rave_visits / (visits + rave_visits + visits * rave_visits / 300.0)
            };
            let blended = direct * (1.0 - beta) + rave * beta;
            let exploration = (1.25 * logarithm / (visits + 1.0)).sqrt();
            blended + exploration + child.prior * 0.012 / (visits + 1.0)
        };
        value(*left).total_cmp(&value(*right))
    })
}

fn backpropagate(
    nodes: &mut [Node],
    path: &[usize],
    played: &[(u8, u16)],
    tree_moves: usize,
    winner: u8,
) {
    let mut black_moves = [false; MAX_AREA];
    let mut white_moves = [false; MAX_AREA];
    for &(side, index) in &played[tree_moves..] {
        if index != PASS {
            if side == BLACK {
                black_moves[index as usize] = true;
            } else {
                white_moves[index as usize] = true;
            }
        }
    }

    for depth in (0..path.len()).rev() {
        let node_index = path[depth];
        let side = nodes[node_index].side;
        let value = result_for(winner, side);
        nodes[node_index].visits += 1;
        nodes[node_index].value_sum += value;
        let amaf = if side == BLACK {
            &black_moves
        } else {
            &white_moves
        };
        let children = nodes[node_index].children.clone();
        for child_index in children {
            if let Some(index) = nodes[child_index].move_from_parent
                && index != PASS
                && amaf[index as usize]
            {
                nodes[child_index].rave_visits += 1;
                nodes[child_index].rave_value_sum += value;
            }
        }
        if depth > 0 {
            let (move_side, index) = played[depth - 1];
            if index != PASS {
                if move_side == BLACK {
                    black_moves[index as usize] = true;
                } else {
                    white_moves[index as usize] = true;
                }
            }
        }
    }
}

fn result_for(winner: u8, side: u8) -> f32 {
    if winner == EMPTY {
        0.5
    } else if winner == side {
        1.0
    } else {
        0.0
    }
}

fn candidates(board: &FastBoard, rng: &mut SplitMix64) -> Vec<Candidate> {
    let mut moves = Vec::with_capacity(board.area());
    for index in 0..board.area() as u16 {
        if board.cell(index) != EMPTY {
            continue;
        }
        let Some(info) = board.probe(index) else {
            continue;
        };
        if board.is_true_eye(index, board.turn()) && info.captured == 0 {
            continue;
        }
        moves.push(Candidate {
            index,
            prior: move_prior(board, index, info) + rng.unit() * 0.001,
        });
    }
    if board.should_offer_pass() || moves.is_empty() {
        moves.push(Candidate {
            index: PASS,
            prior: if moves.is_empty() { 1_000.0 } else { -8.0 },
        });
    }
    moves.sort_by(|left, right| {
        left.prior
            .total_cmp(&right.prior)
            .then_with(|| right.index.cmp(&left.index))
    });
    moves
}

fn opening_move(size: u8, candidates: &[Candidate], rng: &mut SplitMix64) -> Option<u16> {
    let far = match size {
        9 => 6,
        13 => 9,
        19 => 15,
        _ => return None,
    };
    let near = if size == 9 { 2 } else { 3 };
    let middle = size / 2;
    let points = [
        (near, near),
        (far, far),
        (near, far),
        (far, near),
        (middle, middle),
    ];
    let available: Vec<_> = points
        .into_iter()
        .map(|(row, column)| row as u16 * size as u16 + column as u16)
        .filter(|index| candidates.iter().any(|candidate| candidate.index == *index))
        .collect();
    (!available.is_empty()).then(|| available[rng.index(available.len())])
}

fn move_prior(board: &FastBoard, index: u16, info: MoveInfo) -> f32 {
    let side = board.turn();
    let mut friendly = 0.0;
    let mut opponent = 0.0;
    for neighbor in board.neighbors(index).into_iter().flatten() {
        match board.cell(neighbor) {
            color if color == side => friendly += 1.0,
            EMPTY => {}
            _ => opponent += 1.0,
        }
    }
    let row = index / board.size as u16;
    let column = index % board.size as u16;
    let edge = row
        .min(column)
        .min(board.size as u16 - 1 - row)
        .min(board.size as u16 - 1 - column) as f32;
    let self_atari = info.liberties == 1 && info.captured == 0;
    info.captured as f32 * 80.0
        + info.liberties.min(8) as f32 * 3.0
        + info.stones.min(8) as f32
        + opponent * 6.0
        + friendly * 2.0
        + edge.min(3.0) * 2.0
        - if self_atari { 60.0 } else { 0.0 }
}

fn playout<F: FnMut() -> bool>(
    board: &mut FastBoard,
    rng: &mut SplitMix64,
    stopped: &mut F,
    played: &mut Vec<(u8, u16)>,
) {
    let limit = board.area() + board.area() / 2;
    for ply in 0..limit {
        if board.state.passes >= 2 || ply % 16 == 0 && stopped() {
            break;
        }
        let side = board.turn();
        let index = playout_move(board, rng).unwrap_or(PASS);
        board.play_candidate(index);
        played.push((side, index));
    }
}

fn playout_move(board: &FastBoard, rng: &mut SplitMix64) -> Option<u16> {
    let mut tactical = tactical_moves(board);
    tactical.sort_by(|left, right| {
        left.1
            .total_cmp(&right.1)
            .then_with(|| right.0.cmp(&left.0))
    });
    while !tactical.is_empty() {
        let window = tactical.len().min(3);
        let selected = tactical.len() - 1 - rng.index(window);
        let (index, _) = tactical.swap_remove(selected);
        if sensible_probe(board, index).is_some() {
            return Some(index);
        }
    }

    if let Some(last) = board.state.last_move {
        let row = last as i16 / board.size as i16;
        let column = last as i16 % board.size as i16;
        let mut local = Vec::with_capacity(8);
        for row_delta in -1..=1 {
            for column_delta in -1..=1 {
                if row_delta == 0 && column_delta == 0 {
                    continue;
                }
                let next_row = row + row_delta;
                let next_column = column + column_delta;
                if next_row >= 0
                    && next_column >= 0
                    && next_row < board.size as i16
                    && next_column < board.size as i16
                {
                    local.push(next_row as u16 * board.size as u16 + next_column as u16);
                }
            }
        }
        while !local.is_empty() {
            let index = local.swap_remove(rng.index(local.len()));
            if sensible_probe(board, index).is_some() && rng.unit() < 0.72 {
                return Some(index);
            }
        }
    }

    let area = board.area();
    for _ in 0..area.min(32) {
        let index = rng.index(area) as u16;
        if sensible_probe(board, index).is_some() {
            return Some(index);
        }
    }
    let start = rng.index(area);
    for offset in 0..area {
        let index = ((start + offset) % area) as u16;
        if sensible_probe(board, index).is_some() {
            return Some(index);
        }
    }
    None
}

fn sensible_probe(board: &FastBoard, index: u16) -> Option<MoveInfo> {
    if board.cell(index) != EMPTY {
        return None;
    }
    let info = board.probe(index)?;
    if board.is_true_eye(index, board.turn()) && info.captured == 0 {
        return None;
    }
    if info.liberties == 1 && info.captured == 0 && info.stones <= 2 {
        return None;
    }
    Some(info)
}

fn tactical_moves(board: &FastBoard) -> Vec<(u16, f32)> {
    let mut visited = [false; MAX_AREA];
    let mut seen_moves = [false; MAX_AREA];
    let mut result = Vec::new();
    for index in 0..board.area() as u16 {
        let color = board.cell(index);
        if color == EMPTY || visited[index as usize] {
            continue;
        }
        let (stones, liberties) = board.group(index);
        for stone in &stones {
            visited[*stone as usize] = true;
        }
        if liberties.len() != 1 {
            continue;
        }
        let liberty = liberties[0];
        if seen_moves[liberty as usize] {
            continue;
        }
        seen_moves[liberty as usize] = true;
        let weight = if color == board.turn() {
            700.0 + stones.len() as f32 * 28.0
        } else {
            900.0 + stones.len() as f32 * 42.0
        };
        result.push((liberty, weight));
    }
    result
}

impl FastBoard {
    fn from_position(position: &Position) -> Self {
        let mut board = Self {
            state: BoardState {
                cells: [EMPTY; MAX_AREA],
                turn: BLACK,
                ko: None,
                passes: 0,
                hash: 0,
                last_move: None,
            },
            history: vec![0],
            size: position.size,
        };
        for record in &position.records {
            match *record {
                Record::Play(index) => {
                    board.play(index).expect("validated position must replay");
                }
                Record::Pass => board.pass(),
                Record::Resign => break,
            }
        }
        board
    }

    fn area(&self) -> usize {
        self.size as usize * self.size as usize
    }

    fn turn(&self) -> u8 {
        self.state.turn
    }

    fn cell(&self, index: u16) -> u8 {
        self.state.cells[index as usize]
    }

    fn play_candidate(&mut self, index: u16) -> Option<MoveInfo> {
        if index == PASS {
            self.pass();
            Some(MoveInfo {
                captured: 0,
                liberties: 0,
                stones: 0,
            })
        } else {
            self.play(index)
        }
    }

    fn pass(&mut self) {
        self.state.turn = other(self.state.turn);
        self.state.ko = None;
        self.state.passes = self.state.passes.saturating_add(1);
        self.state.last_move = None;
    }

    fn play(&mut self, index: u16) -> Option<MoveInfo> {
        let info = apply_move(self.size, &mut self.state, &self.history, index)?;
        self.history.push(self.state.hash);
        Some(info)
    }

    fn probe(&self, index: u16) -> Option<MoveInfo> {
        let mut state = self.state;
        apply_move(self.size, &mut state, &self.history, index)
    }

    fn group(&self, index: u16) -> (Vec<u16>, Vec<u16>) {
        collect_group(self.size, &self.state, index)
    }

    fn neighbors(&self, index: u16) -> [Option<u16>; 4] {
        neighbors(self.size, index)
    }

    fn is_true_eye(&self, index: u16, side: u8) -> bool {
        if self.cell(index) != EMPTY {
            return false;
        }
        let row = index / self.size as u16;
        let column = index % self.size as u16;
        if self
            .neighbors(index)
            .into_iter()
            .flatten()
            .any(|neighbor| self.cell(neighbor) != side)
        {
            return false;
        }
        let mut friendly_corners = 0;
        let mut off_board = 0;
        for (row_delta, column_delta) in [(-1_i16, -1_i16), (-1, 1), (1, -1), (1, 1)] {
            let corner_row = row as i16 + row_delta;
            let corner_column = column as i16 + column_delta;
            if corner_row < 0
                || corner_column < 0
                || corner_row >= self.size as i16
                || corner_column >= self.size as i16
            {
                off_board += 1;
            } else {
                let corner = corner_row as u16 * self.size as u16 + corner_column as u16;
                friendly_corners += (self.cell(corner) == side) as u8;
            }
        }
        friendly_corners + off_board >= if off_board > 0 { 4 } else { 3 }
    }

    fn should_offer_pass(&self) -> bool {
        let occupied = self.state.cells[..self.area()]
            .iter()
            .filter(|cell| **cell != EMPTY)
            .count();
        self.state.passes > 0 || occupied * 5 >= self.area() * 4
    }

    fn area_score(&self) -> (f32, f32) {
        let mut black = 0_u16;
        let mut white = 0_u16;
        let mut visited = [false; MAX_AREA];
        for index in 0..self.area() as u16 {
            match self.cell(index) {
                BLACK => black += 1,
                WHITE => white += 1,
                EMPTY if !visited[index as usize] => {
                    let mut region = vec![index];
                    let mut cursor = 0;
                    let mut border = 0_u8;
                    visited[index as usize] = true;
                    while cursor < region.len() {
                        let point = region[cursor];
                        cursor += 1;
                        for neighbor in self.neighbors(point).into_iter().flatten() {
                            match self.cell(neighbor) {
                                EMPTY if !visited[neighbor as usize] => {
                                    visited[neighbor as usize] = true;
                                    region.push(neighbor);
                                }
                                BLACK => border |= 1,
                                WHITE => border |= 2,
                                _ => {}
                            }
                        }
                    }
                    if border == 1 {
                        black += region.len() as u16;
                    } else if border == 2 {
                        white += region.len() as u16;
                    }
                }
                _ => {}
            }
        }
        (black as f32, white as f32 + KOMI)
    }
}

fn apply_move(size: u8, state: &mut BoardState, history: &[u64], index: u16) -> Option<MoveInfo> {
    let area = size as usize * size as usize;
    if index as usize >= area || state.cells[index as usize] != EMPTY || state.ko == Some(index) {
        return None;
    }
    let original = *state;
    let side = state.turn;
    let opponent = other(side);
    state.cells[index as usize] = side;
    state.hash ^= stone_hash(index, side);

    let mut captured = Vec::new();
    let mut processed = [false; MAX_AREA];
    for neighbor in neighbors(size, index).into_iter().flatten() {
        if state.cells[neighbor as usize] != opponent || processed[neighbor as usize] {
            continue;
        }
        let (stones, liberties) = collect_group(size, state, neighbor);
        for stone in &stones {
            processed[*stone as usize] = true;
        }
        if liberties.is_empty() {
            for stone in stones {
                state.cells[stone as usize] = EMPTY;
                state.hash ^= stone_hash(stone, opponent);
                captured.push(stone);
            }
        }
    }

    let (stones, liberties) = collect_group(size, state, index);
    if liberties.is_empty() || !captured.is_empty() && history.contains(&state.hash) {
        *state = original;
        return None;
    }
    state.ko = if captured.len() == 1 && stones.len() == 1 && liberties.len() == 1 {
        Some(captured[0])
    } else {
        None
    };
    state.turn = opponent;
    state.passes = 0;
    state.last_move = Some(index);
    Some(MoveInfo {
        captured: captured.len() as u16,
        liberties: liberties.len() as u16,
        stones: stones.len() as u16,
    })
}

fn collect_group(size: u8, state: &BoardState, start: u16) -> (Vec<u16>, Vec<u16>) {
    let color = state.cells[start as usize];
    if color == EMPTY {
        return (Vec::new(), Vec::new());
    }
    let mut stones = vec![start];
    let mut liberties = Vec::new();
    let mut seen_stones = [false; MAX_AREA];
    let mut seen_liberties = [false; MAX_AREA];
    seen_stones[start as usize] = true;
    let mut cursor = 0;
    while cursor < stones.len() {
        let point = stones[cursor];
        cursor += 1;
        for neighbor in neighbors(size, point).into_iter().flatten() {
            match state.cells[neighbor as usize] {
                EMPTY if !seen_liberties[neighbor as usize] => {
                    seen_liberties[neighbor as usize] = true;
                    liberties.push(neighbor);
                }
                cell if cell == color && !seen_stones[neighbor as usize] => {
                    seen_stones[neighbor as usize] = true;
                    stones.push(neighbor);
                }
                _ => {}
            }
        }
    }
    (stones, liberties)
}

fn neighbors(size: u8, index: u16) -> [Option<u16>; 4] {
    let row = index / size as u16;
    let column = index % size as u16;
    [
        (row > 0).then(|| index - size as u16),
        (row + 1 < size as u16).then(|| index + size as u16),
        (column > 0).then(|| index - 1),
        (column + 1 < size as u16).then(|| index + 1),
    ]
}

fn other(side: u8) -> u8 {
    if side == BLACK { WHITE } else { BLACK }
}

fn stone_hash(index: u16, color: u8) -> u64 {
    let mut value =
        index as u64 ^ (color as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15) ^ 0x474f_4241_4e5f_4149;
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(row: u16, column: u16, size: u16) -> u16 {
        row * size + column
    }

    #[test]
    fn fast_board_matches_rules_for_capture_and_suicide() {
        let records = [
            Record::Play(at(0, 1, 9)),
            Record::Play(at(1, 1, 9)),
            Record::Play(at(1, 0, 9)),
            Record::Pass,
            Record::Play(at(1, 2, 9)),
            Record::Pass,
            Record::Play(at(2, 1, 9)),
        ];
        let position = Position::from_records(9, &records).unwrap();
        let board = FastBoard::from_position(&position);
        assert_eq!(board.state.cells[..board.area()], position.board(),);
        assert!(board.probe(at(1, 1, 9)).is_none());
    }

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
                simulation_limit: 16,
                widening: 1.5,
            },
            11,
            || false,
        );
        assert!(legal.contains(&result.selected.unwrap()));
        assert!(result.nodes > 2);
    }

    #[test]
    fn search_takes_an_immediate_capture() {
        let size = 9;
        let records = [
            Record::Play(at(1, 1, size)),
            Record::Play(at(1, 0, size)),
            Record::Play(at(8, 8, size)),
            Record::Play(at(1, 2, size)),
            Record::Play(at(8, 7, size)),
            Record::Play(at(0, 1, size)),
            Record::Play(at(7, 8, size)),
        ];
        let position = Position::from_records(size as u8, &records).unwrap();
        let result = search(
            &position,
            SearchConfig {
                budget_ms: 10.0,
                simulation_limit: 128,
                widening: 1.5,
            },
            19,
            || false,
        );
        assert_eq!(result.selected, Some(at(2, 1, size)));
    }

    #[test]
    fn fast_board_replays_a_seeded_game_like_the_rules_engine() {
        let mut rng = SplitMix64(0x7265_706c_6179);
        let mut records = Vec::new();
        for _ in 0..120 {
            let position = Position::from_records(9, &records).unwrap();
            let fast = FastBoard::from_position(&position);
            assert_eq!(fast.state.cells[..fast.area()], position.board());
            assert_eq!(fast.turn(), position.turn());
            assert_eq!(fast.area_score(), position.score());
            let legal = position.legal_moves();
            if legal.is_empty() {
                break;
            }
            records.push(Record::Play(legal[rng.index(legal.len())]));
        }
    }
}
