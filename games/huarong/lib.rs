mod game;
mod search;
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
        "ping" => Ok(json!({"abi": wasm_abi::ABI_VERSION, "game": "huarong"})),
        "layouts" => Ok(json!(game::layouts())),
        "layout" => {
            #[derive(serde::Deserialize)]
            struct Input {
                id: String,
            }
            Ok(json!(
                game::layout(&args::<Input>(&request)?.id).map_err(DispatchError::new)?
            ))
        }
        "validate" => {
            #[derive(serde::Deserialize)]
            struct Input {
                positions: Vec<u8>,
            }
            Ok(json!(
                game::validate(&args::<Input>(&request)?.positions).is_ok()
            ))
        }
        "legalMoves" => {
            #[derive(serde::Deserialize)]
            struct Input {
                positions: Vec<u8>,
                piece: usize,
            }
            let input: Input = args(&request)?;
            Ok(json!(
                game::legal_moves(&input.positions, input.piece).map_err(DispatchError::new)?
            ))
        }
        "applyMove" => {
            #[derive(serde::Deserialize)]
            struct Input {
                positions: Vec<u8>,
                piece: usize,
                to: u8,
            }
            let input: Input = args(&request)?;
            Ok(json!(
                game::apply_move(&input.positions, input.piece, input.to)
                    .map_err(DispatchError::new)?
            ))
        }
        "isSolved" => {
            #[derive(serde::Deserialize)]
            struct Input {
                positions: Vec<u8>,
            }
            Ok(json!(game::is_solved(&args::<Input>(&request)?.positions)))
        }
        "hint" => {
            #[derive(serde::Deserialize)]
            struct Input {
                positions: Vec<u8>,
            }
            Ok(json!(
                search::shortest_hint(&args::<Input>(&request)?.positions)
                    .map_err(DispatchError::new)?
            ))
        }
        _ => Err(DispatchError::new(format!(
            "unknown huarong operation {operation:?}"
        ))),
    }
}

wasm_abi::export_json_abi!(dispatch);
