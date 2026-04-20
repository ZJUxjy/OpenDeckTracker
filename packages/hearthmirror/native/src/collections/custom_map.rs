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
    let array_len = runtime
        .memory
        .read_u32(value_slots + array_max_length_offset)? as usize;
    let limit = size.min(array_len);
    let limit = u32::try_from(limit)
        .map_err(|_| ScryError::Unsupported("custom map scan exceeds 32-bit range".into()))?;

    let mut entries = Vec::with_capacity(limit as usize);
    for index in 0..limit {
        let slot = value_slots + array_data_start + index * ptr_size;
        let value = runtime.memory.read_remote_ptr(slot)?;
        if !value.is_null() {
            entries.push(value);
        }
    }
    Ok(entries)
}

pub(crate) fn resolve_size_with(
    mut read_field_i32: impl FnMut(&str) -> Result<i32, ScryError>,
) -> Result<Option<usize>, ScryError> {
    for field in ["count", "_size", "size"] {
        if let Ok(value) = read_field_i32(field) {
            return Ok(Some(value.max(0) as usize));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
