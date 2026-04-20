use crate::error::ScryError;
use crate::handle::OwnedProcessHandle;
use crate::memory::ProcessMemory;
use crate::mono::class::{read_mono_class, MonoClassRef};
use crate::mono::object::MonoObject;
use crate::process::{enumerate_modules_32bit, find_pid, ModuleInfo};
use crate::reflection::field_paths;
use crate::remote_ptr::RemotePtr;
use pelite::pe32::{Pe, PeView};
use std::collections::HashMap;
use std::sync::Mutex;

const HEARTHSTONE_EXE: &str = "Hearthstone.exe";
const PREFERRED_MONO: &str = "mono-2.0-bdwgc.dll";
const FALLBACK_PREFIXES: &[&str] = &["mono-2.0-sgen", "mono-2.0-boehm", "mono-"];

pub struct MonoRuntime {
    pub memory: ProcessMemory,
    pub mono_module: ModuleInfo,
    pub mono_get_root_domain_va: RemotePtr,
    pub global_root_domain_addr: RemotePtr,
    pub root_domain: RemotePtr,
    /// Lazily populated caches (interior mutability via Mutex)
    cache: Mutex<RuntimeCache>,
}

#[derive(Default)]
struct RuntimeCache {
    offsets: Option<MonoOffsets>,
    ac_image: Option<RemotePtr>,
    class_def_table_offset: Option<u32>,
    classes: HashMap<String, MonoClassRef>,
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
        let func_va = find_mono_get_root_domain_va(&memory, &mono_module)?;
        let global_addr = extract_global_root_domain_addr(&memory, func_va)?;
        let root_domain = memory.read_remote_ptr(global_addr)?;

        if root_domain.is_null() {
            return Err(ScryError::MonoNotInitialized);
        }

        Ok(Self {
            memory,
            mono_module,
            mono_get_root_domain_va: func_va,
            global_root_domain_addr: global_addr,
            root_domain,
            cache: Mutex::new(RuntimeCache::default()),
        })
    }
}

fn find_mono_module(handle: &OwnedProcessHandle) -> Result<ModuleInfo, ScryError> {
    let modules = enumerate_modules_32bit(handle)?;
    if modules.is_empty() {
        return Err(ScryError::ModuleNotFound("LIST_MODULES_32BIT empty".into()));
    }

    // 1. Exact match on preferred mono dll
    if let Some(m) = modules.iter().find(|m| m.name.eq_ignore_ascii_case(PREFERRED_MONO)) {
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

fn find_mono_get_root_domain_va(
    memory: &ProcessMemory,
    mono: &ModuleInfo,
) -> Result<RemotePtr, ScryError> {
    let base_addr = mono.base.0 as u32;
    // Read enough of the PE to satisfy pelite (header + tables, ~64 KB is generous).
    let pe_size = mono.size.min(0x100_000) as usize;
    let pe_bytes = memory.read_bytes(RemotePtr::new(base_addr), pe_size)?;

    // Safety: pe_bytes is our local copy of the module's mapped-image layout.
    // PeView::module expects the in-memory mapped PE format, which is what we have.
    let pe = unsafe { PeView::module(pe_bytes.as_ptr()) };

    let exports = pe
        .exports()
        .map_err(|e| ScryError::MetadataError(format!("no exports: {}", e)))?;
    let by = exports.by()
        .map_err(|e| ScryError::MetadataError(format!("by name table failed: {}", e)))?;
    let func = by
        .name("mono_get_root_domain")
        .map_err(|_| ScryError::ClassNotFound { name: "mono_get_root_domain export".into() })?;
    let rva = match func {
        pelite::pe32::exports::Export::Symbol(rva) => *rva,
        _ => return Err(ScryError::Unsupported("forwarded export".into())),
    };
    Ok(RemotePtr::new(base_addr + rva))
}

fn extract_global_root_domain_addr(
    memory: &ProcessMemory,
    func_va: RemotePtr,
) -> Result<RemotePtr, ScryError> {
    let bytes = memory.read_bytes(func_va, 16)?;
    // Pattern A: A1 [4 bytes addr] C3
    if bytes.len() >= 6 && bytes[0] == 0xA1 && bytes[5] == 0xC3 {
        let addr = u32::from_le_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]);
        return Ok(RemotePtr::new(addr));
    }
    // Pattern B: 55 89 E5 A1 [4 bytes] 5D C3
    if bytes.len() >= 9
        && bytes[0..3] == [0x55, 0x89, 0xE5]
        && bytes[3] == 0xA1
        && bytes[8] == 0xC3
    {
        let addr = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        return Ok(RemotePtr::new(addr));
    }
    Err(ScryError::DisasmPatternUnknown { bytes })
}

use crate::mono::probe::{looks_like_cstring, probe_field_offset};

#[derive(Debug, Clone, Default)]
pub struct MonoOffsets {
    /// Offset within MonoDomain to the loaded_images MonoGList*
    pub domain_loaded_images: u32,
}

impl MonoRuntime {
    /// Discover field offsets for the current Hearthstone build.
    /// Returns a populated MonoOffsets. Cache the result; re-probe only when
    /// mono_module.base changes (i.e., process restarted).
    pub fn discover_offsets(&self) -> Result<MonoOffsets, ScryError> {
        let memory = &self.memory;
        let domain = self.root_domain;

        let domain_loaded_images = probe_field_offset(memory, domain, |slot| {
            // slot = candidate GList*. Read its `data` (offset 0) — should be a MonoImage*.
            let data_ptr = match memory.read_remote_ptr(slot) {
                Ok(p) => p,
                Err(_) => return false,
            };
            if data_ptr.is_null() {
                return false;
            }
            // MonoImage layout (Unity Mono 2021): name @ +0x10. Check it points
            // to a printable cstring of length >= 4.
            let name_ptr = match memory.read_remote_ptr(data_ptr + 0x10) {
                Ok(p) => p,
                Err(_) => return false,
            };
            if name_ptr.is_null() {
                return false;
            }
            looks_like_cstring(memory, name_ptr, 4)
        })?;

        Ok(MonoOffsets { domain_loaded_images })
    }
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
            return Err(ScryError::MetadataError("GetModuleFileNameExW failed".into()));
        }
        let mono_path = String::from_utf16_lossy(&name_buf[..len as usize]);
        let mono_dir = PathBuf::from(&mono_path)
            .parent()
            .ok_or_else(|| ScryError::MetadataError(format!("no parent dir for {}", mono_path)))?
            .to_path_buf();

        let candidates = [
            mono_dir.join("Assembly-CSharp.dll"),
            mono_dir.join("..").join("Managed").join("Assembly-CSharp.dll"),
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

use crate::collections::glist;

impl MonoRuntime {
    /// Find a class by namespace + name in the running Hearthstone process.
    ///
    /// Walks MonoDomain.loaded_images → Assembly-CSharp MonoImage → class_def_table
    /// → MonoClass, then enumerates fields to build a `MonoClassRef`.
    /// Results are cached per class name for the lifetime of this runtime.
    pub fn find_class(&self, namespace: &str, name: &str) -> Result<MonoClassRef, ScryError> {
        let cache_key = if namespace.is_empty() {
            name.to_string()
        } else {
            format!("{}.{}", namespace, name)
        };

        // Check cache
        {
            if let Ok(cache) = self.cache.lock() {
                if let Some(class) = cache.classes.get(&cache_key) {
                    return Ok(class.clone());
                }
            }
        }

        // 1. Find Assembly-CSharp MonoImage*
        let image = self.find_ac_image_cached()?;

        // 2. Get TypeDef token from disk metadata
        let metadata = self.open_assembly_csharp()?;
        let token = metadata
            .find_class_token(namespace, name)
            .map_err(|_| ScryError::ClassNotFound {
                name: cache_key.clone(),
            })?;
        let rid = (token & 0x00FF_FFFF) as usize;
        if rid == 0 {
            return Err(ScryError::ClassNotFound {
                name: cache_key.clone(),
            });
        }

        // 3. Probe for class_def_table offset in MonoImage (cached)
        let cdt_offset = self.find_class_def_table_offset_cached(image)?;

        // 4. Read table base pointer, then index by RID-1
        let table_base = self.memory.read_remote_ptr(image + cdt_offset)?;
        if table_base.is_null() {
            return Err(ScryError::ClassNotFound { name: cache_key });
        }
        let class_ptr =
            self.memory
                .read_remote_ptr(table_base + ((rid - 1) * 4) as u32)?;
        if class_ptr.is_null() {
            return Err(ScryError::ClassNotFound { name: cache_key });
        }

        // 5. Build MonoClassRef from the live MonoClass* structure
        let class_ref = read_mono_class(&self.memory, class_ptr)?;

        // Cache the result
        if let Ok(mut cache) = self.cache.lock() {
            cache.classes.insert(cache_key, class_ref.clone());
        }

        Ok(class_ref)
    }

    /// Get a singleton object via `ClassName.s_instance`.
    ///
    /// Returns `Ok(None)` if the class isn't loaded, s_instance field doesn't
    /// exist, or the instance pointer is null (game not in the right state).
    pub fn get_singleton(
        &self,
        namespace: &str,
        name: &str,
    ) -> Result<Option<MonoObject>, ScryError> {
        let class = match self.find_class(namespace, name) {
            Ok(c) => c,
            Err(ScryError::ClassNotFound { .. }) => return Ok(None),
            Err(e) => return Err(e),
        };

        let Some(&offset) = class.fields.get(field_paths::FLD_S_INSTANCE) else {
            return Ok(None);
        };

        if class.static_field_data.is_null() {
            return Ok(None);
        }

        let instance = self
            .memory
            .read_remote_ptr(class.static_field_data + offset)?;
        if instance.is_null() {
            return Ok(None);
        }

        Ok(Some(MonoObject::new(instance, &class)))
    }

    /// Find the Assembly-CSharp MonoImage* pointer, caching the result.
    fn find_ac_image_cached(&self) -> Result<RemotePtr, ScryError> {
        if let Ok(cache) = self.cache.lock() {
            if let Some(image) = cache.ac_image {
                return Ok(image);
            }
        }

        let offsets = self.discover_offsets_cached()?;
        let images_head = self
            .memory
            .read_remote_ptr(self.root_domain + offsets.domain_loaded_images)?;
        let image_ptrs = glist::iter(&self.memory, images_head, 500)?;

        for image_ptr in image_ptrs {
            if image_ptr.is_null() {
                continue;
            }
            let name_ptr = self
                .memory
                .read_remote_ptr(image_ptr + field_paths::MONO_IMAGE_NAME)?;
            if name_ptr.is_null() {
                continue;
            }
            let name = self.memory.read_cstring(name_ptr, 128)?;
            if name.contains("Assembly-CSharp") {
                if let Ok(mut cache) = self.cache.lock() {
                    cache.ac_image = Some(image_ptr);
                }
                return Ok(image_ptr);
            }
        }

        Err(ScryError::MetadataError(
            "Assembly-CSharp image not found in loaded_images".into(),
        ))
    }

    /// Probe for the class_def_table offset within MonoImage, caching the result.
    fn find_class_def_table_offset_cached(
        &self,
        image: RemotePtr,
    ) -> Result<u32, ScryError> {
        if let Ok(cache) = self.cache.lock() {
            if let Some(offset) = cache.class_def_table_offset {
                return Ok(offset);
            }
        }

        let offset = self.probe_class_def_table_offset(image)?;

        if let Ok(mut cache) = self.cache.lock() {
            cache.class_def_table_offset = Some(offset);
        }
        Ok(offset)
    }

    /// Discover and cache MonoOffsets.
    fn discover_offsets_cached(&self) -> Result<MonoOffsets, ScryError> {
        if let Ok(cache) = self.cache.lock() {
            if let Some(ref offsets) = cache.offsets {
                return Ok(offsets.clone());
            }
        }

        let offsets = self.discover_offsets()?;

        if let Ok(mut cache) = self.cache.lock() {
            cache.offsets = Some(offsets.clone());
        }
        Ok(offsets)
    }

    /// Probe MonoImage structure to find the offset of the class_def_table pointer.
    ///
    /// Strategy: use a known class (from disk metadata) as a fingerprint.
    /// For each candidate offset in MonoImage, treat the u32 there as a pointer
    /// to an array of MonoClass* pointers, index by (RID-1), and validate by
    /// reading MonoClass.name.
    fn probe_class_def_table_offset(&self, image: RemotePtr) -> Result<u32, ScryError> {
        let metadata = self.open_assembly_csharp()?;

        // Pick a well-known probe class
        let (probe_name, probe_token) = [
            ("GameState", ("", "GameState")),
            ("Entity", ("", "Entity")),
            ("GameMgr", ("", "GameMgr")),
        ]
        .iter()
        .find_map(|(expected_name, (ns, cls))| {
            metadata
                .find_class_token(ns, cls)
                .ok()
                .map(|t| (*expected_name, t))
        })
        .ok_or_else(|| {
            ScryError::MetadataError("no probe class found in Assembly-CSharp metadata".into())
        })?;

        let probe_rid = (probe_token & 0x00FF_FFFF) as usize;
        if probe_rid == 0 {
            return Err(ScryError::MetadataError("probe class RID is 0".into()));
        }

        // Read a large chunk of the MonoImage structure
        let scan_size = 0x200usize;
        let image_bytes = self.memory.read_bytes(image, scan_size)?;

        for offset in (0..scan_size).step_by(4) {
            let candidate = u32::from_le_bytes([
                image_bytes[offset],
                image_bytes[offset + 1],
                image_bytes[offset + 2],
                image_bytes[offset + 3],
            ]);

            // Filter out obviously invalid pointers
            if candidate == 0 || !(0x10000..=0xFFFF_0000).contains(&candidate) {
                continue;
            }

            // Try to read candidate[probe_rid - 1] as a MonoClass*
            let class_ptr_addr = RemotePtr::new(candidate) + ((probe_rid - 1) * 4) as u32;
            let class_ptr = match self.memory.read_remote_ptr(class_ptr_addr) {
                Ok(p) => p,
                Err(_) => continue,
            };

            if class_ptr.is_null() || class_ptr.raw() < 0x10000 {
                continue;
            }

            // Validate: MonoClass.name should match our probe class
            let name_ptr = match self
                .memory
                .read_remote_ptr(class_ptr + field_paths::MONO_CLASS_NAME)
            {
                Ok(p) => p,
                Err(_) => continue,
            };
            if name_ptr.is_null() {
                continue;
            }
            let name = match self.memory.read_cstring(name_ptr, 128) {
                Ok(s) => s,
                Err(_) => continue,
            };
            if name == probe_name {
                return Ok(offset as u32);
            }
        }

        Err(ScryError::MetadataError(
            "class_def_table offset not found by probing MonoImage".into(),
        ))
    }
}

#[cfg(all(test, feature = "integration"))]
mod integration_tests {
    use super::*;

    fn hearthstone_is_running() -> bool {
        crate::process::find_pid("Hearthstone.exe")
            .ok()
            .flatten()
            .is_some()
    }

    macro_rules! skip_if_no_hs {
        () => {
            if !hearthstone_is_running() {
                eprintln!("SKIP: no Hearthstone process found");
                return;
            }
        };
    }

    #[test]
    fn locate_mono_runtime_in_hearthstone() {
        skip_if_no_hs!();
        let runtime = MonoRuntime::init().expect("Hearthstone must be running on main menu");
        assert!(runtime.mono_module.name.to_lowercase().contains("mono"));
        assert!(!runtime.root_domain.is_null());
        eprintln!("locate OK: {:?}", runtime.mono_module.name);
        eprintln!("root_domain = {}", runtime.root_domain);
    }

    #[test]
    fn discover_domain_offsets() {
        skip_if_no_hs!();
        let runtime = MonoRuntime::init().expect("Hearthstone must be running");
        let offsets = runtime.discover_offsets().expect("offset discovery failed");
        eprintln!("MonoDomain.loaded_images @ +0x{:02X}", offsets.domain_loaded_images);
        assert!(offsets.domain_loaded_images >= 0x10 && offsets.domain_loaded_images <= 0x40,
            "loaded_images offset 0x{:02X} is wildly outside expected range",
            offsets.domain_loaded_images);
    }

    #[test]
    fn open_assembly_csharp_finds_file() {
        skip_if_no_hs!();
        let runtime = MonoRuntime::init().expect("Hearthstone must be running");
        let reader = runtime.open_assembly_csharp().expect("Assembly-CSharp.dll not found");
        let bytes = reader.bytes();
        assert!(bytes.len() > 0, "empty file");
        let token = reader.find_class_token("", "Entity")
            .or_else(|_| reader.find_class_token("Blizzard.T5.Services", "Entity"))
            .expect("Entity class must exist in Assembly-CSharp.dll");
        eprintln!("Entity token = 0x{:08X}", token);
        assert_eq!(token >> 24, 0x02, "TypeDef token must have table 0x02");
    }
}
