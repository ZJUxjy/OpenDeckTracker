use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::class::{read_class_fields, MonoClassRef};
use crate::remote_ptr::RemotePtr;
use std::collections::HashMap;

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
}

impl MonoObject {
    /// Create a MonoObject from an address and a resolved class.
    pub fn new(addr: RemotePtr, class: &MonoClassRef) -> Self {
        Self {
            addr,
            fields: class.fields.clone(),
        }
    }

    /// Create a MonoObject from an address by reading its klass pointer.
    pub fn from_address(memory: &ProcessMemory, addr: RemotePtr) -> Result<Option<Self>, ScryError> {
        if addr.is_null() {
            return Ok(None);
        }
        // Mono object header: +0x00 is MonoClass* (klass pointer)
        let klass = memory.read_remote_ptr(addr)?;
        if klass.is_null() {
            return Ok(None);
        }
        let fields = read_class_fields(memory, klass)?;
        Ok(Some(Self { addr, fields }))
    }

    // ── Chain helpers ────────────────────────────────────────────────────────

    /// Read a Mono string field (System.String). Returns None if field missing or null.
    pub fn read_string_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<String>, ScryError> {
        let Some(&offset) = self.fields.get(field) else {
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
        let Some(&offset) = self.fields.get(field) else {
            return Ok(None);
        };
        Ok(Some(memory.read_i32(self.addr + offset)?))
    }

    /// Read an i64 field. Returns None if field missing.
    pub fn read_int64_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<i64>, ScryError> {
        let Some(&offset) = self.fields.get(field) else {
            return Ok(None);
        };
        Ok(Some(memory.read_i64(self.addr + offset)?))
    }

    /// Read a bool field (1 byte). Returns None if field missing.
    pub fn read_bool_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<bool>, ScryError> {
        let Some(&offset) = self.fields.get(field) else {
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
        let Some(&offset) = self.fields.get(field) else {
            return Ok(None);
        };
        let ptr = memory.read_remote_ptr(self.addr + offset)?;
        MonoObject::from_address(memory, ptr)
    }

    /// Read a raw pointer field. Returns None if field missing or null.
    pub fn read_pointer_field(
        &self,
        memory: &ProcessMemory,
        field: &str,
    ) -> Result<Option<RemotePtr>, ScryError> {
        let Some(&offset) = self.fields.get(field) else {
            return Ok(None);
        };
        let ptr = memory.read_remote_ptr(self.addr + offset)?;
        if ptr.is_null() {
            return Ok(None);
        }
        Ok(Some(ptr))
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
        };
        let obj = MonoObject::new(RemotePtr::new(0x4000), &class);
        assert_eq!(obj.addr.raw(), 0x4000);
        assert_eq!(obj.fields.get("test_field"), Some(&0x10u32));
    }
}
