mod ai;
mod game;
mod wasm_abi {
    include!("../wasm_abi.rs");
}

use ai::{SearchConfig, SearchResult};
use game::{BLACK, Move, RED, Status};
use serde_json::{Value, json};
use wasm_abi::{DispatchError, DispatchResult};

fn field<'a>(request: &'a Value, name: &str) -> Result<&'a Value, DispatchError> {
    request
        .get(name)
        .ok_or_else(|| DispatchError::new(format!("request is missing {name:?}")))
}

fn side(request: &Value, name: &str) -> Result<u8, DispatchError> {
    match field(request, name)?
        .as_u64()
        .ok_or_else(|| DispatchError::new(format!("{name:?} must be a number")))?
    {
        v if v == u64::from(RED) => Ok(RED),
        v if v == u64::from(BLACK) => Ok(BLACK),
        _ => Err(DispatchError::new(format!("{name:?} is not a valid side"))),
    }
}

fn board(request: &Value) -> Result<Vec<u8>, DispatchError> {
    let arr = field(request, "board")?
        .as_array()
        .ok_or("board must be an array")?;
    if arr.len() != game::ROWS * game::COLS {
        return Err(DispatchError::new(format!(
            "board must have {} cells, got {}",
            game::ROWS * game::COLS,
            arr.len()
        )));
    }
    arr.iter()
        .map(|v| {
            v.as_u64()
                .filter(|&n| n <= 16)
                .map(|n| n as u8)
                .ok_or_else(|| DispatchError::new("board contains an invalid cell value"))
        })
        .collect()
}

fn move_json(mv: Move) -> Value {
    json!({"from": mv.from, "to": mv.to})
}

fn status_json(s: &Status) -> Value {
    json!({"ended": s.ended, "winner": s.winner, "reason": s.reason})
}

fn search_json(result: SearchResult) -> Value {
    json!({
        "move": result.selected.map(move_json),
        "score": result.score,
        "selectedScore": result.selected_score,
        "depth": result.depth,
        "nodes": result.nodes,
    })
}

fn dispatch(request: Value) -> DispatchResult {
    let op = field(&request, "op")?
        .as_str()
        .ok_or("op must be a string")?;
    match op {
        "initialBoard" => Ok(json!(game::initial_board())),
        "legalMoves" => {
            let b = board(&request)?;
            let s = side(&request, "side")?;
            Ok(Value::Array(
                game::legal_moves(&b, s)
                    .into_iter()
                    .map(move_json)
                    .collect(),
            ))
        }
        "movesFor" => {
            let b = board(&request)?;
            let from = field(&request, "from")?
                .as_u64()
                .filter(|&n| n < (game::ROWS * game::COLS) as u64)
                .ok_or("from must be a valid board index")? as usize;
            Ok(Value::Array(
                game::moves_for(&b, from)
                    .into_iter()
                    .map(move_json)
                    .collect(),
            ))
        }
        "applyMove" => {
            let b = board(&request)?;
            let mv_val = field(&request, "move")?;
            let from = mv_val
                .get("from")
                .and_then(Value::as_u64)
                .filter(|&n| n < 63)
                .ok_or("move.from must be a board index")? as u8;
            let to = mv_val
                .get("to")
                .and_then(Value::as_u64)
                .filter(|&n| n < 63)
                .ok_or("move.to must be a board index")? as u8;
            let mv = Move { from, to };
            game::apply_move(&b, mv)
                .map(|next| json!(next))
                .map_err(DispatchError::from)
        }
        "status" => {
            let b = board(&request)?;
            let turn = side(&request, "turn")?;
            Ok(status_json(&game::status(&b, turn)))
        }
        "evaluate" => {
            let b = board(&request)?;
            let s = side(&request, "side")?;
            Ok(json!(ai::evaluate(&b, s)))
        }
        "search" => {
            let b = board(&request)?;
            let s = side(&request, "side")?;
            let config = SearchConfig {
                node_budget: request
                    .get("nodeBudget")
                    .and_then(Value::as_u64)
                    .unwrap_or(200_000)
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
            Ok(search_json(ai::search(&b, s, config)))
        }
        _ => Err(DispatchError::new(format!(
            "unknown doushouqi operation {op:?}"
        ))),
    }
}

wasm_abi::export_json_abi!(dispatch);
