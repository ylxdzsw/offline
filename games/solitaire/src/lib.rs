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
        "ping" => Ok(json!({"abi": wasm_abi::ABI_VERSION, "game": "solitaire"})),
        "newGame" => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Input {
                seed: u64,
                draw_count: u8,
            }
            let input = args::<Input>(&request)?;
            Ok(json!(
                game::new_game(input.seed, input.draw_count).map_err(DispatchError::new)?
            ))
        }
        "validate" => {
            #[derive(serde::Deserialize)]
            struct Input {
                game: game::Game,
            }
            Ok(json!(
                game::validate(&args::<Input>(&request)?.game).is_ok()
            ))
        }
        "draw" => {
            #[derive(serde::Deserialize)]
            struct Input {
                game: game::Game,
            }
            Ok(json!(
                game::draw(args::<Input>(&request)?.game).map_err(DispatchError::new)?
            ))
        }
        "move" => {
            #[derive(serde::Deserialize)]
            struct Input {
                game: game::Game,
                source: game::Source,
                destination: game::Destination,
            }
            let input = args::<Input>(&request)?;
            Ok(json!(
                game::move_cards(input.game, input.source, input.destination)
                    .map_err(DispatchError::new)?
            ))
        }
        _ => Err(DispatchError::new(format!(
            "unknown solitaire operation {operation:?}"
        ))),
    }
}

wasm_abi::export_json_abi!(dispatch);
