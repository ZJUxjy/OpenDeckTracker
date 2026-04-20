use crate::disasm;
use crate::error::ScryError;
use crate::handle::OwnedProcessHandle;
use crate::memory::ProcessMemory;
use crate::mono::offsets::{read_exports_map, MonoOffsets, OffsetProber};
use crate::mono::probe::MAX_PROBE_SLOTS;
use crate::process::{enumerate_modules_32bit, find_pid, ModuleInfo};
use crate::remote_ptr::RemotePtr;
use std::collections::HashMap;

const HEARTHSTONE_EXE: &str = "Hearthstone.exe";
const PREFERRED_MONO: &str = "mono-2.0-bdwgc.dll";
const FALLBACK_PREFIXES: &[&str] = &["mono-2.0-sgen", "mono-2.0-boehm", "mono-"];
const MAX_DOMAIN_ASSEMBLIES: usize = 4096;

pub struct MonoRuntime {
    pub memory: ProcessMemory,
    pub mono_module: ModuleInfo,
    pub offsets: MonoOffsets,
    pub exports: HashMap<String, usize>,
    pub root_domain: RemotePtr,
}

impl MonoRuntime {
    /// Locate Hearthstone, find mono dll, resolve mono_get_root_domain,
    /// extract the global root_domain pointer.
    pub fn init() -> Result<Self, ScryError> {
        let pid = find_pid(HEARTHSTONE_EXE)?
            .ok_or_else(|| ScryError::ProcessNotFound(HEARTHSTONE_EXE.into()))?;
        let handle = OwnedProcessHandle::open(pid)?;
        let memory = ProcessMemory::new(handle);

        let mono_module = find_mono_module(memory.handle())?;
        let exports = read_exports_map(&memory, &mono_module)?;
        let defaults = MonoOffsets::bundled_unity_2021_3()?;
        let offsets =
            OffsetProber::new(&memory, &mono_module, 32).probe_all(&exports, &defaults)?;
        let root_domain = resolve_root_domain(&memory, &exports)?;

        Ok(Self {
            memory,
            mono_module,
            offsets,
            exports,
            root_domain,
        })
    }
}

fn find_mono_module(handle: &OwnedProcessHandle) -> Result<ModuleInfo, ScryError> {
    let modules = enumerate_modules_32bit(handle)?;
    if modules.is_empty() {
        return Err(ScryError::ModuleNotFound("LIST_MODULES_32BIT empty".into()));
    }

    // 1. Exact match on preferred mono dll
    if let Some(m) = modules
        .iter()
        .find(|m| m.name.eq_ignore_ascii_case(PREFERRED_MONO))
    {
        return Ok(m.clone());
    }

    // 2. Fallback prefixes in order
    for prefix in FALLBACK_PREFIXES {
        if let Some(m) = modules
            .iter()
            .find(|m| m.name.to_lowercase().starts_with(*prefix))
        {
            return Ok(m.clone());
        }
    }

    Err(ScryError::ModuleNotFound(format!(
        "no mono runtime found (preferred: {})",
        PREFERRED_MONO
    )))
}

fn find_export_va(
    exports: &HashMap<String, usize>,
    export_name: &str,
) -> Result<RemotePtr, ScryError> {
    let addr = *exports
        .get(export_name)
        .ok_or_else(|| missing_export_error(export_name))?;
    let addr = u32::try_from(addr)
        .map_err(|_| ScryError::Unsupported(format!("export out of 32-bit range: 0x{addr:X}")))?;
    Ok(RemotePtr::new(addr))
}

fn missing_export_error(export_name: &str) -> ScryError {
    ScryError::MetadataError(format!("required export not found: {export_name}"))
}

fn extract_global_root_domain_addr(
    memory: &ProcessMemory,
    func_va: RemotePtr,
) -> Result<RemotePtr, ScryError> {
    let bytes = memory.read_bytes(func_va, disasm::DEFAULT_PROBE_WINDOW)?;
    extract_global_root_domain_addr_from_code(&bytes)
}

fn resolve_root_domain(
    memory: &ProcessMemory,
    exports: &HashMap<String, usize>,
) -> Result<RemotePtr, ScryError> {
    let func_va = find_export_va(exports, "mono_get_root_domain")?;
    let global_addr = extract_global_root_domain_addr(memory, func_va)?;
    let root_domain = memory.read_remote_ptr(global_addr)?;
    if root_domain.is_null() {
        return Err(ScryError::MonoNotInitialized);
    }
    Ok(root_domain)
}

fn extract_global_root_domain_addr_from_code(code: &[u8]) -> Result<RemotePtr, ScryError> {
    let addr = disasm::find_first_absolute_load(code, 32)?;
    let addr = u32::try_from(addr).map_err(|_| {
        ScryError::DisasmError(format!(
            "absolute load address out of 32-bit range: 0x{addr:X}"
        ))
    })?;
    Ok(RemotePtr::new(addr))
}

impl MonoRuntime {
    pub fn probe_json_offsets(&self) -> Result<MonoOffsets, ScryError> {
        let defaults = MonoOffsets::bundled_unity_2021_3()?;
        OffsetProber::new(&self.memory, &self.mono_module, 32).probe_all(&self.exports, &defaults)
    }

    pub fn discover_offsets(&self) -> Result<MonoOffsets, ScryError> {
        let mut offsets = self.probe_json_offsets()?;
        offsets.structs.domain.domain_assemblies = discover_domain_assemblies_offset_with(
            self.root_domain,
            &offsets,
            |addr| self.memory.read_remote_ptr(addr),
            |addr| self.memory.read_cstring(addr, 256),
        )? as usize;
        Ok(offsets)
    }

    pub fn enumerate_assembly_image_addrs(&self) -> Result<Vec<RemotePtr>, ScryError> {
        enumerate_assembly_image_addrs_with(self.root_domain, &self.offsets, |addr| {
            self.memory.read_remote_ptr(addr)
        })
    }

    pub fn find_image(&self, name: &str) -> Result<RemotePtr, ScryError> {
        let images = self.enumerate_assembly_image_addrs()?;
        find_image_with(
            &images,
            &self.offsets,
            |addr| self.memory.read_remote_ptr(addr),
            |addr| self.memory.read_cstring(addr, 256),
            name,
        )
    }
}

fn enumerate_assembly_image_addrs_with(
    root_domain: RemotePtr,
    offsets: &MonoOffsets,
    mut read_remote_ptr: impl FnMut(RemotePtr) -> Result<RemotePtr, ScryError>,
) -> Result<Vec<RemotePtr>, ScryError> {
    let mut node = read_remote_ptr(add_offset(
        root_domain,
        offsets.structs.domain.domain_assemblies,
    )?)?;
    let mut images = Vec::new();
    let next_offset = u32::try_from(offsets.ptr_size).map_err(|_| {
        ScryError::Unsupported(format!("ptr_size out of range: {}", offsets.ptr_size))
    })?;

    for _ in 0..MAX_DOMAIN_ASSEMBLIES {
        if node.is_null() {
            return Ok(images);
        }

        let assembly = read_remote_ptr(node)?;
        let next = read_remote_ptr(node + next_offset)?;
        if !assembly.is_null() {
            let image = read_remote_ptr(add_offset(assembly, offsets.structs.assembly.image)?)?;
            if !image.is_null() {
                images.push(image);
            }
        }
        node = next;
    }

    if node.is_null() {
        Ok(images)
    } else {
        Err(ScryError::CollectionOverflow {
            max: MAX_DOMAIN_ASSEMBLIES,
        })
    }
}

fn find_image_with(
    images: &[RemotePtr],
    offsets: &MonoOffsets,
    mut read_remote_ptr: impl FnMut(RemotePtr) -> Result<RemotePtr, ScryError>,
    mut read_cstring: impl FnMut(RemotePtr) -> Result<String, ScryError>,
    name: &str,
) -> Result<RemotePtr, ScryError> {
    for &image in images {
        let name_ptr = read_remote_ptr(add_offset(image, offsets.structs.image.name)?)?;
        if name_ptr.is_null() {
            continue;
        }

        let image_name = read_cstring(name_ptr)?;
        if image_name.eq_ignore_ascii_case(name) {
            return Ok(image);
        }
    }

    Err(ScryError::ImageNotFound { name: name.into() })
}

pub(crate) fn add_offset(base: RemotePtr, offset: usize) -> Result<RemotePtr, ScryError> {
    let offset = u32::try_from(offset)
        .map_err(|_| ScryError::Unsupported(format!("offset out of 32-bit range: 0x{offset:X}")))?;
    Ok(base + offset)
}

fn discover_domain_assemblies_offset_with(
    root_domain: RemotePtr,
    offsets: &MonoOffsets,
    mut read_remote_ptr: impl FnMut(RemotePtr) -> Result<RemotePtr, ScryError>,
    mut read_cstring: impl FnMut(RemotePtr) -> Result<String, ScryError>,
) -> Result<u32, ScryError> {
    for slot_index in 0..MAX_PROBE_SLOTS {
        let slot_addr = root_domain + slot_index * 4;
        let list_head = match read_remote_ptr(slot_addr) {
            Ok(ptr) => ptr,
            Err(_) => continue,
        };
        if list_head.is_null() {
            continue;
        }

        let assembly = match read_remote_ptr(list_head) {
            Ok(ptr) => ptr,
            Err(_) => continue,
        };
        if assembly.is_null() {
            continue;
        }

        let image = match read_remote_ptr(add_offset(assembly, offsets.structs.assembly.image)?) {
            Ok(ptr) => ptr,
            Err(_) => continue,
        };
        if image.is_null() {
            continue;
        }

        let name_ptr = match read_remote_ptr(add_offset(image, offsets.structs.image.name)?) {
            Ok(ptr) => ptr,
            Err(_) => continue,
        };
        if name_ptr.is_null() {
            continue;
        }

        let image_name = match read_cstring(name_ptr) {
            Ok(name) => name,
            Err(_) => continue,
        };
        if looks_like_image_name(&image_name) {
            return Ok(slot_index * 4);
        }
    }

    Err(ScryError::FieldNotFound {
        class: "MonoDomain".into(),
        field: "domain_assemblies".into(),
    })
}

fn looks_like_image_name(name: &str) -> bool {
    name.len() >= 4 && name.bytes().all(|byte| (0x20..=0x7E).contains(&byte))
}

use crate::metadata::MetadataReader;
use std::path::PathBuf;

impl MonoRuntime {
    /// Open the disk file `Assembly-CSharp.dll` next to mono dll.
    pub fn open_assembly_csharp(&self) -> Result<MetadataReader, ScryError> {
        use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
        let mut name_buf = [0u16; 1024];
        let len = unsafe {
            GetModuleFileNameExW(
                self.memory.handle().raw(),
                self.mono_module.base,
                &mut name_buf,
            )
        };
        if len == 0 {
            return Err(ScryError::MetadataError(
                "GetModuleFileNameExW failed".into(),
            ));
        }
        let mono_path = String::from_utf16_lossy(&name_buf[..len as usize]);
        let mono_dir = PathBuf::from(&mono_path)
            .parent()
            .ok_or_else(|| ScryError::MetadataError(format!("no parent dir for {}", mono_path)))?
            .to_path_buf();

        let candidates = [
            mono_dir.join("Assembly-CSharp.dll"),
            mono_dir
                .join("..")
                .join("Managed")
                .join("Assembly-CSharp.dll"),
            mono_dir
                .join("..")
                .join("..")
                .join("Hearthstone_Data")
                .join("Managed")
                .join("Assembly-CSharp.dll"),
        ];
        for c in &candidates {
            if c.exists() {
                return MetadataReader::from_disk(c);
            }
        }
        Err(ScryError::MetadataError(format!(
            "Assembly-CSharp.dll not found. Tried: {:?}",
            candidates
        )))
    }
}

#[cfg(all(test, feature = "integration"))]
mod integration_tests {
    use super::*;

    #[test]
    fn locate_mono_runtime_in_hearthstone() {
        let runtime = MonoRuntime::init().expect("Hearthstone must be running on main menu");
        assert!(runtime.mono_module.name.to_lowercase().contains("mono"));
        assert!(runtime.exports.contains_key("mono_get_root_domain"));
        assert_eq!(runtime.offsets.ptr_size, 4);
        assert!(!runtime.root_domain.is_null());
        eprintln!("locate OK: {:?}", runtime.mono_module.name);
        eprintln!("root_domain = {}", runtime.root_domain);
    }

    #[test]
    fn discover_domain_offsets() {
        let runtime = MonoRuntime::init().expect("Hearthstone must be running");
        let offsets = runtime.discover_offsets().expect("offset discovery failed");
        eprintln!(
            "MonoDomain.domain_assemblies @ +0x{:02X}",
            offsets.structs.domain.domain_assemblies
        );
        assert!(
            offsets.structs.domain.domain_assemblies >= 0x40
                && offsets.structs.domain.domain_assemblies <= 0x80,
            "domain_assemblies offset 0x{:02X} is wildly outside expected range",
            offsets.structs.domain.domain_assemblies
        );
    }

    #[test]
    fn open_assembly_csharp_finds_file() {
        let runtime = MonoRuntime::init().expect("Hearthstone must be running");
        let reader = runtime
            .open_assembly_csharp()
            .expect("Assembly-CSharp.dll not found");
        let bytes = reader.bytes();
        assert!(bytes.len() > 0, "empty file");
        // token for Entity class is always present in HS builds
        let token = reader
            .find_class_token("", "Entity")
            .or_else(|_| reader.find_class_token("Blizzard.T5.Services", "Entity"))
            .expect("Entity class must exist in Assembly-CSharp.dll");
        eprintln!("Entity token = 0x{:08X}", token);
        assert_eq!(token >> 24, 0x02, "TypeDef token must have table 0x02");
    }
}

#[cfg(test)]
mod unit_tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn extracts_root_domain_addr_from_absolute_load() {
        let code = [0xA1, 0x78, 0x56, 0x34, 0x12, 0xC3];
        let addr = extract_global_root_domain_addr_from_code(&code).unwrap();
        assert_eq!(addr, RemotePtr::new(0x1234_5678));
    }

    #[test]
    fn extracts_root_domain_addr_from_prologued_absolute_load() {
        let code = [0x55, 0x89, 0xE5, 0xA1, 0x78, 0x56, 0x34, 0x12, 0x5D, 0xC3];
        let addr = extract_global_root_domain_addr_from_code(&code).unwrap();
        assert_eq!(addr, RemotePtr::new(0x1234_5678));
    }

    #[test]
    fn returns_disasm_error_when_absolute_load_missing() {
        let code = [0x8B, 0x41, 0x2C, 0xC3];
        let err = extract_global_root_domain_addr_from_code(&code).unwrap_err();
        assert!(matches!(err, ScryError::DisasmError(_)));
    }

    #[test]
    fn missing_root_domain_export_reports_metadata_error() {
        let err = missing_export_error("mono_get_root_domain");
        assert!(matches!(
            err,
            ScryError::MetadataError(msg) if msg == "required export not found: mono_get_root_domain"
        ));
    }

    #[test]
    fn missing_root_domain_export_from_map_reports_metadata_error() {
        let err = find_export_va(&HashMap::new(), "mono_get_root_domain").unwrap_err();

        assert!(matches!(
            err,
            ScryError::MetadataError(msg) if msg == "required export not found: mono_get_root_domain"
        ));
    }

    #[test]
    fn enumerate_assembly_image_addrs_walks_domain_assemblies() {
        let offsets = crate::mono::offsets::MonoOffsets::bundled_unity_2021_3().unwrap();
        let root_domain = RemotePtr::new(0x1000);
        let first_node = RemotePtr::new(0x2000);
        let second_node = RemotePtr::new(0x2010);
        let first_assembly = RemotePtr::new(0x3000);
        let second_assembly = RemotePtr::new(0x4000);
        let first_image = RemotePtr::new(0x5000);
        let second_image = RemotePtr::new(0x6000);

        let mut ptrs = HashMap::new();
        ptrs.insert(
            root_domain + offsets.structs.domain.domain_assemblies as u32,
            first_node,
        );
        ptrs.insert(first_node, first_assembly);
        ptrs.insert(first_node + offsets.ptr_size as u32, second_node);
        ptrs.insert(
            first_assembly + offsets.structs.assembly.image as u32,
            first_image,
        );
        ptrs.insert(second_node, second_assembly);
        ptrs.insert(second_node + offsets.ptr_size as u32, RemotePtr::NULL);
        ptrs.insert(
            second_assembly + offsets.structs.assembly.image as u32,
            second_image,
        );

        let images = enumerate_assembly_image_addrs_with(root_domain, &offsets, |addr| match ptrs
            .get(&addr)
        {
            Some(ptr) => Ok(*ptr),
            None => Err(ScryError::MemoryAccess {
                addr: addr.raw(),
                reason: "missing test pointer".into(),
            }),
        })
        .unwrap();

        assert_eq!(images, vec![first_image, second_image]);
    }

    #[test]
    fn find_image_matches_name_case_insensitively() {
        let offsets = crate::mono::offsets::MonoOffsets::bundled_unity_2021_3().unwrap();
        let first_image = RemotePtr::new(0x5000);
        let second_image = RemotePtr::new(0x6000);
        let first_name = RemotePtr::new(0x7000);
        let second_name = RemotePtr::new(0x7010);

        let mut ptrs = HashMap::new();
        ptrs.insert(first_image + offsets.structs.image.name as u32, first_name);
        ptrs.insert(
            second_image + offsets.structs.image.name as u32,
            second_name,
        );

        let mut strings = HashMap::new();
        strings.insert(first_name, "mscorlib.dll".to_string());
        strings.insert(second_name, "Assembly-CSharp".to_string());

        let found = find_image_with(
            &[first_image, second_image],
            &offsets,
            |addr| match ptrs.get(&addr) {
                Some(ptr) => Ok(*ptr),
                None => Err(ScryError::MemoryAccess {
                    addr: addr.raw(),
                    reason: "missing image name pointer".into(),
                }),
            },
            |addr| match strings.get(&addr) {
                Some(name) => Ok(name.clone()),
                None => Err(ScryError::MemoryAccess {
                    addr: addr.raw(),
                    reason: "missing image name".into(),
                }),
            },
            "assembly-csharp",
        )
        .unwrap();

        assert_eq!(found, second_image);
    }

    #[test]
    fn discover_offsets_prefers_live_domain_assemblies_probe() {
        let mut offsets = crate::mono::offsets::MonoOffsets::bundled_unity_2021_3().unwrap();
        offsets.structs.domain.domain_assemblies = 0x58;

        let root_domain = RemotePtr::new(0x1000);
        let first_node = RemotePtr::new(0x2200);
        let first_assembly = RemotePtr::new(0x3000);
        let first_image = RemotePtr::new(0x5000);
        let image_name = RemotePtr::new(0x7000);

        let mut ptrs = HashMap::new();
        ptrs.insert(root_domain + 0x14, first_node);
        ptrs.insert(first_node, first_assembly);
        ptrs.insert(first_node + 4, RemotePtr::NULL);
        ptrs.insert(
            first_assembly + offsets.structs.assembly.image as u32,
            first_image,
        );
        ptrs.insert(first_image + offsets.structs.image.name as u32, image_name);

        let mut strings = HashMap::new();
        strings.insert(image_name, "Assembly-CSharp".to_string());

        let discovered = discover_domain_assemblies_offset_with(
            root_domain,
            &offsets,
            |addr| match ptrs.get(&addr) {
                Some(ptr) => Ok(*ptr),
                None => Err(ScryError::MemoryAccess {
                    addr: addr.raw(),
                    reason: "missing probe pointer".into(),
                }),
            },
            |addr| match strings.get(&addr) {
                Some(value) => Ok(value.clone()),
                None => Err(ScryError::MemoryAccess {
                    addr: addr.raw(),
                    reason: "missing probe string".into(),
                }),
            },
        )
        .unwrap();

        assert_eq!(discovered, 0x14);
    }

    #[test]
    fn find_image_miss_reports_image_not_found() {
        let offsets = crate::mono::offsets::MonoOffsets::bundled_unity_2021_3().unwrap();
        let err = find_image_with(
            &[],
            &offsets,
            |_| Ok(RemotePtr::NULL),
            |_| Ok(String::new()),
            "missing",
        )
        .unwrap_err();

        assert!(matches!(
            err,
            ScryError::ImageNotFound { name } if name == "missing"
        ));
    }
}
