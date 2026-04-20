use super::field::MonoFieldDef;
use super::runtime::{add_offset, MonoRuntime};
use crate::error::ScryError;
use crate::remote_ptr::RemotePtr;
use std::collections::HashMap;

pub struct MonoClass<'rt> {
    pub runtime: &'rt MonoRuntime,
    pub addr: RemotePtr,
}

impl<'rt> MonoClass<'rt> {
    pub fn new(runtime: &'rt MonoRuntime, addr: RemotePtr) -> Self {
        Self { runtime, addr }
    }

    pub fn name(&self) -> Result<String, ScryError> {
        let ptr = self.runtime.memory.read_remote_ptr(add_offset(
            self.addr,
            self.runtime.offsets.structs.class.name,
        )?)?;
        if ptr.is_null() {
            return Ok(String::new());
        }
        self.runtime.memory.read_cstring(ptr, 256)
    }

    pub fn namespace(&self) -> Result<String, ScryError> {
        let ptr = self.runtime.memory.read_remote_ptr(add_offset(
            self.addr,
            self.runtime.offsets.structs.class.name_space,
        )?)?;
        if ptr.is_null() {
            return Ok(String::new());
        }
        self.runtime.memory.read_cstring(ptr, 256)
    }

    pub fn full_name(&self) -> Result<String, ScryError> {
        Ok(compose_full_name(&self.namespace()?, &self.name()?))
    }

    pub fn parent(&self) -> Result<Option<RemotePtr>, ScryError> {
        let parent = self.runtime.memory.read_remote_ptr(add_offset(
            self.addr,
            self.runtime.offsets.structs.class.parent,
        )?)?;
        Ok((!parent.is_null()).then_some(parent))
    }

    pub fn fields(&self) -> Result<Vec<MonoFieldDef>, ScryError> {
        let count = self.runtime.memory.read_u32(add_offset(
            self.addr,
            self.runtime.offsets.structs.class.field_count,
        )?)? as usize;
        if count > 10_000 {
            return Err(ScryError::OffsetProbe(format!(
                "class @ {} field_count {} unreasonably large — bad class.field_count offset?",
                self.addr, count
            )));
        }

        let fields_ptr = self.runtime.memory.read_remote_ptr(add_offset(
            self.addr,
            self.runtime.offsets.structs.class.fields,
        )?)?;
        if fields_ptr.is_null() {
            return Ok(Vec::new());
        }

        let field_size = u32::try_from(self.runtime.offsets.structs.field.size).map_err(|_| {
            ScryError::Unsupported(format!(
                "field struct size out of 32-bit range: {}",
                self.runtime.offsets.structs.field.size
            ))
        })?;
        let mut fields = Vec::with_capacity(count);
        for index in 0..count {
            let offset = field_size
                .checked_mul(index as u32)
                .ok_or_else(|| ScryError::Unsupported("field array offset overflow".into()))?;
            fields.push(MonoFieldDef::read(self.runtime, fields_ptr + offset)?);
        }
        Ok(fields)
    }

    pub fn fields_recursive(&self) -> Result<HashMap<String, MonoFieldDef>, ScryError> {
        let mut fields = HashMap::new();
        let mut current = Some(self.addr);
        for _ in 0..=64 {
            let Some(class) = current else {
                return Ok(fields);
            };
            let class = MonoClass::new(self.runtime, class);
            for field in class.fields()? {
                fields.entry(field.name.clone()).or_insert(field);
            }
            current = class.parent()?;
        }
        Err(ScryError::OffsetProbe(format!(
            "class inheritance chain exceeded 64 hops starting at {}",
            self.addr
        )))
    }

    pub fn find_field(&self, name: &str) -> Result<MonoFieldDef, ScryError> {
        self.fields_recursive()?
            .remove(name)
            .ok_or_else(|| ScryError::FieldNotFound {
                class: self.full_name().unwrap_or_default(),
                field: name.to_string(),
            })
    }
}

pub(crate) fn compose_full_name(namespace: &str, name: &str) -> String {
    if namespace.is_empty() {
        name.to_string()
    } else {
        format!("{namespace}.{name}")
    }
}

#[cfg(test)]
pub(crate) fn fields_recursive_with(
    start: RemotePtr,
    mut read_parent: impl FnMut(RemotePtr) -> Option<RemotePtr>,
    mut read_fields: impl FnMut(RemotePtr) -> Vec<MonoFieldDef>,
) -> Result<HashMap<String, MonoFieldDef>, ScryError> {
    let mut fields = HashMap::new();
    let mut current = Some(start);
    for _ in 0..=64 {
        let Some(class) = current else {
            return Ok(fields);
        };
        for field in read_fields(class) {
            fields.entry(field.name.clone()).or_insert(field);
        }
        current = read_parent(class);
    }
    Err(ScryError::OffsetProbe(format!(
        "class inheritance chain exceeded 64 hops starting at {start}"
    )))
}

impl MonoRuntime {
    pub fn find_class(&self, namespace: &str, name: &str) -> Result<MonoClass<'_>, ScryError> {
        let full_name = compose_full_name(namespace, name);
        for image_addr in self.enumerate_assembly_image_addrs()? {
            let image = super::image::MonoImage::new(self, image_addr);
            match image.find_class(&full_name) {
                Ok(class_addr) => return Ok(MonoClass::new(self, class_addr)),
                Err(ScryError::ClassNotFound { .. }) => {}
                Err(err) => return Err(err),
            }
        }
        Err(ScryError::ClassNotFound { name: full_name })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compose_full_name_omits_empty_namespace() {
        assert_eq!(compose_full_name("", "Entity"), "Entity");
        assert_eq!(compose_full_name("Game", "Card"), "Game.Card");
    }

    #[test]
    fn fields_recursive_prefers_derived_definitions() {
        let base = RemotePtr::new(0x1000);
        let derived = RemotePtr::new(0x2000);

        let mut parents = HashMap::new();
        parents.insert(derived, Some(base));
        parents.insert(base, None);

        let mut fields = HashMap::new();
        fields.insert(
            derived,
            vec![MonoFieldDef {
                name: "id".to_string(),
                offset: 0x20,
                type_ptr: RemotePtr::new(0x3000),
                is_static: false,
                owner_class: derived,
            }],
        );
        fields.insert(
            base,
            vec![
                MonoFieldDef {
                    name: "id".to_string(),
                    offset: 0x10,
                    type_ptr: RemotePtr::new(0x3004),
                    is_static: false,
                    owner_class: base,
                },
                MonoFieldDef {
                    name: "health".to_string(),
                    offset: 0x14,
                    type_ptr: RemotePtr::new(0x3008),
                    is_static: false,
                    owner_class: base,
                },
            ],
        );

        let merged = fields_recursive_with(
            derived,
            |addr| parents.get(&addr).copied().flatten(),
            |addr| fields.get(&addr).cloned().unwrap_or_default(),
        )
        .unwrap();

        assert_eq!(merged["id"].offset, 0x20);
        assert_eq!(merged["health"].offset, 0x14);
    }

    #[test]
    fn fields_recursive_allows_exactly_sixty_four_levels() {
        let classes: Vec<_> = (0..64).map(|i| RemotePtr::new(0x1000 + i)).collect();
        let merged = fields_recursive_with(
            classes[0],
            |addr| {
                let index = classes
                    .iter()
                    .position(|candidate| *candidate == addr)
                    .unwrap();
                classes.get(index + 1).copied()
            },
            |addr| {
                vec![MonoFieldDef {
                    name: format!("field_{:08X}", addr.raw()),
                    offset: addr.raw(),
                    type_ptr: RemotePtr::NULL,
                    is_static: false,
                    owner_class: addr,
                }]
            },
        )
        .unwrap();

        assert_eq!(merged.len(), 64);
    }

    #[test]
    fn fields_recursive_preserves_inherited_field_owners() {
        let base = RemotePtr::new(0x1000);
        let middle = RemotePtr::new(0x2000);
        let derived = RemotePtr::new(0x3000);

        let mut parents = HashMap::new();
        parents.insert(derived, Some(middle));
        parents.insert(middle, Some(base));
        parents.insert(base, None);

        let mut fields = HashMap::new();
        fields.insert(
            derived,
            vec![MonoFieldDef {
                name: "derived_only".to_string(),
                offset: 0x30,
                type_ptr: RemotePtr::new(0x4000),
                is_static: false,
                owner_class: derived,
            }],
        );
        fields.insert(
            middle,
            vec![MonoFieldDef {
                name: "shared".to_string(),
                offset: 0x20,
                type_ptr: RemotePtr::new(0x4004),
                is_static: false,
                owner_class: middle,
            }],
        );
        fields.insert(
            base,
            vec![MonoFieldDef {
                name: "base_only".to_string(),
                offset: 0x10,
                type_ptr: RemotePtr::new(0x4008),
                is_static: false,
                owner_class: base,
            }],
        );

        let merged = fields_recursive_with(
            derived,
            |addr| parents.get(&addr).copied().flatten(),
            |addr| fields.get(&addr).cloned().unwrap_or_default(),
        )
        .unwrap();

        assert_eq!(merged["derived_only"].owner_class, derived);
        assert_eq!(merged["shared"].owner_class, middle);
        assert_eq!(merged["base_only"].owner_class, base);
    }
}
