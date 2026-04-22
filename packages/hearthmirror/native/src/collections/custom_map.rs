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

const MAP_LINK_SLOTS_OFFSET: u32 = 0x0C;
const MAP_KEY_SLOTS_OFFSET: u32 = 0x10;
const MAP_VALUE_SLOTS_OFFSET: u32 = 0x14;
const MAP_TOUCHED_SLOTS_OFFSET: u32 = 0x1C;
const MAP_COUNT_OFFSET: u32 = 0x24;

/// MonoArray header occupies 0x10 bytes (vtable, monitor, bounds,
/// max_length) before the first element starts.
const ARRAY_DATA_OFFSET: u32 = 0x10;

/// Each `Link` struct is two i32s (HashCode, Next) = 8 bytes.
const LINK_SIZE: u32 = 8;

/// 4-byte managed reference per parallel slot.
const SLOT_PTR_SIZE: u32 = 4;

/// Iterate a `Blizzard.T5.Core.Map<K, V>`, yielding `(key_ptr, value_ptr)`
/// for every populated slot.
///
/// Returns `Ok(vec![])` when the map pointer is null or the slot arrays
/// are unallocated. Returns `Err(ScryError::CollectionOverflow)` when
/// `touchedSlots` exceeds `max_items`, which would indicate either
/// memory corruption or a layout shift rather than a transient state.
pub fn iter_entries(
    memory: &ProcessMemory,
    map: RemotePtr,
    max_items: usize,
) -> Result<Vec<(RemotePtr, RemotePtr)>, ScryError> {
    if map.is_null() {
        return Ok(Vec::new());
    }

    let link_arr = memory.read_remote_ptr(map + MAP_LINK_SLOTS_OFFSET)?;
    let key_arr = memory.read_remote_ptr(map + MAP_KEY_SLOTS_OFFSET)?;
    let val_arr = memory.read_remote_ptr(map + MAP_VALUE_SLOTS_OFFSET)?;
    let touched = memory.read_i32(map + MAP_TOUCHED_SLOTS_OFFSET)?.max(0) as usize;
    let _count = memory.read_i32(map + MAP_COUNT_OFFSET)?.max(0) as usize;

    if touched > max_items {
        return Err(ScryError::CollectionOverflow { max: max_items });
    }
    if link_arr.is_null() || key_arr.is_null() || val_arr.is_null() || touched == 0 {
        return Ok(Vec::new());
    }

    let link_data = link_arr + ARRAY_DATA_OFFSET;
    let key_data = key_arr + ARRAY_DATA_OFFSET;
    let val_data = val_arr + ARRAY_DATA_OFFSET;

    let mut out = Vec::with_capacity(touched);
    for i in 0..touched as u32 {
        let hash = memory.read_i32(link_data + i * LINK_SIZE)?;
        if hash == 0 {
            continue;
        }
        let key = memory.read_remote_ptr(key_data + i * SLOT_PTR_SIZE)?;
        let value = memory.read_remote_ptr(val_data + i * SLOT_PTR_SIZE)?;
        out.push((key, value));
    }
    Ok(out)
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
        slots: &[(i32, u32, u32)],
    ) -> (
        RemotePtr,
        &'static [u8],
        &'static [u8],
        &'static [u8],
        &'static [u8],
    ) {
        let n = slots.len();

        // linkSlots backing: array header (0x10) + n * 8.
        let mut link_buf = vec![0u8; ARRAY_DATA_OFFSET as usize + n * LINK_SIZE as usize];
        link_buf[0x0C..0x10].copy_from_slice(&(n as u32).to_le_bytes());
        // keySlots backing: array header + n * 4.
        let mut key_buf = vec![0u8; ARRAY_DATA_OFFSET as usize + n * SLOT_PTR_SIZE as usize];
        key_buf[0x0C..0x10].copy_from_slice(&(n as u32).to_le_bytes());
        // valueSlots backing.
        let mut val_buf = vec![0u8; ARRAY_DATA_OFFSET as usize + n * SLOT_PTR_SIZE as usize];
        val_buf[0x0C..0x10].copy_from_slice(&(n as u32).to_le_bytes());

        for (i, (h, k, v)) in slots.iter().enumerate() {
            let lo = ARRAY_DATA_OFFSET as usize + i * LINK_SIZE as usize;
            link_buf[lo..lo + 4].copy_from_slice(&h.to_le_bytes());
            link_buf[lo + 4..lo + 8].copy_from_slice(&(-1_i32).to_le_bytes());
            let ko = ARRAY_DATA_OFFSET as usize + i * SLOT_PTR_SIZE as usize;
            key_buf[ko..ko + 4].copy_from_slice(&k.to_le_bytes());
            val_buf[ko..ko + 4].copy_from_slice(&v.to_le_bytes());
        }

        let link_leaked: &'static [u8] = Box::leak(link_buf.into_boxed_slice());
        let key_leaked: &'static [u8] = Box::leak(key_buf.into_boxed_slice());
        let val_leaked: &'static [u8] = Box::leak(val_buf.into_boxed_slice());

        let map_size = 0x30usize;
        let mut map_buf = vec![0u8; map_size];
        let link_addr = link_leaked.as_ptr() as u32;
        let key_addr = key_leaked.as_ptr() as u32;
        let val_addr = val_leaked.as_ptr() as u32;
        map_buf[MAP_LINK_SLOTS_OFFSET as usize..MAP_LINK_SLOTS_OFFSET as usize + 4]
            .copy_from_slice(&link_addr.to_le_bytes());
        map_buf[MAP_KEY_SLOTS_OFFSET as usize..MAP_KEY_SLOTS_OFFSET as usize + 4]
            .copy_from_slice(&key_addr.to_le_bytes());
        map_buf[MAP_VALUE_SLOTS_OFFSET as usize..MAP_VALUE_SLOTS_OFFSET as usize + 4]
            .copy_from_slice(&val_addr.to_le_bytes());
        map_buf[MAP_TOUCHED_SLOTS_OFFSET as usize..MAP_TOUCHED_SLOTS_OFFSET as usize + 4]
            .copy_from_slice(&touched.to_le_bytes());
        map_buf[MAP_COUNT_OFFSET as usize..MAP_COUNT_OFFSET as usize + 4]
            .copy_from_slice(&count.to_le_bytes());

        let map_leaked: &'static [u8] = Box::leak(map_buf.into_boxed_slice());
        let map_ptr = RemotePtr::new(map_leaked.as_ptr() as u32);
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
        let (map, _m, _l, _k, _v) = make_map_fixture(5, 3, &slots);
        let mem = self_memory();
        let out = iter_entries(&mem, map, 100).unwrap();
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
        let (map, _m, _l, _k, _v) = make_map_fixture(1_000_000, 0, &[]);
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
        let (map, _m, _l, _k, _v) = make_map_fixture(0, 0, &[]);
        let mem = self_memory();
        let out = iter_entries(&mem, map, 100).unwrap();
        assert!(out.is_empty());
    }
}
