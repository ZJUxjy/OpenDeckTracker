//! Resolve a static-singleton field-pointer chain and dump the runtime
//! type of the resulting object (i.e. `obj.klass.name`).
//!
//! Use this to verify the *actual* C# type of a field (e.g. is it a
//! `List<T>` or a `Dictionary<K,V>`?) without guessing from the field
//! name. It is the most reliable way to diagnose collection-iterator
//! bugs.
//!
//! Usage:
//!   cargo run --release --example diag_field_object -- <ClassFullName> <Field> [<Field2>...]
//!
//! Examples:
//!   cargo run --release --example diag_field_object -- CollectionManager m_decks
//!   cargo run --release --example diag_field_object -- CollectionManager m_collectibleCards
//!   cargo run --release --example diag_field_object -- NetCache m_netCacheValues
//!
//! Each subsequent <FieldN> dives one level deeper through pointer fields.

use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::class::read_mono_class;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::remote_ptr::RemotePtr;

fn main() -> Result<(), ScryError> {
    let mut args = std::env::args().skip(1);
    let full_name = match args.next() {
        Some(n) => n,
        None => {
            eprintln!("usage: diag_field_object <ClassFullName> <Field> [<Field2>...]");
            std::process::exit(2);
        }
    };
    let field_chain: Vec<String> = args.collect();
    if field_chain.is_empty() {
        eprintln!("usage: diag_field_object <ClassFullName> <Field> [<Field2>...]");
        std::process::exit(2);
    }

    let (namespace, name) = match full_name.rsplit_once('.') {
        Some((ns, n)) => (ns.to_string(), n.to_string()),
        None => (String::new(), full_name.clone()),
    };

    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;

    let Some(mut current) = rt.get_singleton(&namespace, &name)? else {
        eprintln!("singleton {}.{} is null (s_instance not initialized)", namespace, name);
        std::process::exit(3);
    };

    // Header for the singleton itself
    println!("=== diag_field_object: {}.{}.s_instance ===", namespace, name);
    print_obj(mem, &rt, "<root>", current.addr)?;

    for (i, fld) in field_chain.iter().enumerate() {
        let depth_label = format!("[{}] {}", i + 1, fld);
        let off = match current.fields.get(fld) {
            Some(o) => *o,
            None => {
                println!("\n  -> field '{}' NOT FOUND on this object's class", fld);
                println!("  available fields ({}):", current.fields.len());
                let mut entries: Vec<_> = current.fields.iter().collect();
                entries.sort_by_key(|(_, off)| **off);
                for (n, o) in entries {
                    println!("    +0x{:04X}  {}", o, n);
                }
                std::process::exit(4);
            }
        };
        println!("\n--- step {}: {} @ +0x{:04X} ---", i + 1, fld, off);
        let next_addr = mem.read_remote_ptr(current.addr + off)?;
        if next_addr.is_null() {
            println!("  pointer is NULL — chain ends here");
            return Ok(());
        }
        print_obj(mem, &rt, &depth_label, next_addr)?;
        // dive
        match current.child_from_address(mem, next_addr)? {
            Some(c) => current = c,
            None => {
                println!(
                    "  could not resolve klass for {} — chain ends here",
                    next_addr
                );
                return Ok(());
            }
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

    // MonoObject header: vtable @ +0x00, klass reached via vtable.klass.
    let vtable = mem.read_remote_ptr(addr + rt.offsets.structs.object.vtable)?;
    if vtable.is_null() {
        println!("    vtable = NULL");
        return Ok(());
    }
    let klass = mem.read_remote_ptr(vtable + rt.offsets.structs.vtable.klass)?;
    if klass.is_null() {
        println!("    vtable = {} (klass = NULL)", vtable);
        return Ok(());
    }
    println!("    vtable = {}", vtable);
    println!("    klass  = {}", klass);

    let class_off = &rt.offsets.structs.class;
    let name_ptr = mem.read_remote_ptr(klass + class_off.name).unwrap_or(RemotePtr::NULL);
    let ns_ptr = mem.read_remote_ptr(klass + class_off.name_space).unwrap_or(RemotePtr::NULL);
    let kname = if name_ptr.is_null() {
        "<null name_ptr>".into()
    } else {
        mem.read_cstring(name_ptr, 256).unwrap_or_else(|e| format!("<name read err: {}>", e))
    };
    let kns = if ns_ptr.is_null() {
        "".into()
    } else {
        mem.read_cstring(ns_ptr, 256).unwrap_or_else(|e| format!("<ns read err: {}>", e))
    };
    println!("    type(raw) = {}.{}", kns, kname);

    let vtable_size = mem.read_u32(klass + class_off.vtable_size).unwrap_or(0xDEAD_BEEF);
    println!("    vtable_size = {} (0x{:X})", vtable_size, vtable_size);

    match read_mono_class(mem, klass, rt.offsets.clone()) {
        Ok(c) => println!("    type(full) = {}", c.full_name),
        Err(e) => println!("    type(full) = <unresolved: {}>", e),
    }

    // Dump first 0x20 bytes of the object as u32 hex for layout inspection
    println!("    raw u32 [+0x00..+0x20]:");
    for off in (0..0x20).step_by(4) {
        let v = mem
            .read_u32(addr + off)
            .map(|x| format!("0x{:08X}", x))
            .unwrap_or_else(|e| format!("<ERR: {}>", e));
        println!("      +0x{:02X} = {}", off, v);
    }
    Ok(())
}
