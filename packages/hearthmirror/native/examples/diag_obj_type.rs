//! Resolve a raw MonoObject address to its runtime type name.
//!
//! Usage:
//!   cargo run --release --example diag_obj_type -- 0x43940B00
//!
//! This is the minimal helper you reach for when an earlier diag has
//! surfaced a pointer and you just want to know "what is this, in C#
//! land?" — it walks obj.vtable.klass and prints the class name.

use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::remote_ptr::RemotePtr;

fn main() -> Result<(), ScryError> {
    let addr_str = match std::env::args().nth(1) {
        Some(s) => s,
        None => {
            eprintln!("usage: diag_obj_type <object addr, hex e.g. 0x43940B00>");
            std::process::exit(2);
        }
    };
    let addr = u32::from_str_radix(addr_str.trim_start_matches("0x"), 16)
        .map_err(|e| ScryError::MetadataError(format!("bad ptr: {e}")))?;
    let obj_addr = RemotePtr::new(addr);

    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;
    let vtable = mem.read_remote_ptr(obj_addr + rt.offsets.structs.object.vtable)?;
    let klass = mem.read_remote_ptr(vtable + rt.offsets.structs.vtable.klass)?;
    let name_ptr = mem.read_remote_ptr(klass + rt.offsets.structs.class.name)?;
    let ns_ptr = mem.read_remote_ptr(klass + rt.offsets.structs.class.name_space)?;
    let name = if name_ptr.is_null() { String::new() } else { mem.read_cstring(name_ptr, 256)? };
    let ns = if ns_ptr.is_null() { String::new() } else { mem.read_cstring(ns_ptr, 256)? };

    let field_count = mem.read_u16(klass + rt.offsets.structs.class.field_count)?;
    let parent = mem.read_remote_ptr(klass + rt.offsets.structs.class.parent)?;

    println!("obj      = {}", obj_addr);
    println!("vtable   = {}", vtable);
    println!("klass    = {}", klass);
    println!("type     = {}.{}", ns, name);
    println!("field_count = {}", field_count);
    println!("parent klass = {}", parent);

    println!("\n--- obj raw u32 [+0x00..+0x30] ---");
    for off in (0..0x30_u32).step_by(4) {
        match mem.read_u32(obj_addr + off) {
            Ok(v) => println!("  +0x{:02X} = 0x{:08X} ({})", off, v, v),
            Err(e) => println!("  +0x{:02X} = <ERR: {}>", off, e),
        }
    }

    Ok(())
}
