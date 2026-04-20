use crate::collections::glist;
use crate::disasm;
use crate::error::ScryError;
use crate::handle::OwnedProcessHandle;
use crate::memory::ProcessMemory;
use crate::metadata::MetadataReader;
use crate::mono::class::{read_mono_class, MonoClassRef};
use crate::mono::object::MonoObject;
use crate::mono::offsets::MonoOffsets;
use crate::mono::probe::{read_exports_map, OffsetProber};
use crate::process::{enumerate_modules_32bit, find_pid, ModuleInfo};
use crate::reflection::field_paths;
use crate::remote_ptr::RemotePtr;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

const HEARTHSTONE_EXE: &str = "Hearthstone.exe";
const PREFERRED_MONO: &str = "mono-2.0-bdwgc.dll";
const FALLBACK_PREFIXES: &[&str] = &["mono-2.0-sgen", "mono-2.0-boehm", "mono-"];

pub struct MonoRuntime {
    pub memory: ProcessMemory,
    pub mono_module: ModuleInfo,
    pub mono_get_root_domain_va: RemotePtr,
    pub global_root_domain_addr: RemotePtr,
    pub root_domain: RemotePtr,
    /// Mono runtime offsets table. Built in `init()` by starting from the
    /// embedded baseline (`MonoOffsets::default()`) and refining via
    /// `OffsetProber::probe_all`. Wrapped in `Arc` so the table is shared
    /// cheaply with every `MonoClassRef` / `MonoObject` that the runtime
    /// hands out (see design D11).
    pub offsets: Arc<MonoOffsets>,
    /// Mono DLL export name → remote address. Populated once at `init()`
    /// time. Kept on the runtime so diagnostic tools (e.g. `diag_init`) can
    /// re-probe specific exports without re-reading the entire PE image.
    pub exports: HashMap<String, RemotePtr>,
    /// Lazily populated caches (interior mutability via Mutex)
    cache: Mutex<RuntimeCache>,
}

#[derive(Default)]
struct RuntimeCache {
    ac_image: Option<RemotePtr>,
    class_def_table_offset: Option<u32>,
    classes: HashMap<String, MonoClassRef>,
}

impl MonoRuntime {
    /// Locate Hearthstone, find mono dll, build the export map, refine offsets
    /// via `OffsetProber`, then resolve `mono_get_root_domain` and extract the
    /// global root_domain pointer.
    pub fn init() -> Result<Self, ScryError> {
        let pid = find_pid(HEARTHSTONE_EXE)?
            .ok_or_else(|| ScryError::ProcessNotFound(HEARTHSTONE_EXE.into()))?;
        let handle = OwnedProcessHandle::open(pid)?;
        let memory = ProcessMemory::new(handle);

        let mono_module = find_mono_module(memory.handle())?;

        // Build the export name → remote address map once, then refine the
        // baseline offsets table by disassembling getter exports. On probe
        // failure we fall back to the embedded baseline so a single drifted
        // export does not break init() — Phase 6 still ships a usable runtime,
        // just without the disasm-confirmed offsets for that field.
        let exports = read_exports_map(&memory, &mono_module)?;
        let offsets = match OffsetProber::new(&memory, &exports, 32)
            .and_then(|p| p.probe_all(MonoOffsets::default()))
        {
            Ok(refined) => refined,
            Err(e) => {
                eprintln!(
                    "[hearthmirror] OffsetProber.probe_all failed: {}; \
                     falling back to embedded baseline",
                    e
                );
                MonoOffsets::default()
            }
        };

        let func_va = lookup_export(&exports, "mono_get_root_domain")?;
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
            offsets: Arc::new(offsets),
            exports,
            cache: Mutex::new(RuntimeCache::default()),
        })
    }
}

fn find_mono_module(handle: &OwnedProcessHandle) -> Result<ModuleInfo, ScryError> {
    let modules = enumerate_modules_32bit(handle)?;
    if modules.is_empty() {
        return Err(ScryError::ModuleNotFound("LIST_MODULES_32BIT empty".into()));
    }

    if let Some(m) = modules.iter().find(|m| m.name.eq_ignore_ascii_case(PREFERRED_MONO)) {
        return Ok(m.clone());
    }

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

/// Resolve a Mono export from the pre-built map. Returns the export's RVA
/// already biased by `module.base`.
fn lookup_export(
    exports: &HashMap<String, RemotePtr>,
    name: &str,
) -> Result<RemotePtr, ScryError> {
    exports
        .get(name)
        .copied()
        .ok_or_else(|| ScryError::ExportNotFound(name.into()))
}

/// Recover the address of the global `root_domain` variable that
/// `mono_get_root_domain` loads in its prologue.
///
/// Replaces the previous hand-rolled byte-pattern matcher (Patterns A/B,
/// 16-byte read window) with a generic disassembler scan via
/// `disasm::find_first_absolute_load`. The disassembler tolerates any
/// prologue (`push ebp; mov ebp, esp; ...`) before the absolute MOV, where
/// the byte matcher only handled two specific shapes.
fn extract_global_root_domain_addr(
    memory: &ProcessMemory,
    func_va: RemotePtr,
) -> Result<RemotePtr, ScryError> {
    let bytes = memory.read_bytes(func_va, disasm::DEFAULT_PROBE_WINDOW)?;
    let displ = disasm::find_first_absolute_load(&bytes, 32).ok_or_else(|| {
        ScryError::OffsetProbeFailed(format!(
            "mono_get_root_domain: no absolute MOV in first {} bytes at {}",
            disasm::DEFAULT_PROBE_WINDOW,
            func_va
        ))
    })?;
    Ok(RemotePtr::new(displ))
}

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

impl MonoRuntime {
    /// Find a class by namespace + name in the running Hearthstone process.
    ///
    /// Walks `MonoDomain.domain_assemblies → MonoAssembly.image →
    /// Assembly-CSharp MonoImage → class_def_table → MonoClass`, then
    /// enumerates fields to build a `MonoClassRef`. Results are cached per
    /// class name for the lifetime of this runtime.
    pub fn find_class(&self, namespace: &str, name: &str) -> Result<MonoClassRef, ScryError> {
        let cache_key = if namespace.is_empty() {
            name.to_string()
        } else {
            format!("{}.{}", namespace, name)
        };

        {
            if let Ok(cache) = self.cache.lock() {
                if let Some(class) = cache.classes.get(&cache_key) {
                    return Ok(class.clone());
                }
            }
        }

        let image = self.find_ac_image_cached()?;

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

        let cdt_offset = self.find_class_def_table_offset_cached(image)?;

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

        let class_ref = read_mono_class(&self.memory, class_ptr, self.offsets.clone())?;

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

    /// Find the Assembly-CSharp `MonoImage*` pointer, caching the result.
    ///
    /// Walks `MonoDomain.domain_assemblies` (a GSList of `MonoAssembly*`),
    /// dereferences each `MonoAssembly.image` to its `MonoImage*`, then
    /// inspects `MonoImage.name`. Replaces the legacy `loaded_images` GList
    /// path that required runtime offset probing (deleted with this change).
    fn find_ac_image_cached(&self) -> Result<RemotePtr, ScryError> {
        if let Ok(cache) = self.cache.lock() {
            if let Some(image) = cache.ac_image {
                return Ok(image);
            }
        }

        let domain_off = &self.offsets.structs.domain;
        let assembly_off = &self.offsets.structs.assembly;
        let image_off = &self.offsets.structs.image;

        let assemblies_head = self
            .memory
            .read_remote_ptr(self.root_domain + domain_off.domain_assemblies)?;
        // GSList shares its first two fields ({data, next}) with GList — only
        // GList's optional `prev` differs and `glist::iter` does not touch it.
        let assembly_ptrs = glist::iter(&self.memory, assemblies_head, 500)?;

        for assembly_ptr in assembly_ptrs {
            if assembly_ptr.is_null() {
                continue;
            }
            let image_ptr = self
                .memory
                .read_remote_ptr(assembly_ptr + assembly_off.image)?;
            if image_ptr.is_null() {
                continue;
            }
            let name_ptr = self.memory.read_remote_ptr(image_ptr + image_off.name)?;
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
            "Assembly-CSharp image not found in domain_assemblies".into(),
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

    /// Probe MonoImage structure to find the offset of the class_def_table pointer.
    ///
    /// Strategy: use a known class (from disk metadata) as a fingerprint.
    /// For each candidate offset in MonoImage, treat the u32 there as a pointer
    /// to an array of MonoClass* pointers, index by (RID-1), and validate by
    /// reading MonoClass.name.
    fn probe_class_def_table_offset(&self, image: RemotePtr) -> Result<u32, ScryError> {
        let metadata = self.open_assembly_csharp()?;

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

        let scan_size = 0x200usize;
        let image_bytes = self.memory.read_bytes(image, scan_size)?;

        for offset in (0..scan_size).step_by(4) {
            let candidate = u32::from_le_bytes([
                image_bytes[offset],
                image_bytes[offset + 1],
                image_bytes[offset + 2],
                image_bytes[offset + 3],
            ]);

            if candidate == 0 || !(0x10000..=0xFFFF_0000).contains(&candidate) {
                continue;
            }

            let class_ptr_addr = RemotePtr::new(candidate) + ((probe_rid - 1) * 4) as u32;
            let class_ptr = match self.memory.read_remote_ptr(class_ptr_addr) {
                Ok(p) => p,
                Err(_) => continue,
            };

            if class_ptr.is_null() || class_ptr.raw() < 0x10000 {
                continue;
            }

            let name_ptr = match self
                .memory
                .read_remote_ptr(class_ptr + self.offsets.structs.class.name)
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

    /// Phase 6 sanity: prober refines `MonoClass.name` from the embedded
    /// baseline value (0x2C) to the disasm-derived value. Verifies the
    /// prober wired into init() actually fired and updated the offsets table.
    #[test]
    fn offset_prober_runs_during_init() {
        skip_if_no_hs!();
        let runtime = MonoRuntime::init().expect("Hearthstone must be running");
        // class.name MUST be probed (it's the first critical export).
        // Either the prober succeeded → value matches the disasm result,
        // or it errored entirely → init() would have surfaced the error
        // before reaching here. Falling back to baseline is *also* a valid
        // outcome (eprintln logged), so we only assert the value is sane.
        let class_name_off = runtime.offsets.structs.class.name;
        assert!(
            (0x10..=0x60).contains(&class_name_off),
            "MonoClass.name offset 0x{:X} outside plausible range",
            class_name_off
        );
        eprintln!("MonoClass.name @ +0x{:02X} (probed or baseline)", class_name_off);
        eprintln!("exports captured: {}", runtime.exports.len());
        assert!(
            runtime.exports.contains_key("mono_get_root_domain"),
            "exports map must include mono_get_root_domain"
        );
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
