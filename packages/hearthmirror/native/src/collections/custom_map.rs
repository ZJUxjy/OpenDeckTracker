//! `Blizzard.T5.Core.Map<K, V>` iterator — Hearthstone's bespoke hash map.
//!
//! Layout VERIFIED 2026-04-20 against `NetCache.m_netCache` in a live
//! Hearthstone process (`diag_net_cache_values` + `diag_klass_fields` on
//! `Blizzard.T5.Core.Map`2`). The 14 declared fields, in declaration
//! order, are:
//!
//! ```text
//!   +0x0000  INITIAL_SIZE        [STATIC i32]
//!   +0x0000  DEFAULT_LOAD_FACTOR [STATIC f32]
//!   +0x0000  NO_SLOT             [STATIC i32]
//!   +0x0000  HASH_FLAG           [STATIC i32]
//!
//!   +0x0008  table         (int[]?)            // bucket → first slot
//!   +0x000C  linkSlots     (Link[]?)           // (HashCode i32, Next i32)
//!   +0x0010  keySlots      (K[]?)              // parallel to linkSlots
//!   +0x0014  valueSlots    (V[]?)              // parallel to linkSlots
//!   +0x0018  hcp           (IEqualityComparer) // hash-code provider
//!   +0x001C  touchedSlots  (i32)               // high water-mark of slots
//!                                              // ever used (>= count)
//!   +0x0020  emptySlot     (i32)               // free-list head index
//!   +0x0024  count         (i32)               // populated entry count
//!   +0x0028  threshold     (i32)
//!   +0x002C  generation    (i32)
//! ```
//!
//! Iteration walks `linkSlots[0..touchedSlots]`, returning
//! `(key_ptr, value_ptr)` for slots whose `HashCode != 0` — Hearthstone
//! marks populated slots by ORing in `HASH_FLAG (0x80000000)` so the
//! HashCode word is always negative-valued for live entries and exactly
//! zero for free/never-used slots (this is also what
//! `NetCache.m_netCache` showed: 30 contiguous non-zero HashCodes
//! followed by zero-filled slots out to capacity).

use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::remote_ptr::RemotePtr;

fn map_link_slots_offset(memory: &ProcessMemory) -> u32 {
    crate::collections::list::object_data_offset(memory) + memory.ptr_size()
}

fn map_key_slots_offset(memory: &ProcessMemory) -> u32 {
    crate::collections::list::object_data_offset(memory) + memory.ptr_size() * 2
}

fn map_value_slots_offset(memory: &ProcessMemory) -> u32 {
    crate::collections::list::object_data_offset(memory) + memory.ptr_size() * 3
}

fn map_touched_slots_offset(memory: &ProcessMemory) -> u32 {
    crate::collections::list::object_data_offset(memory) + memory.ptr_size() * 5
}

fn map_count_offset(memory: &ProcessMemory) -> u32 {
    map_touched_slots_offset(memory) + 8
}

/// Each `Link` struct is two i32s (HashCode, Next) = 8 bytes.
const LINK_SIZE: u32 = 8;

/// Iterate a `Blizzard.T5.Core.Map<K, V>`, yielding `(key_ptr, value_ptr)`
/// for every populated slot.
///
/// This default assumes `K` is either a managed reference or an 8-byte scalar
/// on 64-bit (`long`), and therefore uses the target pointer size as the key
/// slot width. Use [`iter_entries_with_key_size`] for inline `int` keys.
pub fn iter_entries(
    memory: &ProcessMemory,
    map: RemotePtr,
    max_items: usize,
) -> Result<Vec<(RemotePtr, RemotePtr)>, ScryError> {
    iter_entries_with_key_size(memory, map, memory.ptr_size(), max_items)
}

/// Iterate a `Blizzard.T5.Core.Map<K, V>` with an explicit key slot width.
///
/// Returns `Ok(vec![])` when the map pointer is null or the slot arrays
/// are unallocated. Returns `Err(ScryError::CollectionOverflow)` when
/// `touchedSlots` exceeds `max_items`, which would indicate either
/// memory corruption or a layout shift rather than a transient state.
pub fn iter_entries_with_key_size(
    memory: &ProcessMemory,
    map: RemotePtr,
    key_slot_size: u32,
    max_items: usize,
) -> Result<Vec<(RemotePtr, RemotePtr)>, ScryError> {
    if map.is_null() {
        return Ok(Vec::new());
    }
    if key_slot_size != 4 && key_slot_size != 8 {
        return Err(ScryError::Unsupported(format!(
            "unsupported custom map key slot size: {}",
            key_slot_size
        )));
    }

    let link_arr = memory.read_remote_ptr(map + map_link_slots_offset(memory))?;
    let key_arr = memory.read_remote_ptr(map + map_key_slots_offset(memory))?;
    let val_arr = memory.read_remote_ptr(map + map_value_slots_offset(memory))?;
    let touched = memory
        .read_i32(map + map_touched_slots_offset(memory))?
        .max(0) as usize;
    let _count = memory.read_i32(map + map_count_offset(memory))?.max(0) as usize;

    if touched > max_items {
        return Err(ScryError::CollectionOverflow { max: max_items });
    }
    if link_arr.is_null() || key_arr.is_null() || val_arr.is_null() || touched == 0 {
        return Ok(Vec::new());
    }

    let array_data_offset = crate::collections::list::mono_array_data_offset(memory);
    let link_data = link_arr + array_data_offset;
    let key_data = key_arr + array_data_offset;
    let val_data = val_arr + array_data_offset;

    let mut out = Vec::with_capacity(touched);
    for i in 0..touched as u32 {
        let hash = memory.read_i32(link_data + i * LINK_SIZE)?;
        if hash == 0 {
            continue;
        }
        let key = read_key_slot(memory, key_data + i * key_slot_size, key_slot_size)?;
        let value = memory.read_remote_ptr(val_data + i * memory.ptr_size())?;
        out.push((key, value));
    }
    Ok(out)
}

fn read_key_slot(
    memory: &ProcessMemory,
    addr: RemotePtr,
    key_slot_size: u32,
) -> Result<RemotePtr, ScryError> {
    match key_slot_size {
        4 => Ok(RemotePtr::from(memory.read_u32(addr)?)),
        8 => Ok(RemotePtr::new(memory.read_u64(addr)?)),
        other => Err(ScryError::Unsupported(format!(
            "unsupported custom map key slot size: {}",
            other
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::handle::OwnedProcessHandle;

    fn self_memory() -> ProcessMemory {
        ProcessMemory::new(OwnedProcessHandle::current())
    }

    #[test]
    fn null_map_returns_empty() {
        let mem = self_memory();
        let out = iter_entries(&mem, RemotePtr::NULL, 100).unwrap();
        assert!(out.is_empty());
    }

    /// Build a Map fixture: map struct (0x30 bytes) + 3 separately-leaked
    /// arrays (linkSlots / keySlots / valueSlots), each with a 16-byte
    /// MonoArray header. Zero-hashed link slots are skipped per
    /// HASH_FLAG semantics.
    #[allow(clippy::type_complexity)]
    fn make_map_fixture(
        touched: i32,
        count: i32,
        key_slot_size: u32,
        slots: &[(i32, u64, u64)],
    ) -> (
        RemotePtr,
        &'static [u8],
        &'static [u8],
        &'static [u8],
        &'static [u8],
    ) {
        let n = slots.len();
        let ptr_size = std::mem::size_of::<usize>() as u32;
        let array_data_offset = ptr_size * 4;
        let value_slot_size = ptr_size;

        // linkSlots backing: array header + n * 8.
        let mut link_buf = vec![0u8; array_data_offset as usize + n * LINK_SIZE as usize];
        // keySlots backing.
        let mut key_buf = vec![0u8; array_data_offset as usize + n * key_slot_size as usize];
        // valueSlots backing.
        let mut val_buf = vec![0u8; array_data_offset as usize + n * value_slot_size as usize];

        for (i, (h, k, v)) in slots.iter().enumerate() {
            let lo = array_data_offset as usize + i * LINK_SIZE as usize;
            link_buf[lo..lo + 4].copy_from_slice(&h.to_le_bytes());
            link_buf[lo + 4..lo + 8].copy_from_slice(&(-1_i32).to_le_bytes());
            let ko = array_data_offset as usize + i * key_slot_size as usize;
            if key_slot_size == 4 {
                key_buf[ko..ko + 4].copy_from_slice(&(*k as u32).to_le_bytes());
            } else {
                key_buf[ko..ko + 8].copy_from_slice(&k.to_le_bytes());
            }
            let vo = array_data_offset as usize + i * value_slot_size as usize;
            if value_slot_size == 4 {
                val_buf[vo..vo + 4].copy_from_slice(&(*v as u32).to_le_bytes());
            } else {
                val_buf[vo..vo + 8].copy_from_slice(&v.to_le_bytes());
            }
        }

        let link_leaked: &'static [u8] = Box::leak(link_buf.into_boxed_slice());
        let key_leaked: &'static [u8] = Box::leak(key_buf.into_boxed_slice());
        let val_leaked: &'static [u8] = Box::leak(val_buf.into_boxed_slice());

        let map_size = if ptr_size == 8 { 0x50usize } else { 0x30usize };
        let mut map_buf = vec![0u8; map_size];
        let link_addr = link_leaked.as_ptr() as u64;
        let key_addr = key_leaked.as_ptr() as u64;
        let val_addr = val_leaked.as_ptr() as u64;
        let object_data = ptr_size * 2;
        let link_off = (object_data + ptr_size) as usize;
        let key_off = (object_data + ptr_size * 2) as usize;
        let val_off = (object_data + ptr_size * 3) as usize;
        let touched_off = (object_data + ptr_size * 5) as usize;
        let count_off = touched_off + 8;
        if ptr_size == 4 {
            map_buf[link_off..link_off + 4].copy_from_slice(&(link_addr as u32).to_le_bytes());
            map_buf[key_off..key_off + 4].copy_from_slice(&(key_addr as u32).to_le_bytes());
            map_buf[val_off..val_off + 4].copy_from_slice(&(val_addr as u32).to_le_bytes());
        } else {
            map_buf[link_off..link_off + 8].copy_from_slice(&link_addr.to_le_bytes());
            map_buf[key_off..key_off + 8].copy_from_slice(&key_addr.to_le_bytes());
            map_buf[val_off..val_off + 8].copy_from_slice(&val_addr.to_le_bytes());
        }
        map_buf[touched_off..touched_off + 4].copy_from_slice(&touched.to_le_bytes());
        map_buf[count_off..count_off + 4].copy_from_slice(&count.to_le_bytes());

        let map_leaked: &'static [u8] = Box::leak(map_buf.into_boxed_slice());
        let map_ptr = RemotePtr::new(map_leaked.as_ptr() as u64);
        (map_ptr, map_leaked, link_leaked, key_leaked, val_leaked)
    }

    /// Verify Map iteration skips zero-hash slots (free / never-used) and
    /// returns parallel `(keySlots, valueSlots)` pairs only for populated
    /// slots — the same shape the live `NetCache.m_netCache` exposes.
    #[test]
    #[cfg_attr(
        not(target_pointer_width = "32"),
        ignore = "RemotePtr is u32; Box::leak addresses overflow on 64-bit"
    )]
    fn iter_entries_skips_zero_hash_slots() {
        let slots = vec![
            (0xA5_00_00_01_u32 as i32, 0xAAAA_AAAA, 0xBBBB_BBBB), // populated
            (0, 0, 0),                                            // empty
            (0xA5_00_00_02_u32 as i32, 0xCCCC_CCCC, 0xDDDD_DDDD), // populated
            (0, 0, 0),                                            // empty
            (0xA5_00_00_03_u32 as i32, 0xEEEE_EEEE, 0xFFFF_FFFF), // populated
        ];
        let (map, _m, _l, _k, _v) = make_map_fixture(5, 3, 4, &slots);
        let mem = self_memory();
        let out = iter_entries_with_key_size(&mem, map, 4, 100).unwrap();
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].0.raw(), 0xAAAA_AAAA);
        assert_eq!(out[0].1.raw(), 0xBBBB_BBBB);
        assert_eq!(out[1].0.raw(), 0xCCCC_CCCC);
        assert_eq!(out[1].1.raw(), 0xDDDD_DDDD);
        assert_eq!(out[2].0.raw(), 0xEEEE_EEEE);
        assert_eq!(out[2].1.raw(), 0xFFFF_FFFF);
    }

    #[test]
    #[cfg_attr(
        not(target_pointer_width = "32"),
        ignore = "RemotePtr is u32; Box::leak addresses overflow on 64-bit"
    )]
    fn iter_entries_overflow_guard() {
        let (map, _m, _l, _k, _v) = make_map_fixture(1_000_000, 0, 4, &[]);
        let mem = self_memory();
        let err = iter_entries(&mem, map, 100).unwrap_err();
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
        let (map, _m, _l, _k, _v) = make_map_fixture(0, 0, 4, &[]);
        let mem = self_memory();
        let out = iter_entries(&mem, map, 100).unwrap();
        assert!(out.is_empty());
    }

    #[test]
    fn iter_entries_preserves_64_bit_keys_and_values() {
        let slots = vec![
            (
                0xA5_00_00_01_u32 as i32,
                0x0000_1234_5678_9ABC,
                0x0000_3333_4444_5555,
            ),
            (0, 0, 0),
            (
                0xA5_00_00_02_u32 as i32,
                0x0000_2222_3333_4444,
                0x0000_6666_7777_8888,
            ),
        ];
        let (map, _m, _l, _k, _v) = make_map_fixture(3, 2, 8, &slots);
        let mem = ProcessMemory::new_with_ptr_size(OwnedProcessHandle::current(), 8);

        let out = iter_entries(&mem, map, 100).unwrap();

        assert_eq!(out.len(), 2);
        assert_eq!(out[0].0.raw(), 0x0000_1234_5678_9ABC);
        assert_eq!(out[0].1.raw(), 0x0000_3333_4444_5555);
        assert_eq!(out[1].0.raw(), 0x0000_2222_3333_4444);
        assert_eq!(out[1].1.raw(), 0x0000_6666_7777_8888);
    }

    #[test]
    fn iter_entries_with_key_size_reads_inline_i32_keys_on_64_bit() {
        let slots = vec![
            (0xA5_00_00_01_u32 as i32, 10, 0x0000_3333_4444_5555),
            (0xA5_00_00_02_u32 as i32, 20, 0x0000_6666_7777_8888),
        ];
        let (map, _m, _l, _k, _v) = make_map_fixture(2, 2, 4, &slots);
        let mem = ProcessMemory::new_with_ptr_size(OwnedProcessHandle::current(), 8);

        let out = iter_entries_with_key_size(&mem, map, 4, 100).unwrap();

        assert_eq!(out.len(), 2);
        assert_eq!(out[0].0.raw(), 10);
        assert_eq!(out[0].1.raw(), 0x0000_3333_4444_5555);
        assert_eq!(out[1].0.raw(), 20);
        assert_eq!(out[1].1.raw(), 0x0000_6666_7777_8888);
    }
}
