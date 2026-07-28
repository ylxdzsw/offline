mod game;
mod search;
mod wasm_abi {
    include!("../wasm_abi.rs");
}

#[cfg(not(target_arch = "wasm32"))]
use std::sync::OnceLock;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

use game::{BLACK, EMPTY, Position, Record, SIZES, WHITE};
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

fn size(request: &Value) -> Result<u8, DispatchError> {
    let value = number(request, "size")?;
    if !SIZES.contains(&(value as u8)) {
        return Err(DispatchError::new("size must be 9, 13, or 19"));
    }
    Ok(value as u8)
}

fn records(request: &Value) -> Result<Vec<Record>, DispatchError> {
    let values = request.get("moves").map_or(Ok(&[][..]), |value| {
        value
            .as_array()
            .map(Vec::as_slice)
            .ok_or_else(|| DispatchError::new("moves must be an array"))
    })?;
    values
        .iter()
        .map(|value| {
            let object = value
                .as_object()
                .ok_or_else(|| DispatchError::new("each move must be an object"))?;
            match object.get("kind").and_then(Value::as_str) {
                Some("play") => object
                    .get("index")
                    .and_then(Value::as_u64)
                    .filter(|index| *index <= u16::MAX as u64)
                    .map(|index| Record::Play(index as u16))
                    .ok_or_else(|| DispatchError::new("play move is missing a valid index")),
                Some("pass") => Ok(Record::Pass),
                Some("resign") => Ok(Record::Resign),
                _ => Err(DispatchError::new(
                    "move kind must be play, pass, or resign",
                )),
            }
        })
        .collect()
}

fn position(request: &Value) -> Result<Position, DispatchError> {
    Position::from_records(size(request)?, &records(request)?).map_err(DispatchError::from)
}

fn index(request: &Value, size: u8) -> Result<u16, DispatchError> {
    let value = number(request, "index")?;
    if value >= size as u64 * size as u64 {
        return Err(DispatchError::new(
            "index must identify a board intersection",
        ));
    }
    Ok(value as u16)
}

fn outcome_json(position: &Position) -> Value {
    let outcome = position.outcome();
    json!({
        "ended": outcome.ended,
        "winner": outcome.winner,
        "reason": outcome.reason,
        "black": outcome.black_score,
        "white": outcome.white_score,
        "margin": outcome.margin,
    })
}

fn state_json(position: &Position) -> Value {
    let (black_captures, white_captures) = position.captures();
    let (black_score, white_score) = position.score();
    json!({
        "size": position.size,
        "board": position.board(),
        "turn": position.turn(),
        "passes": position.pass_count(),
        "captures": {"black": black_captures, "white": white_captures},
        "score": {"black": black_score, "white": white_score},
        "outcome": outcome_json(position),
        "legal": position.legal_moves(),
    })
}

fn dispatch(request: Value) -> DispatchResult {
    let operation = field(&request, "op")?
        .as_str()
        .ok_or("op must be a string")?;
    match operation {
        "state" => Ok(state_json(&position(&request)?)),
        "checkMove" => {
            let position = position(&request)?;
            let index = index(&request, position.size)?;
            Ok(match position.check_move(index) {
                Ok(()) => json!({"legal": true, "reason": null}),
                Err(reason) => json!({"legal": false, "reason": reason}),
            })
        }
        "play" => {
            let mut position = position(&request)?;
            let index = index(&request, position.size)?;
            position.try_play(index).map_err(DispatchError::from)?;
            Ok(state_json(&position))
        }
        "pass" => {
            let mut position = position(&request)?;
            position.pass().map_err(DispatchError::from)?;
            Ok(state_json(&position))
        }
        "resign" => {
            let mut position = position(&request)?;
            position.resign();
            Ok(state_json(&position))
        }
        "search" => {
            let position = position(&request)?;
            if position.outcome().ended {
                return Err(DispatchError::new("cannot search an ended game"));
            }
            let difficulty = request
                .get("difficulty")
                .and_then(Value::as_str)
                .unwrap_or("medium");
            let seed = request
                .get("seed")
                .and_then(Value::as_u64)
                .unwrap_or(0x0047_4f42_414e);
            let config = search::config(difficulty);
            let deadline = clock_ms() + config.budget_ms;
            let result = search::search(&position, config, seed, || clock_ms() >= deadline);
            Ok(json!({
                "move": result.selected,
                "simulations": result.simulations,
                "nodes": result.nodes,
            }))
        }
        "constants" => Ok(json!({
            "empty": EMPTY,
            "black": BLACK,
            "white": WHITE,
            "komi": game::KOMI,
            "sizes": SIZES,
        })),
        _ => Err(DispatchError::new(format!(
            "unknown Go operation {operation:?}"
        ))),
    }
}

wasm_abi::export_json_abi!(dispatch);
