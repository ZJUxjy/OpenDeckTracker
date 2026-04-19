use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::class::MonoClassRef;
use crate::remote_ptr::RemotePtr;

/// Read an instance field of an object by name.
/// Returns the raw u32 at the field offset.
pub fn read_field_u32(
    memory: &ProcessMemory,
    class: &MonoClassRef,
    instance: RemotePtr,
    field: &str,
) -> Result<u32, ScryError> {
    let offset = *class.fields.get(field).ok_or_else(|| ScryError::FieldNotFound {
        class: class.full_name.clone(),
        field: field.into(),
    })?;
    // Mono instance layout: vtable(4) + monitor(4) + synchronization(4) + fields at +0x0C
    memory.read_u32(instance + offset)
}
