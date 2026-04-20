use super::class::compose_full_name;
use super::runtime::{add_offset, MonoRuntime};
use crate::error::ScryError;
use crate::remote_ptr::RemotePtr;

pub struct MonoImage<'rt> {
    pub runtime: &'rt MonoRuntime,
    pub addr: RemotePtr,
}

impl<'rt> MonoImage<'rt> {
    pub fn new(runtime: &'rt MonoRuntime, addr: RemotePtr) -> Self {
        Self { runtime, addr }
    }

    pub fn enumerate_classes(&self) -> Result<Vec<(String, RemotePtr)>, ScryError> {
        let offsets = &self.runtime.offsets;
        let hash_table = &offsets.structs.hash_table;
        let class_offsets = &offsets.structs.class;
        let class_cache = add_offset(self.addr, offsets.structs.image.class_cache)?;

        let buckets = self
            .runtime
            .memory
            .read_u32(add_offset(class_cache, hash_table.size)?)? as usize;
        if buckets == 0 {
            return Ok(Vec::new());
        }
        if buckets > 1_000_000 {
            return Err(ScryError::OffsetProbe(format!(
                "class_cache.size {} unreasonably large — bad image.class_cache offset?",
                buckets
            )));
        }

        let table = self
            .runtime
            .memory
            .read_remote_ptr(add_offset(class_cache, hash_table.table)?)?;
        if table.is_null() {
            return Ok(Vec::new());
        }

        let mut classes = Vec::new();
        let ptr_size = u32::try_from(offsets.ptr_size).map_err(|_| {
            ScryError::Unsupported(format!("ptr_size out of range: {}", offsets.ptr_size))
        })?;
        for bucket in 0..buckets {
            let bucket_offset = ptr_size
                .checked_mul(bucket as u32)
                .ok_or_else(|| ScryError::Unsupported("bucket offset overflow".into()))?;
            let mut node = self.runtime.memory.read_remote_ptr(table + bucket_offset)?;
            for _ in 0..1024 {
                if node.is_null() {
                    break;
                }
                if let Some(name) = self.read_class_name(node)? {
                    classes.push((name, node));
                }
                let next = self
                    .runtime
                    .memory
                    .read_remote_ptr(add_offset(node, class_offsets.next_class_cache)?)?;
                if next == node {
                    break;
                }
                node = next;
            }
        }
        Ok(classes)
    }

    pub fn find_class(&self, full_name: &str) -> Result<RemotePtr, ScryError> {
        find_class_with(self.enumerate_classes()?.into_iter(), full_name)
    }

    fn read_class_name(&self, class_addr: RemotePtr) -> Result<Option<String>, ScryError> {
        let name_ptr = self.runtime.memory.read_remote_ptr(add_offset(
            class_addr,
            self.runtime.offsets.structs.class.name,
        )?)?;
        if name_ptr.is_null() {
            return Ok(None);
        }

        let name = self.runtime.memory.read_cstring(name_ptr, 256)?;
        if name.is_empty() {
            return Ok(None);
        }

        let namespace_ptr = self.runtime.memory.read_remote_ptr(add_offset(
            class_addr,
            self.runtime.offsets.structs.class.name_space,
        )?)?;
        let namespace = if namespace_ptr.is_null() {
            String::new()
        } else {
            self.runtime.memory.read_cstring(namespace_ptr, 256)?
        };
        Ok(Some(compose_full_name(&namespace, &name)))
    }
}

#[cfg(test)]
pub(crate) fn enumerate_classes_with(
    image: RemotePtr,
    offsets: &super::offsets::MonoOffsets,
    mut read_u32: impl FnMut(RemotePtr) -> u32,
    mut read_ptr: impl FnMut(RemotePtr) -> RemotePtr,
    mut read_cstring: impl FnMut(RemotePtr) -> String,
) -> Result<Vec<(String, RemotePtr)>, ScryError> {
    let class_cache = image + offsets.structs.image.class_cache as u32;

    let buckets = read_u32(class_cache + offsets.structs.hash_table.size as u32) as usize;
    if buckets > 1_000_000 {
        return Err(ScryError::OffsetProbe(format!(
            "class_cache.size {} unreasonably large — bad image.class_cache offset?",
            buckets
        )));
    }

    let table = read_ptr(class_cache + offsets.structs.hash_table.table as u32);
    if buckets == 0 || table.is_null() {
        return Ok(Vec::new());
    }

    let mut classes = Vec::new();
    for bucket in 0..buckets {
        let mut node = read_ptr(table + (bucket as u32 * offsets.ptr_size as u32));
        for _ in 0..1024 {
            if node.is_null() {
                break;
            }
            let name_ptr = read_ptr(node + offsets.structs.class.name as u32);
            if !name_ptr.is_null() {
                let name = read_cstring(name_ptr);
                if !name.is_empty() {
                    let namespace_ptr = read_ptr(node + offsets.structs.class.name_space as u32);
                    let namespace = if namespace_ptr.is_null() {
                        String::new()
                    } else {
                        read_cstring(namespace_ptr)
                    };
                    classes.push((compose_full_name(&namespace, &name), node));
                }
            }
            let next = read_ptr(node + offsets.structs.class.next_class_cache as u32);
            if next == node {
                break;
            }
            node = next;
        }
    }
    Ok(classes)
}

pub(crate) fn find_class_with(
    classes: impl IntoIterator<Item = (String, RemotePtr)>,
    full_name: &str,
) -> Result<RemotePtr, ScryError> {
    classes
        .into_iter()
        .find_map(|(name, addr)| (name == full_name).then_some(addr))
        .ok_or_else(|| ScryError::ClassNotFound {
            name: full_name.to_string(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mono::offsets::MonoOffsets;
    use std::collections::HashMap;

    #[test]
    fn enumerate_classes_walks_buckets_and_collision_chains() {
        let offsets = MonoOffsets::bundled_unity_2021_3().unwrap();
        let image = RemotePtr::new(0x1000);
        let class_cache = image + offsets.structs.image.class_cache as u32;
        let table = RemotePtr::new(0x3000);
        let first = RemotePtr::new(0x4000);
        let second = RemotePtr::new(0x5000);
        let third = RemotePtr::new(0x6000);
        let first_name = RemotePtr::new(0x7000);
        let second_name = RemotePtr::new(0x7010);
        let second_ns = RemotePtr::new(0x7020);
        let third_name = RemotePtr::new(0x7030);
        let third_ns = RemotePtr::new(0x7040);

        let mut ptrs = HashMap::new();
        ptrs.insert(class_cache + offsets.structs.hash_table.table as u32, table);
        ptrs.insert(table, first);
        ptrs.insert(table + offsets.ptr_size as u32, second);
        ptrs.insert(first + offsets.structs.class.name as u32, first_name);
        ptrs.insert(second + offsets.structs.class.name as u32, second_name);
        ptrs.insert(second + offsets.structs.class.name_space as u32, second_ns);
        ptrs.insert(
            second + offsets.structs.class.next_class_cache as u32,
            third,
        );
        ptrs.insert(third + offsets.structs.class.name as u32, third_name);
        ptrs.insert(third + offsets.structs.class.name_space as u32, third_ns);

        let mut u32s = HashMap::new();
        u32s.insert(class_cache + offsets.structs.hash_table.size as u32, 2);

        let mut strings = HashMap::new();
        strings.insert(first_name, "Entity".to_string());
        strings.insert(second_name, "Card".to_string());
        strings.insert(second_ns, "Game".to_string());
        strings.insert(third_name, "Zone".to_string());
        strings.insert(third_ns, "Game".to_string());

        let classes = enumerate_classes_with(
            image,
            &offsets,
            |addr| u32s.get(&addr).copied().unwrap_or_default(),
            |addr| ptrs.get(&addr).copied().unwrap_or(RemotePtr::NULL),
            |addr| strings.get(&addr).cloned().unwrap_or_default(),
        )
        .unwrap();

        assert_eq!(
            classes,
            vec![
                ("Entity".to_string(), first),
                ("Game.Card".to_string(), second),
                ("Game.Zone".to_string(), third),
            ]
        );
    }

    #[test]
    fn find_class_matches_full_name() {
        let classes = vec![
            ("Entity".to_string(), RemotePtr::new(0x1000)),
            ("Game.Card".to_string(), RemotePtr::new(0x2000)),
        ];

        assert_eq!(
            find_class_with(classes.iter().cloned(), "Game.Card").unwrap(),
            RemotePtr::new(0x2000)
        );
    }
}
