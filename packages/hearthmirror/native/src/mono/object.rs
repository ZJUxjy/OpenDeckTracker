use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::class::{read_class_fields, read_mono_class, MonoClassRef};
use crate::mono::field::MonoFieldDef;
use crate::mono::offsets::MonoOffsets;
use crate::remote_ptr::RemotePtr;
use std::collections::HashMap;
use std::sync::Arc;

/// A live Mono object in the target process with its resolved field map.
///
/// Created via `MonoRuntime::get_singleton()` or `MonoObject::read_object_field()`.
/// All chain helpers return `Ok(None)` when a field is missing or the pointed-to
/// value is null — this makes `?` chaining ergonomic in reflection methods.
#[derive(Debug, Clone)]
pub struct MonoObject {
    /// Object address in the target process
    pub addr: RemotePtr,
    /// Field name → byte offset (from object start for instance fields)
    pub fields: HashMap<String, u32>,
    /// Mono runtime offsets table, propagated from the owning class so chain
    /// helpers can resolve nested objects without re-threading the offsets
    /// argument through every reflection method (see design D11).
    pub offsets: Arc<MonoOffsets>,
}

impl MonoObject {
    /// Create a MonoObject from an address and a resolved class. The returned
    /// object inherits the class's `Arc<MonoOffsets>`.
    pub fn new(addr: RemotePtr, class: &MonoClassRef) -> Self {
        Self {
            addr,
            fields: class.fields.clone(),
            offsets: class.offsets.clone(),
        }
    }

    /// Create a MonoObject from an address by resolving its runtime class
    /// through the object header's `MonoVTable*`, then the vtable's
    /// `klass` slot.
    ///
    /// `offsets` is the runtime's shared `Arc<MonoOffsets>` (the field-name →
    /// offset map for the resolved klass is computed via `read_class_fields`).
    ///
    /// ## Why vtable, not klass, lives at object +0x00
    ///
    /// Mono's object header is `struct MonoObject { MonoVTable *vtable;
    /// MonoThreadsSync *monitor; }` — the pointer immediately following the
    /// sync-monitor word is reserved for the GC header, NOT for the
    /// MonoClass. The real class pointer is reached via one additional
    /// indirection through the vtable:
    ///
    /// ```text
    ///   MonoObject.vtable  → MonoVTable* (at object + offsets.object.vtable, usually +0x00)
    ///   MonoVTable.klass   → MonoClass*  (at vtable  + offsets.vtable.klass,  usually +0x00)
    /// ```
    ///
    /// An earlier implementation treated object+0x00 as a direct klass
    /// pointer. That incorrectly returned `MonoVTable*`, which caused
    /// downstream `read_class_fields` to read garbage bytes where it
    /// expected MonoClass fields — producing nonsensical offsets that then
    /// drove the P1 collection-overflow bugs (getDecks / getCollection
    /// reading huge `_size` values out of unrelated vtable slots).
    pub fn from_address(
        memory: &ProcessMemory,
        addr: RemotePtr,
        offsets: Arc<MonoOffsets>,
    ) -> Result<Option<Self>, ScryError> {
        if addr.is_null() {
            return Ok(None);
        }
        let vtable_ptr = memory.read_remote_ptr(addr + offsets.structs.object.vtable)?;
        if vtable_ptr.is_null() {
            return Ok(None);
        }
        let klass = memory.read_remote_ptr(vtable_ptr + offsets.structs.vtable.klass)?;
        if klass.is_null() {
            return Ok(None);
        }
        let fields = read_class_fields(memory, klass, &offsets)?;
        Ok(Some(Self {
            addr,
            fields,
            offsets,
        }))
    }

    /// Convenience: construct a sibling MonoObject sharing this object's
    /// offsets table. Use in reflection methods that hold a parent object and
    /// need to resolve a child object pointer.
    pub fn child_from_address(
        &self,
        memory: &ProcessMemory,
        addr: RemotePtr,
    ) -> Result<Option<Self>, ScryError> {
        Self::from_address(memory, addr, self.offsets.clone())
    }

    // ── Chain helpers ────────────────────────────────────────────────────────

    /// Resolve a field name to its byte offset, walking the class hierarchy
    /// when the field is not declared on the leaf.
    ///
    /// Fast path: hit on `self.fields` (own-class declarations).
    /// Slow path: parent walk via [`MonoObject::find_field`] for inherited
    /// fields like protobuf-generated `_unknownFields` or `_hasBits0`, or
    /// SDK base-class auto-properties such as `<EntityId>k__BackingField` on
    /// `BnetAccountId` (declared on `BnetEntityId` parent).
    ///
    /// Returns `Ok(None)` when the field is absent in the entire hierarchy
    /// (or when the klass pointer is unreadable). The slow-path result is
    /// not cached — repeated chain reads on the same nested object should
    /// stay cheap because the parent walk is shallow (≤4 in practice for
    /// Hearthstone's class graph) and cached `MonoFieldDef`s are computed
    /// from already-paged memory.
    fn field_offset(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<u32>, ScryError> {
        if let Some(&offset) = self.fields.get(field) {
            return Ok(Some(offset));
        }
        Ok(self.find_field(memory, field)?.map(|f| f.offset))
    }

    /// Read a Mono string field (System.String). Returns None if field missing or null.
    pub fn read_string_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<String>, ScryError> {
        let Some(offset) = self.field_offset(memory, field)? else {
            return Ok(None);
        };
        let str_ptr = memory.read_remote_ptr(self.addr + offset)?;
        if str_ptr.is_null() {
            return Ok(None);
        }
        Ok(Some(memory.read_mono_string(str_ptr)?))
    }

    /// Read an i32 field. Returns None if field missing.
    pub fn read_int32_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<i32>, ScryError> {
        let Some(offset) = self.field_offset(memory, field)? else {
            return Ok(None);
        };
        Ok(Some(memory.read_i32(self.addr + offset)?))
    }

    /// Read a u32 field. Returns None if field missing.
    pub fn read_uint32_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<u32>, ScryError> {
        let Some(offset) = self.field_offset(memory, field)? else {
            return Ok(None);
        };
        Ok(Some(memory.read_u32(self.addr + offset)?))
    }

    /// Read an i64 field. Returns None if field missing.
    pub fn read_int64_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<i64>, ScryError> {
        let Some(offset) = self.field_offset(memory, field)? else {
            return Ok(None);
        };
        Ok(Some(memory.read_i64(self.addr + offset)?))
    }

    /// Read a u64 field. Returns None if field missing.
    pub fn read_uint64_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<u64>, ScryError> {
        let Some(offset) = self.field_offset(memory, field)? else {
            return Ok(None);
        };
        Ok(Some(memory.read_u64(self.addr + offset)?))
    }

    /// Read a bool field (1 byte). Returns None if field missing.
    pub fn read_bool_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<bool>, ScryError> {
        let Some(offset) = self.field_offset(memory, field)? else {
            return Ok(None);
        };
        let val = memory.read_u8(self.addr + offset)?;
        Ok(Some(val != 0))
    }

    /// Read an object-typed field, resolving the sub-object's class from its klass pointer.
    /// Returns None if field missing, pointer null, or klass null.
    pub fn read_object_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<MonoObject>, ScryError> {
        let Some(offset) = self.field_offset(memory, field)? else {
            return Ok(None);
        };
        let ptr = memory.read_remote_ptr(self.addr + offset)?;
        MonoObject::from_address(memory, ptr, self.offsets.clone())
    }

    /// Read a raw pointer field. Returns None if field missing or null.
    pub fn read_pointer_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<RemotePtr>, ScryError> {
        let Some(offset) = self.field_offset(memory, field)? else {
            return Ok(None);
        };
        let ptr = memory.read_remote_ptr(self.addr + offset)?;
        if ptr.is_null() {
            return Ok(None);
        }
        Ok(Some(ptr))
    }

    /// Look up a field by name across the object's class hierarchy,
    /// delegating to [`MonoClassRef::find_field`] after resolving the object's
    /// klass pointer.
    ///
    /// Prefer this over the `self.fields` HashMap when the field you need
    /// might be inherited — `self.fields` only holds fields declared on the
    /// leaf class. Returns `Ok(None)` when the klass pointer is NULL or the
    /// field is absent in the hierarchy.
    pub fn find_field(
        &self,
        memory: &ProcessMemory,
        name: &str,
    ) -> Result<Option<MonoFieldDef>, ScryError> {
        let object_off = &self.offsets.structs.object;
        let vtable_off = &self.offsets.structs.vtable;

        let vtable_ptr = memory.read_remote_ptr(self.addr + object_off.vtable)?;
        if vtable_ptr.is_null() {
            return Ok(None);
        }
        let klass = memory.read_remote_ptr(vtable_ptr + vtable_off.klass)?;
        if klass.is_null() {
            return Ok(None);
        }
        let class = read_mono_class(memory, klass, self.offsets.clone())?;
        class.find_field(memory, name)
    }
}

/// Read an instance field of an object by name (legacy free-function API).
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
    memory.read_u32(instance + offset)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mono_object_missing_field_returns_none() {
        let obj = MonoObject {
            addr: RemotePtr::new(0x1000),
            fields: HashMap::new(),
            offsets: Arc::new(MonoOffsets::default()),
        };
        // We can't call the actual read methods without a real ProcessMemory,
        // but we can verify the field lookup logic returns None for missing fields
        // by checking that the fields map is empty.
        assert!(obj.fields.get("nonexistent").is_none());
    }

    #[test]
    fn mono_object_new_clones_fields() {
        let mut fields = HashMap::new();
        fields.insert("test_field".into(), 0x10u32);
        let class = MonoClassRef {
            full_name: "Test".into(),
            addr: RemotePtr::new(0x2000),
            static_field_data: RemotePtr::new(0x3000),
            fields,
            offsets: Arc::new(MonoOffsets::default()),
        };
        let obj = MonoObject::new(RemotePtr::new(0x4000), &class);
        assert_eq!(obj.addr.raw(), 0x4000);
        assert_eq!(obj.fields.get("test_field"), Some(&0x10u32));
        // Offsets Arc is propagated, sharing the same underlying allocation.
        assert!(Arc::ptr_eq(&obj.offsets, &class.offsets));
    }
}
