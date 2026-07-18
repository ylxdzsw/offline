mod ai;
mod game;

use game::{Move, State};
use games_core::{DispatchError, DispatchResult, Value, json};

fn field<'a>(value: &'a Value, key: &str) -> Result<&'a Value, DispatchError> {
    value
        .get(key)
        .ok_or_else(|| DispatchError::new(format!("missing field {key}")))
}

fn side_from(value: &Value) -> Result<u8, DispatchError> {
    match value.as_str() {
        Some("w") => Ok(game::WHITE),
        Some("b") => Ok(game::BLACK),
        _ => Err(DispatchError::new("invalid chess side")),
    }
}

fn side_to(side: u8) -> &'static str {
    if side == game::WHITE { "w" } else { "b" }
}

fn kind_from(character: u8) -> Result<u8, DispatchError> {
    match character {
        b'P' => Ok(game::PAWN),
        b'N' => Ok(game::KNIGHT),
        b'B' => Ok(game::BISHOP),
        b'R' => Ok(game::ROOK),
        b'Q' => Ok(game::QUEEN),
        b'K' => Ok(game::KING),
        _ => Err(DispatchError::new("invalid chess piece type")),
    }
}

fn kind_to(kind: u8) -> char {
    match kind {
        game::PAWN => 'P',
        game::KNIGHT => 'N',
        game::BISHOP => 'B',
        game::ROOK => 'R',
        game::QUEEN => 'Q',
        game::KING => 'K',
        _ => '?',
    }
}

fn piece_from(value: &Value) -> Result<u8, DispatchError> {
    if value.is_null() {
        return Ok(0);
    }
    let text = value
        .as_str()
        .ok_or_else(|| DispatchError::new("invalid chess piece"))?;
    let bytes = text.as_bytes();
    if bytes.len() != 2 {
        return Err(DispatchError::new("invalid chess piece"));
    }
    Ok(game::piece(
        side_from(&Value::String((bytes[0] as char).to_string()))?,
        kind_from(bytes[1])?,
    ))
}

fn piece_to(value: u8) -> Value {
    if value == 0 {
        Value::Null
    } else {
        Value::String(format!(
            "{}{}",
            side_to(game::side_of(value)),
            kind_to(game::kind_of(value))
        ))
    }
}

fn state_from(value: &Value) -> Result<State, DispatchError> {
    let values = field(value, "board")?
        .as_array()
        .ok_or_else(|| DispatchError::new("board must be an array"))?;
    if values.len() != 64 {
        return Err(DispatchError::new("chess board must contain 64 squares"));
    }
    let mut board = [0; 64];
    for (target, source) in board.iter_mut().zip(values) {
        *target = piece_from(source)?;
    }
    let castling_value = field(value, "castling")?;
    let mut castling = 0;
    for (key, bit) in [
        ("wK", game::CASTLE_WHITE_KING),
        ("wQ", game::CASTLE_WHITE_QUEEN),
        ("bK", game::CASTLE_BLACK_KING),
        ("bQ", game::CASTLE_BLACK_QUEEN),
    ] {
        if castling_value
            .get(key)
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            castling |= bit;
        }
    }
    Ok(State {
        board,
        turn: side_from(field(value, "turn")?)?,
        castling,
        en_passant: value
            .get("enPassant")
            .and_then(Value::as_i64)
            .map_or(-1, |index| index as i16),
        halfmove: value.get("halfmove").and_then(Value::as_u64).unwrap_or(0) as u16,
        fullmove: value.get("fullmove").and_then(Value::as_u64).unwrap_or(1) as u16,
    })
}

fn state_to(state: &State) -> Value {
    json!({
        "board": state.board.iter().copied().map(piece_to).collect::<Vec<_>>(),
        "turn": side_to(state.turn),
        "castling": {
            "wK": state.castling & game::CASTLE_WHITE_KING != 0,
            "wQ": state.castling & game::CASTLE_WHITE_QUEEN != 0,
            "bK": state.castling & game::CASTLE_BLACK_KING != 0,
            "bQ": state.castling & game::CASTLE_BLACK_QUEEN != 0,
        },
        "enPassant": if state.en_passant < 0 { Value::Null } else { json!(state.en_passant) },
        "halfmove": state.halfmove,
        "fullmove": state.fullmove,
    })
}

fn move_to(state: &State, mv: Move) -> Value {
    let moving = state.board[mv.from as usize];
    let captured_at = if mv.flags & game::FLAG_EN_PASSANT != 0 {
        game::at(
            game::row_of(mv.from as usize),
            game::column_of(mv.to as usize),
        )
    } else {
        mv.to as usize
    };
    let mut object = games_core::serde_json::Map::new();
    object.insert("from".into(), json!(mv.from));
    object.insert("to".into(), json!(mv.to));
    object.insert("piece".into(), piece_to(moving));
    object.insert("captured".into(), piece_to(state.board[captured_at]));
    if mv.promotion != 0 {
        object.insert("promotion".into(), json!(kind_to(mv.promotion).to_string()));
    }
    if mv.flags & game::FLAG_DOUBLE_PAWN != 0 {
        object.insert("doublePawn".into(), json!(true));
    }
    if mv.flags & game::FLAG_EN_PASSANT != 0 {
        object.insert("enPassant".into(), json!(true));
        object.insert("capturedAt".into(), json!(captured_at));
    }
    if mv.flags & game::FLAG_CASTLE_KING != 0 {
        object.insert("castle".into(), json!("K"));
    }
    if mv.flags & game::FLAG_CASTLE_QUEEN != 0 {
        object.insert("castle".into(), json!("Q"));
    }
    Value::Object(object)
}

fn resolve_move(state: &State, value: &Value) -> Result<Move, DispatchError> {
    let from = field(value, "from")?
        .as_u64()
        .ok_or_else(|| DispatchError::new("invalid move from"))? as u8;
    let to = field(value, "to")?
        .as_u64()
        .ok_or_else(|| DispatchError::new("invalid move to"))? as u8;
    let promotion = match value.get("promotion").and_then(Value::as_str) {
        Some(text) => kind_from(
            *text
                .as_bytes()
                .first()
                .ok_or_else(|| DispatchError::new("invalid promotion"))?,
        )?,
        None => 0,
    };
    game::pseudo_moves_for(state, from as usize)
        .into_iter()
        .find(|mv| mv.to == to && mv.promotion == promotion)
        .ok_or_else(|| DispatchError::new("illegal chess move"))
}

fn outcome_to(outcome: game::Outcome) -> Value {
    match outcome {
        game::Outcome::Playing => json!({"ended":false,"winner":null,"reason":"playing"}),
        game::Outcome::Check => json!({"ended":false,"winner":null,"reason":"check"}),
        game::Outcome::Checkmate(side) => {
            json!({"ended":true,"winner":side_to(side),"reason":"checkmate"})
        }
        game::Outcome::Stalemate => json!({"ended":true,"winner":null,"reason":"stalemate"}),
        game::Outcome::Repetition => json!({"ended":true,"winner":null,"reason":"repetition"}),
        game::Outcome::FiftyMove => json!({"ended":true,"winner":null,"reason":"fiftyMove"}),
        game::Outcome::Insufficient => json!({"ended":true,"winner":null,"reason":"insufficient"}),
    }
}

fn dispatch(request: Value) -> DispatchResult {
    let op = field(&request, "op")?
        .as_str()
        .ok_or_else(|| DispatchError::new("op must be a string"))?;
    match op {
        "ping" => Ok(json!({"abi":games_core::ABI_VERSION,"game":"chess"})),
        "initialState" => Ok(state_to(&State::initial())),
        "isSquareAttacked" => {
            let state = state_from(field(&request, "state")?)?;
            let index = field(&request, "index")?
                .as_u64()
                .ok_or_else(|| DispatchError::new("invalid index"))?
                as usize;
            let side = side_from(field(&request, "side")?)?;
            Ok(json!(game::is_square_attacked(&state, index, side)))
        }
        "isInCheck" => {
            let state = state_from(field(&request, "state")?)?;
            Ok(json!(game::is_in_check(
                &state,
                side_from(field(&request, "side")?)?
            )))
        }
        "pseudoMovesFor" | "pseudoMoves" | "legalMoves" => {
            let state = state_from(field(&request, "state")?)?;
            let moves = if op == "pseudoMovesFor" {
                game::pseudo_moves_for(
                    &state,
                    field(&request, "from")?
                        .as_u64()
                        .ok_or_else(|| DispatchError::new("invalid from"))?
                        as usize,
                )
            } else {
                let side = side_from(field(&request, "side")?)?;
                if op == "pseudoMoves" {
                    game::pseudo_moves(&state, side)
                } else {
                    game::legal_moves(&state, side)
                }
            };
            Ok(Value::Array(
                moves.into_iter().map(|mv| move_to(&state, mv)).collect(),
            ))
        }
        "applyMove" => {
            let state = state_from(field(&request, "state")?)?;
            let mv = resolve_move(&state, field(&request, "move")?)?;
            Ok(state_to(&game::apply_move(&state, mv)))
        }
        "effectiveEnPassant" => Ok(json!(game::effective_en_passant(&state_from(field(
            &request, "state"
        )?)?))),
        "insufficientMaterial" => {
            let state = state_from(&json!({
                "board": field(&request,"board")?, "turn":"w",
                "castling":{"wK":false,"wQ":false,"bK":false,"bQ":false},
                "enPassant":null,"halfmove":0,"fullmove":1
            }))?;
            Ok(json!(game::insufficient_material(&state.board)))
        }
        "status" => {
            let state = state_from(field(&request, "state")?)?;
            let repetitions = request
                .get("repetitions")
                .and_then(Value::as_u64)
                .unwrap_or(0) as u8;
            Ok(outcome_to(game::status(&state, repetitions)))
        }
        "search" => {
            let state = state_from(field(&request, "state")?)?;
            let config = ai::SearchConfig {
                node_budget: request
                    .get("nodeBudget")
                    .and_then(Value::as_u64)
                    .unwrap_or(40_000) as u32,
                max_depth: request.get("maxDepth").and_then(Value::as_u64).unwrap_or(4) as u8,
                seed: request.get("seed").and_then(Value::as_u64).unwrap_or(0),
                root_band: request.get("rootBand").and_then(Value::as_i64).unwrap_or(0) as i32,
            };
            let result = ai::search(&state, config);
            Ok(json!({
                "move": result.selected.map(|mv| move_to(&state,mv)).unwrap_or(Value::Null),
                "score": result.score, "selectedScore":result.selected_score,
                "depth":result.depth,"nodes":result.nodes
            }))
        }
        _ => Err(DispatchError::new(format!("unknown chess operation {op}"))),
    }
}

games_core::export_json_abi!(dispatch);
