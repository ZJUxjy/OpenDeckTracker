//! Mono runtime internal struct offsets, loaded from a JSON config file.
//!
//! The on-disk schema lives in `config/mono-offsets/*.json`. Hex offset values
//! are encoded as strings like `"0xC"` (so they are human-readable in source
//! control), but plain integers are also accepted for fields like
//! `MonoClassField.size`. Annotation keys prefixed with `$` (e.g.
//! `$confidence`, `$note`) are ignored by the deserializer.
//!
//! The default baseline ships embedded via `include_str!` so the crate works
//! without an on-disk config file. `OffsetProber` (added in Phase 5) refines
//! the baseline by disassembling exported Mono getter functions at runtime.

use crate::error::ScryError;
use serde::Deserialize;
use std::path::Path;

/// Embedded baseline offsets, derived from Unity 2021.3 BDWGC fork. Used as
/// the starting point for `OffsetProber::probe_all`.
pub const DEFAULT_OFFSETS_JSON: &str =
    include_str!("../../config/mono-offsets/unity-2021.3.json");

/// Top-level Mono offsets table loaded from JSON.
#[derive(Debug, Clone, Deserialize)]
pub struct MonoOffsets {
    pub schema_version: u32,
    pub unity_version: String,
    pub ptr_size: u32,
    pub structs: MonoStructs,
}

/// Per-Mono-type offset tables. Field names match the JSON struct keys via
/// `#[serde(rename = ...)]`.
#[derive(Debug, Clone, Deserialize)]
pub struct MonoStructs {
    #[serde(rename = "MonoDomain")]
    pub domain: DomainOffsets,
    #[serde(rename = "MonoAssembly")]
    pub assembly: AssemblyOffsets,
    #[serde(rename = "MonoImage")]
    pub image: ImageOffsets,
    #[serde(rename = "MonoInternalHashTable")]
    pub hash_table: HashTableOffsets,
    #[serde(rename = "MonoClass")]
    pub class: ClassOffsets,
    #[serde(rename = "MonoClassField")]
    pub field: FieldOffsets,
    #[serde(rename = "MonoVTable")]
    pub vtable: VTableOffsets,
    #[serde(rename = "MonoObject")]
    pub object: ObjectOffsets,
    #[serde(rename = "MonoString")]
    pub string: StringOffsets,
    #[serde(rename = "MonoArray")]
    pub array: ArrayOffsets,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DomainOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub domain_assemblies: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub loaded_images_hash: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssemblyOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub image: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImageOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub name: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub assembly: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub class_cache: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HashTableOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub hash_func: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub key_extract_func: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub next_value_func: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub size: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub num_entries: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub table: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClassOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub instance_size: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub parent: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub nested_in: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub image: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub name: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub name_space: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub type_token: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub vtable_size: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub interface_count: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub fields: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub methods: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub runtime_info: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub vtable: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub field_count: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub next_class_cache: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FieldOffsets {
    #[serde(rename = "type", deserialize_with = "hex_or_int")]
    pub type_: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub name: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub parent: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub offset: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub size: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VTableOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub klass: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub gc_descr: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub domain: u32,
    #[serde(rename = "type", deserialize_with = "hex_or_int")]
    pub type_: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub interface_bitmap: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub max_interface_id: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub vtable_array_start: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ObjectOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub vtable: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub data_start: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StringOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub length: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub chars: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ArrayOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub bounds: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub max_length: u32,
    #[serde(deserialize_with = "hex_or_int")]
    pub data_start: u32,
}

/// Deserializer that accepts either a hex string (`"0xC"`, `"0X10"`), a
/// decimal string (`"16"`), or a plain JSON integer (`16`).
fn hex_or_int<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    use serde::de::Error;
    let v = serde_json::Value::deserialize(d)?;
    match v {
        serde_json::Value::String(s) => {
            let s = s.trim();
            let stripped = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X"));
            match stripped {
                Some(rest) => u32::from_str_radix(rest, 16).map_err(D::Error::custom),
                None => s.parse::<u32>().map_err(D::Error::custom),
            }
        }
        serde_json::Value::Number(n) => n
            .as_u64()
            .and_then(|v| u32::try_from(v).ok())
            .ok_or_else(|| D::Error::custom("expected non-negative integer fitting in u32")),
        other => Err(D::Error::custom(format!(
            "expected hex string or integer, got {:?}",
            other
        ))),
    }
}

impl MonoOffsets {
    /// Load a `MonoOffsets` table from a JSON file on disk.
    pub fn from_file(path: impl AsRef<Path>) -> Result<Self, ScryError> {
        let s = std::fs::read_to_string(path.as_ref()).map_err(|e| {
            ScryError::MetadataError(format!(
                "failed to read offsets JSON {}: {}",
                path.as_ref().display(),
                e
            ))
        })?;
        Self::from_str(&s)
    }

    /// Parse a `MonoOffsets` table from an in-memory JSON string.
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Result<Self, ScryError> {
        serde_json::from_str(s)
            .map_err(|e| ScryError::MetadataError(format!("offsets JSON parse error: {}", e)))
    }
}

impl Default for MonoOffsets {
    /// Returns the embedded baseline (Unity 2021.3 BDWGC). Panics only on
    /// programmer error (the embedded JSON is shipped at compile time and
    /// validated by `loads_default_baseline_with_sentinel_values` test).
    fn default() -> Self {
        #[allow(clippy::expect_used)]
        {
            Self::from_str(DEFAULT_OFFSETS_JSON)
                .expect("DEFAULT_OFFSETS_JSON is malformed (compile-time bug)")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies the embedded baseline JSON loads correctly with sentinel
    /// values. Acts as a contract test for the schema + JSON synchronisation.
    #[test]
    fn loads_default_baseline_with_sentinel_values() {
        let off = MonoOffsets::from_str(DEFAULT_OFFSETS_JSON)
            .expect("embedded DEFAULT_OFFSETS_JSON must parse");

        assert_eq!(off.ptr_size, 4);
        assert_eq!(off.structs.field.size, 16);
        assert_eq!(off.structs.field.offset, 0xC);
        assert_eq!(off.structs.object.data_start, 0x8);
        assert_eq!(off.structs.array.max_length, 0xC);
        assert_eq!(off.structs.array.data_start, 0x10);
        assert_eq!(off.structs.class.name, 0x2C);
    }

    /// `Default::default()` returns the embedded baseline (non-zero).
    #[test]
    fn default_impl_returns_non_zero_baseline() {
        let off = MonoOffsets::default();
        assert_ne!(off.structs.class.name, 0);
        assert_ne!(off.structs.image.class_cache, 0);
    }

    /// `from_file` loads the on-disk file equivalently to `from_str` on the
    /// embedded constant (the file IS the source of `include_str!`).
    #[test]
    fn from_file_matches_embedded_default() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("config/mono-offsets/unity-2021.3.json");
        let from_disk = MonoOffsets::from_file(&path).unwrap_or_else(|e| {
            #[allow(clippy::panic)]
            { panic!("failed to load {}: {}", path.display(), e); }
        });
        let from_embedded = MonoOffsets::default();
        assert_eq!(from_disk.ptr_size, from_embedded.ptr_size);
        assert_eq!(from_disk.structs.class.name, from_embedded.structs.class.name);
        assert_eq!(from_disk.structs.image.class_cache, from_embedded.structs.image.class_cache);
    }

    /// Hex deserializer accepts strings, plain ints, and uppercase 0X.
    #[test]
    fn hex_or_int_accepts_string_and_int() {
        let json = r#"{
          "schema_version": 1,
          "unity_version": "test",
          "ptr_size": 4,
          "structs": {
            "MonoDomain": { "domain_assemblies": "0xC", "loaded_images_hash": "0x14" },
            "MonoAssembly": { "image": "0x8" },
            "MonoImage": { "name": "0x10", "assembly": "0x420", "class_cache": "0x424" },
            "MonoInternalHashTable": { "hash_func": "0x0", "key_extract_func": "0x4",
              "next_value_func": "0x8", "size": "0xC", "num_entries": "0x10", "table": "0x14" },
            "MonoClass": {
              "instance_size": "0x10", "parent": "0x1C", "nested_in": "0x20", "image": "0x24",
              "name": "0x28", "name_space": "0x2C", "type_token": "0x30", "vtable_size": "0x34",
              "interface_count": "0x38", "fields": "0x5C", "methods": "0x60",
              "runtime_info": "0x78", "vtable": "0x7C",
              "field_count": "0x98", "next_class_cache": "0x9C"
            },
            "MonoClassField": { "name": "0x4", "type": "0x0", "parent": "0x8", "offset": "0xC", "size": 16 },
            "MonoVTable": { "klass": "0x0", "gc_descr": "0x4", "domain": "0x8", "type": "0xC",
              "interface_bitmap": "0x10", "max_interface_id": "0x14", "vtable_array_start": "0x24" },
            "MonoObject": { "vtable": "0x0", "data_start": "0x8" },
            "MonoString": { "length": "0x8", "chars": "0xC" },
            "MonoArray": { "bounds": "0x8", "max_length": "0xC", "data_start": "0x10" }
          }
        }"#;
        let off = MonoOffsets::from_str(json).expect("test JSON must parse");
        assert_eq!(off.structs.domain.domain_assemblies, 0xC);
        assert_eq!(off.structs.field.size, 16);
        assert_eq!(off.structs.image.class_cache, 0x424);
    }

    /// Ignores `$`-prefixed annotation keys (no error on extra fields).
    #[test]
    fn ignores_dollar_annotation_keys() {
        let json = r#"{
          "$schema_comment": "doc",
          "schema_version": 1,
          "unity_version": "test",
          "ptr_size": 4,
          "structs": {
            "MonoDomain": { "$confidence": "HIGH", "$note": "foo",
              "domain_assemblies": "0x0", "loaded_images_hash": "0x0" },
            "MonoAssembly": { "image": "0x0" },
            "MonoImage": { "name": "0x0", "assembly": "0x0", "class_cache": "0x0" },
            "MonoInternalHashTable": { "hash_func": "0x0", "key_extract_func": "0x0",
              "next_value_func": "0x0", "size": "0x0", "num_entries": "0x0", "table": "0x0" },
            "MonoClass": {
              "instance_size": "0x0", "parent": "0x0", "nested_in": "0x0", "image": "0x0",
              "name": "0x0", "name_space": "0x0", "type_token": "0x0", "vtable_size": "0x0",
              "interface_count": "0x0", "fields": "0x0", "methods": "0x0",
              "runtime_info": "0x0", "vtable": "0x0", "field_count": "0x0", "next_class_cache": "0x0"
            },
            "MonoClassField": { "name": "0x0", "type": "0x0", "parent": "0x0", "offset": "0x0", "size": 0 },
            "MonoVTable": { "klass": "0x0", "gc_descr": "0x0", "domain": "0x0", "type": "0x0",
              "interface_bitmap": "0x0", "max_interface_id": "0x0", "vtable_array_start": "0x0" },
            "MonoObject": { "vtable": "0x0", "data_start": "0x0" },
            "MonoString": { "length": "0x0", "chars": "0x0" },
            "MonoArray": { "bounds": "0x0", "max_length": "0x0", "data_start": "0x0" }
          }
        }"#;
        MonoOffsets::from_str(json).expect("annotation-only JSON must parse");
    }

    #[test]
    fn rejects_unparseable_hex() {
        let bad = r#"{ "schema_version":1,"unity_version":"x","ptr_size":4,"structs":{
          "MonoDomain":{"domain_assemblies":"0xZZ","loaded_images_hash":"0x0"}}}"#;
        assert!(MonoOffsets::from_str(bad).is_err());
    }
}
