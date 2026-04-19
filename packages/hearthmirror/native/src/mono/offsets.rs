//! Mono runtime internal struct offsets and runtime probing helpers.

use crate::{
    disasm, error::ScryError, memory::ProcessMemory, process::ModuleInfo, remote_ptr::RemotePtr,
};
use pelite::pe32::{exports::Export, Pe, PeView};
use serde::Deserialize;
use std::{collections::HashMap, path::Path};

const BUNDLED_UNITY_2021_3_JSON: &str = include_str!("../../config/mono-offsets/unity-2021.3.json");

#[derive(Debug, Clone, Deserialize)]
pub struct MonoOffsets {
    pub schema_version: u32,
    pub unity_version: String,
    pub ptr_size: usize,
    pub structs: MonoStructs,
}

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
    pub domain_assemblies: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub loaded_images_hash: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssemblyOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub image: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImageOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub name: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub assembly: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub class_cache: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HashTableOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub hash_func: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub key_extract_func: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub next_value_func: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub size: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub num_entries: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub table: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClassOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub instance_size: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub parent: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub nested_in: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub image: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub name: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub name_space: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub type_token: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub vtable_size: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub interface_count: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub fields: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub methods: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub runtime_info: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub vtable: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub field_count: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub next_class_cache: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FieldOffsets {
    #[serde(rename = "type", deserialize_with = "hex_or_int")]
    pub type_: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub name: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub parent: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub offset: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub size: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VTableOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub klass: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub gc_descr: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub domain: usize,
    #[serde(rename = "type", deserialize_with = "hex_or_int")]
    pub type_: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub interface_bitmap: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub max_interface_id: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub vtable_array_start: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ObjectOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub vtable: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub data_start: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StringOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub length: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub chars: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ArrayOffsets {
    #[serde(deserialize_with = "hex_or_int")]
    pub bounds: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub max_length: usize,
    #[serde(deserialize_with = "hex_or_int")]
    pub data_start: usize,
}

fn hex_or_int<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<usize, D::Error> {
    use serde::de::Error;

    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(s) => {
            let s = s.trim();
            let stripped = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X"));
            match stripped {
                Some(rest) => usize::from_str_radix(rest, 16).map_err(D::Error::custom),
                None => s.parse::<usize>().map_err(D::Error::custom),
            }
        }
        serde_json::Value::Number(n) => n
            .as_u64()
            .map(|value| value as usize)
            .ok_or_else(|| D::Error::custom("expected non-negative integer")),
        other => Err(D::Error::custom(format!(
            "expected hex string or integer, got {other:?}"
        ))),
    }
}

impl MonoOffsets {
    pub fn from_file(path: impl AsRef<Path>) -> Result<Self, ScryError> {
        let path = path.as_ref();
        let json = std::fs::read_to_string(path).map_err(|e| {
            ScryError::OffsetProbe(format!("failed to read {}: {e}", path.display()))
        })?;
        Self::from_str(&json)
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(json: &str) -> Result<Self, ScryError> {
        serde_json::from_str(json).map_err(|e| ScryError::OffsetProbe(e.to_string()))
    }

    pub fn bundled_unity_2021_3() -> Result<Self, ScryError> {
        Self::from_str(BUNDLED_UNITY_2021_3_JSON)
    }
}

type ProbeEntry = (&'static str, fn(&mut MonoOffsets, usize));

pub struct OffsetProber<'a> {
    pub mem: &'a ProcessMemory,
    pub mono_module: &'a ModuleInfo,
    pub bitness: u32,
    pub probe_window: usize,
}

impl<'a> OffsetProber<'a> {
    pub fn new(mem: &'a ProcessMemory, mono_module: &'a ModuleInfo, bitness: u32) -> Self {
        Self {
            mem,
            mono_module,
            bitness,
            probe_window: disasm::DEFAULT_PROBE_WINDOW,
        }
    }

    pub fn probe_displacement(
        &self,
        exports: &HashMap<String, usize>,
        export_name: &str,
    ) -> Result<usize, ScryError> {
        let addr = exports
            .get(export_name)
            .ok_or_else(|| ScryError::OffsetProbe(format!("missing mono export: {export_name}")))?;
        let code = self.mem.read_bytes(remote_ptr(*addr)?, self.probe_window)?;
        disasm::find_field_load_displacement(&code, self.bitness)
            .map_err(|e| ScryError::OffsetProbe(format!("{export_name}: {e}")))
    }

    pub fn probe_absolute_load(
        &self,
        exports: &HashMap<String, usize>,
        export_name: &str,
    ) -> Result<usize, ScryError> {
        let addr = exports
            .get(export_name)
            .ok_or_else(|| ScryError::OffsetProbe(format!("missing mono export: {export_name}")))?;
        let code = self.mem.read_bytes(remote_ptr(*addr)?, self.probe_window)?;
        disasm::find_first_absolute_load(&code, self.bitness)
            .map_err(|e| ScryError::OffsetProbe(format!("{export_name}: {e}")))
    }

    pub fn probe_all(
        &self,
        exports: &HashMap<String, usize>,
        defaults: &MonoOffsets,
    ) -> Result<MonoOffsets, ScryError> {
        let mut offsets = defaults.clone();

        let critical: &[ProbeEntry] = &[
            ("mono_class_get_name", |o, v| o.structs.class.name = v),
            ("mono_class_get_namespace", |o, v| {
                o.structs.class.name_space = v
            }),
            ("mono_class_get_fields", |o, v| o.structs.class.fields = v),
            ("mono_class_get_image", |o, v| o.structs.class.image = v),
            ("mono_image_get_name", |o, v| o.structs.image.name = v),
            ("mono_assembly_get_image", |o, v| {
                o.structs.assembly.image = v
            }),
        ];
        for (name, setter) in critical {
            setter(&mut offsets, self.probe_displacement(&exports, name)?);
        }

        let best_effort: &[ProbeEntry] = &[
            ("mono_class_get_parent", |o, v| o.structs.class.parent = v),
            ("mono_field_get_offset", |o, v| o.structs.field.offset = v),
            ("mono_field_get_name", |o, v| o.structs.field.name = v),
            ("mono_field_get_type", |o, v| o.structs.field.type_ = v),
        ];
        for (name, setter) in best_effort {
            if let Ok(value) = self.probe_displacement(&exports, name) {
                setter(&mut offsets, value);
            }
        }

        Ok(offsets)
    }
}

pub(crate) fn read_exports_map(
    mem: &ProcessMemory,
    module: &ModuleInfo,
) -> Result<HashMap<String, usize>, ScryError> {
    let base_addr = module.base.0 as u32;
    let pe_size = module.size.min(0x100_000) as usize;
    let pe_bytes = mem.read_bytes(RemotePtr::new(base_addr), pe_size)?;
    let pe = PeView::from_bytes(&pe_bytes)
        .map_err(|e| ScryError::MetadataError(format!("invalid module image: {e}")))?;
    collect_exports_map(pe, base_addr as usize)
}

fn collect_exports_map<'a, P: Pe<'a>>(
    pe: P,
    image_base: usize,
) -> Result<HashMap<String, usize>, ScryError> {
    let exports = pe
        .exports()
        .map_err(|e| ScryError::MetadataError(format!("no exports: {e}")))?;
    let by = exports
        .by()
        .map_err(|e| ScryError::MetadataError(format!("by name table failed: {e}")))?;

    let mut map = HashMap::new();
    for (name, export) in by.iter_names() {
        let name = name
            .map_err(|e| ScryError::MetadataError(format!("invalid export name: {e}")))?
            .to_str()
            .map_err(|e| ScryError::MetadataError(format!("non-utf8 export name: {e}")))?;
        let export =
            export.map_err(|e| ScryError::MetadataError(format!("invalid export entry: {e}")))?;
        if let Export::Symbol(rva) = export {
            map.insert(name.to_owned(), image_base + *rva as usize);
        }
    }
    Ok(map)
}

fn remote_ptr(addr: usize) -> Result<RemotePtr, ScryError> {
    let addr = u32::try_from(addr).map_err(|_| {
        ScryError::Unsupported(format!("32-bit remote pointer out of range: 0x{addr:X}"))
    })?;
    Ok(RemotePtr::new(addr))
}

#[cfg(test)]
mod tests {
    use super::*;
    use pelite::pe32::PeFile;
    use std::{fs, path::PathBuf};

    #[test]
    fn loads_unity_2021_3_json_from_repo() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("config/mono-offsets/unity-2021.3.json");
        let off = MonoOffsets::from_file(&path)
            .unwrap_or_else(|e| panic!("failed to load {}: {e}", path.display()));

        assert_eq!(off.ptr_size, 4);
        assert_eq!(off.structs.field.size, 16);
        assert_eq!(off.structs.field.offset, 0xC);
        assert_eq!(off.structs.object.data_start, 0x8);
        assert_eq!(off.structs.array.max_length, 0xC);
        assert_eq!(off.structs.array.data_start, 0x10);
        assert_eq!(
            MonoOffsets::bundled_unity_2021_3()
                .unwrap()
                .structs
                .class
                .name,
            0x2C
        );
    }

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
              "instance_size": "0x10", "parent": "0x20", "nested_in": "0x24", "image": "0x28",
              "name": "0x2C", "name_space": "0x30", "type_token": "0x34", "vtable_size": "0x38",
              "interface_count": "0x3C", "fields": "0x60", "methods": "0x64",
              "runtime_info": "0x7C", "vtable": "0x80",
              "field_count": "0x9C", "next_class_cache": "0xA0"
            },
            "MonoClassField": { "name": "0x4", "type": "0x0", "parent": "0x8", "offset": "0xC", "size": 16 },
            "MonoVTable": { "klass": "0x0", "gc_descr": "0x4", "domain": "0x8", "type": "0xC",
              "interface_bitmap": "0x10", "max_interface_id": "0x14", "vtable_array_start": "0x2C" },
            "MonoObject": { "vtable": "0x0", "data_start": "0x8" },
            "MonoString": { "length": "0x8", "chars": "0xC" },
            "MonoArray": { "bounds": "0x8", "max_length": "0xC", "data_start": "0x10" }
          }
        }"#;
        let off = MonoOffsets::from_str(json).unwrap();
        assert_eq!(off.structs.domain.domain_assemblies, 0xC);
        assert_eq!(off.structs.field.size, 16);
        assert_eq!(off.structs.image.class_cache, 0x424);
    }

    #[test]
    fn ignores_dollar_annotation_keys() {
        let json = r#"{
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
        let off = MonoOffsets::from_str(json).unwrap();
        assert_eq!(off.structs.class.name, 0);
    }

    #[test]
    fn collects_named_exports_from_pe_file() {
        let system_root =
            std::env::var_os("SystemRoot").expect("SystemRoot should be set on Windows");
        let kernel32_path = PathBuf::from(system_root)
            .join("SysWOW64")
            .join("kernel32.dll");
        let bytes = fs::read(&kernel32_path)
            .unwrap_or_else(|err| panic!("failed to read {}: {err}", kernel32_path.display()));
        let pe = PeFile::from_bytes(&bytes).expect("kernel32.dll should be a valid PE");
        let image_base = 0x5000_0000usize;

        let exports = collect_exports_map(pe, image_base).expect("export map should build");
        let expected_rva = match pe
            .exports()
            .expect("kernel32 exports")
            .by()
            .expect("kernel32 export name table")
            .name("GetProcAddress")
            .expect("GetProcAddress export")
        {
            Export::Symbol(rva) => *rva as usize,
            other => panic!("unexpected export type: {other:?}"),
        };

        assert_eq!(
            exports.get("GetProcAddress"),
            Some(&(image_base + expected_rva))
        );
    }
}
