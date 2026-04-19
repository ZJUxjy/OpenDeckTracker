use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::remote_ptr::RemotePtr;

/// Iterate a MonoGList linked list, yielding the `data` pointer of each node.
/// Stops at NULL `next` or when `max_items` is reached.
///
/// MonoGList layout (32-bit):
///   +0x00: data: *void
///   +0x04: next: *MonoGList
///   +0x08: prev: *MonoGList
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
        cur = memory.read_remote_ptr(cur + 0x04)?;
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
}
