mod ai;
mod game;
mod wasm_abi {
    include!("../wasm_abi.rs");
}

use ai::{SearchConfig, SearchResult};
use game::{BLACK, Move, Outcome, Position, RED};
use serde_json::{Value, json};
use wasm_abi::{DispatchError, DispatchResult};

fn field<'a>(request: &'a Value, name: &str) -> Result<&'a Value, DispatchError> {
    request
        .get(name)
        .ok_or_else(|| DispatchError::new(format!("request is missing {name:?}")))
}

fn unsigned(request: &Value, name: &str) -> Result<u64, DispatchError> {
    field(request, name)?
        .as_u64()
        .ok_or_else(|| DispatchError::new(format!("{name:?} must be an unsigned integer")))
}

fn side(request: &Value, name: &str) -> Result<u8, DispatchError> {
    match unsigned(request, name)? {
        value if value == u64::from(BLACK) => Ok(BLACK),
        value if value == u64::from(RED) => Ok(RED),
        _ => Err(DispatchError::new(format!("{name:?} is not a valid side"))),
    }
}

fn position(request: &Value) -> Result<Position, DispatchError> {
    let values = field(request, "board")?
        .as_array()
        .ok_or("board must be an array")?;
    let board: Result<Vec<_>, _> = values
        .iter()
        .map(|value| {
            value
                .as_u64()
                .filter(|piece| *piece <= game::RED_KING as u64)
                .map(|piece| piece as u8)
                .ok_or("board contains an invalid piece")
        })
        .collect();
    Position::from_board(&board?).map_err(DispatchError::from)
}

fn move_json(mv: &Move) -> Value {
    json!({
        "from": mv.from,
        "path": mv.path,
        "captures": mv.captures,
        "promotes": mv.promotes,
    })
}

fn requested_move(value: &Value) -> Result<(u8, Vec<u8>), DispatchError> {
    let from = value
        .get("from")
        .and_then(Value::as_u64)
        .filter(|index| *index < 64)
        .ok_or("move.from must be a board index")? as u8;
    let path = value
        .get("path")
        .and_then(Value::as_array)
        .ok_or("move.path must be an array")?
        .iter()
        .map(|value| {
            value
                .as_u64()
                .filter(|index| *index < 64)
                .map(|index| index as u8)
                .ok_or_else(|| DispatchError::new("move.path contains an invalid board index"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    if path.is_empty() {
        return Err("move.path cannot be empty".into());
    }
    Ok((from, path))
}

fn resolve_move(position: Position, side: u8, value: &Value) -> Result<Move, DispatchError> {
    let (from, path) = requested_move(value)?;
    position
        .legal_moves(side)
        .into_iter()
        .find(|mv| mv.from == from && mv.path == path)
        .ok_or_else(|| DispatchError::new("illegal move"))
}

fn outcome_json(outcome: Outcome) -> Value {
    match outcome {
        Outcome::Playing => json!({"ended": false, "winner": null, "reason": "playing"}),
        Outcome::Win(side) => json!({"ended": true, "winner": side, "reason": "no-moves"}),
        Outcome::Repetition => {
            json!({"ended": true, "winner": null, "reason": "repetition"})
        }
        Outcome::FortyMove => {
            json!({"ended": true, "winner": null, "reason": "forty-move"})
        }
    }
}

fn search_json(result: SearchResult) -> Value {
    json!({
        "move": result.selected.as_ref().map(move_json),
        "score": result.score,
        "selectedScore": result.selected_score,
        "depth": result.depth,
        "nodes": result.nodes,
    })
}

fn dispatch(request: Value) -> DispatchResult {
    let operation = field(&request, "op")?
        .as_str()
        .ok_or("op must be a string")?;
    match operation {
        "initialBoard" => Ok(json!(&Position::initial().board()[..])),
        "legalMoves" => {
            let position = position(&request)?;
            let side = side(&request, "side")?;
            Ok(Value::Array(
                position.legal_moves(side).iter().map(move_json).collect(),
            ))
        }
        "applyMove" => {
            let position = position(&request)?;
            let side = side(&request, "side")?;
            let mv = resolve_move(position, side, field(&request, "move")?)?;
            Ok(json!(&position.apply_legal(&mv, side).board()[..]))
        }
        "positionKey" => {
            let position = position(&request)?;
            Ok(json!(position.position_key(side(&request, "side")?)))
        }
        "status" => {
            let position = position(&request)?;
            let turn = side(&request, "turn")?;
            let halfmove = request
                .get("halfmove")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                .min(u16::MAX as u64) as u16;
            let repetitions = request
                .get("repetitions")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                .min(u8::MAX as u64) as u8;
            Ok(outcome_json(position.outcome(turn, halfmove, repetitions)))
        }
        "evaluate" => {
            let position = position(&request)?;
            Ok(json!(ai::evaluate(position, side(&request, "side")?)))
        }
        "search" => {
            let position = position(&request)?;
            let side = side(&request, "side")?;
            let config = SearchConfig {
                node_budget: request
                    .get("nodeBudget")
                    .and_then(Value::as_u64)
                    .unwrap_or(180_000)
                    .min(u32::MAX as u64) as u32,
                max_depth: request
                    .get("maxDepth")
                    .and_then(Value::as_u64)
                    .unwrap_or(7)
                    .min(u8::MAX as u64) as u8,
                root_band: request
                    .get("rootBand")
                    .and_then(Value::as_i64)
                    .unwrap_or(24)
                    .clamp(0, i32::MAX as i64) as i32,
                seed: request.get("seed").and_then(Value::as_u64).unwrap_or(0),
            };
            Ok(search_json(ai::search(position, side, config)))
        }
        _ => Err(DispatchError::new(format!(
            "unknown checkers operation {operation:?}"
        ))),
    }
}

wasm_abi::export_json_abi!(dispatch);
