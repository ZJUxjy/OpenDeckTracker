//! Diagnose `find_ac_image_cached` by walking `MonoDomain.domain_assemblies`
//! and, for each `MonoAssembly*` it yields, dumping enough of the structure
//! to figure out where `MonoImage.name` actually lives in this Unity build.
//!
//! Background: `dump_reflection` fails at `ReadProcessMemory(0x15)` for all
//! 12 methods. The `0x15` strongly looks like a small int (e.g. `ref_count`)
//! being misread as a `char*` because `MonoImage.name` is at the wrong
//! offset in `unity-2021.3.json`.
//!
//! For each candidate offset 0x00..0x80 (4-byte aligned) we read the u32,
//! treat it as a `char*`, try `read_cstring(name_ptr, 128)`, and print the
//! first 60 chars when it succeeds. The slot whose string contains
//! `"Assembly-CSharp"` (or any `.dll` / file path) is the real
//! `MonoImage.name`.

use hearthmirror_native::collections::glist;
use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::MonoRuntime;

fn main() -> Result<(), ScryError> {
    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;
    let off = &rt.offsets;

    let assemblies_head = mem.read_remote_ptr(rt.root_domain + off.structs.domain.domain_assemblies)?;
    println!(
        "root_domain={} domain_assemblies head={} (offset +0x{:X})",
        rt.root_domain, assemblies_head, off.structs.domain.domain_assemblies
    );

    let assembly_ptrs = glist::iter(mem, assemblies_head, 500)?;
    println!("walked GSList → {} assembly pointers", assembly_ptrs.len());

    for (i, asm_ptr) in assembly_ptrs.iter().enumerate().take(20) {
        if asm_ptr.is_null() {
            println!("\n[{:2}] NULL assembly pointer", i);
            continue;
        }
        println!("\n[{:2}] MonoAssembly* = {}", i, asm_ptr);

        // Dump the assembly's first 0x60 bytes so we can eyeball where
        // image_ptr actually lives (JSON says +0x40, but that's $confidence: MED).
        println!("  --- MonoAssembly first 0x60 bytes ---");
        match mem.read_bytes(*asm_ptr, 0x60) {
            Ok(bytes) => {
                for chunk_off in (0..0x60).step_by(16) {
                    let chunk = &bytes[chunk_off..chunk_off + 16];
                    let hex: Vec<String> = chunk.iter().map(|b| format!("{:02X}", b)).collect();
                    println!("    +0x{:02X}  {}", chunk_off, hex.join(" "));
                }
            }
            Err(e) => {
                println!("    <ERR reading assembly bytes: {}>", e);
                continue;
            }
        }

        // For every candidate slot in the assembly, try to follow it to a string
        // and see if it looks like a module name.
        println!("  --- candidate string-pointer slots in MonoAssembly ---");
        if let Ok(asm_bytes) = mem.read_bytes(*asm_ptr, 0x60) {
            for slot_off in (0..0x60).step_by(4) {
                let candidate = u32::from_le_bytes([
                    asm_bytes[slot_off],
                    asm_bytes[slot_off + 1],
                    asm_bytes[slot_off + 2],
                    asm_bytes[slot_off + 3],
                ]);
                if candidate < 0x10000 {
                    continue;
                }
                if let Ok(s) =
                    mem.read_cstring(hearthmirror_native::remote_ptr::RemotePtr::new(candidate), 128)
                {
                    if !s.is_empty() && s.is_ascii() {
                        let trimmed: String = s.chars().take(60).collect();
                        println!(
                            "    asm+0x{:02X} → {:#010X} → {:?}",
                            slot_off, candidate, trimmed
                        );
                    }
                }
            }
        }

        // Read what JSON claims is image_ptr at +0x40.
        let image_ptr_via_json = match mem.read_remote_ptr(*asm_ptr + off.structs.assembly.image) {
            Ok(p) => {
                println!(
                    "  image_ptr (via JSON +0x{:X}) = {}",
                    off.structs.assembly.image, p
                );
                p
            }
            Err(e) => {
                println!("  <ERR reading image_ptr at +0x{:X}: {}>", off.structs.assembly.image, e);
                continue;
            }
        };

        if image_ptr_via_json.is_null() {
            println!("  → NULL, skipping image scan");
            continue;
        }

        // Dump MonoImage's first 0x60 bytes + scan for string-pointer slots.
        println!("  --- MonoImage first 0x60 bytes ---");
        match mem.read_bytes(image_ptr_via_json, 0x60) {
            Ok(img_bytes) => {
                for chunk_off in (0..0x60).step_by(16) {
                    let chunk = &img_bytes[chunk_off..chunk_off + 16];
                    let hex: Vec<String> = chunk.iter().map(|b| format!("{:02X}", b)).collect();
                    println!("    +0x{:02X}  {}", chunk_off, hex.join(" "));
                }

                println!("  --- candidate string-pointer slots in MonoImage ---");
                for slot_off in (0..0x60).step_by(4) {
                    let candidate = u32::from_le_bytes([
                        img_bytes[slot_off],
                        img_bytes[slot_off + 1],
                        img_bytes[slot_off + 2],
                        img_bytes[slot_off + 3],
                    ]);
                    if candidate < 0x10000 {
                        let small_marker = if candidate > 0 && candidate < 256 {
                            format!(" (small int {})", candidate)
                        } else {
                            String::new()
                        };
                        if !small_marker.is_empty() {
                            println!("    img+0x{:02X} = {:#X}{}", slot_off, candidate, small_marker);
                        }
                        continue;
                    }
                    if let Ok(s) = mem.read_cstring(
                        hearthmirror_native::remote_ptr::RemotePtr::new(candidate),
                        128,
                    ) {
                        if !s.is_empty() && s.is_ascii() {
                            let trimmed: String = s.chars().take(60).collect();
                            println!(
                                "    img+0x{:02X} → {:#010X} → {:?}",
                                slot_off, candidate, trimmed
                            );
                        }
                    }
                }
            }
            Err(e) => println!("    <ERR reading image bytes: {}>", e),
        }
    }

    Ok(())
}
