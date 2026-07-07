use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::remote_ptr::RemotePtr;

// Dictionary<K, V> field offsets — VERIFIED 2026-04-20 against
// `Blizzard.T5.Services.ServiceLocator.m_services` in a live Hearthstone
// process during the `add-hearthmirror-service-locator` change. Captured
// via `cargo run --release --example diag_static_chain -- 0x251805C8 \
//   s_runtimeServices m_services`, which dumped:
//
//   +0x00 vtable                          = 0x28C5A0F8
//   +0x04 monitor                         = 0x00000000
//   +0x08 _buckets    (int[]*)            = 0x2AB90660  → System.Int32[]
//   +0x0C _entries    (Entry[]*)          = 0x2B2B6000  → .Entry[]
//   +0x10 ?           (typically 0)
//   +0x14 ?           (typically 0)
//   +0x18 _comparer   (object*)           = 0x2B29D9D0
//   +0x1C ?
//   +0x20 _count      (i32)               = 0x0000005E (= 94 services)
//   +0x24 _freeList   (i32, -1 when empty)= 0xFFFFFFFF
//   +0x28 _freeCount  (i32)               = 0x00000000
//   +0x2C _version    (i32)               = 0x0000005E
//
// The previously assumed layout (`_entries: +0x14, _count: +0x18`) was a
// guess copied from a stale .NET Framework 4.x reference; modern Mono 2.0
// BDWGC reorders these fields. No shipping reflector iterates a Dictionary
// before this change, so swapping the offsets is a behaviour-neutral fix
// for everyone who was getting `Ok(vec![])` from `iter_entries` previously.
/// Reserved offset of `_buckets` (int[]) — not consumed by `iter_entries`
/// today (it only needs `_entries` for direct enumeration), but kept here
/// so the verified layout block stays self-documenting and future helpers
/// (e.g. bucket-walk-only iteration) have a named anchor.
#[allow(dead_code)]
fn dict_entries_offset(memory: &ProcessMemory) -> u32 {
    crate::collections::list::object_data_offset(memory) + memory.ptr_size()
}

fn dict_count_offset(memory: &ProcessMemory) -> u32 {
    crate::collections::list::object_data_offset(memory) + memory.ptr_size() * 6
}

pub fn reference_entry_size(memory: &ProcessMemory) -> u32 {
    8 + memory.ptr_size() * 2
}

/// Iterate a `System.Collections.Generic.Dictionary<K, V>`, yielding
/// `(entry_ptr, hash_code)` for each populated entry.
///
/// Each `Entry` has the `.NET` standard 16-byte-for-reference-types layout:
///
/// ```text
///   +0x00 hashCode: i32   (high bit cleared = populated; high bit set / negative = free-list slot)
///   +0x04 next:     i32   (chain index into _entries; -1 = end of bucket)
///   +0x08 key:      K     (4 bytes for object/pointer K)
///   +0x0C value:    V     (4 bytes for object/pointer V)
/// ```
///
/// Caller supplies `entry_size` (sum of header + sizeof(K) + sizeof(V)
/// rounded up to alignment); for `Dictionary<RefT, RefT>` on 32-bit, this
/// is 16. Caller computes `key`/`value` field reads relative to
/// `entry.addr + 0x08` and `entry.addr + 0x08 + ptr_size` respectively.
pub fn iter_entries(
    memory: &ProcessMemory,
    dict: RemotePtr,
    entry_size: u32,
    max_items: usize,
) -> Result<Vec<DictEntry>, ScryError> {
    if dict.is_null() {
        return Ok(Vec::new());
    }
    let entries_array = memory.read_remote_ptr(dict + dict_entries_offset(memory))?;
    let count = memory.read_i32(dict + dict_count_offset(memory))?.max(0) as usize;
    if count > max_items {
        return Err(ScryError::CollectionOverflow { max: max_items });
    }
    if entries_array.is_null() || count == 0 {
        return Ok(Vec::new());
    }
    let entries_start = entries_array + crate::collections::list::mono_array_data_offset(memory);
    let mut out = Vec::with_capacity(count);
    for i in 0..count as u32 {
        let entry_addr = entries_start + i * entry_size;
        let hash = memory.read_i32(entry_addr)?;
        // Negative hash (high bit set) marks a free-list slot in modern
        // .NET / Mono Dictionaries. Skip these to surface only populated
        // entries to the caller.
        if hash >= 0 {
            out.push(DictEntry {
                addr: entry_addr,
                hash,
            });
        }
    }
    Ok(out)
}

/// Read a Dictionary entry's `key` field as a remote pointer. Convenience
/// for callers iterating reference-keyed Dictionaries (e.g.
/// `Dictionary<Type, ServiceInfo>`).
pub fn read_entry_key_ptr(
    memory: &ProcessMemory,
    entry: DictEntry,
) -> Result<RemotePtr, ScryError> {
    memory.read_remote_ptr(entry.addr + 0x08)
}

/// Read a Dictionary entry's `value` field as a remote pointer.
pub fn read_entry_value_ptr(
    memory: &ProcessMemory,
    entry: DictEntry,
) -> Result<RemotePtr, ScryError> {
    memory.read_remote_ptr(entry.addr + 0x08 + memory.ptr_size())
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

    /// Build a minimum-viable in-memory Dictionary fixture: one struct
    /// holding `_entries` pointer + `_count` at the verified offsets, and
    /// a backing entry array (`MonoArray` header + N × 16-byte entries).
    /// Both buffers are leaked so the returned `(dict_ptr, entries_ptr,
    /// _backing)` addresses stay valid for the whole test run; the
    /// `_backing` Vec is returned so the test owner can hold it explicitly
    /// rather than relying on `Box::leak` semantics.
    #[allow(clippy::too_many_lines)]
    fn make_dict_fixture(
        count: i32,
        entries: &[(i32, u64, u64)],
        ptr_size: u32,
    ) -> (RemotePtr, &'static [u8]) {
        let array_data_offset = ptr_size * 4;
        let entry_size = 8 + ptr_size * 2;
        // Layout: dict struct (0x30 bytes is enough), then array header (0x10) +
        // N × 16-byte entries. We allocate one combined buffer so addresses
        // are stable.
        let entries_count = entries.len();
        let array_size = array_data_offset as usize + entries_count * entry_size as usize;
        let dict_size = if ptr_size == 8 { 0x50usize } else { 0x30usize };
        let total = dict_size + array_size;
        let buf = vec![0u8; total];

        // Compute base addresses (we'll fill in real values after we get
        // the leaked address).
        let leaked: &'static mut [u8] = Box::leak(buf.into_boxed_slice());
        let base_addr = leaked.as_ptr() as usize;
        let dict_addr = base_addr;
        let array_addr = base_addr + dict_size;
        let entries_data_start = array_addr + array_data_offset as usize;

        // Fill dict struct: _entries @ object_data + ptr_size, _count after
        // the pointer-sized reference slots observed in Mono's Dictionary.
        let object_data = ptr_size * 2;
        let entries_off = (object_data + ptr_size) as usize;
        let count_off = (object_data + ptr_size * 6) as usize;
        if ptr_size == 4 {
            leaked[entries_off..entries_off + 4]
                .copy_from_slice(&(array_addr as u32).to_le_bytes());
        } else {
            leaked[entries_off..entries_off + 8]
                .copy_from_slice(&(array_addr as u64).to_le_bytes());
        }
        leaked[count_off..count_off + 4].copy_from_slice(&count.to_le_bytes());

        // Fill each entry: hash @ +0, next @ +4 (=-1), key @ +8, value @ +0xC.
        for (i, (hash, key, value)) in entries.iter().enumerate() {
            let off = entries_data_start - base_addr + i * entry_size as usize;
            leaked[off..off + 4].copy_from_slice(&hash.to_le_bytes());
            leaked[off + 4..off + 8].copy_from_slice(&(-1_i32).to_le_bytes());
            if ptr_size == 4 {
                leaked[off + 8..off + 12].copy_from_slice(&(*key as u32).to_le_bytes());
                leaked[off + 12..off + 16].copy_from_slice(&(*value as u32).to_le_bytes());
            } else {
                leaked[off + 8..off + 16].copy_from_slice(&key.to_le_bytes());
                leaked[off + 16..off + 24].copy_from_slice(&value.to_le_bytes());
            }
        }

        let leaked_imm: &'static [u8] = leaked;
        (RemotePtr::new(dict_addr as u64), leaked_imm)
    }

    fn self_memory() -> ProcessMemory {
        // GetCurrentProcess() pseudo-handle always has full access — using
        // OpenProcess(self_pid) would require explicit PROCESS_VM_READ
        // rights on our own process, which Windows does not always grant.
        ProcessMemory::new(OwnedProcessHandle::current())
    }

    /// All three fixture-backed tests in this module rely on `Box::leak`
    /// returning a stable address that fits into a `u32` (because
    /// `RemotePtr` is `u32`). On 64-bit dev builds that's not generally
    /// true, so we mark them `#[ignore]` there. The shipping cdylib is
    /// always built for `i686-pc-windows-msvc`, so they execute normally
    /// when CI runs `cargo test --target i686-pc-windows-msvc`.
    #[test]
    #[cfg_attr(
        not(target_pointer_width = "32"),
        ignore = "RemotePtr is u32; Box::leak addresses overflow on 64-bit"
    )]
    fn iter_entries_layout_verified() {
        // 5 entries: 1 and 3 are free-list (hash < 0), 0/2/4 are populated.
        let entries = vec![
            (0x111_i32, 0xAAAA_AAAA, 0xBBBB_BBBB),
            (-1, 0, 0),
            (0x222, 0xCCCC_CCCC, 0xDDDD_DDDD),
            (-1, 0, 0),
            (0x333, 0xEEEE_EEEE, 0xFFFF_FFFF),
        ];
        let (dict_ptr, _backing) = make_dict_fixture(5, &entries, 4);
        let mem = self_memory();

        let out = iter_entries(&mem, dict_ptr, 16, 100).expect("iter");
        assert_eq!(out.len(), 3, "free-list slots must be skipped");
        assert_eq!(out[0].hash, 0x111);
        assert_eq!(out[1].hash, 0x222);
        assert_eq!(out[2].hash, 0x333);

        // Verify the value-pointer extraction helper resolves the right
        // entry slot.
        let v0 = read_entry_value_ptr(&mem, out[0]).unwrap();
        assert_eq!(v0.raw(), 0xBBBB_BBBB);
        let v2 = read_entry_value_ptr(&mem, out[2]).unwrap();
        assert_eq!(v2.raw(), 0xFFFF_FFFF);
    }

    #[test]
    #[cfg_attr(
        not(target_pointer_width = "32"),
        ignore = "RemotePtr is u32; Box::leak addresses overflow on 64-bit"
    )]
    fn iter_entries_overflow_guard() {
        let (dict_ptr, _backing) = make_dict_fixture(1_000_000, &[], 4);
        let mem = self_memory();
        let err = iter_entries(&mem, dict_ptr, 16, 100).unwrap_err();
        match err {
            ScryError::CollectionOverflow { max } => assert_eq!(max, 100),
            other => panic!("expected CollectionOverflow, got {:?}", other),
        }
    }

    #[test]
    #[cfg_attr(
        not(target_pointer_width = "32"),
        ignore = "RemotePtr is u32; Box::leak addresses overflow on 64-bit"
    )]
    fn iter_entries_empty_returns_empty() {
        // _count = 0 with non-null entries pointer.
        let (dict_ptr, _backing) = make_dict_fixture(0, &[(0x111, 0xAAAA_AAAA, 0xBBBB_BBBB)], 4);
        let mem = self_memory();
        let out = iter_entries(&mem, dict_ptr, 16, 100).expect("iter");
        assert_eq!(out.len(), 0);
    }

    #[test]
    fn iter_entries_reads_64_bit_reference_entries() {
        let entries = vec![
            (0x111_i32, 0x0000_1234_5678_9ABC, 0x0000_3333_4444_5555),
            (-1, 0, 0),
            (0x222, 0x0000_2222_3333_4444, 0x0000_6666_7777_8888),
        ];
        let (dict_ptr, _backing) = make_dict_fixture(3, &entries, 8);
        let mem = ProcessMemory::new_with_ptr_size(OwnedProcessHandle::current(), 8);

        let out = iter_entries(&mem, dict_ptr, reference_entry_size(&mem), 100).unwrap();

        assert_eq!(out.len(), 2);
        assert_eq!(
            read_entry_key_ptr(&mem, out[0]).unwrap().raw(),
            0x0000_1234_5678_9ABC
        );
        assert_eq!(
            read_entry_value_ptr(&mem, out[0]).unwrap().raw(),
            0x0000_3333_4444_5555
        );
        assert_eq!(
            read_entry_key_ptr(&mem, out[1]).unwrap().raw(),
            0x0000_2222_3333_4444
        );
        assert_eq!(
            read_entry_value_ptr(&mem, out[1]).unwrap().raw(),
            0x0000_6666_7777_8888
        );
    }
}
