use super::runtime::{add_offset, MonoRuntime};
use crate::error::ScryError;
use crate::remote_ptr::RemotePtr;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MonoFieldDef {
    pub name: String,
    pub offset: u32,
    pub type_ptr: RemotePtr,
    pub is_static: bool,
    pub owner_class: RemotePtr,
}

impl MonoFieldDef {
    pub fn read(runtime: &MonoRuntime, field_addr: RemotePtr) -> Result<Self, ScryError> {
        let offsets = &runtime.offsets.structs.field;
        let name_ptr = runtime
            .memory
            .read_remote_ptr(add_offset(field_addr, offsets.name)?)?;
        let name = if name_ptr.is_null() {
            String::new()
        } else {
            runtime.memory.read_cstring(name_ptr, 256)?
        };
        let type_ptr = runtime
            .memory
            .read_remote_ptr(add_offset(field_addr, offsets.type_)?)?;
        let offset = runtime
            .memory
            .read_u32(add_offset(field_addr, offsets.offset)?)?;

        Ok(Self {
            name,
            offset,
            type_ptr,
            is_static: offset < runtime.offsets.structs.object.data_start as u32,
            owner_class: runtime
                .memory
                .read_remote_ptr(add_offset(field_addr, offsets.parent)?)?,
        })
    }
}

#[cfg(test)]
pub(crate) fn read_field_with(
    field_addr: RemotePtr,
    offsets: &super::offsets::MonoOffsets,
    mut read_u32: impl FnMut(RemotePtr) -> u32,
    mut read_ptr: impl FnMut(RemotePtr) -> RemotePtr,
    mut read_cstring: impl FnMut(RemotePtr) -> String,
) -> Result<MonoFieldDef, ScryError> {
    let name_ptr = read_ptr(field_addr + offsets.structs.field.name as u32);
    let name = if name_ptr.is_null() {
        String::new()
    } else {
        read_cstring(name_ptr)
    };
    Ok(MonoFieldDef {
        name,
        offset: read_u32(field_addr + offsets.structs.field.offset as u32),
        type_ptr: read_ptr(field_addr + offsets.structs.field.type_ as u32),
        is_static: read_u32(field_addr + offsets.structs.field.offset as u32)
            < offsets.structs.object.data_start as u32,
        owner_class: read_ptr(field_addr + offsets.structs.field.parent as u32),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mono::offsets::MonoOffsets;
    use std::collections::HashMap;

    #[test]
    fn read_field_def_reads_name_offset_and_type_ptr() {
        let offsets = MonoOffsets::bundled_unity_2021_3().unwrap();
        let field = RemotePtr::new(0x1000);
        let name_ptr = RemotePtr::new(0x2000);
        let type_ptr = RemotePtr::new(0x3000);

        let mut ptrs = HashMap::new();
        ptrs.insert(field + offsets.structs.field.name as u32, name_ptr);
        ptrs.insert(field + offsets.structs.field.type_ as u32, type_ptr);

        let mut u32s = HashMap::new();
        u32s.insert(field + offsets.structs.field.offset as u32, 0x24);

        let def = read_field_with(
            field,
            &offsets,
            |addr| u32s.get(&addr).copied().unwrap_or_default(),
            |addr| ptrs.get(&addr).copied().unwrap_or(RemotePtr::NULL),
            |addr| {
                if addr == name_ptr {
                    "m_name".to_string()
                } else {
                    String::new()
                }
            },
        )
        .unwrap();

        assert_eq!(def.name, "m_name");
        assert_eq!(def.offset, 0x24);
        assert_eq!(def.type_ptr, type_ptr);
        assert!(!def.is_static);
        assert_eq!(def.owner_class, RemotePtr::NULL);
    }

    #[test]
    fn marks_offsets_before_object_header_as_static() {
        let offsets = MonoOffsets::bundled_unity_2021_3().unwrap();
        let field = RemotePtr::new(0x1000);

        let def = read_field_with(
            field,
            &offsets,
            |_| 0x04,
            |_| RemotePtr::NULL,
            |_| String::new(),
        )
        .unwrap();

        assert!(def.is_static);
    }

    #[test]
    fn reads_declaring_class_pointer() {
        let offsets = MonoOffsets::bundled_unity_2021_3().unwrap();
        let field = RemotePtr::new(0x1000);
        let owner = RemotePtr::new(0x2000);

        let def = read_field_with(
            field,
            &offsets,
            |_| 0x10,
            |addr| {
                if addr == field + offsets.structs.field.parent as u32 {
                    owner
                } else {
                    RemotePtr::NULL
                }
            },
            |_| String::new(),
        )
        .unwrap();

        assert_eq!(def.owner_class, owner);
    }
}
