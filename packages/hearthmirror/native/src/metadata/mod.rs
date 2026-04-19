pub mod tables;

use crate::error::ScryError;
use std::path::Path;

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
