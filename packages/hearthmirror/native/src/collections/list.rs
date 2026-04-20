use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::offsets::MonoOffsets;
use crate::remote_ptr::RemotePtr;

const ITEMS_OFFSET: u32 = 0x08;
const SIZE_OFFSET: u32 = 0x0C;

/// Iterate a System.Collections.Generic.List<T>, yielding pointers to each element slot.
pub fn iter_element_ptrs(
    memory: &ProcessMemory,
    offsets: &MonoOffsets,
    list: RemotePtr,
    elem_size: u32,
    max_items: usize,
) -> Result<Vec<RemotePtr>, ScryError> {
    let array_data_start = u32::try_from(offsets.structs.array.data_start).map_err(|_| {
        ScryError::Unsupported(format!(
            "array.data_start out of 32-bit range: {}",
            offsets.structs.array.data_start
        ))
    })?;
    iter_element_ptrs_with(
        list,
        elem_size,
        max_items,
        array_data_start,
        |addr| memory.read_remote_ptr(addr),
        |addr| memory.read_i32(addr),
    )
}

pub(crate) fn iter_element_ptrs_with(
    list: RemotePtr,
    elem_size: u32,
    max_items: usize,
    array_data_start: u32,
    mut read_remote_ptr: impl FnMut(RemotePtr) -> Result<RemotePtr, ScryError>,
    mut read_i32: impl FnMut(RemotePtr) -> Result<i32, ScryError>,
) -> Result<Vec<RemotePtr>, ScryError> {
    if list.is_null() {
        return Ok(Vec::new());
    }
    let items_array = read_remote_ptr(list + ITEMS_OFFSET)?;
    let size = read_i32(list + SIZE_OFFSET)?.max(0) as usize;
    if size > max_items {
        return Err(ScryError::CollectionOverflow { max: max_items });
    }
    if items_array.is_null() || size == 0 {
        return Ok(Vec::new());
    }
    let elements_start = items_array + array_data_start;
    Ok((0..size as u32)
        .map(|i| elements_start + i * elem_size)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::handle::OwnedProcessHandle;
    use crate::mono::offsets::MonoOffsets;
    use std::collections::HashMap;

    #[test]
    fn null_list_returns_empty() {
        let h = OwnedProcessHandle::current();
        let mem = ProcessMemory::new(h);
        let offsets = MonoOffsets::bundled_unity_2021_3().unwrap();
        let result = iter_element_ptrs(&mem, &offsets, RemotePtr::NULL, 4, 100).unwrap();
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn iter_element_ptrs_uses_runtime_array_data_start() {
        let list = RemotePtr::new(0x1000);
        let items = RemotePtr::new(0x2000);
        let mut ptrs = HashMap::new();
        ptrs.insert(list + ITEMS_OFFSET, items);

        let mut i32s = HashMap::new();
        i32s.insert(list + SIZE_OFFSET, 3);

        let result = iter_element_ptrs_with(
            list,
            8,
            8,
            0x20,
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
        )
        .unwrap();

        assert_eq!(
            result,
            vec![
                RemotePtr::new(0x2020),
                RemotePtr::new(0x2028),
                RemotePtr::new(0x2030),
            ]
        );
    }
}
