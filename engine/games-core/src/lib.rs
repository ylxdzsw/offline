//! Shared support for the small raw WebAssembly ABI used by every game engine.
//!
//! JavaScript reserves the input buffer, copies one UTF-8 JSON request into
//! exported linear memory, calls `offline_dispatch`, and copies the JSON result
//! out before making another ABI call. Each WebAssembly instance owns its own
//! buffers; the ABI is deliberately synchronous and non-reentrant.

use std::sync::{Mutex, MutexGuard};

pub use serde_json::{self, Value, json};

/// Version of the raw JSON dispatch ABI exported by game crates.
pub const ABI_VERSION: u32 = 1;

/// Status returned by `offline_dispatch` when the response is a normal value.
pub const STATUS_OK: u32 = 0;
/// Status returned when the request was not valid UTF-8 JSON.
pub const STATUS_INVALID_JSON: u32 = 1;
/// Status returned when a game rejected a valid request.
pub const STATUS_DISPATCH_ERROR: u32 = 2;

pub type DispatchResult = Result<Value, DispatchError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DispatchError {
    message: String,
}

impl DispatchError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl From<&str> for DispatchError {
    fn from(message: &str) -> Self {
        Self::new(message)
    }
}

impl From<String> for DispatchError {
    fn from(message: String) -> Self {
        Self::new(message)
    }
}

/// Per-instance storage behind the exported JSON ABI.
pub struct JsonAbi {
    input: Mutex<Vec<u8>>,
    output: Mutex<Vec<u8>>,
}

impl JsonAbi {
    pub const fn new() -> Self {
        Self {
            input: Mutex::new(Vec::new()),
            output: Mutex::new(Vec::new()),
        }
    }

    /// Resize the request buffer and return the pointer JavaScript should fill.
    pub fn reserve_input(&self, length: usize) -> *mut u8 {
        let mut input = lock(&self.input);
        input.resize(length, 0);
        input.as_mut_ptr()
    }

    /// Parse and dispatch the first `length` bytes of the reserved input.
    pub fn dispatch(&self, length: usize, handler: fn(Value) -> DispatchResult) -> u32 {
        let request = {
            let input = lock(&self.input);
            if length > input.len() {
                return self.write_error(
                    STATUS_INVALID_JSON,
                    "request length exceeds the reserved input buffer",
                );
            }
            serde_json::from_slice::<Value>(&input[..length])
        };

        match request {
            Ok(value) => match handler(value) {
                Ok(value) => {
                    self.write_output(&value);
                    STATUS_OK
                }
                Err(error) => self.write_error(STATUS_DISPATCH_ERROR, error.message()),
            },
            Err(error) => self.write_error(STATUS_INVALID_JSON, &error.to_string()),
        }
    }

    pub fn output_ptr(&self) -> *const u8 {
        lock(&self.output).as_ptr()
    }

    pub fn output_len(&self) -> usize {
        lock(&self.output).len()
    }

    fn write_error(&self, status: u32, message: &str) -> u32 {
        self.write_output(&json!({
            "error": {
                "status": status,
                "message": message,
            }
        }));
        status
    }

    fn write_output(&self, value: &Value) {
        let encoded = serde_json::to_vec(value).unwrap_or_else(|_| {
            br#"{"error":{"status":2,"message":"response serialization failed"}}"#.to_vec()
        });
        *lock(&self.output) = encoded;
    }
}

impl Default for JsonAbi {
    fn default() -> Self {
        Self::new()
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Temporary handler used by newly-created game crates until their real
/// operation routing is implemented.
pub fn skeleton_dispatch(game: &'static str, request: Value) -> DispatchResult {
    match request.get("op").and_then(Value::as_str) {
        Some("ping") => Ok(json!({"abi": ABI_VERSION, "game": game})),
        Some(operation) => Err(DispatchError::new(format!(
            "{game} does not implement operation {operation:?} yet"
        ))),
        None => Err(DispatchError::new("request is missing a string op field")),
    }
}

/// Export the standard ABI from a game crate using the supplied JSON handler.
#[macro_export]
macro_rules! export_json_abi {
    ($handler:path) => {
        static OFFLINE_JSON_ABI: $crate::JsonAbi = $crate::JsonAbi::new();

        #[unsafe(no_mangle)]
        pub extern "C" fn offline_abi_version() -> u32 {
            $crate::ABI_VERSION
        }

        #[unsafe(no_mangle)]
        pub extern "C" fn offline_input_reserve(length: usize) -> *mut u8 {
            OFFLINE_JSON_ABI.reserve_input(length)
        }

        #[unsafe(no_mangle)]
        pub extern "C" fn offline_dispatch(length: usize) -> u32 {
            OFFLINE_JSON_ABI.dispatch(length, $handler)
        }

        #[unsafe(no_mangle)]
        pub extern "C" fn offline_output_ptr() -> *const u8 {
            OFFLINE_JSON_ABI.output_ptr()
        }

        #[unsafe(no_mangle)]
        pub extern "C" fn offline_output_len() -> usize {
            OFFLINE_JSON_ABI.output_len()
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dispatches_json_and_reports_errors() {
        let abi = JsonAbi::new();
        let request = br#"{"op":"ping"}"#;
        write_input(&abi, request);

        assert_eq!(
            abi.dispatch(request.len(), |value| skeleton_dispatch("test", value)),
            STATUS_OK
        );
        assert_eq!(read_output(&abi), json!({"abi": 1, "game": "test"}));

        write_input(&abi, b"not json");
        assert_eq!(
            abi.dispatch(8, |value| skeleton_dispatch("test", value)),
            STATUS_INVALID_JSON
        );
        assert_eq!(read_output(&abi)["error"]["status"], STATUS_INVALID_JSON);

        write_input(&abi, br#"{"op":"unknown"}"#);
        assert_eq!(
            abi.dispatch(16, |value| skeleton_dispatch("test", value)),
            STATUS_DISPATCH_ERROR
        );
        assert_eq!(read_output(&abi)["error"]["status"], STATUS_DISPATCH_ERROR);
    }

    fn write_input(abi: &JsonAbi, input: &[u8]) {
        let ptr = abi.reserve_input(input.len());
        // SAFETY: reserve_input allocated exactly this writable range and no
        // other ABI call can resize it before the copy completes.
        unsafe { std::ptr::copy_nonoverlapping(input.as_ptr(), ptr, input.len()) };
    }

    fn read_output(abi: &JsonAbi) -> Value {
        // SAFETY: the output remains allocated until the next dispatch call.
        let output = unsafe { std::slice::from_raw_parts(abi.output_ptr(), abi.output_len()) };
        serde_json::from_slice(output).unwrap()
    }
}
