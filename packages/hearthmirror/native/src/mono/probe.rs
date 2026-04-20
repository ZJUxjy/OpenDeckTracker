use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::remote_ptr::RemotePtr;

/// Number of u32-aligned slots to scan when probing.
pub const MAX_PROBE_SLOTS: u32 = 64; // 64 * 4 bytes = 0x100

/// Probe a field offset within a structure.
///
/// Reads `MAX_PROBE_SLOTS * 4` bytes starting at `base`, treats them as
/// `[u32; MAX_PROBE_SLOTS]`, and returns the **byte offset** (slot_index * 4)
/// of the first slot for which `validator` returns Ok(true). Returns
/// `Err(FieldNotFound)` if no slot validates.
///
/// Caller MUST pass `owner_class` and `owner_field` identifiers (e.g.
/// `"MonoDomain"`, `"loaded_images"`) so probe failures surface actionable
/// error strings like `mono field not found: MonoDomain.loaded_images`
/// instead of opaque placeholders. See spike 0003 F-7.
pub fn probe_field_offset<F>(
    memory: &ProcessMemory,
    base: RemotePtr,
    owner_class: &str,
    owner_field: &str,
    validator: F,
) -> Result<u32, ScryError>
where
    F: Fn(RemotePtr) -> bool,
{
    let bytes = memory.read_bytes(base, (MAX_PROBE_SLOTS * 4) as usize)?;
    for i in 0..MAX_PROBE_SLOTS as usize {
        let slot = u32::from_le_bytes([
            bytes[i * 4],
            bytes[i * 4 + 1],
            bytes[i * 4 + 2],
            bytes[i * 4 + 3],
        ]);
        if slot != 0 && validator(RemotePtr::new(slot)) {
            return Ok((i * 4) as u32);
        }
    }
    Err(ScryError::FieldNotFound {
        class: owner_class.into(),
        field: owner_field.into(),
    })
}

/// Validator: a remote pointer points to memory that LOOKS like a valid heap
/// region with at least `min_bytes` readable starting at the address.
pub fn looks_readable(memory: &ProcessMemory, addr: RemotePtr, min_bytes: usize) -> bool {
    memory.read_bytes(addr, min_bytes).is_ok()
}

/// Validator: the bytes at `addr` look like a printable ASCII C string of at
/// least `min_len` characters before a null terminator.
pub fn looks_like_cstring(memory: &ProcessMemory, addr: RemotePtr, min_len: usize) -> bool {
    let buf = match memory.read_bytes(addr, 64) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    if end < min_len {
        return false;
    }
    buf[..end].iter().all(|&c| (0x20..=0x7E).contains(&c))
}

#[cfg(test)]
mod tests {
    // Probe behavior is validated against real MonoDomain in Phase C.2 integration test.
    // Pure unit testing requires constructing a real cross-process memory layout,
    // which is more work than it's worth here.
}
