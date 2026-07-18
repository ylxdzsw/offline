mod game;

#[cfg(not(target_arch = "wasm32"))]
use std::sync::OnceLock;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

use game::{BLACK, Position, SearchResult, Status, WHITE};
use games_core::{DispatchError, DispatchResult, Value, json};

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
            let index = number(&request, "index")? as u16;
            let side = number(&request, "side")? as u8;
            let next = position.apply(index, side).ok_or("occupied intersection")?;
            Ok(json!(&next.board()[..]))
        }
        "isWin" => {
            let position = board(&request)?;
            let index = number(&request, "index")? as u16;
            let side = request
                .get("side")
                .and_then(Value::as_u64)
                .map(|value| value as u8)
                .or_else(|| position.board().get(index as usize).copied())
                .unwrap_or(0);
            Ok(json!(position.is_win(index, side)))
        }
        "winner" => Ok(json!(board(&request)?.winner())),
        "status" => {
            let position = board(&request)?;
            let last_move = request
                .get("lastMove")
                .and_then(Value::as_u64)
                .map(|value| value as u16);
            Ok(status_json(position.status(last_move)))
        }
        "candidates" => Ok(json!(board(&request)?.candidates())),
        "evaluate" => {
            let position = board(&request)?;
            let side = number(&request, "side")? as u8;
            Ok(json!(game::evaluate(&position, side)))
        }
        "search" => {
            let position = board(&request)?;
            let side = number(&request, "side")? as u8;
            if ![BLACK, WHITE].contains(&side) {
                return Err("invalid side".into());
            }
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
            Ok(search_json(game::search(
                &position,
                side,
                game::config(difficulty),
                seed,
                |_| clock_ms() >= deadline,
            )))
        }
        _ => Err(DispatchError::new(format!(
            "unknown wuziqi operation {operation:?}"
        ))),
    }
}

games_core::export_json_abi!(dispatch);
