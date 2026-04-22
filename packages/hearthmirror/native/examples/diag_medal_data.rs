//! Probe `NetCacheMedalInfo.MedalData` reached via NetCache map → entry
//! whose runtime type is `NetCacheMedalInfo`. Dump the runtime class,
//! field declarations, and own/inherited field maps so we can pick the
//! right reader for `getMedalInfo`.

use hearthmirror_native::collections::custom_map;
use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::object::MonoObject;
use hearthmirror_native::mono::class::read_mono_class;
use hearthmirror_native::mono::MonoRuntime;

fn klass_name(rt: &MonoRuntime, addr: hearthmirror_native::remote_ptr::RemotePtr)
    -> Result<String, ScryError>
{
    let mem = &rt.memory;
    let object_off = &rt.offsets.structs.object;
    let vtable_off = &rt.offsets.structs.vtable;
    let class_off = &rt.offsets.structs.class;
    let vt = mem.read_remote_ptr(addr + object_off.vtable)?;
    if vt.is_null() { return Ok("<null vt>".into()); }
    let kl = mem.read_remote_ptr(vt + vtable_off.klass)?;
    if kl.is_null() { return Ok("<null kl>".into()); }
    let np = mem.read_remote_ptr(kl + class_off.name)?;
    let nsp = mem.read_remote_ptr(kl + class_off.name_space)?;
    let n = if np.is_null() { String::new() } else { mem.read_cstring(np, 256)? };
    let ns = if nsp.is_null() { String::new() } else { mem.read_cstring(nsp, 256)? };
    Ok(if ns.is_empty() { n } else { format!("{}.{}", ns, n) })
}

fn main() -> Result<(), ScryError> {
    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;

    let net_cache = rt.get_service("NetCache")?.expect("NetCache service");
    let map_ptr = net_cache.read_pointer_field(mem, "m_netCache")?.expect("m_netCache");
    println!("NetCache @ {}, m_netCache @ {}", net_cache.addr, map_ptr);

    let entries = custom_map::iter_entries(mem, map_ptr, 4096)?;
    println!("entries = {}", entries.len());

    for (key, val) in &entries {
        let kn = klass_name(&rt, *key).unwrap_or_default();
        let vn = klass_name(&rt, *val).unwrap_or_default();
        if vn.contains("NetCacheMedalInfo") || vn.contains("Medal") {
            println!("\n>>> hit  key={} ({})  value={} ({})", key, kn, val, vn);

            let medal_info = MonoObject::from_address(mem, *val, rt.offsets.clone())?
                .expect("medal_info");
            println!("NetCacheMedalInfo.fields (own-class):");
            let mut sorted: Vec<_> = medal_info.fields.iter().collect();
            sorted.sort_by_key(|(_, off)| **off);
            for (name, off) in &sorted {
                println!("  +0x{:04X}  {}", off, name);
            }

            // Dump raw header
            println!("raw bytes [+0x00..+0x20]:");
            for off in (0..0x20_u32).step_by(4) {
                let v = mem.read_u32(medal_info.addr + off)?;
                println!("  +0x{:02X} = 0x{:08X} ({})", off, v, v);
            }

            // MedalData
            if let Some(md) = medal_info.read_object_field(mem, "MedalData")? {
                let class_addr = {
                    let vt = mem.read_remote_ptr(md.addr + rt.offsets.structs.object.vtable)?;
                    mem.read_remote_ptr(vt + rt.offsets.structs.vtable.klass)?
                };
                println!("\nMedalData @ {}  class @ {}", md.addr, class_addr);
                println!("MedalData runtime class: {}", klass_name(&rt, md.addr)?);
                let class = read_mono_class(mem, class_addr, rt.offsets.clone())?;
                println!("MedalData class.full_name = {}", class.full_name);
                println!("MedalData class.fields (own-class):");
                let mut sorted: Vec<_> = class.fields.iter().collect();
                sorted.sort_by_key(|(_, off)| **off);
                for (name, off) in &sorted {
                    println!("  +0x{:04X}  {}", off, name);
                }
                let merged = class.fields_recursive(mem)?;
                println!("MedalData fields_recursive (merged with parents): {}", merged.len());
                let mut sorted2: Vec<_> = merged.iter().collect();
                sorted2.sort_by_key(|(_, f)| f.offset);
                for (name, f) in &sorted2 {
                    println!("  +0x{:04X}  {}", f.offset, name);
                }
                println!("MedalData raw bytes [+0x00..+0x40]:");
                for off in (0..0x40_u32).step_by(4) {
                    let v = mem.read_u32(md.addr + off)?;
                    println!("  +0x{:02X} = 0x{:08X} ({})", off, v, v);
                }
            } else {
                println!("MedalData is null");
            }

            // <PreviousMedalInfo>k__BackingField
            if let Some(prev) = medal_info.read_object_field(mem, "<PreviousMedalInfo>k__BackingField")? {
                println!("\nPreviousMedalInfo @ {}", prev.addr);
                println!("Previous runtime class: {}", klass_name(&rt, prev.addr)?);
            } else {
                println!("\nPreviousMedalInfo is null");
            }
        }
    }

    Ok(())
}
