pub mod pe;
pub mod streams;
pub mod tables;
pub mod tokens;

use crate::error::ScryError;
use std::fmt;
use std::path::Path;

/// Errors specific to .NET metadata parsing.
#[derive(Debug, Clone)]
pub enum MetadataError {
    /// The byte slice is not a valid PE image.
    InvalidPe(String),
    /// The PE has no CLI/COM descriptor — not a .NET assembly.
    NotDotNet,
    /// A required structure overruns the available data.
    Truncated(String),
}

impl fmt::Display for MetadataError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPe(msg) => write!(f, "invalid PE: {}", msg),
            Self::NotDotNet => write!(f, "not a .NET assembly"),
            Self::Truncated(msg) => write!(f, "truncated: {}", msg),
        }
    }
}

impl std::error::Error for MetadataError {}

impl From<MetadataError> for ScryError {
    fn from(e: MetadataError) -> Self {
        ScryError::MetadataError(e.to_string())
    }
}

pub struct MetadataReader {
    bytes: Vec<u8>,
}

impl MetadataReader {
    pub fn from_disk(path: impl AsRef<Path>) -> Result<Self, ScryError> {
        let bytes = std::fs::read(path.as_ref())
            .map_err(|e| ScryError::MetadataError(format!("disk read failed: {}", e)))?;
        Ok(Self { bytes })
    }

    pub fn from_memory(bytes: Vec<u8>) -> Self {
        Self { bytes }
    }

    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }
}
