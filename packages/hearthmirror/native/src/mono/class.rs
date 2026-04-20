use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::reflection::field_paths::*;
use crate::remote_ptr::RemotePtr;
use std::collections::HashMap;

/// Resolved class info from probing the running process.
#[derive(Debug, Clone)]
pub struct MonoClassRef {
    /// Full name "Namespace.Name"
    pub full_name: String,
    /// MonoClass* in the target process
    pub addr: RemotePtr,
    /// Static field data area pointer (s_instance and other statics live here)
    pub static_field_data: RemotePtr,
    /// Field name → byte offset (static fields: relative to static_field_data;
    /// instance fields: relative to object start, including the 0x0C header)
    pub fields: HashMap<String, u32>,
}

/// Read the fields array from a MonoClass* in the target process and return
/// a name → offset mapping.
pub fn read_class_fields(
    memory: &ProcessMemory,
    klass: RemotePtr,
) -> Result<HashMap<String, u32>, ScryError> {
    let field_count = memory.read_u16(klass + MONO_CLASS_FIELD_COUNT)? as usize;
    let fields_ptr = memory.read_remote_ptr(klass + MONO_CLASS_FIELDS)?;

    if fields_ptr.is_null() || field_count == 0 || field_count > 500 {
        return Ok(HashMap::new());
    }

    let mut map = HashMap::with_capacity(field_count);
    for i in 0..field_count {
        let field_base = fields_ptr + (i as u32 * MONO_CLASS_FIELD_SIZE);
        let name_ptr = memory.read_remote_ptr(field_base + MONO_CLASS_FIELD_NAME)?;
        if name_ptr.is_null() {
            continue;
        }
        let name = memory.read_cstring(name_ptr, 128)?;
        let offset = memory.read_u32(field_base + MONO_CLASS_FIELD_OFFSET)?;
        // Skip unresolved fields (offset = 0xFFFFFFFF)
        if offset == 0xFFFF_FFFF {
            continue;
        }
        map.insert(name, offset);
    }

    Ok(map)
}

/// Build a full `MonoClassRef` from a MonoClass* pointer.
pub fn read_mono_class(
    memory: &ProcessMemory,
    klass: RemotePtr,
) -> Result<MonoClassRef, ScryError> {
    let name_ptr = memory.read_remote_ptr(klass + MONO_CLASS_NAME)?;
    let ns_ptr = memory.read_remote_ptr(klass + MONO_CLASS_NAMESPACE)?;

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

    let static_field_data = memory.read_remote_ptr(klass + MONO_CLASS_STATIC_FIELD_DATA)?;
    let fields = read_class_fields(memory, klass)?;

    Ok(MonoClassRef {
        full_name,
        addr: klass,
        static_field_data,
        fields,
    })
}
