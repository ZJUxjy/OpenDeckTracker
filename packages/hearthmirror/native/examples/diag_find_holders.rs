//! Walk every registered IService and recursively (up to depth 2) inspect
//! its instance fields, reporting any field whose pointer's runtime klass
//! matches one of the user-supplied target klass addresses.
//!
//! Use this to discover where in the live object graph a particular
//! Mono class instance is reachable from — for example, "which service
//! holds a `BattleTag`?" without having to grep DLLs.
//!
//! Usage:
//!   cargo run --release --example diag_find_holders -- 0x25263230 0x24C785D8
//!
//! Pass one or more target klass pointers (hex). The tool prints
//! `service.path.to.field  →  Type  @ instance_addr` for every match.

use hearthmirror_native::collections::dict::{iter_entries, read_entry_value_ptr};
use hearthmirror_native::error::ScryError;
use hearthmirror_native::memory::ProcessMemory;
use hearthmirror_native::mono::class::read_class_field_defs;
use hearthmirror_native::mono::object::MonoObject;
use hearthmirror_native::mono::offsets::MonoOffsets;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::reflection::field_paths::*;
use hearthmirror_native::remote_ptr::RemotePtr;
use std::collections::HashSet;
use std::sync::Arc;

const MAX_SERVICES: usize = 1024;
const MAX_DEPTH: usize = 4;

fn main() -> Result<(), ScryError> {
    let targets: HashSet<u32> = std::env::args()
        .skip(1)
        .filter_map(|s| u32::from_str_radix(s.trim_start_matches("0x"), 16).ok())
        .collect();
    if targets.is_empty() {
        eprintln!("usage: diag_find_holders <klass_hex> [<klass_hex>...]");
        std::process::exit(2);
    }
    println!("Targets: {} klass pointers", targets.len());
    for t in &targets {
        println!("  0x{:08X}", t);
    }

    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;

    let sm = rt.find_class_in_image(SVC_LOCATOR_DLL, CLS_SERVICE_MANAGER.0, CLS_SERVICE_MANAGER.1)?;
    let sr_off = *sm.fields.get(FLD_S_RUNTIME_SERVICES).ok_or_else(|| {
        ScryError::FieldNotFound { class: "ServiceManager".into(), field: FLD_S_RUNTIME_SERVICES.into() }
    })?;
    let locator_ptr = mem.read_remote_ptr(sm.static_field_data + sr_off)?;
    let Some(locator) = MonoObject::from_address(mem, locator_ptr, rt.offsets.clone())? else {
        eprintln!("ServiceLocator NULL");
        std::process::exit(2);
    };
    let Some(dict_ptr) = locator.read_pointer_field(mem, FLD_M_SERVICES)? else {
        eprintln!("m_services NULL");
        std::process::exit(2);
    };
    let entries = iter_entries(mem, dict_ptr, 16, MAX_SERVICES)?;

    let mut hits = 0usize;
    for entry in entries {
        let info_ptr = read_entry_value_ptr(mem, entry)?;
        let Some(info) = MonoObject::from_address(mem, info_ptr, rt.offsets.clone())? else {
            continue;
        };
        let svc_name = info
            .read_string_field(mem, FLD_SERVICE_TYPE_NAME)?
            .unwrap_or_else(|| "<no name>".into());
        let Some(svc_inst) = info.read_object_field(mem, FLD_SERVICE)? else {
            continue;
        };

        let mut visited = HashSet::new();
        scan(mem, &rt.offsets, svc_inst.addr, &targets, &svc_name, 0, &mut visited, &mut hits)?;
    }

    println!("\nDone. {} hits.", hits);
    Ok(())
}

fn scan(
    mem: &ProcessMemory,
    offsets: &Arc<MonoOffsets>,
    addr: RemotePtr,
    targets: &HashSet<u32>,
    path: &str,
    depth: usize,
    visited: &mut HashSet<u32>,
    hits: &mut usize,
) -> Result<(), ScryError> {
    if depth > MAX_DEPTH || addr.is_null() {
        return Ok(());
    }
    if !visited.insert(addr.raw()) {
        return Ok(());
    }
    // Resolve klass for this object.
    let object_off = &offsets.structs.object;
    let vtable_off = &offsets.structs.vtable;
    let class_off = &offsets.structs.class;
    let Ok(vt) = mem.read_remote_ptr(addr + object_off.vtable) else { return Ok(()); };
    if vt.is_null() {
        return Ok(());
    }
    let Ok(klass) = mem.read_remote_ptr(vt + vtable_off.klass) else { return Ok(()); };
    if klass.is_null() {
        return Ok(());
    }
    if targets.contains(&klass.raw()) {
        let np = mem.read_remote_ptr(klass + class_off.name).unwrap_or(RemotePtr::NULL);
        let nsp = mem.read_remote_ptr(klass + class_off.name_space).unwrap_or(RemotePtr::NULL);
        let nm = if np.is_null() { String::new() } else { mem.read_cstring(np, 256).unwrap_or_default() };
        let ns = if nsp.is_null() { String::new() } else { mem.read_cstring(nsp, 256).unwrap_or_default() };
        let ty = if ns.is_empty() { nm } else { format!("{}.{}", ns, nm) };
        println!("  HIT: {}  →  {} @ {}", path, ty, addr);
        *hits += 1;
        return Ok(());
    }

    // Read field defs of this object's class to know which offsets are
    // reference-typed candidates. Limit recursion: only walk fields that
    // look like managed object pointers (we don't have full MonoType
    // resolution here — accept any non-null read that has a plausible
    // vtable when we descend).
    let Ok(defs) = read_class_field_defs(mem, klass, offsets) else { return Ok(()); };
    for d in defs {
        if d.is_static {
            continue;
        }
        // Read 4 bytes as a candidate pointer.
        let Ok(child_ptr) = mem.read_remote_ptr(addr + d.offset) else { continue; };
        if child_ptr.is_null() || child_ptr.raw() < 0x10000 {
            continue;
        }
        // Try to validate as an object: vtable → klass; if either fails,
        // skip silently.
        let Ok(cvt) = mem.read_remote_ptr(child_ptr + object_off.vtable) else { continue; };
        if cvt.is_null() {
            continue;
        }
        let Ok(ck) = mem.read_remote_ptr(cvt + vtable_off.klass) else { continue; };
        if ck.is_null() {
            continue;
        }
        let new_path = format!("{}.{}", path, d.name);
        scan(mem, offsets, child_ptr, targets, &new_path, depth + 1, visited, hits)?;
    }
    Ok(())
}
