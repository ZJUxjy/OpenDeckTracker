use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::remote_ptr::RemotePtr;

/// Iterate a System.Collections.Generic.Dictionary<K, V>, yielding (entry_ptr, hash_code, next).
///
/// Dictionary<K, V> layout (32-bit Mono, .NET Framework 4.x):
///   +0x10: _buckets: int[]      (i32 indices into _entries, 1-based; 0 = empty)
///   +0x14: _entries: Entry[]    (MonoArray)
///   +0x18: _count: i32
///   +0x1C: _freeList: i32
///   +0x20: _freeCount: i32
///
/// Entry struct (variable-size, depends on K and V):
///   +0x00: hashCode: i32
///   +0x04: next: i32
///   +0x08: key: K
///   +0x08+sizeof(K): value: V
///
/// Returns vector of (entry_base_ptr, hash_code, key_offset_within_entry).
pub fn iter_entries(
    memory: &ProcessMemory,
    dict: RemotePtr,
    entry_size: u32,
    max_items: usize,
) -> Result<Vec<DictEntry>, ScryError> {
    if dict.is_null() {
        return Ok(Vec::new());
    }
    let entries_array = memory.read_remote_ptr(dict + 0x14)?;
    let count = memory.read_i32(dict + 0x18)?.max(0) as usize;
    if count > max_items {
        return Err(ScryError::CollectionOverflow { max: max_items });
    }
    if entries_array.is_null() || count == 0 {
        return Ok(Vec::new());
    }
    let entries_start = entries_array + 0x10;
    let mut out = Vec::with_capacity(count);
    for i in 0..count as u32 {
        let entry_addr = entries_start + i * entry_size;
        let hash = memory.read_i32(entry_addr)?;
        // _next is +0x04. If hash < 0, this slot is unused (free list).
        if hash >= 0 {
            out.push(DictEntry {
                addr: entry_addr,
                hash,
            });
        }
    }
    Ok(out)
}

#[derive(Debug, Clone, Copy)]
pub struct DictEntry {
    pub addr: RemotePtr,
    pub hash: i32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::handle::OwnedProcessHandle;

    #[test]
    fn null_dict_returns_empty() {
        let h = OwnedProcessHandle::current();
        let mem = ProcessMemory::new(h);
        let result = iter_entries(&mem, RemotePtr::NULL, 16, 100).unwrap();
        assert_eq!(result.len(), 0);
    }
}
