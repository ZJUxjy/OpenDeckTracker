use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::remote_ptr::RemotePtr;

/// Iterate a MonoGList linked list, yielding the `data` pointer of each node.
/// Stops at NULL `next` or when `max_items` is reached.
///
/// MonoGList layout:
///   +0x00: data: *void
///   +ptr_size: next: *MonoGList
///   +(ptr_size * 2): prev: *MonoGList
pub fn iter(
    memory: &ProcessMemory,
    head: RemotePtr,
    max_items: usize,
) -> Result<Vec<RemotePtr>, ScryError> {
    let mut out = Vec::new();
    let mut cur = head;
    let mut count = 0;
    while !cur.is_null() {
        if count >= max_items {
            return Err(ScryError::CollectionOverflow { max: max_items });
        }
        let data = memory.read_remote_ptr(cur)?;
        out.push(data);
        cur = memory.read_remote_ptr(cur + memory.ptr_size())?;
        count += 1;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::handle::OwnedProcessHandle;

    #[test]
    fn empty_head_returns_empty() {
        let h = OwnedProcessHandle::current();
        let mem = ProcessMemory::new(h);
        let result = iter(&mem, RemotePtr::NULL, 10).unwrap();
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn iter_uses_64_bit_next_pointer_offset() {
        let h = OwnedProcessHandle::current();
        let mem = ProcessMemory::new_with_ptr_size(h, 8);
        let node_size = 24usize;
        let buf = vec![0u8; node_size * 2];
        let leaked: &'static mut [u8] = Box::leak(buf.into_boxed_slice());
        let base = leaked.as_ptr() as u64;
        let node0 = base;
        let node1 = base + node_size as u64;
        let data0 = 0x0000_1234_5678_9ABC_u64;
        let data1 = 0x0000_1111_2222_3333_u64;

        leaked[0..8].copy_from_slice(&data0.to_le_bytes());
        leaked[8..16].copy_from_slice(&node1.to_le_bytes());
        leaked[node_size..node_size + 8].copy_from_slice(&data1.to_le_bytes());
        leaked[node_size + 8..node_size + 16].copy_from_slice(&0_u64.to_le_bytes());

        let result = iter(&mem, RemotePtr::new(node0), 10).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].raw(), data0);
        assert_eq!(result[1].raw(), data1);
    }
}
