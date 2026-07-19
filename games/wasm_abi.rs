// The small synchronous JSON ABI shared by every standalone game module.

use std::sync::{Mutex, MutexGuard};

use serde_json::{Value, json};

pub(crate) const ABI_VERSION: u32 = 1;
pub(crate) const STATUS_OK: u32 = 0;
pub(crate) const STATUS_INVALID_JSON: u32 = 1;
pub(crate) const STATUS_DISPATCH_ERROR: u32 = 2;

pub(crate) type DispatchResult = Result<Value, DispatchError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DispatchError {
    message: String,
}

impl DispatchError {
    pub(crate) fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    pub(crate) fn message(&self) -> &str {
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

pub(crate) struct JsonAbi {
    input: Mutex<Vec<u8>>,
    output: Mutex<Vec<u8>>,
}

impl JsonAbi {
    pub(crate) const fn new() -> Self {
        Self {
            input: Mutex::new(Vec::new()),
            output: Mutex::new(Vec::new()),
        }
    }

    pub(crate) fn reserve_input(&self, length: usize) -> *mut u8 {
        let mut input = lock(&self.input);
        input.resize(length, 0);
        input.as_mut_ptr()
    }

    pub(crate) fn dispatch(&self, length: usize, handler: fn(Value) -> DispatchResult) -> u32 {
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

    pub(crate) fn output_ptr(&self) -> *const u8 {
        lock(&self.output).as_ptr()
    }

    pub(crate) fn output_len(&self) -> usize {
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

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

macro_rules! export_json_abi {
    ($handler:path) => {
        static OFFLINE_JSON_ABI: $crate::wasm_abi::JsonAbi = $crate::wasm_abi::JsonAbi::new();

        #[unsafe(no_mangle)]
        pub extern "C" fn offline_abi_version() -> u32 {
            $crate::wasm_abi::ABI_VERSION
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

pub(crate) use export_json_abi;
