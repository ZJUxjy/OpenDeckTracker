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

    let pe = PeView::from_bytes(&pe_bytes)
        .map_err(|e| ScryError::MetadataError(format!("pelite parse failed: {}", e)))?;

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
        eprintln!("MonoDomain.loaded_images @ +0x{:02X}", offsets.domain_loaded_images);
        // §7.2 says +0x14; spike 02 confirmed.
        // We tolerate ±0x10 because newer Mono builds may shift fields.
        assert!(offsets.domain_loaded_images >= 0x10 && offsets.domain_loaded_images <= 0x40,
            "loaded_images offset 0x{:02X} is wildly outside expected range",
            offsets.domain_loaded_images);
    }
}
