//! Mono runtime offset probing via disassembly of exported Mono getter
//! functions.
//!
//! [`OffsetProber`] disassembles exported Mono getter functions (e.g.
//! `mono_class_get_name`) and recovers field displacements directly from
//! the machine code. Deterministic; resilient to MSVC/GCC bitfield padding
//! differences across Unity versions. Wired into `MonoRuntime::init`.
//!
//! [`read_exports_map`] supports the prober by exposing the Mono DLL's
//! export table as a `HashMap<String, RemotePtr>`.
//!
//! The legacy slot-scan family (`probe_field_offset` + `looks_*` helpers)
//! that previously coexisted here was deleted in
//! `add-hearthmirror-offset-probing` Phase 6 once the disasm path covered
//! all production probes.

use crate::disasm;
use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::process::ModuleInfo;
use crate::remote_ptr::RemotePtr;
use std::collections::HashMap;

use crate::mono::offsets::MonoOffsets;
use pelite::pe32::{Pe, PeView};

/// Read the Mono DLL's export table and return a name → remote address map.
///
/// Reads the entire mapped PE image (`module.size` bytes) so `pelite::PeView`
/// can resolve export name strings located anywhere in the module. Returns
/// only `Symbol` exports (forwarded exports are silently skipped — they are
/// not callable Mono entry points).
pub fn read_exports_map(
    memory: &ProcessMemory,
    module: &ModuleInfo,
) -> Result<HashMap<String, RemotePtr>, ScryError> {
    let base_addr = module.base.0 as u32;
    let pe_size = module.size as usize;
    let pe_bytes = memory.read_bytes(RemotePtr::new(base_addr), pe_size)?;

    // Safety: pe_bytes is our local copy of the module's mapped-image layout.
    // PeView::module expects the in-memory mapped PE format, which is what we
    // capture above via ReadProcessMemory on a 32-bit module.
    let pe = unsafe { PeView::module(pe_bytes.as_ptr()) };

    let exports = pe
        .exports()
        .map_err(|e| ScryError::MetadataError(format!("no exports: {}", e)))?;
    let by = exports
        .by()
        .map_err(|e| ScryError::MetadataError(format!("by name table failed: {}", e)))?;

    let mut map = HashMap::new();
    for result in by.iter_names() {
        let (name_res, export_res) = result;
        let Ok(name) = name_res else { continue };
        let Ok(export) = export_res else { continue };
        if let pelite::pe32::exports::Export::Symbol(rva) = export {
            let name_str = name.to_str().unwrap_or("").to_string();
            if !name_str.is_empty() {
                map.insert(name_str, RemotePtr::new(base_addr.wrapping_add(*rva)));
            }
        }
    }
    Ok(map)
}

/// Disasm-based offset prober for Mono internal struct layouts.
///
/// Disassembles exported Mono getter functions (e.g. `mono_class_get_name`)
/// and recovers field offsets directly from the machine code. Resilient to
/// MSVC/GCC bitfield padding drift across Unity versions.
pub struct OffsetProber<'m> {
    memory: &'m ProcessMemory,
    exports: &'m HashMap<String, RemotePtr>,
    bitness: u32,
    probe_window: usize,
}

impl<'m> OffsetProber<'m> {
    /// Construct a new prober. `bitness` MUST be 32 (Hearthstone is 32-bit).
    pub fn new(
        memory: &'m ProcessMemory,
        exports: &'m HashMap<String, RemotePtr>,
        bitness: u32,
    ) -> Result<Self, ScryError> {
        if bitness != 32 {
            return Err(ScryError::InvalidProbeBitness(bitness));
        }
        Ok(Self {
            memory,
            exports,
            bitness,
            probe_window: disasm::DEFAULT_PROBE_WINDOW,
        })
    }

    /// Disassemble a getter and return the displacement of its field load.
    fn probe_displacement(&self, export_name: &str) -> Result<u32, ScryError> {
        let addr = *self
            .exports
            .get(export_name)
            .ok_or_else(|| ScryError::ExportNotFound(export_name.into()))?;
        let code = self.memory.read_bytes(addr, self.probe_window)?;
        disasm::find_field_load_displacement(&code, self.bitness).ok_or_else(|| {
            ScryError::OffsetProbeFailed(format!(
                "{}: no field-load displacement instruction in first {} bytes",
                export_name, self.probe_window
            ))
        })
    }

    /// Refine `baseline` offsets by probing critical + best-effort exports.
    ///
    /// Critical probes (6) — failure aborts with `OffsetProbeFailed`:
    ///   `mono_class_get_name`, `_namespace`, `_fields`, `_image`,
    ///   `mono_image_get_name`, `mono_assembly_get_image`
    ///
    /// Best-effort probes (4) — failure logs to stderr and keeps the
    /// baseline value:
    ///   `mono_class_get_parent`, `mono_field_get_offset`, `_name`, `_type`
    pub fn probe_all(&self, baseline: MonoOffsets) -> Result<MonoOffsets, ScryError> {
        let mut off = baseline;

        // Critical
        type CriticalSetter = fn(&mut MonoOffsets, u32);
        let critical: &[(&str, CriticalSetter)] = &[
            ("mono_class_get_name", |o, v| o.structs.class.name = v),
            ("mono_class_get_namespace", |o, v| o.structs.class.name_space = v),
            ("mono_class_get_fields", |o, v| o.structs.class.fields = v),
            ("mono_class_get_image", |o, v| o.structs.class.image = v),
            ("mono_image_get_name", |o, v| o.structs.image.name = v),
            ("mono_assembly_get_image", |o, v| o.structs.assembly.image = v),
        ];
        for (name, setter) in critical {
            let v = self.probe_displacement(name)?;
            setter(&mut off, v);
        }

        // Best-effort
        let best_effort: &[(&str, CriticalSetter)] = &[
            ("mono_class_get_parent", |o, v| o.structs.class.parent = v),
            ("mono_field_get_offset", |o, v| o.structs.field.offset = v),
            ("mono_field_get_name", |o, v| o.structs.field.name = v),
            ("mono_field_get_type", |o, v| o.structs.field.type_ = v),
        ];
        for (name, setter) in best_effort {
            match self.probe_displacement(name) {
                Ok(v) => setter(&mut off, v),
                Err(e) => {
                    eprintln!(
                        "OffsetProber: best-effort probe '{}' failed ({}); keeping baseline",
                        name, e
                    );
                }
            }
        }

        Ok(off)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::handle::OwnedProcessHandle;

    /// Helper: a self-process ProcessMemory we can borrow without needing a
    /// remote target. We never actually read from it in these tests.
    fn self_memory() -> ProcessMemory {
        let pid = std::process::id();
        #[allow(clippy::expect_used)]
        let handle = OwnedProcessHandle::open(pid).expect("self-open MUST succeed");
        ProcessMemory::new(handle)
    }

    #[test]
    fn invalid_bitness_rejected_at_construction() {
        let mem = self_memory();
        let exports = HashMap::new();
        let result = OffsetProber::new(&mem, &exports, 64);
        assert!(matches!(result, Err(ScryError::InvalidProbeBitness(64))));

        let result16 = OffsetProber::new(&mem, &exports, 16);
        assert!(matches!(result16, Err(ScryError::InvalidProbeBitness(16))));
    }

    #[test]
    fn missing_export_returns_export_not_found() {
        let mem = self_memory();
        let exports = HashMap::new();
        #[allow(clippy::expect_used)]
        let prober = OffsetProber::new(&mem, &exports, 32).expect("32 must be valid");
        let baseline = MonoOffsets::default();
        let err = prober.probe_all(baseline).err().expect("must fail");
        match err {
            ScryError::ExportNotFound(name) => {
                assert_eq!(name, "mono_class_get_name", "first critical export expected");
            }
            other => {
                #[allow(clippy::panic)]
                { panic!("expected ExportNotFound, got {:?}", other); }
            }
        }
    }

    #[test]
    fn export_not_found_display_contains_name() {
        let e = ScryError::ExportNotFound("mono_image_get_name".into());
        let s = e.to_string();
        assert!(s.contains("mono_image_get_name"), "got {}", s);
    }

    #[test]
    fn invalid_probe_bitness_display_contains_value() {
        let e = ScryError::InvalidProbeBitness(64);
        let s = e.to_string();
        assert!(s.contains("64"), "got {}", s);
        assert!(s.contains("32"), "got {}", s);
    }

    #[test]
    fn offset_probe_failed_display_includes_site() {
        let e = ScryError::OffsetProbeFailed("mono_class_get_image: no MOV instruction".into());
        let s = e.to_string();
        assert!(s.contains("mono_class_get_image"), "got {}", s);
    }

    // Note: `probe_all` success path requires reading actual mono.dll bytes
    // and is exercised by spike 0003 Run 3 (post-Phase 6) against running
    // Hearthstone. Pure unit testing without a target process would require
    // a full mock ProcessMemory, which is more work than it's worth here.
}
