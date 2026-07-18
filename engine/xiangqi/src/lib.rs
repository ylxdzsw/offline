mod ai;
mod game;

use game::{Move, State};
use games_core::{DispatchError, DispatchResult, Value, json};

fn field<'a>(value: &'a Value, key: &str) -> Result<&'a Value, DispatchError> {
    value
        .get(key)
        .ok_or_else(|| DispatchError::new(format!("missing field {key}")))
}

fn side_from(value: &Value) -> Result<u8, DispatchError> {
    match value.as_str() {
        Some("r") => Ok(game::RED),
        Some("b") => Ok(game::BLACK),
        _ => Err(DispatchError::new("invalid Xiangqi side")),
    }
}

fn side_to(side: u8) -> &'static str {
    if side == game::RED { "r" } else { "b" }
}

fn kind_from(character: u8) -> Result<u8, DispatchError> {
    match character {
        b'K' => Ok(game::KING),
        b'A' => Ok(game::ADVISOR),
        b'E' => Ok(game::ELEPHANT),
        b'H' => Ok(game::HORSE),
        b'R' => Ok(game::ROOK),
        b'C' => Ok(game::CANNON),
        b'P' => Ok(game::PAWN),
        _ => Err(DispatchError::new("invalid Xiangqi piece type")),
    }
}

fn kind_to(kind: u8) -> char {
    match kind {
        game::KING => 'K',
        game::ADVISOR => 'A',
        game::ELEPHANT => 'E',
        game::HORSE => 'H',
        game::ROOK => 'R',
        game::CANNON => 'C',
        game::PAWN => 'P',
        _ => '?',
    }
}

fn piece_from(value: &Value) -> Result<u8, DispatchError> {
    if value.is_null() {
        return Ok(0);
    }
    let text = value
        .as_str()
        .ok_or_else(|| DispatchError::new("invalid Xiangqi piece"))?;
    let bytes = text.as_bytes();
    if bytes.len() != 2 {
        return Err(DispatchError::new("invalid Xiangqi piece"));
    }
    let side = match bytes[0] {
        b'r' => game::RED,
        b'b' => game::BLACK,
        _ => return Err(DispatchError::new("invalid Xiangqi piece side")),
    };
    Ok(game::piece(side, kind_from(bytes[1])?))
}

fn piece_to(value: u8) -> Value {
    if value == 0 {
        Value::Null
    } else {
        Value::String(format!(
            "{}{}",
            side_to(game::side_of(value)),
            kind_to(game::kind_of(value))
        ))
    }
}

fn board_from(value: &Value) -> Result<[u8; game::ROWS * game::COLS], DispatchError> {
    let values = value
        .as_array()
        .ok_or_else(|| DispatchError::new("board must be an array"))?;
    if values.len() != game::ROWS * game::COLS {
        return Err(DispatchError::new("Xiangqi board must contain 90 squares"));
    }
    let mut board = [0; game::ROWS * game::COLS];
    for (target, source) in board.iter_mut().zip(values) {
        *target = piece_from(source)?;
    }
    Ok(board)
}

fn board_to(board: &[u8; game::ROWS * game::COLS]) -> Value {
    Value::Array(board.iter().copied().map(piece_to).collect())
}

fn state_from(request: &Value) -> Result<State, DispatchError> {
    Ok(State {
        board: board_from(field(request, "board")?)?,
        turn: side_from(field(request, "side")?)?,
    })
}

fn move_to(state: &State, mv: Move) -> Value {
    json!({
        "from":mv.from,"to":mv.to,
        "piece":piece_to(state.board[mv.from as usize]),
        "captured":piece_to(state.board[mv.to as usize]),
    })
}

fn resolve_move(state: &State, value: &Value) -> Result<Move, DispatchError> {
    let from = field(value, "from")?
        .as_u64()
        .ok_or_else(|| DispatchError::new("invalid move from"))? as u8;
    let to = field(value, "to")?
        .as_u64()
        .ok_or_else(|| DispatchError::new("invalid move to"))? as u8;
    game::pseudo_moves_for(state, from as usize)
        .into_iter()
        .find(|mv| mv.to == to)
        .ok_or_else(|| DispatchError::new("illegal Xiangqi move"))
}

fn outcome_to(outcome: game::Outcome) -> Value {
    match outcome {
        game::Outcome::Playing => json!({"ended":false,"winner":null,"reason":"playing"}),
        game::Outcome::Check => json!({"ended":false,"winner":null,"reason":"check"}),
        game::Outcome::Checkmate(side) => {
            json!({"ended":true,"winner":side_to(side),"reason":"checkmate"})
        }
        game::Outcome::Stalemate(side) => {
            json!({"ended":true,"winner":side_to(side),"reason":"stalemate"})
        }
        game::Outcome::Repetition => json!({"ended":true,"winner":null,"reason":"repetition"}),
    }
}

fn dispatch(request: Value) -> DispatchResult {
    let op = field(&request, "op")?
        .as_str()
        .ok_or_else(|| DispatchError::new("op must be a string"))?;
    match op {
        "ping" => Ok(json!({"abi":games_core::ABI_VERSION,"game":"xiangqi"})),
        "initialBoard" => Ok(board_to(&State::initial().board)),
        "pseudoMovesFor" | "pseudoMoves" | "legalMoves" => {
            let state = state_from(&request)?;
            let moves = if op == "pseudoMovesFor" {
                game::pseudo_moves_for(
                    &state,
                    field(&request, "from")?
                        .as_u64()
                        .ok_or_else(|| DispatchError::new("invalid from"))?
                        as usize,
                )
            } else if op == "pseudoMoves" {
                game::pseudo_moves(&state, state.turn)
            } else {
                game::legal_moves(&state, state.turn)
            };
            Ok(Value::Array(
                moves.into_iter().map(|mv| move_to(&state, mv)).collect(),
            ))
        }
        "applyMove" => {
            let state = state_from(&request)?;
            let mv = resolve_move(&state, field(&request, "move")?)?;
            Ok(board_to(&game::apply_move(&state, mv).board))
        }
        "isInCheck" => {
            let state = state_from(&request)?;
            Ok(json!(game::is_in_check(&state, state.turn)))
        }
        "status" => {
            let state = state_from(&request)?;
            let repetitions = request
                .get("repetitions")
                .and_then(Value::as_u64)
                .unwrap_or(0) as u8;
            Ok(outcome_to(game::status(&state, repetitions)))
        }
        "search" => {
            let state = state_from(&request)?;
            let config = ai::SearchConfig {
                node_budget: request
                    .get("nodeBudget")
                    .and_then(Value::as_u64)
                    .unwrap_or(50_000) as u32,
                max_depth: request.get("maxDepth").and_then(Value::as_u64).unwrap_or(4) as u8,
                seed: request.get("seed").and_then(Value::as_u64).unwrap_or(0),
                root_band: request.get("rootBand").and_then(Value::as_i64).unwrap_or(0) as i32,
            };
            let result = ai::search(&state, config);
            Ok(json!({
                "move":result.selected.map(|mv|move_to(&state,mv)).unwrap_or(Value::Null),
                "score":result.score,"selectedScore":result.selected_score,
                "depth":result.depth,"nodes":result.nodes
            }))
        }
        _ => Err(DispatchError::new(format!(
            "unknown Xiangqi operation {op}"
        ))),
    }
}

games_core::export_json_abi!(dispatch);
