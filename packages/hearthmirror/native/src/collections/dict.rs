use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::offsets::MonoOffsets;
use crate::remote_ptr::RemotePtr;
const DICT_ENTRY_HEADER_SIZE: u32 = (std::mem::size_of::<i32>() * 2) as u32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReferencePairLayout {
    pub entry_size: u32,
    pub value_offset: u32,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct EntryIterationLayout {
    pub dictionary: super::DictionaryLayout,
    pub array_data_start: u32,
    pub array_max_length_offset: u32,
}

/// Iterate a System.Collections.Generic.Dictionary<K, V>, yielding (entry_ptr, hash_code).
pub fn iter_entries(
    memory: &ProcessMemory,
    offsets: &MonoOffsets,
    dict: RemotePtr,
    entry_size: u32,
    max_items: usize,
) -> Result<Vec<DictEntry>, ScryError> {
    let dictionary_layout = super::dictionary_layout(offsets)?;
    let array_data_start = u32::try_from(offsets.structs.array.data_start).map_err(|_| {
        ScryError::Unsupported(format!(
            "array.data_start out of 32-bit range: {}",
            offsets.structs.array.data_start
        ))
    })?;
    let array_max_length_offset =
        u32::try_from(offsets.structs.array.max_length).map_err(|_| {
            ScryError::Unsupported(format!(
                "array.max_length out of 32-bit range: {}",
                offsets.structs.array.max_length
            ))
        })?;
    let iteration_layout = EntryIterationLayout {
        dictionary: dictionary_layout,
        array_data_start,
        array_max_length_offset,
    };
    iter_entries_with(
        dict,
        entry_size,
        max_items,
        iteration_layout,
        |addr| memory.read_remote_ptr(addr),
        |addr| memory.read_i32(addr),
        |addr| memory.read_u32(addr),
    )
}

pub fn reference_pair_layout(ptr_size: usize) -> Result<ReferencePairLayout, ScryError> {
    if ptr_size > std::mem::size_of::<u32>() {
        return Err(ScryError::Unsupported(format!(
            "dictionary reference pair layout requires 32-bit pointers, got {ptr_size}"
        )));
    }
    let ptr_size = u32::try_from(ptr_size)
        .map_err(|_| ScryError::Unsupported(format!("ptr_size out of range: {ptr_size}")))?;
    let value_offset = DICT_ENTRY_HEADER_SIZE
        .checked_add(ptr_size)
        .ok_or_else(|| ScryError::Unsupported("dictionary value offset overflow".into()))?;
    let entry_size = value_offset
        .checked_add(ptr_size)
        .ok_or_else(|| ScryError::Unsupported("dictionary entry size overflow".into()))?;

    Ok(ReferencePairLayout {
        entry_size,
        value_offset,
    })
}

pub(crate) fn iter_entries_with(
    dict: RemotePtr,
    entry_size: u32,
    max_items: usize,
    layout: EntryIterationLayout,
    mut read_remote_ptr: impl FnMut(RemotePtr) -> Result<RemotePtr, ScryError>,
    mut read_i32: impl FnMut(RemotePtr) -> Result<i32, ScryError>,
    mut read_u32: impl FnMut(RemotePtr) -> Result<u32, ScryError>,
) -> Result<Vec<DictEntry>, ScryError> {
    if dict.is_null() {
        return Ok(Vec::new());
    }
    let entries_array = read_remote_ptr(dict + layout.dictionary.entries_offset)?;
    let count = read_i32(dict + layout.dictionary.count_offset)?.max(0) as usize;
    if count > max_items {
        return Err(ScryError::CollectionOverflow { max: max_items });
    }
    if entries_array.is_null() || count == 0 {
        return Ok(Vec::new());
    }
    if entry_size == 0 {
        return Err(ScryError::Unsupported(
            "dictionary entry_size must be non-zero".into(),
        ));
    }

    let array_len = read_u32(entries_array + layout.array_max_length_offset)? as usize;
    if array_len == 0 {
        return Ok(Vec::new());
    }

    let entries_start = entries_array + layout.array_data_start;
    let max_scan = array_len.min((count * 4).max(count));
    let max_scan = u32::try_from(max_scan)
        .map_err(|_| ScryError::Unsupported("dictionary scan exceeds 32-bit range".into()))?;
    let mut out = Vec::with_capacity(count.min(array_len));
    for i in 0..max_scan {
        let entry_addr = entries_start + i * entry_size;
        let hash = read_i32(entry_addr)?;
        if hash >= 0 {
            out.push(DictEntry {
                addr: entry_addr,
                hash,
            });
            if out.len() == count {
                break;
            }
        }
    }
    Ok(out)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DictEntry {
    pub addr: RemotePtr,
    pub hash: i32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::handle::OwnedProcessHandle;
    use crate::mono::offsets::MonoOffsets;
    use std::collections::HashMap;

    #[test]
    fn null_dict_returns_empty() {
        let h = OwnedProcessHandle::current();
        let mem = ProcessMemory::new(h);
        let offsets = MonoOffsets::bundled_unity_2021_3().unwrap();
        let result = iter_entries(&mem, &offsets, RemotePtr::NULL, 16, 100).unwrap();
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn iter_entries_scans_past_removed_slots_until_count_is_satisfied() {
        let dict = RemotePtr::new(0x1000);
        let entries = RemotePtr::new(0x2000);
        let dictionary_layout = super::super::DictionaryLayout {
            entries_offset: 0x0C,
            count_offset: 0x20,
        };
        let layout = EntryIterationLayout {
            dictionary: dictionary_layout,
            array_data_start: 0x20,
            array_max_length_offset: 0x0C,
        };
        let entry_size = 0x10;
        let mut ptrs = HashMap::new();
        ptrs.insert(dict + dictionary_layout.entries_offset, entries);

        let mut i32s = HashMap::new();
        i32s.insert(dict + dictionary_layout.count_offset, 2);
        i32s.insert(entries + layout.array_data_start, -1);
        i32s.insert(entries + layout.array_data_start + entry_size, 111);
        i32s.insert(entries + layout.array_data_start + entry_size * 2, -1);
        i32s.insert(entries + layout.array_data_start + entry_size * 3, 222);

        let mut u32s = HashMap::new();
        u32s.insert(entries + 0x0C, 4);

        let result = iter_entries_with(
            dict,
            entry_size,
            8,
            layout,
            |addr| {
                ptrs.get(&addr)
                    .copied()
                    .ok_or_else(|| ScryError::MemoryAccess {
                        addr: addr.raw(),
                        reason: "missing ptr".into(),
                    })
            },
            |addr| {
                i32s.get(&addr)
                    .copied()
                    .ok_or_else(|| ScryError::MemoryAccess {
                        addr: addr.raw(),
                        reason: "missing i32".into(),
                    })
            },
            |addr| {
                u32s.get(&addr)
                    .copied()
                    .ok_or_else(|| ScryError::MemoryAccess {
                        addr: addr.raw(),
                        reason: "missing u32".into(),
                    })
            },
        )
        .unwrap();

        assert_eq!(
            result,
            vec![
                DictEntry {
                    addr: RemotePtr::new(0x2030),
                    hash: 111,
                },
                DictEntry {
                    addr: RemotePtr::new(0x2050),
                    hash: 222,
                },
            ]
        );
    }

    #[test]
    fn reference_pair_layout_tracks_pointer_size() {
        let layout = reference_pair_layout(4).expect("32-bit layout");
        assert_eq!(layout.entry_size, 16);
        assert_eq!(layout.value_offset, 12);
    }

    #[test]
    fn reference_pair_layout_rejects_unsupported_pointer_sizes() {
        let err = reference_pair_layout(8).expect_err("64-bit layout should be rejected");
        assert!(matches!(err, ScryError::Unsupported(_)));
    }
}
