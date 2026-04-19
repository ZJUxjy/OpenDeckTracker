use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::remote_ptr::RemotePtr;

/// Iterate a System.Collections.Generic.List<T>, yielding pointers to each element slot.
///
/// List<T> layout (32-bit Mono):
///   +0x00: vtable
///   +0x04: monitor
///   +0x08: _items: T[]   (MonoArray*)
///   +0x0C: _size: i32
///   +0x10: _version: i32
///
/// MonoArray layout (32-bit):
///   +0x00: vtable
///   +0x04: monitor
///   +0x08: bounds*
///   +0x0C: max_length: usize
///   +0x10: --- elements ---
pub fn iter_element_ptrs(
    memory: &ProcessMemory,
    list: RemotePtr,
    elem_size: u32,
    max_items: usize,
) -> Result<Vec<RemotePtr>, ScryError> {
    if list.is_null() {
        return Ok(Vec::new());
    }
    let items_array = memory.read_remote_ptr(list + 0x08)?;
    let size = memory.read_i32(list + 0x0C)?.max(0) as usize;
    if size > max_items {
        return Err(ScryError::CollectionOverflow { max: max_items });
    }
    if items_array.is_null() || size == 0 {
        return Ok(Vec::new());
    }
    let elements_start = items_array + 0x10;
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
}
