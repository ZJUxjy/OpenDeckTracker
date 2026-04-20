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
    /// Computed via the per-domain MonoVTable: `runtime_info →
    /// MonoClassRuntimeInfo.domain_vtables[0]`, then `vtable_base +
    /// vtable_array_start + vtable_size * ptr_size` (dereferenced) — see
    /// design D12 (corrected). `RemotePtr::NULL` if the class is uninitialized
    /// in the root domain (Mono builds runtime_info lazily on first access).
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
/// Computes `static_field_data` via the per-domain `MonoVTable` reached
/// through `MonoClass.runtime_info → MonoClassRuntimeInfo.domain_vtables[0]`,
/// then `vtable_base + vtable_array_start + vtable_size * ptr_size` →
/// dereferenced. See design D12 (corrected per hearthmirror-rs reference
/// `vtable.rs::try_static_field_data` after self-review found `MonoClass.vtable`
/// at +0x80 is `MonoMethod**` (inline function-pointer array), NOT a
/// `MonoVTable*` — those are distinct concepts despite the shared name).
///
/// Returns `RemotePtr::NULL` for `static_field_data` when the class is
/// uninitialized (no runtime_info, no vtable allocated for the root domain,
/// or no static-storage slot populated). Reflection methods treat this as
/// "class never instantiated → no s_instance" and return `Ok(None)`.
pub fn read_mono_class(
    memory: &ProcessMemory,
    klass: RemotePtr,
    offsets: Arc<MonoOffsets>,
) -> Result<MonoClassRef, ScryError> {
    let class_off = &offsets.structs.class;
    let vtable_off = &offsets.structs.vtable;
    let ptr_size = offsets.ptr_size;

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

    // 1. MonoClass.runtime_info → MonoClassRuntimeInfo* (Mono builds this lazily
    //    on first instance/static access of the class in a domain).
    let runtime_info = memory.read_remote_ptr(klass + class_off.runtime_info)?;
    let static_field_data = if runtime_info.is_null() {
        RemotePtr::NULL
    } else {
        // 2. MonoClassRuntimeInfo layout: { max_domain: u16 + padding,
        //    domain_vtables[0]: MonoVTable* }. For the root domain (index 0),
        //    vtable pointer slot is at offset = ptr_size (skip max_domain word).
        let vtable_ptr = memory.read_remote_ptr(runtime_info + ptr_size)?;
        if vtable_ptr.is_null() {
            RemotePtr::NULL
        } else {
            // 3. vtable_size = number of vtable function-pointer slots (u32 in Mono
            //    source). Sanity-cap matches hearthmirror-rs reference impl.
            let vtable_size = memory.read_u32(klass + class_off.vtable_size)?;
            if vtable_size > 100_000 {
                return Err(ScryError::MetadataError(format!(
                    "class @ {} vtable_size {} unreasonably large",
                    klass, vtable_size
                )));
            }
            // 4. static_field_data slot sits AFTER the function-pointer array.
            //    Dereference the slot to get the actual chunk holding s_instance
            //    and other static fields.
            let sfd_slot =
                vtable_ptr + vtable_off.vtable_array_start + vtable_size * ptr_size;
            memory.read_remote_ptr(sfd_slot)?
        }
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
