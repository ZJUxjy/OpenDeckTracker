//! Mono runtime offset probing via disassembly of exported Mono getter
//! functions.
//!
//! [`OffsetProber`] disassembles exported Mono getter functions (e.g.
//! `mono_class_get_name`) and recovers field displacements directly from
//! the machine code. The result is **range-gated against the embedded
//! `MonoOffsets` baseline** before being applied — see design D13.
//!
//! ## Why range-gating exists
//!
//! Hearthstone ships Unity's instrumented BDWGC Mono fork, where many
//! getter exports are wrapped in a profiling thunk:
//!
//! ```text
//! push ebp; mov ebp, esp; and esp, -8; sub esp, 8
//! cmp [global_profiling_flag], 0
//! ... profiling-on path with TLS reads (mov ecx, [eax+ecx*4+0xE10]) ...
//! je <profiling_off_label>
//! ... switch on a global state byte, dispatch to one of N branches ...
//! ; the actual `mov eax, [klass+0x2C]` is buried deep behind jumps
//! ```
//!
//! `disasm::find_field_load_displacement` scans linearly until the first
//! `ret`, so for these Shape-B thunks it picks up a profiling MOV (e.g.
//! `+0xE10` or `-0x100`) instead of the real field load. We catch that by
//! requiring the disasm result to land in a per-export "sane range"
//! bracketing the baseline value; out-of-range results fall back to the
//! `$confidence: HIGH` baseline (which is itself
//! `$verified_2026_04_19 by brute-force scan against running Hearthstone
//! Mono` — i.e. independently validated, not just source-derived).
//!
//! Practically this means the prober acts as a **sanity gate** on the
//! baseline: it confirms the simple-thunk exports (Shape A) still match
//! the JSON, and silently keeps the baseline whenever the wrapper makes
//! disasm too noisy.
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

    /// Refine `baseline` offsets by probing the 10 production exports.
    ///
    /// **Behavior matrix** (see [`PROBE_SPECS`] for the table):
    ///
    /// | outcome                                  | critical            | best-effort         |
    /// |------------------------------------------|---------------------|---------------------|
    /// | disasm result inside `sane_range`        | apply               | apply               |
    /// | disasm result outside `sane_range`       | log + keep baseline | log + keep baseline |
    /// | export missing (`ExportNotFound`)        | **abort**           | log + keep baseline |
    /// | no field-load found (`OffsetProbeFailed`)| log + keep baseline | log + keep baseline |
    /// | other (e.g. `MemoryAccess`)              | **propagate**       | **propagate**       |
    ///
    /// The "critical" flag now only governs **export presence** (a missing
    /// `mono_class_get_name` indicates the DLL is fundamentally not a Mono
    /// build → fast fail). Everything else degrades gracefully to the
    /// embedded baseline — see module docs for the rationale.
    pub fn probe_all(&self, baseline: MonoOffsets) -> Result<MonoOffsets, ScryError> {
        let mut off = baseline;

        for spec in PROBE_SPECS {
            match self.probe_displacement(spec.export) {
                Ok(v) if spec.sane_range.contains(&v) => (spec.setter)(&mut off, v),
                Ok(v) => {
                    eprintln!(
                        "OffsetProber: '{}' → {} returned 0x{:X} outside sane range \
                         0x{:X}..=0x{:X}; keeping baseline (likely a profiled thunk; \
                         see probe.rs module docs)",
                        spec.export,
                        spec.field_label,
                        v,
                        spec.sane_range.start(),
                        spec.sane_range.end(),
                    );
                }
                Err(ScryError::ExportNotFound(name)) => {
                    if spec.critical {
                        return Err(ScryError::ExportNotFound(name));
                    }
                    eprintln!(
                        "OffsetProber: best-effort export '{}' for {} missing; \
                         keeping baseline",
                        name, spec.field_label
                    );
                }
                Err(ScryError::OffsetProbeFailed(msg)) => {
                    eprintln!(
                        "OffsetProber: probe '{}' for {} failed ({}); keeping baseline",
                        spec.export, spec.field_label, msg
                    );
                }
                Err(other) => return Err(other),
            }
        }

        Ok(off)
    }
}

/// One row in the [`OffsetProber::probe_all`] table.
///
/// `sane_range` brackets the baseline value with enough slack to absorb
/// reasonable Unity-version drift while rejecting the typical garbage
/// produced by profiled-thunk wrappers (see module docs).
struct ProbeSpec {
    export: &'static str,
    field_label: &'static str,
    setter: fn(&mut MonoOffsets, u32),
    sane_range: std::ops::RangeInclusive<u32>,
    critical: bool,
}

/// The 10 production probes. Sane ranges are derived from spike 0003 +
/// real-machine `diag_prober` runs against Hearthstone; widen with care.
///
/// `mono_image_get_name` is intentionally tight (`0x10..=0x18`): Mono's
/// public getter actually returns `MonoImage.assembly_name` (0x1C in this
/// build) rather than `MonoImage.name` (0x14). The narrow gate forces the
/// fall-back to the baseline 0x14, which is what every reflection caller
/// in this crate expects.
const PROBE_SPECS: &[ProbeSpec] = &[
    ProbeSpec {
        export: "mono_class_get_name",
        field_label: "MonoClass.name",
        setter: |o, v| o.structs.class.name = v,
        sane_range: 0x04..=0x80,
        critical: true,
    },
    ProbeSpec {
        export: "mono_class_get_namespace",
        field_label: "MonoClass.name_space",
        setter: |o, v| o.structs.class.name_space = v,
        sane_range: 0x04..=0x80,
        critical: true,
    },
    ProbeSpec {
        export: "mono_class_get_fields",
        field_label: "MonoClass.fields",
        setter: |o, v| o.structs.class.fields = v,
        sane_range: 0x10..=0x100,
        critical: true,
    },
    ProbeSpec {
        export: "mono_class_get_image",
        field_label: "MonoClass.image",
        setter: |o, v| o.structs.class.image = v,
        sane_range: 0x10..=0x80,
        critical: true,
    },
    ProbeSpec {
        export: "mono_image_get_name",
        field_label: "MonoImage.name",
        setter: |o, v| o.structs.image.name = v,
        sane_range: 0x10..=0x18,
        critical: true,
    },
    ProbeSpec {
        export: "mono_assembly_get_image",
        field_label: "MonoAssembly.image",
        setter: |o, v| o.structs.assembly.image = v,
        sane_range: 0x10..=0x80,
        critical: true,
    },
    ProbeSpec {
        export: "mono_class_get_parent",
        field_label: "MonoClass.parent",
        setter: |o, v| o.structs.class.parent = v,
        sane_range: 0x10..=0x80,
        critical: false,
    },
    ProbeSpec {
        export: "mono_field_get_offset",
        field_label: "MonoClassField.offset",
        setter: |o, v| o.structs.field.offset = v,
        sane_range: 0x04..=0x40,
        critical: false,
    },
    ProbeSpec {
        export: "mono_field_get_name",
        field_label: "MonoClassField.name",
        setter: |o, v| o.structs.field.name = v,
        sane_range: 0x00..=0x40,
        critical: false,
    },
    ProbeSpec {
        export: "mono_field_get_type",
        field_label: "MonoClassField.type",
        setter: |o, v| o.structs.field.type_ = v,
        sane_range: 0x00..=0x40,
        critical: false,
    },
];

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
        #[allow(clippy::expect_used, clippy::err_expect)]
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

    /// Each baseline offset value (from JSON) must lie inside the
    /// corresponding `sane_range`. We hard-code the (export, expected) pairs
    /// to make a regression visible if either the baseline or the gate moves.
    #[test]
    fn baseline_offsets_fall_inside_sane_ranges() {
        let baseline = MonoOffsets::default();
        let pairs: &[(&str, u32)] = &[
            ("mono_class_get_name", baseline.structs.class.name),
            ("mono_class_get_namespace", baseline.structs.class.name_space),
            ("mono_class_get_fields", baseline.structs.class.fields),
            ("mono_class_get_image", baseline.structs.class.image),
            ("mono_image_get_name", baseline.structs.image.name),
            ("mono_assembly_get_image", baseline.structs.assembly.image),
            ("mono_class_get_parent", baseline.structs.class.parent),
            ("mono_field_get_offset", baseline.structs.field.offset),
            ("mono_field_get_name", baseline.structs.field.name),
            ("mono_field_get_type", baseline.structs.field.type_),
        ];
        for (export, value) in pairs {
            let spec = PROBE_SPECS.iter().find(|s| s.export == *export);
            #[allow(clippy::panic)]
            let spec = match spec {
                Some(s) => s,
                None => panic!("no spec for {}", export),
            };
            assert!(
                spec.sane_range.contains(value),
                "{} baseline 0x{:X} not inside sane range 0x{:X}..=0x{:X}",
                export,
                value,
                spec.sane_range.start(),
                spec.sane_range.end()
            );
        }
    }

    /// `mono_image_get_name` MUST reject 0x1C (the wrong-semantic
    /// `MonoImage.assembly_name` field that the public Mono getter actually
    /// returns). If this fails, future callers will silently swap to
    /// assembly names instead of image names.
    #[test]
    fn mono_image_name_range_excludes_assembly_name_offset() {
        #[allow(clippy::expect_used)]
        let spec = PROBE_SPECS
            .iter()
            .find(|s| s.export == "mono_image_get_name")
            .expect("spec must exist");
        assert!(
            !spec.sane_range.contains(&0x1C),
            "0x1C (MonoImage.assembly_name) leaked into the sane range"
        );
        assert!(
            spec.sane_range.contains(&0x14),
            "0x14 (MonoImage.name baseline) MUST be inside the sane range"
        );
    }

    /// A typical "garbage" displacement from a profiled-thunk wrapper (e.g.
    /// `0xE10` from a TLS fetch) MUST land outside every spec's sane range.
    /// This is the regression guard for the `0xE10` panic that motivated
    /// design D13.
    #[test]
    fn profiled_thunk_garbage_displacements_are_rejected() {
        let garbage: &[u32] = &[0xE10, 0x1000, 0x4000, 0xFFFF_FF00];
        for spec in PROBE_SPECS {
            for v in garbage {
                assert!(
                    !spec.sane_range.contains(v),
                    "spec '{}' would silently accept garbage 0x{:X}",
                    spec.export,
                    v
                );
            }
        }
    }
}
