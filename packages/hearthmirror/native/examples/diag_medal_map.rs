//! Iterate `NetCacheMedalInfo.MedalData` (a `Blizzard.T5.Core.Map<K, V>`) and
//! dump every (key, value) pair's runtime type + raw header. Used to
//! discover the medal ladder schema for `getMedalInfo` Phase 2.

use hearthmirror_native::collections::custom_map;
use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::class::read_mono_class;
use hearthmirror_native::mono::object::MonoObject;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::remote_ptr::RemotePtr;

fn klass_full_name(rt: &MonoRuntime, addr: RemotePtr) -> Result<String, ScryError> {
    if addr.is_null() {
        return Ok("<null>".into());
    }
    let mem = &rt.memory;
    let object_off = &rt.offsets.structs.object;
    let vtable_off = &rt.offsets.structs.vtable;
    let class_off = &rt.offsets.structs.class;
    let vt = mem.read_remote_ptr(addr + object_off.vtable)?;
    if vt.is_null() {
        return Ok("<null vt>".into());
    }
    let kl = mem.read_remote_ptr(vt + vtable_off.klass)?;
    if kl.is_null() {
        return Ok("<null kl>".into());
    }
    let np = mem.read_remote_ptr(kl + class_off.name)?;
    let nsp = mem.read_remote_ptr(kl + class_off.name_space)?;
    let n = if np.is_null() {
        String::new()
    } else {
        mem.read_cstring(np, 256)?
    };
    let ns = if nsp.is_null() {
        String::new()
    } else {
        mem.read_cstring(nsp, 256)?
    };
    Ok(if ns.is_empty() {
        n
    } else {
        format!("{}.{}", ns, n)
    })
}

fn main() -> Result<(), ScryError> {
    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;

    let net_cache = rt.get_service("NetCache")?.expect("NetCache service");
    let map_ptr = net_cache
        .read_pointer_field(mem, "m_netCache")?
        .expect("m_netCache");

    let entries = custom_map::iter_entries(mem, map_ptr, 4096)?;

    let mut medal_info_ptr = RemotePtr::NULL;
    for (_k, v) in &entries {
        let n = klass_full_name(&rt, *v)?;
        if n.contains("NetCacheMedalInfo") {
            medal_info_ptr = *v;
            break;
        }
    }
    if medal_info_ptr.is_null() {
        eprintln!("NetCacheMedalInfo not in map");
        std::process::exit(2);
    }

    let medal_info =
        MonoObject::from_address(mem, medal_info_ptr, rt.offsets.clone())?.expect("medal info");

    let medal_data = medal_info
        .read_pointer_field(mem, "MedalData")?
        .expect("MedalData null");
    println!("MedalData (Map) @ {}", medal_data);

    println!("MedalData header u32 [+0x00..+0x40]:");
    for off in (0..0x40_u32).step_by(4) {
        let v = mem.read_u32(medal_data + off)?;
        println!("  +0x{:02X} = 0x{:08X} ({})", off, v, v);
    }

    let inner = custom_map::iter_entries(mem, medal_data, 4096)?;
    println!("\nMedalData entries = {}", inner.len());

    for (i, (k, v)) in inner.iter().enumerate() {
        let kn = klass_full_name(&rt, *k).unwrap_or_default();
        let vn = klass_full_name(&rt, *v).unwrap_or_default();
        println!(
            "\n#{:02}  key={} ({})  value={} ({})",
            i, k, kn, v, vn
        );

        // Key may be a boxed enum — dump first 16 bytes
        if !k.is_null() {
            print!("  key bytes: ");
            for off in (0..0x10_u32).step_by(4) {
                if let Ok(w) = mem.read_u32(*k + off) {
                    print!("[+{:02X}=0x{:08X}] ", off, w);
                }
            }
            println!();
        }

        if v.is_null() {
            continue;
        }

        // Value class fields
        let class_addr = {
            let vt = mem.read_remote_ptr(*v + rt.offsets.structs.object.vtable)?;
            mem.read_remote_ptr(vt + rt.offsets.structs.vtable.klass)?
        };
        let class = read_mono_class(mem, class_addr, rt.offsets.clone())?;
        let merged = class.fields_recursive(mem)?;
        println!("  value class: {} (declared+inherited fields = {})", class.full_name, merged.len());
        let mut sorted: Vec<_> = merged.iter().collect();
        sorted.sort_by_key(|(_, f)| f.offset);
        for (name, f) in &sorted {
            println!("    +0x{:04X}  {}", f.offset, name);
        }

        // Raw value bytes
        println!("  value raw [+0x00..+0x30]:");
        for off in (0..0x30_u32).step_by(4) {
            let w = mem.read_u32(*v + off)?;
            println!("    +0x{:02X} = 0x{:08X} ({})", off, w, w);
        }
    }

    Ok(())
}
