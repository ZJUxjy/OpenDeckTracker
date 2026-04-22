//! Resolve a static-field chain starting from a *raw* `MonoClass*`
//! address (so it works for classes outside `Assembly-CSharp.dll`,
//! which `find_class` cannot reach today). Useful for spelunking
//! `Blizzard.T5.Services.ServiceManager.s_runtimeServices` and similar
//! cross-DLL singletons.
//!
//! Usage:
//!   cargo run --release --example diag_static_chain -- <klass_hex> <staticField> [<field2>...]
//!
//! Example (ServiceManager.s_runtimeServices):
//!   cargo run --release --example diag_static_chain -- 0x251805C8 s_runtimeServices

use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::class::read_mono_class;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::remote_ptr::RemotePtr;

fn main() -> Result<(), ScryError> {
    let mut args = std::env::args().skip(1);
    let ptr_str = match args.next() {
        Some(s) => s,
        None => {
            eprintln!("usage: diag_static_chain <klass_hex> <staticField> [<field2>...]");
            std::process::exit(2);
        }
    };
    let chain: Vec<String> = args.collect();
    if chain.is_empty() {
        eprintln!("usage: diag_static_chain <klass_hex> <staticField> [<field2>...]");
        std::process::exit(2);
    }

    let addr = u32::from_str_radix(ptr_str.trim_start_matches("0x"), 16)
        .map_err(|e| ScryError::MetadataError(format!("bad ptr: {e}")))?;
    let klass_addr = RemotePtr::new(addr);

    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;
    let class = read_mono_class(mem, klass_addr, rt.offsets.clone())?;

    println!("=== diag_static_chain: {} @ {} ===", class.full_name, class.addr);
    println!("static_field_data = {}", class.static_field_data);
    if class.static_field_data.is_null() {
        println!("(class never instantiated — runtime_info NULL or vtable not allocated)");
        return Ok(());
    }

    // Step 1: read the requested static field by name → object addr.
    let first = &chain[0];
    let off = match class.fields.get(first) {
        Some(o) => *o,
        None => {
            eprintln!("static field '{}' not found on this class", first);
            std::process::exit(3);
        }
    };
    println!("\n--- step 1: static field {} @ static_field_data + 0x{:04X} ---", first, off);
    let mut current = mem.read_remote_ptr(class.static_field_data + off)?;
    print_obj(mem, &rt, "<static>", current)?;

    if current.is_null() {
        println!("static field is NULL — chain ends");
        return Ok(());
    }

    // Subsequent steps: walk instance fields by name.
    for (i, fld) in chain.iter().enumerate().skip(1) {
        // Need to resolve the current object's klass via vtable→klass and
        // read its field map.
        let vtable = mem.read_remote_ptr(current + rt.offsets.structs.object.vtable)?;
        let cur_klass = mem.read_remote_ptr(vtable + rt.offsets.structs.vtable.klass)?;
        let cur_class = read_mono_class(mem, cur_klass, rt.offsets.clone())?;
        let off = match cur_class.fields.get(fld) {
            Some(o) => *o,
            None => {
                eprintln!("field '{}' not found on {}", fld, cur_class.full_name);
                println!("available fields ({}):", cur_class.fields.len());
                let mut entries: Vec<_> = cur_class.fields.iter().collect();
                entries.sort_by_key(|(_, off)| **off);
                for (n, o) in entries {
                    println!("    +0x{:04X}  {}", o, n);
                }
                std::process::exit(3);
            }
        };
        println!("\n--- step {}: {} @ +0x{:04X} ---", i + 1, fld, off);
        current = mem.read_remote_ptr(current + off)?;
        print_obj(mem, &rt, fld, current)?;
        if current.is_null() {
            println!("pointer is NULL — chain ends");
            return Ok(());
        }
    }
    Ok(())
}

fn print_obj(
    mem: &hearthmirror_native::memory::ProcessMemory,
    rt: &MonoRuntime,
    label: &str,
    addr: RemotePtr,
) -> Result<(), ScryError> {
    println!("  {}: object @ {}", label, addr);
    if addr.is_null() {
        return Ok(());
    }
    let vtable = mem.read_remote_ptr(addr + rt.offsets.structs.object.vtable)?;
    if vtable.is_null() {
        println!("    vtable = NULL");
        return Ok(());
    }
    let klass = mem.read_remote_ptr(vtable + rt.offsets.structs.vtable.klass)?;
    let class_off = &rt.offsets.structs.class;
    let name_ptr = mem.read_remote_ptr(klass + class_off.name).unwrap_or(RemotePtr::NULL);
    let ns_ptr = mem.read_remote_ptr(klass + class_off.name_space).unwrap_or(RemotePtr::NULL);
    let name = if name_ptr.is_null() { String::new() } else { mem.read_cstring(name_ptr, 256).unwrap_or_default() };
    let ns = if ns_ptr.is_null() { String::new() } else { mem.read_cstring(ns_ptr, 256).unwrap_or_default() };
    println!("    vtable = {}", vtable);
    println!("    klass  = {}", klass);
    println!("    type   = {}.{}", ns, name);

    println!("    raw u32 [+0x00..+0x30]:");
    for off in (0..0x30_u32).step_by(4) {
        match mem.read_u32(addr + off) {
            Ok(v) => println!("      +0x{:02X} = 0x{:08X} ({})", off, v, v),
            Err(e) => println!("      +0x{:02X} = <ERR: {}>", off, e),
        }
    }
    Ok(())
}
