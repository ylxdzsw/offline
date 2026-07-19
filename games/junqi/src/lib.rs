mod ai;
mod game;
mod wasm_abi {
    include!("../../wasm_abi.rs");
}

use game::{Move, Piece};
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
        "ping" => Ok(json!({"abi": wasm_abi::ABI_VERSION, "game": "junqi"})),
        "initialBoard" => {
            #[derive(serde::Deserialize)]
            struct Input {
                seed: u64,
            }
            let input: Input = args(&request)?;
            Ok(json!(game::initial_board(input.seed)))
        }
        "deploymentSquares" => {
            #[derive(serde::Deserialize)]
            struct Input {
                side: String,
            }
            let input: Input = args(&request)?;
            Ok(json!(game::deployment_squares(&input.side)))
        }
        "roadNeighbors" => {
            #[derive(serde::Deserialize)]
            struct Input {
                index: usize,
            }
            Ok(json!(game::road_neighbors(args::<Input>(&request)?.index)))
        }
        "railwayNeighbors" => {
            #[derive(serde::Deserialize)]
            struct Input {
                index: usize,
            }
            Ok(json!(game::railway_neighbors(
                args::<Input>(&request)?.index
            )))
        }
        "movesFor" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<Option<Piece>>,
                from: usize,
            }
            let input: Input = args(&request)?;
            Ok(json!(game::moves_for(&input.board, input.from)))
        }
        "legalMoves" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<Option<Piece>>,
                side: String,
            }
            let input: Input = args(&request)?;
            Ok(json!(game::legal_moves(&input.board, &input.side)))
        }
        "battle" => {
            #[derive(serde::Deserialize)]
            struct Input {
                attacker: Piece,
                defender: Piece,
            }
            let input: Input = args(&request)?;
            Ok(json!(game::battle(&input.attacker, &input.defender)))
        }
        "applyMove" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<Option<Piece>>,
                #[serde(rename = "move")]
                movement: Move,
            }
            let input: Input = args(&request)?;
            Ok(json!(
                game::apply_move(&input.board, input.movement).map_err(DispatchError::new)?
            ))
        }
        "status" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<Option<Piece>>,
                turn: String,
            }
            let input: Input = args(&request)?;
            Ok(json!(game::status(&input.board, &input.turn)))
        }
        "validateSetup" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<Option<Piece>>,
                side: String,
            }
            let input: Input = args(&request)?;
            Ok(json!(game::validate_setup(&input.board, &input.side)))
        }
        "aiChoose" => {
            #[derive(serde::Deserialize)]
            struct Input {
                board: Vec<Option<Piece>>,
                side: String,
                difficulty: String,
                #[serde(default)]
                revealed: Vec<String>,
                seed: u64,
            }
            let input: Input = args(&request)?;
            Ok(json!(ai::choose_move(
                &input.board,
                &input.side,
                &input.difficulty,
                &input.revealed,
                input.seed,
            )))
        }
        _ => Err(DispatchError::new(format!(
            "unknown junqi operation {operation:?}"
        ))),
    }
}

wasm_abi::export_json_abi!(dispatch);
