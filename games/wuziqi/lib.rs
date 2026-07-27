mod game;
mod search;
mod wasm_abi {
    include!("../wasm_abi.rs");
}

#[cfg(not(target_arch = "wasm32"))]
use std::sync::OnceLock;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

use game::{BLACK, Position, Status, WHITE};
use search::SearchResult;
use serde_json::{Value, json};
use wasm_abi::{DispatchError, DispatchResult};

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn now_ms() -> f64;
}

fn clock_ms() -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: the page and worker loaders always provide env.now_ms.
    unsafe {
        now_ms()
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        static STARTED: OnceLock<Instant> = OnceLock::new();
        STARTED.get_or_init(Instant::now).elapsed().as_secs_f64() * 1_000.0
    }
}

fn field<'a>(request: &'a Value, name: &str) -> Result<&'a Value, DispatchError> {
    request
        .get(name)
        .ok_or_else(|| DispatchError::new(format!("request is missing {name:?}")))
}

fn number(request: &Value, name: &str) -> Result<u64, DispatchError> {
    field(request, name)?
        .as_u64()
        .ok_or_else(|| DispatchError::new(format!("{name:?} must be an unsigned integer")))
}

fn index(request: &Value, name: &str) -> Result<u16, DispatchError> {
    let value = number(request, name)?;
    if value >= game::CELLS as u64 {
        return Err(DispatchError::new(format!(
            "{name:?} must identify a board intersection"
        )));
    }
    Ok(value as u16)
}

fn side(request: &Value, name: &str) -> Result<u8, DispatchError> {
    match number(request, name)? {
        value if value == BLACK as u64 => Ok(BLACK),
        value if value == WHITE as u64 => Ok(WHITE),
        _ => Err(DispatchError::new(format!(
            "{name:?} must be Black or White"
        ))),
    }
}

fn stone(request: &Value, name: &str) -> Result<u8, DispatchError> {
    match number(request, name)? {
        value if value <= WHITE as u64 => Ok(value as u8),
        _ => Err(DispatchError::new(format!(
            "{name:?} must be Empty, Black, or White"
        ))),
    }
}

fn board(request: &Value) -> Result<Position, DispatchError> {
    let values = field(request, "board")?
        .as_array()
        .ok_or("board must be an array")?;
    let board: Result<Vec<_>, _> = values
        .iter()
        .map(|value| {
            value
                .as_u64()
                .filter(|cell| *cell <= WHITE as u64)
                .map(|cell| cell as u8)
                .ok_or("board contains an invalid cell")
        })
        .collect();
    Position::from_board(&board?).map_err(DispatchError::from)
}

fn status_json(status: Status) -> Value {
    json!({"ended": status.ended, "winner": status.winner, "reason": status.reason})
}

fn search_json(result: SearchResult) -> Value {
    json!({"move": result.selected, "depth": result.depth, "nodes": result.nodes})
}

fn dispatch(request: Value) -> DispatchResult {
    let operation = field(&request, "op")?
        .as_str()
        .ok_or("op must be a string")?;
    match operation {
        "initialBoard" => Ok(json!(&Position::initial().board()[..])),
        "applyMove" => {
            let position = board(&request)?;
            let index = index(&request, "index")?;
            let side = side(&request, "side")?;
            let next = position.apply(index, side).ok_or("occupied intersection")?;
            Ok(json!(&next.board()[..]))
        }
        "isWin" => {
            let position = board(&request)?;
            let index = index(&request, "index")?;
            let side = if request.get("side").is_some() {
                stone(&request, "side")?
            } else {
                position.board()[index as usize]
            };
            Ok(json!(position.is_win(index, side)))
        }
        "winner" => Ok(json!(board(&request)?.winner())),
        "status" => {
            let position = board(&request)?;
            let last_move = match request.get("lastMove") {
                Some(Value::Null) | None => None,
                Some(_) => Some(index(&request, "lastMove")?),
            };
            Ok(status_json(position.status(last_move)))
        }
        "candidates" => Ok(json!(board(&request)?.candidates())),
        "evaluate" => {
            let position = board(&request)?;
            let side = side(&request, "side")?;
            Ok(json!(search::evaluate(&position, side)))
        }
        "search" => {
            let position = board(&request)?;
            let side = side(&request, "side")?;
            let difficulty = request
                .get("difficulty")
                .and_then(Value::as_str)
                .unwrap_or("medium");
            let seed = request
                .get("seed")
                .and_then(Value::as_u64)
                .unwrap_or(0x5755_5a49);
            let budget = match difficulty {
                "easy" => 100.0,
                "hard" => 1_500.0,
                _ => 500.0,
            };
            let deadline = clock_ms() + budget;
            Ok(search_json(search::search(
                &position,
                side,
                search::config(difficulty),
                seed,
                |_| clock_ms() >= deadline,
            )))
        }
        _ => Err(DispatchError::new(format!(
            "unknown wuziqi operation {operation:?}"
        ))),
    }
}

wasm_abi::export_json_abi!(dispatch);
