//! Enumerate every class in Assembly-CSharp and dump names that match
//! a search filter. Used to locate renamed classes (e.g. NetCache, etc.)
//! that no longer match the constants in `reflection::field_paths`.
//!
//! Usage:
//!   cargo run --release --example diag_class_names -- <substring> [<substring>...]
//!
//! Examples:
//!   cargo run --release --example diag_class_names -- NetCache
//!   cargo run --release --example diag_class_names -- Net Cache Account BattleTag
//!
//! Prints every class in Assembly-CSharp whose `full_name` contains any of
//! the given substrings (case-insensitive).

use hearthmirror_native::collections::glist;
use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::image::MonoImage;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::remote_ptr::RemotePtr;

fn main() -> Result<(), ScryError> {
    let needles: Vec<String> = std::env::args()
        .skip(1)
        .map(|s| s.to_lowercase())
        .collect();
    if needles.is_empty() {
        eprintln!("usage: diag_class_names <substring> [<substring>...]");
        std::process::exit(2);
    }

    let rt = MonoRuntime::init()?;

    let ac_image = find_ac_image(&rt)?;
    let image = MonoImage::new(&rt, ac_image);
    let img_name = image.name().unwrap_or_default();
    println!("=== diag_class_names: image={} @ {} ===", img_name, ac_image);

    let classes = image.enumerate_classes()?;
    println!("Enumerated {} classes total", classes.len());
    println!("Searching for: {:?}", needles);
    println!();

    let mut hits = 0usize;
    for c in &classes {
        let lower = c.full_name.to_lowercase();
        if needles.iter().any(|n| lower.contains(n)) {
            println!("  {}  @ {}", c.full_name, c.addr);
            hits += 1;
        }
    }
    println!();
    println!("Found {} matches", hits);
    Ok(())
}

fn find_ac_image(rt: &MonoRuntime) -> Result<RemotePtr, ScryError> {
    let domain_off = &rt.offsets.structs.domain;
    let assembly_off = &rt.offsets.structs.assembly;
    let image_off = &rt.offsets.structs.image;

    let head = rt
        .memory
        .read_remote_ptr(rt.root_domain + domain_off.domain_assemblies)?;
    let assemblies = glist::iter(&rt.memory, head, 500)?;
    for asm in assemblies {
        if asm.is_null() {
            continue;
        }
        let img = rt.memory.read_remote_ptr(asm + assembly_off.image)?;
        if img.is_null() {
            continue;
        }
        let name_ptr = rt.memory.read_remote_ptr(img + image_off.name)?;
        if name_ptr.is_null() {
            continue;
        }
        let name = rt.memory.read_cstring(name_ptr, 256).unwrap_or_default();
        if name.ends_with("Assembly-CSharp.dll") || name == "Assembly-CSharp" {
            return Ok(img);
        }
    }
    Err(ScryError::ModuleNotFound("Assembly-CSharp".into()))
}
