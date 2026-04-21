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
use hearthmirror_native::mono::class::read_class_field_defs;
use hearthmirror_native::mono::MonoRuntime;

fn main() -> Result<(), ScryError> {
    let full_name = match std::env::args().nth(1) {
        Some(n) => n,
        None => {
            eprintln!("usage: diag_class_fields <FullName e.g. CollectionManager OR Foo.Bar.Class>");
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
    println!("--- This class only ({} field defs) — type_ptr for downstream type-name lookup ---", defs.len());
    for d in &defs {
        let static_marker = if d.is_static { " [STATIC]" } else { "" };
        println!(
            "  +0x{:04X}  {}{}  type_ptr={}",
            d.offset, d.name, static_marker, d.type_ptr
        );
    }

    Ok(())
}
