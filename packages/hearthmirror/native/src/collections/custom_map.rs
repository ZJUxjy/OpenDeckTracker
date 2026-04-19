//! Hearthstone uses a custom hash-map implementation for some service registries.
//!
//! Layout (inferred from `Rewrite_Design.md` §4.1):
//!   - `keySlots: T[]`
//!   - `valueSlots: T[]`
//!   - `linkSlots: { hashCode: i32, next: i32 }[]`
//!   - `table: i32[]`
//!   - `size: i32`
//!
//! Iteration: walk keySlots[0..size] and valueSlots[0..size] in parallel.

use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::remote_ptr::RemotePtr;

/// Stub iterator. Returns `Unsupported` until the real layout is verified
/// against a running Hearthstone (Phase G — only invoked if needed).
pub fn iter_entries(
    _memory: &ProcessMemory,
    _map: RemotePtr,
    _max_items: usize,
) -> Result<Vec<RemotePtr>, ScryError> {
    Err(ScryError::Unsupported(
        "Hearthstone custom map iterator not yet implemented".into(),
    ))
}
