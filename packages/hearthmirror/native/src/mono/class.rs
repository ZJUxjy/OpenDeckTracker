use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::field::MonoFieldDef;
use crate::mono::offsets::MonoOffsets;
use crate::remote_ptr::RemotePtr;
use std::collections::HashMap;
use std::sync::Arc;

/// Maximum parent-chain depth walked by [`MonoClassRef::fields_recursive`]
/// before surfacing [`ScryError::ClassHierarchyTooDeep`]. C# inheritance
/// rarely exceeds 10 levels (`System.Object` → ... → leaf); 32 leaves a
/// 3x safety margin and is enough to defend against pathological cycles
/// the simple `parent_addr == self.addr` guard may miss.
pub const MAX_PARENT_CHAIN_DEPTH: usize = 32;

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

/// Read the full `MonoFieldDef` list (name + offset + type_ptr + is_static)
/// for a single MonoClass, WITHOUT walking the parent chain. Used as the
/// building block for [`MonoClassRef::fields_recursive`].
pub fn read_class_field_defs(
    memory: &ProcessMemory,
    klass: RemotePtr,
    offsets: &MonoOffsets,
) -> Result<Vec<MonoFieldDef>, ScryError> {
    let class_off = &offsets.structs.class;
    let field_off = &offsets.structs.field;

    let field_count = memory.read_u16(klass + class_off.field_count)? as usize;
    let fields_ptr = memory.read_remote_ptr(klass + class_off.fields)?;

    if fields_ptr.is_null() || field_count == 0 || field_count > 500 {
        return Ok(Vec::new());
    }

    let mut defs = Vec::with_capacity(field_count);
    for i in 0..field_count {
        let field_base = fields_ptr + (i as u32 * field_off.size);
        match MonoFieldDef::read(memory, field_base, field_off) {
            Ok(def) => {
                // Skip unresolved field slots (offset == 0xFFFFFFFF in Mono).
                if def.offset == 0xFFFF_FFFF {
                    continue;
                }
                if def.name.is_empty() {
                    continue;
                }
                defs.push(def);
            }
            Err(_) => continue,
        }
    }

    Ok(defs)
}

impl MonoClassRef {
    /// Read the parent class pointer from `MonoClass.parent` and eagerly
    /// resolve it to a new [`MonoClassRef`].
    ///
    /// Returns `Ok(None)` when:
    /// * `parent` field is NULL (typically on `System.Object`, the root of
    ///   the reference-type hierarchy).
    /// * `parent` points back at this class (self-cycle guard — malformed
    ///   metadata or partially-initialised class).
    ///
    /// The returned `MonoClassRef` inherits this class's `Arc<MonoOffsets>`.
    pub fn parent(
        &self,
        memory: &ProcessMemory,
    ) -> Result<Option<MonoClassRef>, ScryError> {
        let class_off = &self.offsets.structs.class;
        let parent_addr = memory.read_remote_ptr(self.addr + class_off.parent)?;
        if parent_addr.is_null() || parent_addr == self.addr {
            return Ok(None);
        }
        Ok(Some(read_mono_class(memory, parent_addr, self.offsets.clone())?))
    }

    /// Walk the parent chain (deepest first) and build a `name → MonoFieldDef`
    /// map with the C# "child overrides parent on name collision" rule:
    /// fields declared on the leaf class win over fields of the same name in
    /// ancestors (as if the child used `new` to hide the parent field).
    ///
    /// Returns [`ScryError::ClassHierarchyTooDeep`] if the chain depth
    /// exceeds [`MAX_PARENT_CHAIN_DEPTH`].
    pub fn fields_recursive(
        &self,
        memory: &ProcessMemory,
    ) -> Result<HashMap<String, MonoFieldDef>, ScryError> {
        // Collect ancestors in order: [leaf, parent, grandparent, ...].
        let mut chain: Vec<MonoClassRef> = Vec::with_capacity(8);
        chain.push(self.clone());
        let mut cursor = self.clone();
        for depth in 0..MAX_PARENT_CHAIN_DEPTH {
            match cursor.parent(memory)? {
                Some(p) => {
                    chain.push(p.clone());
                    cursor = p;
                }
                None => {
                    let _ = depth;
                    return build_fields_map(memory, &chain);
                }
            }
        }
        // If we walked the full MAX_PARENT_CHAIN_DEPTH without hitting the
        // root (no None), the chain is suspiciously deep.
        Err(ScryError::ClassHierarchyTooDeep {
            class: self.full_name.clone(),
            depth: MAX_PARENT_CHAIN_DEPTH,
        })
    }

    /// Look up a single field by name across this class and its ancestors,
    /// honouring the "child overrides parent" rule from
    /// [`MonoClassRef::fields_recursive`].
    pub fn find_field(
        &self,
        memory: &ProcessMemory,
        name: &str,
    ) -> Result<Option<MonoFieldDef>, ScryError> {
        // Faster path than `fields_recursive().get(name)` for deeply inherited
        // classes where the field is likely declared on the leaf: scan each
        // class's own field list top-down and return on first hit.
        let mut cursor = self.clone();
        for _ in 0..=MAX_PARENT_CHAIN_DEPTH {
            let defs = read_class_field_defs(memory, cursor.addr, &cursor.offsets)?;
            if let Some(hit) = defs.into_iter().find(|f| f.name == name) {
                return Ok(Some(hit));
            }
            match cursor.parent(memory)? {
                Some(p) => cursor = p,
                None => return Ok(None),
            }
        }
        Err(ScryError::ClassHierarchyTooDeep {
            class: self.full_name.clone(),
            depth: MAX_PARENT_CHAIN_DEPTH,
        })
    }
}

/// Merge field definitions from a leaf→root ancestry chain honouring the
/// "child overrides parent" rule.
///
/// We iterate the chain in REVERSE (root first) so that when we `insert` the
/// leaf's fields last, they replace any same-name ancestor field.
fn build_fields_map(
    memory: &ProcessMemory,
    chain: &[MonoClassRef],
) -> Result<HashMap<String, MonoFieldDef>, ScryError> {
    let mut per_class: Vec<Vec<MonoFieldDef>> = Vec::with_capacity(chain.len());
    for class in chain {
        per_class.push(read_class_field_defs(memory, class.addr, &class.offsets)?);
    }
    Ok(merge_field_chain(&per_class))
}

/// Pure merge: given a leaf→root sequence of per-class field lists, build
/// the final name → def map where leaf-declared fields shadow ancestor
/// fields of the same name.
///
/// Exposed as a pure helper so the "child overrides parent" contract can be
/// unit-tested without touching `ProcessMemory`.
pub(crate) fn merge_field_chain(
    per_class: &[Vec<MonoFieldDef>],
) -> HashMap<String, MonoFieldDef> {
    let mut merged: HashMap<String, MonoFieldDef> =
        HashMap::with_capacity(per_class.iter().map(|v| v.len()).sum());
    for defs in per_class.iter().rev() {
        for def in defs.iter() {
            merged.insert(def.name.clone(), def.clone());
        }
    }
    merged
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    fn fd(name: &str, offset: u32, is_static: bool) -> MonoFieldDef {
        MonoFieldDef {
            name: name.into(),
            offset,
            type_ptr: RemotePtr::new(0x1000),
            is_static,
        }
    }

    #[test]
    fn merge_chain_merges_disjoint_fields() {
        let leaf = vec![fd("m_c", 20, false)];
        let mid = vec![fd("m_b", 16, false)];
        let root = vec![fd("m_a", 12, false)];
        let merged = merge_field_chain(&[leaf, mid, root]);
        assert_eq!(merged.len(), 3);
        assert!(merged.contains_key("m_a"));
        assert!(merged.contains_key("m_b"));
        assert!(merged.contains_key("m_c"));
    }

    #[test]
    fn merge_chain_child_overrides_parent_on_name_collision() {
        let leaf = vec![fd("m_id", 0x20, false)];
        let parent = vec![fd("m_id", 0x0C, false), fd("m_other", 0x10, false)];
        let merged = merge_field_chain(&[leaf, parent]);
        let m_id = merged.get("m_id").expect("m_id present");
        assert_eq!(m_id.offset, 0x20, "leaf's m_id must win over parent's");
        assert!(merged.contains_key("m_other"));
        assert_eq!(merged.len(), 2);
    }

    #[test]
    fn merge_chain_empty_returns_empty() {
        let merged = merge_field_chain(&[]);
        assert!(merged.is_empty());
    }

    #[test]
    fn merge_chain_three_levels_counts_everything() {
        // Simulates: A (root) → B → C (leaf). Each declares a unique field +
        // C re-declares A's `m_tag`.
        let a = vec![fd("m_a", 4, false), fd("m_tag", 8, false)];
        let b = vec![fd("m_b", 12, false)];
        let c = vec![fd("m_c", 16, false), fd("m_tag", 24, false)];
        let merged = merge_field_chain(&[c, b, a]);
        assert_eq!(merged.len(), 4);
        assert_eq!(merged.get("m_tag").unwrap().offset, 24, "leaf tag wins");
    }

    #[test]
    fn max_parent_chain_depth_is_32() {
        assert_eq!(MAX_PARENT_CHAIN_DEPTH, 32);
    }

    #[test]
    fn class_hierarchy_too_deep_display_contains_class_and_depth() {
        let e = ScryError::ClassHierarchyTooDeep {
            class: "Deep.Class".into(),
            depth: 32,
        };
        let msg = e.to_string();
        assert!(msg.contains("Deep.Class"));
        assert!(msg.contains("32"));
    }
}
