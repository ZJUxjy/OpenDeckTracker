//! List every `MonoImage` (DLL/assembly) loaded into the target Mono
//! domain, and optionally search for a class by `<Namespace>.<Name>`
//! across all of them.
//!
//! `MonoRuntime::find_class` is currently scoped to `Assembly-CSharp.dll`
//! (the game's main script DLL). Many engine/runtime types — most
//! notably `Blizzard.T5.Services.ServiceManager` — live in companion
//! assemblies (e.g. `Blizzard.T5.Services.dll`). When `find_class`
//! returns `ClassNotFound`, this tool tells you which image actually
//! contains the type so the search can be widened deliberately.
//!
//! Usage:
//!   cargo run --release --example diag_images
//!   cargo run --release --example diag_images -- Blizzard.T5.Services.ServiceManager
//!
//! With no args: prints just the image roster. With one arg
//! (`Namespace.Name` or just `Name`): also walks each image's
//! `class_cache` and reports every match.

use hearthmirror_native::collections::glist;
use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::image::MonoImage;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::remote_ptr::RemotePtr;

fn main() -> Result<(), ScryError> {
    let needle = std::env::args().nth(1);
    let (target_ns, target_name) = match needle.as_deref() {
        Some(full) => match full.rsplit_once('.') {
            Some((ns, n)) => (ns.to_string(), n.to_string()),
            None => (String::new(), full.to_string()),
        },
        None => (String::new(), String::new()),
    };

    let rt = MonoRuntime::init()?;
    let domain_off = &rt.offsets.structs.domain;
    let assembly_off = &rt.offsets.structs.assembly;
    let image_off = &rt.offsets.structs.image;

    let head = rt
        .memory
        .read_remote_ptr(rt.root_domain + domain_off.domain_assemblies)?;
    let assemblies = glist::iter(&rt.memory, head, 500)?;

    println!("=== diag_images: {} assemblies in domain ===", assemblies.len());
    if !target_name.is_empty() {
        println!("Searching for: namespace={:?}  name={:?}", target_ns, target_name);
    }
    println!();

    let mut images: Vec<(String, RemotePtr)> = Vec::with_capacity(assemblies.len());
    for asm in &assemblies {
        if asm.is_null() {
            continue;
        }
        let img = rt.memory.read_remote_ptr(*asm + assembly_off.image)?;
        if img.is_null() {
            continue;
        }
        let name_ptr = rt.memory.read_remote_ptr(img + image_off.name)?;
        let name = if name_ptr.is_null() {
            "<null>".into()
        } else {
            rt.memory.read_cstring(name_ptr, 512).unwrap_or_default()
        };
        images.push((name, img));
    }

    let mut total_classes = 0usize;
    let mut total_hits = 0usize;
    for (name, img) in &images {
        let monoimg = MonoImage::new(&rt, *img);
        let count = match monoimg.enumerate_classes() {
            Ok(cs) => {
                total_classes += cs.len();
                let hits: Vec<_> = cs
                    .iter()
                    .filter(|c| {
                        if target_name.is_empty() {
                            return false;
                        }
                        let lname = c.full_name.split('.').next_back().unwrap_or("");
                        let lns = c.full_name.rsplit_once('.').map(|(a, _)| a).unwrap_or("");
                        lname == target_name
                            && (target_ns.is_empty() || lns == target_ns)
                    })
                    .collect();
                if !hits.is_empty() {
                    println!("  ★ {} ({} classes) — HITS:", short_name(name), cs.len());
                    for h in &hits {
                        println!("      {}  @ {}", h.full_name, h.addr);
                        total_hits += 1;
                    }
                } else {
                    println!("    {} ({} classes)", short_name(name), cs.len());
                }
                cs.len()
            }
            Err(e) => {
                println!("    {} <enumerate err: {}>", short_name(name), e);
                0
            }
        };
        let _ = count;
    }
    println!();
    println!(
        "Total: {} images, {} classes, {} hits",
        images.len(),
        total_classes,
        total_hits
    );
    Ok(())
}

fn short_name(full_path: &str) -> String {
    full_path
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(full_path)
        .to_string()
}
