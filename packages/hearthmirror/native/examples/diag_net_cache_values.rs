//! Walk `NetCache.m_netCache` (Dictionary<Type, NetCacheValue>) and dump
//! the runtime type name (vtable→klass→name) of every value entry.
//!
//! Use this when you need to know which `NetCacheXxx` subclasses are
//! present in the live game build so the reflection chains can match by
//! Type.Name without hardcoding string lists from a reference C# build.
//!
//! Usage:
//!   cargo run --release --example diag_net_cache_values

use hearthmirror_native::collections::custom_map;
use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::reflection::field_paths::*;

const MAX_ENTRIES: usize = 4096;

fn main() -> Result<(), ScryError> {
    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;

    let Some(net_cache) = rt.get_service(SVC_NET_CACHE)? else {
        eprintln!("NetCache service not registered (or ServiceLocator chain broken)");
        std::process::exit(2);
    };

    println!("NetCache instance @ {}", net_cache.addr);
    println!("NetCache.fields.len = {}", net_cache.fields.len());
    let mut sorted: Vec<_> = net_cache.fields.iter().collect();
    sorted.sort_by_key(|(_, off)| **off);
    for (name, off) in &sorted {
        println!("  +0x{:04X}  {}", off, name);
    }

    let Some(dict_ptr) = net_cache.read_pointer_field(mem, "m_netCache")? else {
        eprintln!("m_netCache field missing or null");
        std::process::exit(3);
    };
    println!("\nm_netCache Dictionary @ {}", dict_ptr);

    let class_off = &rt.offsets.structs.class;
    let object_off = &rt.offsets.structs.object;
    let vtable_off = &rt.offsets.structs.vtable;

    let dvt = mem.read_remote_ptr(dict_ptr + object_off.vtable)?;
    let dkl = mem.read_remote_ptr(dvt + vtable_off.klass)?;
    let dnp = mem.read_remote_ptr(dkl + class_off.name)?;
    let dnsp = mem.read_remote_ptr(dkl + class_off.name_space)?;
    let dn = mem.read_cstring(dnp, 256)?;
    let dns = mem.read_cstring(dnsp, 256)?;
    println!("Dictionary runtime type = {}.{}", dns, dn);

    println!("Dictionary header u32 [+0x00..+0x40]:");
    for off in (0..0x40_u32).step_by(4) {
        match mem.read_u32(dict_ptr + off) {
            Ok(v) => println!("  +0x{:02X} = 0x{:08X} ({})", off, v, v),
            Err(e) => println!("  +0x{:02X} = <ERR: {}>", off, e),
        }
    }

    let entries = custom_map::iter_entries(mem, dict_ptr, MAX_ENTRIES)?;
    println!("\nentries via Map iter (populated) = {}", entries.len());

    for (i, (k, v)) in entries.iter().enumerate() {
        let v_type = if v.is_null() {
            "<null>".to_string()
        } else {
            let vt = mem.read_remote_ptr(*v + object_off.vtable)?;
            if vt.is_null() {
                "<null vtable>".to_string()
            } else {
                let kl = mem.read_remote_ptr(vt + vtable_off.klass)?;
                let nptr = mem.read_remote_ptr(kl + class_off.name)?;
                let nsptr = mem.read_remote_ptr(kl + class_off.name_space)?;
                let nm = if nptr.is_null() {
                    String::new()
                } else {
                    mem.read_cstring(nptr, 256).unwrap_or_default()
                };
                let ns = if nsptr.is_null() {
                    String::new()
                } else {
                    mem.read_cstring(nsptr, 256).unwrap_or_default()
                };
                if ns.is_empty() {
                    nm
                } else {
                    format!("{}.{}", ns, nm)
                }
            }
        };
        println!(
            "  #{:02}  key={}  value={}  type={}",
            i, k, v, v_type
        );
    }

    Ok(())
}
