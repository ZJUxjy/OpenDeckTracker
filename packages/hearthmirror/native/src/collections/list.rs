use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::remote_ptr::RemotePtr;

pub(crate) fn object_data_offset(memory: &ProcessMemory) -> u32 {
    memory.ptr_size() * 2
}

pub(crate) fn mono_array_data_offset(memory: &ProcessMemory) -> u32 {
    memory.ptr_size() * 4
}

pub(crate) fn list_items_offset(memory: &ProcessMemory) -> u32 {
    object_data_offset(memory)
}

pub(crate) fn list_size_offset(memory: &ProcessMemory) -> u32 {
    object_data_offset(memory) + memory.ptr_size()
}

/// Iterate a System.Collections.Generic.List<T>, yielding pointers to each element slot.
///
/// List<T> layout:
///   +0: object header
///   +object_data_offset: _items: T[]   (MonoArray*)
///   +object_data_offset + ptr_size: _size: i32
///   +object_data_offset + ptr_size + 4: _version: i32
///
/// MonoArray layout:
///   +0: object header
///   +object_data_offset: bounds*
///   +object_data_offset + ptr_size: max_length: usize
///   +mono_array_data_offset: --- elements ---
pub fn iter_element_ptrs(
    memory: &ProcessMemory,
    list: RemotePtr,
    elem_size: u32,
    max_items: usize,
) -> Result<Vec<RemotePtr>, ScryError> {
    if list.is_null() {
        return Ok(Vec::new());
    }
    let items_array = memory.read_remote_ptr(list + list_items_offset(memory))?;
    let size = memory.read_i32(list + list_size_offset(memory))?.max(0) as usize;
    if size > max_items {
        return Err(ScryError::CollectionOverflow { max: max_items });
    }
    if items_array.is_null() || size == 0 {
        return Ok(Vec::new());
    }
    let elements_start = items_array + mono_array_data_offset(memory);
    Ok((0..size as u32)
        .map(|i| elements_start + i * elem_size)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::handle::OwnedProcessHandle;

    #[test]
    fn null_list_returns_empty() {
        let h = OwnedProcessHandle::current();
        let mem = ProcessMemory::new(h);
        let result = iter_element_ptrs(&mem, RemotePtr::NULL, 4, 100).unwrap();
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn iter_element_ptrs_uses_64_bit_object_and_array_headers() {
        let h = OwnedProcessHandle::current();
        let mem = ProcessMemory::new_with_ptr_size(h, 8);
        let list_size = 0x40usize;
        let array_size = 0x40usize;
        let buf = vec![0u8; list_size + array_size];
        let leaked: &'static mut [u8] = Box::leak(buf.into_boxed_slice());
        let base = leaked.as_ptr() as u64;
        let list_addr = base;
        let array_addr = base + list_size as u64;

        leaked[0x10..0x18].copy_from_slice(&array_addr.to_le_bytes());
        leaked[0x18..0x1C].copy_from_slice(&2_i32.to_le_bytes());

        let slots = iter_element_ptrs(&mem, RemotePtr::new(list_addr), 8, 10).unwrap();
        assert_eq!(slots.len(), 2);
        assert_eq!(slots[0].raw(), array_addr + 0x20);
        assert_eq!(slots[1].raw(), array_addr + 0x28);
    }
}
