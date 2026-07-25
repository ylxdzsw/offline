mod game;
mod wasm_abi {
    include!("../wasm_abi.rs");
}

use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use wasm_abi::{DispatchError, DispatchResult};

fn args<T: DeserializeOwned>(request: &Value) -> Result<T, DispatchError> {
    serde_json::from_value(request.get("args").cloned().unwrap_or(Value::Null))
        .map_err(|error| DispatchError::new(error.to_string()))
}

fn dispatch(request: Value) -> DispatchResult {
    let operation = request
        .get("op")
        .and_then(Value::as_str)
        .ok_or_else(|| DispatchError::new("request is missing a string op field"))?;
    match operation {
        "ping" => Ok(json!({"abi": wasm_abi::ABI_VERSION, "game": "2048"})),
        "newGame" => {
            #[derive(serde::Deserialize)]
            struct Input {
                seed: u64,
            }
            Ok(json!(game::new_game(args::<Input>(&request)?.seed)))
        }
        "move" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<u32>,
                direction: String,
                seed: u64,
            }
            let input = args::<Input>(&request)?;
            let direction = game::Direction::parse(&input.direction).map_err(DispatchError::new)?;
            Ok(json!(
                game::apply_move(&input.board, direction, input.seed)
                    .map_err(DispatchError::new)?
            ))
        }
        "status" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<u32>,
            }
            Ok(json!(
                game::status(&args::<Input>(&request)?.board).map_err(DispatchError::new)?
            ))
        }
        _ => Err(DispatchError::new(format!(
            "unknown 2048 operation {operation:?}"
        ))),
    }
}

wasm_abi::export_json_abi!(dispatch);
