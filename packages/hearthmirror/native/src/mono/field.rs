//! `MonoFieldDef` — a reusable view over a single `MonoClassField` entry
//! in the target Mono runtime.
//!
//! Adds `type_ptr` + `is_static` metadata on top of the basic `(name, offset)`
//! pair that `MonoClassRef::fields` already exposes, so callers that need to
//! walk inheritance chains or inspect field kinds have a single struct to
//! consume instead of fishing for offsets field-by-field.
//!
//! The `is_static` bit is decoded from `MonoType.attrs` (low 16-bit word at
//! `type_ptr + 4`) by masking `MONO_FIELD_ATTR_STATIC = 0x10`, matching the
//! ECMA-335 `FieldAttributes.Static` flag. When `type_ptr` is NULL
//! (uninitialised / invalid field), `is_static` degrades to `false` rather
//! than erroring — treat it as "don't know, assume instance".

use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::offsets::FieldOffsets;
use crate::remote_ptr::RemotePtr;

/// ECMA-335 `FieldAttributes.Static` bit (`0x10`) extracted from
/// `MonoType.attrs`.
pub const MONO_FIELD_ATTR_STATIC: u16 = 0x10;

/// Decode the `is_static` bit from a `MonoType.attrs` word.
///
/// Split out as a pure helper so the bit-mask contract is unit-testable
/// without round-tripping through `ReadProcessMemory`.
#[inline]
pub fn is_static_from_attrs(attrs: u16) -> bool {
    (attrs & MONO_FIELD_ATTR_STATIC) != 0
}

/// Resolved `MonoClassField` metadata in a shape convenient for reflection.
///
/// `offset` is the raw offset read from the Mono runtime:
/// * For instance fields, it is relative to the start of the `MonoObject`
///   (i.e. includes the `0xC` header on 32-bit Mono).
/// * For static fields, it is relative to the class's
///   `MonoVTable.static_field_data` chunk.
#[derive(Debug, Clone)]
pub struct MonoFieldDef {
    /// Field name, read from `MonoClassField.name` (c-string).
    pub name: String,
    /// Raw offset of the field.
    pub offset: u32,
    /// Pointer to the `MonoType` describing this field. `RemotePtr::NULL` for
    /// unresolved / unreadable fields.
    pub type_ptr: RemotePtr,
    /// `true` if the `FieldAttributes.Static` bit is set in `MonoType.attrs`.
    pub is_static: bool,
}

impl MonoFieldDef {
    /// Read a single `MonoClassField` entry at `addr` in the target process,
    /// using `offsets` for field-struct layout.
    ///
    /// Returns an error only on underlying memory-read failures; NULL
    /// `type_ptr` is silently mapped to `is_static = false` (see module doc).
    pub fn read(
        memory: &ProcessMemory,
        addr: RemotePtr,
        offsets: &FieldOffsets,
    ) -> Result<Self, ScryError> {
        let name_ptr = memory.read_remote_ptr(addr + offsets.name)?;
        let name = if name_ptr.is_null() {
            String::new()
        } else {
            memory.read_cstring(name_ptr, 128)?
        };

        let offset = memory.read_u32(addr + offsets.offset)?;
        let type_ptr = memory.read_remote_ptr(addr + offsets.type_)?;

        let is_static = if type_ptr.is_null() {
            false
        } else {
            // Soft-fail on MonoType read errors: treat as non-static rather
            // than propagating. Mono has corner cases (TYPE_GENERIC_INST with
            // lazy resolution, unloaded assemblies) where `type_ptr` is set
            // but the pointed-to MonoType isn't yet fully populated.
            match memory.read_u16(type_ptr + 4) {
                Ok(attrs) => is_static_from_attrs(attrs),
                Err(_) => false,
            }
        };

        Ok(Self {
            name,
            offset,
            type_ptr,
            is_static,
        })
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn static_field_mask_matches_ecma() {
        assert_eq!(MONO_FIELD_ATTR_STATIC, 0x10);
    }

    #[test]
    fn is_static_from_attrs_sets_bit() {
        assert!(is_static_from_attrs(0x0010));
        assert!(is_static_from_attrs(0x0016)); // Static | Public
        assert!(is_static_from_attrs(0xFFFF));
    }

    #[test]
    fn is_static_from_attrs_clears_bit() {
        assert!(!is_static_from_attrs(0x0000));
        assert!(!is_static_from_attrs(0x0006)); // Public, non-static
        assert!(!is_static_from_attrs(0xFFEF)); // everything except bit 4
    }

    #[test]
    fn mono_field_def_is_clone_and_debug() {
        let def = MonoFieldDef {
            name: "m_id".into(),
            offset: 0x10,
            type_ptr: RemotePtr::new(0x1000),
            is_static: false,
        };
        let clone = def.clone();
        assert_eq!(clone.name, "m_id");
        assert_eq!(format!("{:?}", clone).contains("MonoFieldDef"), true);
    }
}
