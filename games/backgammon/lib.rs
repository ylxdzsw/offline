mod ai;
mod game;
mod wasm_abi {
    include!("../wasm_abi.rs");
}

use ai::{SearchConfig, SearchResult};
use game::{Position, RequestedStep};
use serde_json::{Value, json};
use wasm_abi::{DispatchError, DispatchResult};

fn field<'a>(request: &'a Value, name: &str) -> Result<&'a Value, DispatchError> {
    request
        .get(name)
        .ok_or_else(|| DispatchError::new(format!("request is missing {name:?}")))
}

fn unsigned(request: &Value, name: &str) -> Result<u64, DispatchError> {
    field(request, name)?
        .as_u64()
        .ok_or_else(|| DispatchError::new(format!("{name:?} must be an unsigned integer")))
}

fn side(request: &Value, name: &str) -> Result<u8, DispatchError> {
    match unsigned(request, name)? {
        value if value == u64::from(game::HUMAN) => Ok(game::HUMAN),
        value if value == u64::from(game::AI) => Ok(game::AI),
        _ => Err(DispatchError::new(format!("{name:?} is not a valid side"))),
    }
}

fn position(request: &Value) -> Result<Position, DispatchError> {
    let value = field(request, "position")?.clone();
    let position: Position = serde_json::from_value(value)
        .map_err(|error| DispatchError::new(format!("invalid position: {error}")))?;
    position.validate().map_err(DispatchError::new)?;
    Ok(position)
}

fn dice(request: &Value) -> Result<[u8; 2], DispatchError> {
    let values = field(request, "dice")?
        .as_array()
        .filter(|values| values.len() == 2)
        .ok_or("dice must be an array with two values")?;
    let mut result = [0; 2];
    for (index, value) in values.iter().enumerate() {
        result[index] = value
            .as_u64()
            .filter(|die| (1..=6).contains(die))
            .ok_or("dice values must be between 1 and 6")? as u8;
    }
    Ok(result)
}

fn requested_steps(request: &Value) -> Result<Vec<RequestedStep>, DispatchError> {
    serde_json::from_value(field(request, "steps")?.clone())
        .map_err(|error| DispatchError::new(format!("invalid turn steps: {error}")))
}

fn search_json(result: SearchResult) -> Value {
    json!({
        "turn": result.selected,
        "score": result.score,
        "selectedScore": result.selected_score,
        "depth": result.depth,
        "nodes": result.nodes,
        "chanceNodes": result.chance_nodes,
    })
}

fn dispatch(request: Value) -> DispatchResult {
    let operation = field(&request, "op")?
        .as_str()
        .ok_or("op must be a string")?;
    match operation {
        "initialPosition" => Ok(json!(Position::initial())),
        "legalTurns" => Ok(json!(
            game::legal_turns(
                &position(&request)?,
                side(&request, "side")?,
                dice(&request)?,
            )
            .map_err(DispatchError::new)?
        )),
        "applyTurn" => Ok(json!(
            game::apply_turn(
                &position(&request)?,
                side(&request, "side")?,
                dice(&request)?,
                &requested_steps(&request)?,
            )
            .map_err(DispatchError::new)?
        )),
        "outcome" => Ok(json!(position(&request)?.outcome())),
        "evaluate" => Ok(json!(ai::evaluate(
            &position(&request)?,
            side(&request, "side")?,
        ))),
        "search" => {
            let config = SearchConfig {
                node_budget: request
                    .get("nodeBudget")
                    .and_then(Value::as_u64)
                    .unwrap_or(80_000)
                    .min(u32::MAX as u64) as u32,
                max_depth: request
                    .get("maxDepth")
                    .and_then(Value::as_u64)
                    .unwrap_or(2)
                    .clamp(1, u8::MAX as u64) as u8,
                branch_limit: request
                    .get("branchLimit")
                    .and_then(Value::as_u64)
                    .unwrap_or(8)
                    .clamp(1, 64) as usize,
                root_band: request
                    .get("rootBand")
                    .and_then(Value::as_i64)
                    .unwrap_or(30)
                    .clamp(0, i32::MAX as i64) as i32,
                seed: request.get("seed").and_then(Value::as_u64).unwrap_or(0),
            };
            Ok(search_json(
                ai::search(
                    &position(&request)?,
                    side(&request, "side")?,
                    dice(&request)?,
                    config,
                )
                .map_err(DispatchError::new)?,
            ))
        }
        _ => Err(DispatchError::new(format!(
            "unknown backgammon operation {operation:?}"
        ))),
    }
}

wasm_abi::export_json_abi!(dispatch);
