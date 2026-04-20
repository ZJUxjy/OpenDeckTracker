use super::class::MonoClass;
use super::runtime::{add_offset, MonoRuntime};
use crate::error::ScryError;
use crate::remote_ptr::RemotePtr;

pub struct VTable<'rt> {
    pub runtime: &'rt MonoRuntime,
    pub addr: RemotePtr,
}

impl<'rt> VTable<'rt> {
    pub fn new(runtime: &'rt MonoRuntime, addr: RemotePtr) -> Self {
        Self { runtime, addr }
    }

    pub fn class_ptr(&self) -> Result<RemotePtr, ScryError> {
        self.runtime.memory.read_remote_ptr(add_offset(
            self.addr,
            self.runtime.offsets.structs.vtable.klass,
        )?)
    }

    pub fn class(&self) -> Result<MonoClass<'rt>, ScryError> {
        Ok(MonoClass::new(self.runtime, self.class_ptr()?))
    }
}

pub fn try_vtable_for_class<'rt>(
    runtime: &'rt MonoRuntime,
    class_addr: RemotePtr,
) -> Result<Option<VTable<'rt>>, ScryError> {
    let runtime_info = runtime.memory.read_remote_ptr(add_offset(
        class_addr,
        runtime.offsets.structs.class.runtime_info,
    )?)?;
    if runtime_info.is_null() {
        return Ok(None);
    }
    let vtable = runtime.memory.read_remote_ptr(
        runtime_info
            + u32::try_from(runtime.offsets.ptr_size).map_err(|_| {
                ScryError::Unsupported(format!(
                    "ptr_size out of range: {}",
                    runtime.offsets.ptr_size
                ))
            })?,
    )?;
    if vtable.is_null() {
        return Ok(None);
    }
    Ok(Some(VTable::new(runtime, vtable)))
}

pub fn vtable_for_class<'rt>(
    runtime: &'rt MonoRuntime,
    class_addr: RemotePtr,
) -> Result<VTable<'rt>, ScryError> {
    try_vtable_for_class(runtime, class_addr)?.ok_or_else(|| {
        ScryError::OffsetProbe(format!(
            "class @ {} has null runtime_info or vtable (class not initialized?)",
            class_addr
        ))
    })
}

pub fn try_static_field_data(
    runtime: &MonoRuntime,
    class_addr: RemotePtr,
) -> Result<Option<RemotePtr>, ScryError> {
    let Some(vtable) = try_vtable_for_class(runtime, class_addr)? else {
        return Ok(None);
    };
    let vtable_size = runtime.memory.read_u32(add_offset(
        class_addr,
        runtime.offsets.structs.class.vtable_size,
    )?)?;
    if vtable_size > 100_000 {
        return Err(ScryError::OffsetProbe(format!(
            "class @ {} vtable_size {} unreasonably large",
            class_addr, vtable_size
        )));
    }
    let slot = static_data_slot_addr(
        vtable.addr,
        runtime.offsets.structs.vtable.vtable_array_start,
        vtable_size,
        runtime.offsets.ptr_size,
    )?;
    let data = runtime.memory.read_remote_ptr(slot)?;
    Ok((!data.is_null()).then_some(data))
}

pub fn static_field_data(
    runtime: &MonoRuntime,
    class_addr: RemotePtr,
) -> Result<RemotePtr, ScryError> {
    Ok(try_static_field_data(runtime, class_addr)?.unwrap_or(RemotePtr::NULL))
}

pub(crate) fn static_data_slot_addr(
    vtable_addr: RemotePtr,
    vtable_array_start: usize,
    vtable_size: u32,
    ptr_size: usize,
) -> Result<RemotePtr, ScryError> {
    let vtable_array_start = u32::try_from(vtable_array_start).map_err(|_| {
        ScryError::Unsupported(format!(
            "vtable_array_start out of range: {vtable_array_start}"
        ))
    })?;
    let ptr_size = u32::try_from(ptr_size)
        .map_err(|_| ScryError::Unsupported(format!("ptr_size out of range: {ptr_size}")))?;
    let slot_offset = vtable_size
        .checked_mul(ptr_size)
        .and_then(|value| value.checked_add(vtable_array_start))
        .ok_or_else(|| ScryError::Unsupported("static field slot overflow".into()))?;
    Ok(vtable_addr + slot_offset)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mono::offsets::MonoOffsets;

    #[test]
    fn static_data_slot_addr_uses_vtable_array_start() {
        let offsets = MonoOffsets::bundled_unity_2021_3().unwrap();
        let slot = static_data_slot_addr(
            RemotePtr::new(0x2000),
            offsets.structs.vtable.vtable_array_start,
            3,
            offsets.ptr_size,
        )
        .unwrap();

        assert_eq!(slot, RemotePtr::new(0x2038));
    }
}
