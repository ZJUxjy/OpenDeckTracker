use super::class::MonoClass;
use super::field::MonoFieldDef;
use super::runtime::{add_offset, MonoRuntime};
use super::vtable::{self, VTable};
use crate::error::ScryError;
use crate::remote_ptr::RemotePtr;

pub struct MonoObject<'rt> {
    pub runtime: &'rt MonoRuntime,
    pub addr: RemotePtr,
    pub class_addr: RemotePtr,
}

impl<'rt> MonoObject<'rt> {
    pub fn from_addr(runtime: &'rt MonoRuntime, addr: RemotePtr) -> Result<Self, ScryError> {
        if addr.is_null() {
            return Err(ScryError::MemoryAccess {
                addr: 0,
                reason: "null object".into(),
            });
        }
        let vtable_addr = runtime
            .memory
            .read_remote_ptr(add_offset(addr, runtime.offsets.structs.object.vtable)?)?;
        if vtable_addr.is_null() {
            return Err(ScryError::MemoryAccess {
                addr: addr.raw(),
                reason: "null vtable in object".into(),
            });
        }
        let class_addr = VTable::new(runtime, vtable_addr).class_ptr()?;
        validate_class_addr(class_addr)?;
        Ok(Self {
            runtime,
            addr,
            class_addr,
        })
    }

    pub fn class(&self) -> MonoClass<'rt> {
        MonoClass::new(self.runtime, self.class_addr)
    }

    pub fn read_field_raw(&self, field: &MonoFieldDef) -> Result<RemotePtr, ScryError> {
        let static_field_data = if field.is_static {
            vtable::try_static_field_data(
                self.runtime,
                field_storage_owner(self.class_addr, field),
            )?
        } else {
            None
        };
        field_storage_addr(self.addr, field, static_field_data)
    }

    pub fn read_field_ptr(&self, field_name: &str) -> Result<RemotePtr, ScryError> {
        let field = self.class().find_field(field_name)?;
        self.runtime
            .memory
            .read_remote_ptr(self.read_field_raw(&field)?)
    }

    pub fn read_field_i32(&self, field_name: &str) -> Result<i32, ScryError> {
        let field = self.class().find_field(field_name)?;
        self.runtime.memory.read_i32(self.read_field_raw(&field)?)
    }

    pub fn read_field_u32(&self, field_name: &str) -> Result<u32, ScryError> {
        let field = self.class().find_field(field_name)?;
        self.runtime.memory.read_u32(self.read_field_raw(&field)?)
    }

    pub fn read_field_bool(&self, field_name: &str) -> Result<bool, ScryError> {
        let field = self.class().find_field(field_name)?;
        Ok(self.runtime.memory.read_u8(self.read_field_raw(&field)?)? != 0)
    }

    pub fn read_field_string(&self, field_name: &str) -> Result<String, ScryError> {
        let ptr = self.read_field_ptr(field_name)?;
        self.runtime.memory.read_mono_string(ptr)
    }

    pub fn class_name(&self) -> Result<String, ScryError> {
        self.class().full_name()
    }
}

pub(crate) fn field_storage_addr(
    object_addr: RemotePtr,
    field: &MonoFieldDef,
    static_field_data: Option<RemotePtr>,
) -> Result<RemotePtr, ScryError> {
    if field.is_static {
        let Some(base) = static_field_data else {
            return Err(ScryError::MemoryAccess {
                addr: object_addr.raw(),
                reason: format!("static field {} has no vtable data area", field.name),
            });
        };
        return Ok(base + field.offset);
    }
    Ok(object_addr + field.offset)
}

pub(crate) fn field_storage_owner(object_class: RemotePtr, field: &MonoFieldDef) -> RemotePtr {
    if field.is_static && !field.owner_class.is_null() {
        field.owner_class
    } else {
        object_class
    }
}

pub(crate) fn validate_class_addr(class_addr: RemotePtr) -> Result<(), ScryError> {
    if class_addr.is_null() {
        return Err(ScryError::MemoryAccess {
            addr: 0,
            reason: "null klass in vtable".into(),
        });
    }
    Ok(())
}

pub fn struct_field_addr(
    runtime: &MonoRuntime,
    parent_addr: RemotePtr,
    parent_field_offset: u32,
    struct_class_addr: RemotePtr,
    inner_field_name: &str,
) -> Result<RemotePtr, ScryError> {
    let inner = MonoClass::new(runtime, struct_class_addr).find_field(inner_field_name)?;
    struct_field_addr_from_offsets(
        parent_addr,
        parent_field_offset,
        inner.offset,
        runtime.offsets.structs.object.data_start as u32,
    )
}

pub(crate) fn struct_field_addr_from_offsets(
    parent_addr: RemotePtr,
    parent_field_offset: u32,
    inner_field_offset: u32,
    object_header_size: u32,
) -> Result<RemotePtr, ScryError> {
    let absolute = parent_addr
        .raw()
        .checked_add(parent_field_offset)
        .and_then(|value| value.checked_add(inner_field_offset))
        .and_then(|value| value.checked_sub(object_header_size))
        .ok_or_else(|| ScryError::Unsupported("struct field address overflow".into()))?;
    Ok(RemotePtr::new(absolute))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_storage_addr_uses_instance_offset_directly() {
        let field = MonoFieldDef {
            name: "value".to_string(),
            offset: 0x24,
            type_ptr: RemotePtr::NULL,
            is_static: false,
            owner_class: RemotePtr::NULL,
        };

        assert_eq!(
            field_storage_addr(RemotePtr::new(0x1000), &field, None).unwrap(),
            RemotePtr::new(0x1024)
        );
    }

    #[test]
    fn struct_field_addr_subtracts_object_header() {
        assert_eq!(
            struct_field_addr_from_offsets(RemotePtr::new(0x1000), 0x20, 0x0C, 0x08).unwrap(),
            RemotePtr::new(0x1024)
        );
    }

    #[test]
    fn static_fields_use_declaring_class_for_storage_lookup() {
        let object_class = RemotePtr::new(0x1111);
        let owner_class = RemotePtr::new(0x2222);
        let field = MonoFieldDef {
            name: "counter".to_string(),
            offset: 0x4,
            type_ptr: RemotePtr::NULL,
            is_static: true,
            owner_class,
        };

        assert_eq!(field_storage_owner(object_class, &field), owner_class);
    }

    #[test]
    fn null_class_ptr_is_rejected() {
        let err = validate_class_addr(RemotePtr::NULL).unwrap_err();
        assert!(matches!(
            err,
            ScryError::MemoryAccess { reason, .. } if reason == "null klass in vtable"
        ));
    }
}
