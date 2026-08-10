mod ai;
mod game;
mod wasm_abi {
    include!("../wasm_abi.rs");
}

use game::{Move, Piece};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use wasm_abi::{DispatchError, DispatchResult};

#[cfg(not(target_arch = "wasm32"))]
use std::sync::OnceLock;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

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
                #[serde(rename = "initialBoard")]
                #[serde(default)]
                initial_board: Vec<Option<Piece>>,
                #[serde(default)]
                events: Vec<ai::Observation>,
                side: String,
                difficulty: String,
                #[serde(default)]
                revealed: Vec<String>,
                seed: u64,
            }
            let input: Input = args(&request)?;
            let initial = if input.initial_board.is_empty() {
                &input.board
            } else {
                &input.initial_board
            };
            let deadline = clock_ms() + ai::config(&input.difficulty).budget_ms;
            Ok(json!(ai::choose_move(
                ai::SearchInput {
                    board: &input.board,
                    initial,
                    events: &input.events,
                    side: &input.side,
                    difficulty: &input.difficulty,
                    revealed: &input.revealed,
                    seed: input.seed,
                },
                || clock_ms() >= deadline,
            )))
        }
        _ => Err(DispatchError::new(format!(
            "unknown junqi operation {operation:?}"
        ))),
    }
}

wasm_abi::export_json_abi!(dispatch);
