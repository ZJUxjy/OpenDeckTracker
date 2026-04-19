use crate::disasm;
use crate::error::ScryError;
use crate::handle::OwnedProcessHandle;
use crate::memory::ProcessMemory;
use crate::process::{enumerate_modules_32bit, find_pid, ModuleInfo};
use crate::remote_ptr::RemotePtr;
use pelite::pe32::{Pe, PeView};

const HEARTHSTONE_EXE: &str = "Hearthstone.exe";
const PREFERRED_MONO: &str = "mono-2.0-bdwgc.dll";
const FALLBACK_PREFIXES: &[&str] = &["mono-2.0-sgen", "mono-2.0-boehm", "mono-"];

pub struct MonoRuntime {
    pub memory: ProcessMemory,
    pub mono_module: ModuleInfo,
    pub mono_get_root_domain_va: RemotePtr,
    pub global_root_domain_addr: RemotePtr,
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
    let by = exports
        .by()
        .map_err(|e| ScryError::MetadataError(format!("by name table failed: {}", e)))?;
    let func = by
        .name("mono_get_root_domain")
        .map_err(|_| missing_export_error("mono_get_root_domain"))?;
    let rva = match func {
        pelite::pe32::exports::Export::Symbol(rva) => *rva,
        _ => return Err(ScryError::Unsupported("forwarded export".into())),
    };
    Ok(RemotePtr::new(base_addr + rva))
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

fn extract_global_root_domain_addr_from_code(code: &[u8]) -> Result<RemotePtr, ScryError> {
    let addr = disasm::find_first_absolute_load(code, 32)?;
    let addr = u32::try_from(addr).map_err(|_| {
        ScryError::DisasmError(format!(
            "absolute load address out of 32-bit range: 0x{addr:X}"
        ))
    })?;
    Ok(RemotePtr::new(addr))
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

        Ok(MonoOffsets {
            domain_loaded_images,
        })
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
        assert!(!runtime.root_domain.is_null());
        eprintln!("locate OK: {:?}", runtime.mono_module.name);
        eprintln!("root_domain = {}", runtime.root_domain);
    }

    #[test]
    fn discover_domain_offsets() {
        let runtime = MonoRuntime::init().expect("Hearthstone must be running");
        let offsets = runtime.discover_offsets().expect("offset discovery failed");
        eprintln!(
            "MonoDomain.loaded_images @ +0x{:02X}",
            offsets.domain_loaded_images
        );
        // §7.2 says +0x14; spike 02 confirmed.
        // We tolerate ±0x10 because newer Mono builds may shift fields.
        assert!(
            offsets.domain_loaded_images >= 0x10 && offsets.domain_loaded_images <= 0x40,
            "loaded_images offset 0x{:02X} is wildly outside expected range",
            offsets.domain_loaded_images
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
}
