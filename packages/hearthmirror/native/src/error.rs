use std::fmt;

#[derive(Debug, Clone)]
pub enum ScryError {
    ProcessNotFound(String),
    AccessDenied(u32),
    MemoryAccess { addr: u32, reason: String },
    ClassNotFound { name: String },
    FieldNotFound { class: String, field: String },
    ModuleNotFound(String),
    MonoNotInitialized,
    MetadataError(String),
    OffsetProbe(String),
    DisasmError(String),
    CollectionOverflow { max: usize },
    Unsupported(String),
}

impl fmt::Display for ScryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ProcessNotFound(name) => write!(f, "process not found: {}", name),
            Self::AccessDenied(code) => write!(f, "access denied (Win32 error {})", code),
            Self::MemoryAccess { addr, reason } => {
                write!(f, "memory access failed at 0x{:08X}: {}", addr, reason)
            }
            Self::ClassNotFound { name } => write!(f, "mono class not found: {}", name),
            Self::FieldNotFound { class, field } => {
                write!(f, "mono field not found: {}.{}", class, field)
            }
            Self::ModuleNotFound(name) => write!(f, "module not found: {}", name),
            Self::MonoNotInitialized => write!(f, "mono runtime not yet initialized"),
            Self::MetadataError(msg) => write!(f, "metadata error: {}", msg),
            Self::OffsetProbe(msg) => write!(f, "offset probe error: {}", msg),
            Self::DisasmError(msg) => write!(f, "disasm error: {}", msg),
            Self::CollectionOverflow { max } => {
                write!(f, "collection iteration exceeded max_items={}", max)
            }
            Self::Unsupported(s) => write!(f, "unsupported: {}", s),
        }
    }
}

impl std::error::Error for ScryError {}

impl From<windows::core::Error> for ScryError {
    fn from(e: windows::core::Error) -> Self {
        let code = e.code().0 as u32;
        // ERROR_ACCESS_DENIED = 0x80070005
        if code == 0x80070005 {
            Self::AccessDenied(5)
        } else {
            Self::MemoryAccess {
                addr: 0,
                reason: format!("{} (HRESULT 0x{:08X})", e.message(), code),
            }
        }
    }
}

impl From<ScryError> for napi::Error {
    fn from(e: ScryError) -> Self {
        napi::Error::from_reason(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_not_found_display_contains_name() {
        let e = ScryError::ProcessNotFound("Hearthstone.exe".into());
        assert!(e.to_string().contains("Hearthstone.exe"));
    }

    #[test]
    fn memory_access_display_formats_hex() {
        let e = ScryError::MemoryAccess {
            addr: 0xDEADBEEF,
            reason: "test".into(),
        };
        assert!(e.to_string().contains("0xDEADBEEF"));
    }

    #[test]
    fn napi_error_conversion_preserves_message() {
        let e = ScryError::ClassNotFound { name: "Foo".into() };
        let napi_err: napi::Error = e.into();
        assert!(napi_err.reason.contains("Foo"));
    }
}
