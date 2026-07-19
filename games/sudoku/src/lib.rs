mod game;
mod wasm_abi {
    include!("../../wasm_abi.rs");
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
        "ping" => Ok(json!({"abi": wasm_abi::ABI_VERSION, "game": "sudoku"})),
        "peers" => {
            #[derive(serde::Deserialize)]
            struct Input {
                index: usize,
            }
            Ok(json!(game::peers(args::<Input>(&request)?.index)))
        }
        "candidates" | "conflicts" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<u8>,
                index: usize,
            }
            let input: Input = args(&request)?;
            if input.board.len() != game::CELLS {
                return Err(DispatchError::new("board must have 81 cells"));
            }
            if operation == "candidates" {
                Ok(json!(game::candidates(&input.board, input.index)))
            } else {
                Ok(json!(game::conflicts(&input.board, input.index)))
            }
        }
        "isValid" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<u8>,
            }
            Ok(json!(game::is_valid(&args::<Input>(&request)?.board)))
        }
        "solve" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<u8>,
                limit: usize,
            }
            let input: Input = args(&request)?;
            Ok(json!(game::solve(&input.board, input.limit)))
        }
        "completeBoard" => {
            #[derive(serde::Deserialize)]
            struct Input {
                seed: u64,
            }
            Ok(json!(game::complete_board(args::<Input>(&request)?.seed)))
        }
        "generate" => {
            #[derive(serde::Deserialize)]
            struct Input {
                difficulty: String,
                seed: u64,
            }
            let input: Input = args(&request)?;
            Ok(json!(
                game::generate(&input.difficulty, input.seed).map_err(DispatchError::new)?
            ))
        }
        "isComplete" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<u8>,
                solution: Vec<u8>,
            }
            let input: Input = args(&request)?;
            Ok(json!(game::is_complete(&input.board, &input.solution)))
        }
        _ => Err(DispatchError::new(format!(
            "unknown sudoku operation {operation:?}"
        ))),
    }
}

wasm_abi::export_json_abi!(dispatch);
