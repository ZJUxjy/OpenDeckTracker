//! Diagnose `get_singleton` for a single well-known class (NetCache).
//!
//! Walks every step of the chain that `MonoRuntime::get_singleton` performs
//! and dumps each intermediate value, so we can pinpoint where the all-12
//! reflection-method ReadProcessMemory failure at `0x00000015` originates.
//!
//! Steps dumped:
//!   1. find class via metadata table → get `MonoClass*`
//!   2. read each MonoClass field used by D12: name, runtime_info, vtable_size
//!   3. follow `runtime_info → domain_vtables[0] → vtable_ptr`
//!   4. compute `sfd_slot = vtable_ptr + vtable_array_start + vtable_size * ptr_size`
//!   5. dereference sfd_slot → static_field_data
//!   6. look up `s_instance` in `class.fields` → offset
//!   7. compute `static_field_data + s_instance_offset` → the address dump_reflection bombs on

use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::reflection::field_paths::{CLS_NET_CACHE, FLD_S_INSTANCE};

fn main() -> Result<(), ScryError> {
    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;
    let off = &rt.offsets;

    println!("=== diag_singleton: {}.{} ===", CLS_NET_CACHE.0, CLS_NET_CACHE.1);
    println!(
        "ptr_size={} | class.runtime_info=+0x{:X} class.vtable_size=+0x{:X} \
         class.fields=+0x{:X} class.field_count=+0x{:X}",
        off.ptr_size,
        off.structs.class.runtime_info,
        off.structs.class.vtable_size,
        off.structs.class.fields,
        off.structs.class.field_count,
    );
    println!(
        "vtable.vtable_array_start=+0x{:X}",
        off.structs.vtable.vtable_array_start,
    );

    // 1. Resolve class
    let class = rt.find_class(CLS_NET_CACHE.0, CLS_NET_CACHE.1)?;
    println!("\n1. find_class → MonoClass* @ {}", class.addr);
    println!("   full_name={:?}", class.full_name);
    println!("   static_field_data={}", class.static_field_data);
    println!("   fields.len={}", class.fields.len());

    // 2-3. Manually re-walk D12 to validate `read_mono_class`'s computation.
    let class_off = &off.structs.class;
    let runtime_info =
        mem.read_remote_ptr(class.addr + class_off.runtime_info)?;
    println!(
        "\n2. *(klass+0x{:X}=runtime_info) = {}",
        class_off.runtime_info, runtime_info
    );

    if runtime_info.is_null() {
        println!("   runtime_info is NULL → class never instantiated; abort");
        return Ok(());
    }

    let vtable_ptr = mem.read_remote_ptr(runtime_info + off.ptr_size)?;
    println!(
        "3. *(runtime_info+ptr_size={}) = vtable_ptr = {}",
        off.ptr_size, vtable_ptr
    );

    if vtable_ptr.is_null() {
        println!("   vtable_ptr is NULL; abort");
        return Ok(());
    }

    let vtable_size = mem.read_u32(class.addr + class_off.vtable_size)?;
    println!(
        "4. *u32(klass+0x{:X}=vtable_size) = {} (=0x{:X})",
        class_off.vtable_size, vtable_size, vtable_size
    );

    let sfd_slot_addr =
        vtable_ptr + off.structs.vtable.vtable_array_start + vtable_size * off.ptr_size;
    println!(
        "5. sfd_slot = vtable_ptr + 0x{:X} + {}*{} = {}",
        off.structs.vtable.vtable_array_start,
        vtable_size,
        off.ptr_size,
        sfd_slot_addr,
    );

    let sfd_value = mem.read_remote_ptr(sfd_slot_addr)?;
    println!("6. *(sfd_slot) = static_field_data = {}", sfd_value);

    // 7. Bonus: dump the first few vtable slots so we can eyeball whether
    //    vtable_array_start=0x2C is the actual function-pointer start.
    println!("\n--- vtable[0..vtable_size+2] (raw) ---");
    let max_dump = (vtable_size + 2).min(16);
    for i in 0..max_dump {
        let slot = vtable_ptr + off.structs.vtable.vtable_array_start + i * off.ptr_size;
        let v = mem
            .read_remote_ptr(slot)
            .map(|p| format!("{}", p))
            .unwrap_or_else(|e| format!("<ERR: {}>", e));
        let marker = if i == vtable_size {
            " ← static_field_data slot per current calc"
        } else {
            ""
        };
        println!("  vtable[{:2}] @ +0x{:X} = {}{}", i, slot.raw() - vtable_ptr.raw(), v, marker);
    }

    // 8. Also dump some vtable header words so we can validate
    //    klass/gc_descr/domain layout and see where vtable_array_start
    //    *should* begin if 0x2C is wrong.
    println!("\n--- vtable header [0..vtable_array_start] ---");
    let header_end = off.structs.vtable.vtable_array_start;
    for off_h in (0..header_end).step_by(4) {
        let v = mem
            .read_u32(vtable_ptr + off_h)
            .map(|x| format!("0x{:08X}", x))
            .unwrap_or_else(|e| format!("<ERR: {}>", e));
        println!("  vtable_header @ +0x{:02X} = {}", off_h, v);
    }

    // 9. Field map dump
    println!("\n--- class.fields (first 20) ---");
    let mut entries: Vec<_> = class.fields.iter().collect();
    entries.sort_by_key(|(_, off)| **off);
    for (name, foff) in entries.iter().take(20) {
        let mark = if *name == FLD_S_INSTANCE { " ← FLD_S_INSTANCE" } else { "" };
        println!("  +0x{:04X}  {}{}", foff, name, mark);
    }

    // 10. Final: simulate get_singleton's read
    if let Some(&s_inst_off) = class.fields.get(FLD_S_INSTANCE) {
        let final_addr = class.static_field_data + s_inst_off;
        println!(
            "\n10. get_singleton would read at static_field_data ({}) + s_instance ({:#X}) = {}",
            class.static_field_data, s_inst_off, final_addr,
        );
        match mem.read_remote_ptr(final_addr) {
            Ok(p) => println!("    *final_addr = {}", p),
            Err(e) => println!("    *final_addr ERROR: {}", e),
        }
    } else {
        println!("\n10. class.fields has no '{}' entry", FLD_S_INSTANCE);
    }

    Ok(())
}
