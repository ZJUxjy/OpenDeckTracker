use crate::error::ScryError;
use crate::mono::{MonoObject, MonoRuntime};
use crate::remote_ptr::RemotePtr;

pub fn iter_entries(
    runtime: &MonoRuntime,
    map: RemotePtr,
    max_items: usize,
) -> Result<Vec<RemotePtr>, ScryError> {
    if map.is_null() {
        return Ok(Vec::new());
    }

    let object = MonoObject::from_addr(runtime, map)?;
    let value_slots = object.read_field_ptr("valueSlots")?;
    if value_slots.is_null() {
        return Ok(Vec::new());
    }

    let size = resolve_size_with(|field| object.read_field_i32(field))?.unwrap_or(0);
    if size > max_items {
        return Err(ScryError::CollectionOverflow { max: max_items });
    }
    if size == 0 {
        return Ok(Vec::new());
    }

    let array_data_start =
        u32::try_from(runtime.offsets.structs.array.data_start).map_err(|_| {
            ScryError::Unsupported(format!(
                "array.data_start out of 32-bit range: {}",
                runtime.offsets.structs.array.data_start
            ))
        })?;
    let array_max_length_offset =
        u32::try_from(runtime.offsets.structs.array.max_length).map_err(|_| {
            ScryError::Unsupported(format!(
                "array.max_length out of 32-bit range: {}",
                runtime.offsets.structs.array.max_length
            ))
        })?;
    let ptr_size = u32::try_from(runtime.offsets.ptr_size).map_err(|_| {
        ScryError::Unsupported(format!(
            "ptr_size out of range: {}",
            runtime.offsets.ptr_size
        ))
    })?;
    collect_value_slots_with(
        value_slots,
        size,
        max_items,
        array_data_start,
        array_max_length_offset,
        ptr_size,
        |addr| runtime.memory.read_u32(addr),
        |addr| runtime.memory.read_remote_ptr(addr),
    )
}

pub(crate) fn resolve_size_with(
    mut read_field_i32: impl FnMut(&str) -> Result<i32, ScryError>,
) -> Result<Option<usize>, ScryError> {
    for field in ["count", "_size", "size"] {
        match read_field_i32(field) {
            Ok(value) => return Ok(Some(value.max(0) as usize)),
            Err(ScryError::FieldNotFound { .. }) => continue,
            Err(err) => return Err(err),
        }
    }
    Ok(None)
}

pub(crate) fn collect_value_slots_with(
    value_slots: RemotePtr,
    size: usize,
    max_items: usize,
    array_data_start: u32,
    array_max_length_offset: u32,
    ptr_size: u32,
    mut read_u32: impl FnMut(RemotePtr) -> Result<u32, ScryError>,
    mut read_remote_ptr: impl FnMut(RemotePtr) -> Result<RemotePtr, ScryError>,
) -> Result<Vec<RemotePtr>, ScryError> {
    if value_slots.is_null() || size == 0 {
        return Ok(Vec::new());
    }
    if size > max_items {
        return Err(ScryError::CollectionOverflow { max: max_items });
    }
    if ptr_size == 0 {
        return Err(ScryError::Unsupported(
            "custom map ptr_size must be non-zero".into(),
        ));
    }

    let array_len = read_u32(value_slots + array_max_length_offset)? as usize;
    let limit = size.min(array_len);
    let limit = u32::try_from(limit)
        .map_err(|_| ScryError::Unsupported("custom map scan exceeds 32-bit range".into()))?;

    let mut entries = Vec::with_capacity(limit as usize);
    for index in 0..limit {
        let slot = value_slots + array_data_start + index * ptr_size;
        let value = read_remote_ptr(slot)?;
        if !value.is_null() {
            entries.push(value);
        }
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn resolve_size_tries_common_fallback_field_names() {
        let size = resolve_size_with(|field| match field {
            "count" => Err(ScryError::FieldNotFound {
                class: "Map".into(),
                field: field.into(),
            }),
            "_size" => Ok(3),
            "size" => Ok(99),
            _ => unreachable!(),
        })
        .unwrap();

        assert_eq!(size, Some(3));
    }

    #[test]
    fn resolve_size_propagates_non_field_not_found_errors() {
        let err = resolve_size_with(|field| {
            Err(ScryError::MemoryAccess {
                addr: 0x1234,
                reason: format!("failed to read {field}"),
            })
        })
        .expect_err("unexpected memory errors should not be swallowed");

        assert!(matches!(err, ScryError::MemoryAccess { addr: 0x1234, .. }));
    }

    #[test]
    fn collect_value_slots_iterates_non_null_entries() {
        let value_slots = RemotePtr::new(0x3000);
        let array_data_start = 0x20;
        let array_max_length_offset = 0x0C;
        let ptr_size = 4;

        let mut u32s = HashMap::new();
        u32s.insert(value_slots + array_max_length_offset, 4);

        let mut ptrs = HashMap::new();
        ptrs.insert(value_slots + array_data_start, RemotePtr::NULL);
        ptrs.insert(
            value_slots + array_data_start + ptr_size,
            RemotePtr::new(0x4000),
        );
        ptrs.insert(
            value_slots + array_data_start + ptr_size * 2,
            RemotePtr::new(0x5000),
        );
        ptrs.insert(
            value_slots + array_data_start + ptr_size * 3,
            RemotePtr::NULL,
        );

        let entries = collect_value_slots_with(
            value_slots,
            3,
            8,
            array_data_start,
            array_max_length_offset,
            ptr_size,
            |addr| {
                u32s.get(&addr)
                    .copied()
                    .ok_or_else(|| ScryError::MemoryAccess {
                        addr: addr.raw(),
                        reason: "missing u32".into(),
                    })
            },
            |addr| {
                ptrs.get(&addr)
                    .copied()
                    .ok_or_else(|| ScryError::MemoryAccess {
                        addr: addr.raw(),
                        reason: "missing ptr".into(),
                    })
            },
        )
        .unwrap();

        assert_eq!(
            entries,
            vec![RemotePtr::new(0x4000), RemotePtr::new(0x5000)]
        );
    }
}
