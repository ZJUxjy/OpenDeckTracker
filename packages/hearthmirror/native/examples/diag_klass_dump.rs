//! Dump the raw bytes of a `MonoClass*` and the expected offset-positions
//! of its `name` / `name_space` / `vtable_size` slots. This is the last-
//! resort tool when a class pointer appears live but all field reads
//! return garbage: it confirms whether the pointer actually points at a
//! MonoClass, and whether our offset table matches the layout in memory.
//!
//! Usage:
//!   cargo run --release --example diag_klass_dump -- 0x4ADDFBA8

use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::remote_ptr::RemotePtr;

fn main() -> Result<(), ScryError> {
    let ptr_str = match std::env::args().nth(1) {
        Some(s) => s,
        None => {
            eprintln!("usage: diag_klass_dump <klass ptr, hex e.g. 0x4ADDFBA8>");
            std::process::exit(2);
        }
    };
    let klass_addr = u32::from_str_radix(ptr_str.trim_start_matches("0x"), 16)
        .map_err(|e| ScryError::MetadataError(format!("bad ptr: {e}")))?;
    let klass = RemotePtr::new(klass_addr);

    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;
    let class_off = &rt.offsets.structs.class;

    println!("=== diag_klass_dump: MonoClass @ {} ===", klass);
    println!();
    println!(
        "Baseline MonoClass offsets in use: name={:#x} name_space={:#x} vtable_size={:#x} parent={:#x} field_count={:#x} fields={:#x} runtime_info={:#x}",
        class_off.name,
        class_off.name_space,
        class_off.vtable_size,
        class_off.parent,
        class_off.field_count,
        class_off.fields,
        class_off.runtime_info
    );
    println!();

    println!("--- Raw dump of first 0xC0 bytes (u32 LE) ---");
    for off in (0..0xC0_u32).step_by(4) {
        let v = mem
            .read_u32(klass + off)
            .map(|x| format!("0x{:08X}", x))
            .unwrap_or_else(|e| format!("<ERR: {}>", e));
        // Mark slots we care about
        let tag = match off {
            o if o == class_off.parent => " ← parent",
            o if o == class_off.name => " ← name",
            o if o == class_off.name_space => " ← name_space",
            o if o == class_off.vtable_size => " ← vtable_size",
            o if o == class_off.fields => " ← fields",
            o if o == class_off.runtime_info => " ← runtime_info",
            o if o == class_off.field_count => " ← field_count (u16)",
            _ => "",
        };
        println!("  +0x{:02X} = {}{}", off, v, tag);
    }

    // Try resolving name via the baseline offset
    println!();
    let name_ptr = mem.read_remote_ptr(klass + class_off.name).unwrap_or(RemotePtr::NULL);
    let name = if name_ptr.is_null() {
        "<name_ptr = NULL>".to_string()
    } else {
        mem.read_cstring(name_ptr, 256)
            .unwrap_or_else(|e| format!("<read err: {}>", e))
    };
    println!("name @ +0x{:X} → {} → {:?}", class_off.name, name_ptr, name);

    // Brute-force scan: check every 4-aligned offset in [0x00..0x80] for
    // one that points to a c-string starting with a printable ASCII run.
    // This helps identify if MonoClass.name is really at a different
    // offset than our baseline assumes.
    println!();
    println!("--- Brute-force name offset scan (any u32 in [+0x00..+0x80] that points at a printable c-string) ---");
    for off in (0..0x80_u32).step_by(4) {
        let Ok(candidate) = mem.read_remote_ptr(klass + off) else { continue };
        if candidate.is_null() {
            continue;
        }
        let Ok(s) = mem.read_cstring(candidate, 64) else { continue };
        let first_bytes = s.as_bytes();
        if first_bytes.is_empty() || first_bytes.len() > 63 {
            continue;
        }
        // Require the first char to be a reasonable class-name starter
        let ok = first_bytes.iter().take(8).all(|b| {
            matches!(b, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'<' | b'`' | b' ')
        });
        if ok && !s.trim().is_empty() {
            println!("  +0x{:02X} → {} → {:?}", off, candidate, s);
        }
    }

    Ok(())
}
