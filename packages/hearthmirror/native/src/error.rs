use std::fmt;

#[derive(Debug, Clone)]
pub enum ScryError {
    ProcessNotFound(String),
    AccessDenied(u32),
    MemoryAccess { addr: u32, reason: String },
    ClassNotFound { namespace: String, name: String },
    FieldNotFound { class: String, field: String },
    ModuleNotFound(String),
    MonoNotInitialized,
    MetadataError(String),
    CollectionOverflow { max: usize },
    Unsupported(String),
    /// A critical disasm-based offset probe failed (5e). The string identifies
    /// the probe site (typically a Mono export name + extracted struct/field).
    OffsetProbeFailed(String),
    /// A required Mono DLL export is missing (5e).
    ExportNotFound(String),
    /// `OffsetProber` was constructed with `bitness != 32` (5e).
    InvalidProbeBitness(u32),
    /// The parent chain of a class exceeded [`crate::mono::class::MAX_PARENT_CHAIN_DEPTH`]
    /// steps before hitting `System.Object` — either the chain is malformed
    /// or a cycle evaded the self-address guard (5f).
    ClassHierarchyTooDeep { class: String, depth: usize },
    /// `MonoImage::enumerate_classes` walked a non-NULL `class_cache`
    /// MonoInternalHashTable with `size > 0` but found zero valid class
    /// pointers in any bucket, indicating a probable offset mis-configuration
    /// in the hashtable layout (5f).
    ClassCacheEmpty { image: String },
}

impl fmt::Display for ScryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ProcessNotFound(name) => write!(f, "process not found: {}", name),
            Self::AccessDenied(code) => write!(f, "access denied (Win32 error {})", code),
            Self::MemoryAccess { addr, reason } => {
                write!(f, "memory access failed at 0x{:08X}: {}", addr, reason)
            }
            Self::ClassNotFound { namespace, name } => {
                if namespace.is_empty() {
                    write!(f, "mono class not found: {}", name)
                } else {
                    write!(f, "mono class not found: {}.{}", namespace, name)
                }
            }
            Self::FieldNotFound { class, field } => {
                write!(f, "mono field not found: {}.{}", class, field)
            }
            Self::ModuleNotFound(name) => write!(f, "module not found: {}", name),
            Self::MonoNotInitialized => write!(f, "mono runtime not yet initialized"),
            Self::MetadataError(msg) => write!(f, "metadata error: {}", msg),
            Self::CollectionOverflow { max } => {
                write!(f, "collection iteration exceeded max_items={}", max)
            }
            Self::Unsupported(s) => write!(f, "unsupported: {}", s),
            Self::OffsetProbeFailed(site) => write!(f, "offset probe failed: {}", site),
            Self::ExportNotFound(name) => write!(f, "mono export not found: {}", name),
            Self::InvalidProbeBitness(b) => {
                write!(f, "invalid probe bitness: {} (only 32 supported)", b)
            }
            Self::ClassHierarchyTooDeep { class, depth } => {
                write!(
                    f,
                    "class hierarchy too deep for {} (walked {} parents without reaching root)",
                    class, depth
                )
            }
            Self::ClassCacheEmpty { image } => {
                write!(
                    f,
                    "class_cache in image '{}' has size>0 but enumerated 0 valid classes (offsets likely wrong)",
                    image
                )
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
        let e = ScryError::ClassNotFound {
            namespace: String::new(),
            name: "Foo".into(),
        };
        let napi_err: napi::Error = e.into();
        assert!(napi_err.reason.contains("Foo"));
    }

    #[test]
    fn class_not_found_with_namespace_formats_dotted() {
        let e = ScryError::ClassNotFound {
            namespace: "Blizzard.T5.Services".into(),
            name: "Entity".into(),
        };
        let msg = e.to_string();
        assert!(msg.contains("Blizzard.T5.Services.Entity"));
    }

    #[test]
    fn class_not_found_without_namespace_formats_bare_name() {
        let e = ScryError::ClassNotFound {
            namespace: String::new(),
            name: "CollectionManager".into(),
        };
        let msg = e.to_string();
        assert!(msg.contains("CollectionManager"));
        assert!(!msg.contains("."));
    }
}
