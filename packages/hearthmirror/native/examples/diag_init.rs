//! Minimal diagnostic: just try MonoRuntime::init() steps one at a time.

use hearthmirror_native::process::{find_pid, enumerate_modules_32bit};
use hearthmirror_native::handle::OwnedProcessHandle;
use hearthmirror_native::memory::ProcessMemory;
use hearthmirror_native::remote_ptr::RemotePtr;
use pelite::pe32::Pe;

fn main() {
    println!("Step 1: find_pid");
    let pid = match find_pid("Hearthstone.exe") {
        Ok(Some(pid)) => { println!("  PID: {}", pid); pid },
        Ok(None) => { println!("  Not found"); return; },
        Err(e) => { println!("  Error: {}", e); return; },
    };

    println!("Step 2: open handle");
    let handle = match OwnedProcessHandle::open(pid) {
        Ok(h) => { println!("  OK"); h },
        Err(e) => { println!("  Error: {}", e); return; },
    };

    println!("Step 3: enumerate modules");
    let modules = match enumerate_modules_32bit(&handle) {
        Ok(m) => { println!("  Found {} modules", m.len()); m },
        Err(e) => { println!("  Error: {}", e); return; },
    };

    let mono = modules.iter().find(|m| m.name.to_lowercase().contains("mono"));
    match mono {
        Some(m) => println!("  Mono module: {} at {:?} (size: {})", m.name, m.base, m.size),
        None => { println!("  No mono module found!"); return; },
    };
    let mono = mono.unwrap();

    println!("Step 4: read PE bytes");
    let memory = ProcessMemory::new(handle);
    let base_addr = unsafe { std::mem::transmute::<_, isize>(mono.base) } as u32;
    // Read the FULL module — the bug in runtime.rs caps at 1MB which is too small
    let pe_size = mono.size as usize;
    println!("  Reading {} bytes (full module) from 0x{:08X}", pe_size, base_addr);
    let pe_bytes = match memory.read_bytes(RemotePtr::new(base_addr), pe_size) {
        Ok(b) => { println!("  Read {} bytes OK", b.len()); b },
        Err(e) => { println!("  Error: {}", e); return; },
    };

    println!("Step 5: pelite PeView::module");
    println!("  pe_bytes ptr: {:p}, len: {}", pe_bytes.as_ptr(), pe_bytes.len());
    let pe = unsafe { pelite::pe32::PeView::module(pe_bytes.as_ptr()) };
    println!("  PeView created OK");

    println!("Step 6: find mono_get_root_domain export");
    let mut root_domain_rva = 0u32;
    match pe.exports() {
        Ok(exports) => {
            println!("  exports OK");
            match exports.by() {
                Ok(by) => {
                    println!("  by-name table OK");
                    match by.name("mono_get_root_domain") {
                        Ok(func) => {
                            match func {
                                pelite::pe32::exports::Export::Symbol(rva) => {
                                    root_domain_rva = *rva;
                                    println!("  Found export RVA: 0x{:08X}", rva);
                                    println!("  VA: 0x{:08X}", base_addr + rva);
                                },
                                _ => println!("  Forwarded export"),
                            }
                        },
                        Err(e) => println!("  Export not found: {}", e),
                    }
                },
                Err(e) => println!("  by-name failed: {}", e),
            }
        },
        Err(e) => println!("  exports failed: {}", e),
    }

    if root_domain_rva != 0 {
        println!("Step 7: extract root domain address");
        let func_va = RemotePtr::new(base_addr + root_domain_rva);
        let bytes = memory.read_bytes(func_va, 16).unwrap();
        println!("  First 16 bytes of mono_get_root_domain: {:02X?}", bytes);

        // Pattern A: A1 [4 bytes addr] C3
        if bytes[0] == 0xA1 && bytes[5] == 0xC3 {
            let addr = u32::from_le_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]);
            println!("  Pattern A match — global addr: 0x{:08X}", addr);

            println!("Step 8: read root domain pointer");
            match memory.read_bytes(RemotePtr::new(addr), 4) {
                Ok(b) => {
                    let domain = u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
                    println!("  Root domain: 0x{:08X}", domain);
                },
                Err(e) => println!("  Error reading root domain: {}", e),
            }
        } else if bytes[0..3] == [0x55, 0x89, 0xE5] && bytes[3] == 0xA1 {
            let addr = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
            println!("  Pattern B match — global addr: 0x{:08X}", addr);
        } else {
            println!("  Unknown disasm pattern");
        }
    }

    println!("Done!");
}
