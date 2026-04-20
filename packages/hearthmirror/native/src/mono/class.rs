use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::offsets::MonoOffsets;
use crate::remote_ptr::RemotePtr;
use std::collections::HashMap;
use std::sync::Arc;

/// Resolved class info from probing the running process.
#[derive(Debug, Clone)]
pub struct MonoClassRef {
    /// Full name "Namespace.Name"
    pub full_name: String,
    /// MonoClass* in the target process
    pub addr: RemotePtr,
    /// Static field data area pointer (s_instance and other statics live here).
    /// Computed via vtable + vtable_array_start + vtable_size * ptr_size per
    /// `MonoOffsets` D12 — `RemotePtr::NULL` if vtable is uninitialized
    /// (class never instantiated → no s_instance).
    pub static_field_data: RemotePtr,
    /// Field name → byte offset (static fields: relative to static_field_data;
    /// instance fields: relative to object start, including the 0x0C header)
    pub fields: HashMap<String, u32>,
    /// Mono runtime offsets table, shared with the owning `MonoRuntime`.
    /// Propagates into derived `MonoObject` instances so reflection methods
    /// can resolve nested objects without re-threading the offsets argument.
    pub offsets: Arc<MonoOffsets>,
}

/// Read the fields array from a MonoClass* in the target process and return
/// a name → offset mapping.
pub fn read_class_fields(
    memory: &ProcessMemory,
    klass: RemotePtr,
    offsets: &MonoOffsets,
) -> Result<HashMap<String, u32>, ScryError> {
    let class_off = &offsets.structs.class;
    let field_off = &offsets.structs.field;

    let field_count = memory.read_u16(klass + class_off.field_count)? as usize;
    let fields_ptr = memory.read_remote_ptr(klass + class_off.fields)?;

    if fields_ptr.is_null() || field_count == 0 || field_count > 500 {
        return Ok(HashMap::new());
    }

    let mut map = HashMap::with_capacity(field_count);
    for i in 0..field_count {
        let field_base = fields_ptr + (i as u32 * field_off.size);
        let name_ptr = memory.read_remote_ptr(field_base + field_off.name)?;
        if name_ptr.is_null() {
            continue;
        }
        let name = memory.read_cstring(name_ptr, 128)?;
        let offset = memory.read_u32(field_base + field_off.offset)?;
        // Skip unresolved fields (offset = 0xFFFFFFFF)
        if offset == 0xFFFF_FFFF {
            continue;
        }
        map.insert(name, offset);
    }

    Ok(map)
}

/// Build a full `MonoClassRef` from a MonoClass* pointer.
///
/// Computes `static_field_data` via the MonoVTable rather than a fixed
/// MonoClass slot — see `MonoOffsets` design D12. Returns `RemotePtr::null()`
/// for `static_field_data` when the class has no allocated vtable yet.
pub fn read_mono_class(
    memory: &ProcessMemory,
    klass: RemotePtr,
    offsets: Arc<MonoOffsets>,
) -> Result<MonoClassRef, ScryError> {
    let class_off = &offsets.structs.class;
    let vtable_off = &offsets.structs.vtable;

    let name_ptr = memory.read_remote_ptr(klass + class_off.name)?;
    let ns_ptr = memory.read_remote_ptr(klass + class_off.name_space)?;

    let name = if name_ptr.is_null() {
        String::new()
    } else {
        memory.read_cstring(name_ptr, 256)?
    };
    let ns = if ns_ptr.is_null() {
        String::new()
    } else {
        memory.read_cstring(ns_ptr, 256)?
    };
    let full_name = if ns.is_empty() {
        name
    } else {
        format!("{}.{}", ns, name)
    };

    let vtable_ptr = memory.read_remote_ptr(klass + class_off.vtable)?;
    let static_field_data = if vtable_ptr.is_null() {
        RemotePtr::NULL
    } else {
        let vtable_size = memory.read_u32(klass + class_off.vtable_size)?;
        let sfd_slot = vtable_ptr + vtable_off.vtable_array_start + vtable_size * offsets.ptr_size;
        memory.read_remote_ptr(sfd_slot)?
    };

    let fields = read_class_fields(memory, klass, &offsets)?;

    Ok(MonoClassRef {
        full_name,
        addr: klass,
        static_field_data,
        fields,
        offsets,
    })
}
