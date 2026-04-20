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
    DisasmPatternUnknown { bytes: Vec<u8> },
    CollectionOverflow { max: usize },
    Unsupported(String),
    /// A critical disasm-based offset probe failed (5e). The string identifies
    /// the probe site (typically a Mono export name + extracted struct/field).
    OffsetProbeFailed(String),
    /// A required Mono DLL export is missing (5e).
    ExportNotFound(String),
    /// `OffsetProber` was constructed with `bitness != 32` (5e).
    InvalidProbeBitness(u32),
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
            Self::DisasmPatternUnknown { bytes } => {
                let hex = bytes.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
                write!(f, "disasm pattern unknown: {}", hex)
            }
            Self::CollectionOverflow { max } => {
                write!(f, "collection iteration exceeded max_items={}", max)
            }
            Self::Unsupported(s) => write!(f, "unsupported: {}", s),
            Self::OffsetProbeFailed(site) => write!(f, "offset probe failed: {}", site),
            Self::ExportNotFound(name) => write!(f, "mono export not found: {}", name),
            Self::InvalidProbeBitness(b) => {
                write!(f, "invalid probe bitness: {} (only 32 supported)", b)
            }
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
        let e = ScryError::MemoryAccess { addr: 0xDEADBEEF, reason: "test".into() };
        assert!(e.to_string().contains("0xDEADBEEF"));
    }

    #[test]
    fn napi_error_conversion_preserves_message() {
        let e = ScryError::ClassNotFound { name: "Foo".into() };
        let napi_err: napi::Error = e.into();
        assert!(napi_err.reason.contains("Foo"));
    }
}
