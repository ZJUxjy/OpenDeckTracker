//! Dump every field on a class (recursively through inheritance), with
//! offsets and the C# type name (resolved via `MonoFieldDef.type_ptr →
//! MonoType.data → MonoClass*.name`).
//!
//! Used to diagnose F-13b style class-name / field-name / field-type drift
//! between the offsets the reflection chains assume and what the live
//! Hearthstone build actually exposes.
//!
//! Usage:
//!   cargo run --release --example diag_class_fields -- <FullName>
//!   cargo run --release --example diag_class_fields -- CollectionManager
//!   cargo run --release --example diag_class_fields -- NetCache
//!   cargo run --release --example diag_class_fields -- Blizzard.T5.Services.Entity
//!
//! `<FullName>` is `Namespace.Name`. If there is no `.`, the namespace is empty.

use hearthmirror_native::error::ScryError;
use hearthmirror_native::memory::ProcessMemory;
use hearthmirror_native::mono::class::read_class_field_defs;
use hearthmirror_native::mono::offsets::MonoOffsets;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::remote_ptr::RemotePtr;

fn main() -> Result<(), ScryError> {
    let full_name = match std::env::args().nth(1) {
        Some(n) => n,
        None => {
            eprintln!(
                "usage: diag_class_fields <FullName e.g. CollectionManager OR Foo.Bar.Class>"
            );
            std::process::exit(2);
        }
    };
    let (namespace, name) = match full_name.rsplit_once('.') {
        Some((ns, n)) => (ns.to_string(), n.to_string()),
        None => (String::new(), full_name.clone()),
    };

    let rt = MonoRuntime::init()?;
    let class = rt.find_class(&namespace, &name)?;

    println!(
        "=== diag_class_fields: {} @ {} ===",
        class.full_name, class.addr
    );
    println!("static_field_data = {}", class.static_field_data);
    println!(
        "fields.len = {} (resolved via fields_recursive merge)",
        class.fields.len()
    );
    println!();

    // Dump the merged inheritance map sorted by offset
    println!("--- Merged fields (recursive, child-overrides-parent) ---");
    let mut entries: Vec<_> = class.fields.iter().collect();
    entries.sort_by_key(|(_, off)| **off);
    for (n, foff) in entries {
        println!("  +0x{:04X}  {}", foff, n);
    }
    println!();

    // Dump this class's own field defs (no inheritance) with type_ptr for type
    // resolution.
    let defs = read_class_field_defs(&rt.memory, class.addr, &rt.offsets)?;
    println!(
        "--- This class only ({} field defs) — type_ptr for downstream type-name lookup ---",
        defs.len()
    );
    for d in &defs {
        let static_marker = if d.is_static { " [STATIC]" } else { "" };
        let type_info = describe_type(&rt.memory, d.type_ptr, &rt.offsets)
            .unwrap_or_else(|e| format!("type_info=<ERR: {}>", e));
        println!(
            "  +0x{:04X}  {}{}  type_ptr={}  {}",
            d.offset, d.name, static_marker, d.type_ptr, type_info
        );
    }

    Ok(())
}

fn describe_type(
    mem: &ProcessMemory,
    type_ptr: RemotePtr,
    offsets: &MonoOffsets,
) -> Result<String, ScryError> {
    if type_ptr.is_null() {
        return Ok("type_info=NULL".into());
    }

    let data = mem.read_remote_ptr(type_ptr)?;
    let attrs_32 = mem.read_u16(type_ptr + 4).unwrap_or(0);
    let type_32 = mem.read_u8(type_ptr + 6).unwrap_or(0);
    let attrs_64 = mem.read_u16(type_ptr + 8).unwrap_or(0);
    let type_64 = mem.read_u8(type_ptr + 10).unwrap_or(0);
    let data_class = describe_class(mem, data, offsets).unwrap_or_else(|| "?".into());
    let generic_class = describe_generic_class(mem, data, offsets).unwrap_or_else(|| "?".into());

    Ok(format!(
        "data={} data_class={} generic_class={} attrs32=0x{:04X} tag32=0x{:02X} attrs64=0x{:04X} tag64=0x{:02X}",
        data, data_class, generic_class, attrs_32, type_32, attrs_64, type_64
    ))
}

fn describe_generic_class(
    mem: &ProcessMemory,
    generic_class: RemotePtr,
    offsets: &MonoOffsets,
) -> Option<String> {
    if generic_class.is_null() {
        return None;
    }
    for off in [0_u32, 8, 16, 24, 32] {
        let candidate = mem.read_remote_ptr(generic_class + off).ok()?;
        if let Some(name) = describe_class(mem, candidate, offsets) {
            return Some(format!("+0x{:X}->{}", off, name));
        }
    }
    None
}

fn describe_class(mem: &ProcessMemory, klass: RemotePtr, offsets: &MonoOffsets) -> Option<String> {
    if klass.is_null() {
        return None;
    }
    let class_off = &offsets.structs.class;
    let name_ptr = mem.read_remote_ptr(klass + class_off.name).ok()?;
    let ns_ptr = mem.read_remote_ptr(klass + class_off.name_space).ok()?;
    let name = if name_ptr.is_null() {
        String::new()
    } else {
        mem.read_cstring(name_ptr, 128).ok()?
    };
    let namespace = if ns_ptr.is_null() {
        String::new()
    } else {
        mem.read_cstring(ns_ptr, 128).ok()?
    };
    if name.is_empty() {
        None
    } else if namespace.is_empty() {
        Some(name)
    } else {
        Some(format!("{}.{}", namespace, name))
    }
}
