//! Like `diag_class_fields`, but takes a raw `MonoClass*` address instead
//! of `<Namespace>.<Name>`. Use when `find_class` cannot reach the type
//! (e.g. it lives in a non-Assembly-CSharp image such as
//! `Blizzard.T5.ServiceLocator.dll`).
//!
//! Usage:
//!   cargo run --release --example diag_klass_fields -- 0x251805C8

use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::class::read_class_field_defs;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::remote_ptr::RemotePtr;

fn main() -> Result<(), ScryError> {
    let ptr_str = match std::env::args().nth(1) {
        Some(s) => s,
        None => {
            eprintln!("usage: diag_klass_fields <MonoClass* hex e.g. 0x251805C8>");
            std::process::exit(2);
        }
    };
    let addr = u32::from_str_radix(ptr_str.trim_start_matches("0x"), 16)
        .map_err(|e| ScryError::MetadataError(format!("bad ptr: {e}")))?;
    let klass = RemotePtr::new(addr);

    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;
    let class_off = &rt.offsets.structs.class;

    let name_ptr = mem.read_remote_ptr(klass + class_off.name)?;
    let ns_ptr = mem.read_remote_ptr(klass + class_off.name_space)?;
    let name = if name_ptr.is_null() { String::new() } else { mem.read_cstring(name_ptr, 256)? };
    let ns = if ns_ptr.is_null() { String::new() } else { mem.read_cstring(ns_ptr, 256)? };

    println!("=== diag_klass_fields: {}.{}  @ {} ===", ns, name, klass);

    let defs = read_class_field_defs(mem, klass, &rt.offsets)?;
    println!("field_defs = {}", defs.len());
    println!();

    let mut sorted = defs.clone();
    sorted.sort_by_key(|f| f.offset);
    for d in sorted {
        let kind = if d.is_static { " [STATIC]" } else { "" };
        println!(
            "  +0x{:04X}  {}{}  type_ptr={}",
            d.offset, d.name, kind, d.type_ptr
        );
    }

    Ok(())
}
