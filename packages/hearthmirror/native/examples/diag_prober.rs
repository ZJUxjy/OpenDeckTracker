//! Diagnose `OffsetProber` by hex-dumping + disassembling each critical
//! Mono export that the prober probes. Use when `probe_all` returns a
//! displacement that fails the sanity check (e.g. `MonoClass.name = 0xE10`
//! when the embedded baseline says 0x2C).
//!
//! Output for each export:
//!   - VA + first 64 bytes (hex)
//!   - iced-x86 disassembly until first `ret` or 32 instructions
//!   - what `find_field_load_displacement` would return
//!
//! Usage:
//!   cargo run --example diag_prober

use hearthmirror_native::disasm;
use hearthmirror_native::handle::OwnedProcessHandle;
use hearthmirror_native::memory::ProcessMemory;
use hearthmirror_native::mono::probe::read_exports_map;
use hearthmirror_native::process::{enumerate_modules_32bit, find_pid};
use hearthmirror_native::remote_ptr::RemotePtr;
use iced_x86::{Decoder, DecoderOptions, FastFormatter, Instruction};

const CRITICAL_EXPORTS: &[(&str, &str, u32)] = &[
    ("mono_class_get_name", "MonoClass.name", 0x2C),
    ("mono_class_get_namespace", "MonoClass.name_space", 0x30),
    ("mono_class_get_fields", "MonoClass.fields", 0x60),
    ("mono_class_get_image", "MonoClass.image", 0x28),
    ("mono_image_get_name", "MonoImage.name", 0x14),
    ("mono_assembly_get_image", "MonoAssembly.image", 0x40),
];

const BEST_EFFORT_EXPORTS: &[(&str, &str, u32)] = &[
    ("mono_class_get_parent", "MonoClass.parent", 0x20),
    ("mono_field_get_offset", "MonoClassField.offset", 0xC),
    ("mono_field_get_name", "MonoClassField.name", 0x4),
    ("mono_field_get_type", "MonoClassField.type", 0x0),
];

fn main() {
    let pid = match find_pid("Hearthstone.exe") {
        Ok(Some(pid)) => pid,
        Ok(None) => {
            println!("Hearthstone.exe not running");
            return;
        }
        Err(e) => {
            println!("find_pid error: {}", e);
            return;
        }
    };
    println!("Hearthstone PID: {}", pid);

    let handle = match OwnedProcessHandle::open(pid) {
        Ok(h) => h,
        Err(e) => {
            println!("open handle error: {}", e);
            return;
        }
    };
    let memory = ProcessMemory::new(handle);

    let modules = match enumerate_modules_32bit(memory.handle()) {
        Ok(m) => m,
        Err(e) => {
            println!("enumerate_modules error: {}", e);
            return;
        }
    };
    let mono = match modules.iter().find(|m| m.name.to_lowercase().contains("mono")) {
        Some(m) => m,
        None => {
            println!("no mono module found");
            return;
        }
    };
    println!("Mono module: {} @ 0x{:08X} (size 0x{:X})", mono.name, mono.base.0 as u32, mono.size);

    let exports = match read_exports_map(&memory, mono) {
        Ok(e) => e,
        Err(e) => {
            println!("read_exports_map error: {}", e);
            return;
        }
    };
    println!("Exports map: {} entries\n", exports.len());

    println!("=== CRITICAL ===");
    for (name, field, expected) in CRITICAL_EXPORTS {
        dump_export(&memory, &exports, name, field, *expected);
    }
    println!("\n=== BEST-EFFORT ===");
    for (name, field, expected) in BEST_EFFORT_EXPORTS {
        dump_export(&memory, &exports, name, field, *expected);
    }
}

fn dump_export(
    memory: &ProcessMemory,
    exports: &std::collections::HashMap<String, RemotePtr>,
    name: &str,
    field: &str,
    expected: u32,
) {
    println!("\n--- {} (-> {}, expected 0x{:X}) ---", name, field, expected);
    let va = match exports.get(name) {
        Some(v) => *v,
        None => {
            println!("  EXPORT MISSING");
            return;
        }
    };
    println!("  VA: {}", va);

    let bytes = match memory.read_bytes(va, disasm::DEFAULT_PROBE_WINDOW) {
        Ok(b) => b,
        Err(e) => {
            println!("  read_bytes error: {}", e);
            return;
        }
    };

    let head_len = 64.min(bytes.len());
    let hex: Vec<String> = bytes[..head_len].iter().map(|b| format!("{:02X}", b)).collect();
    println!("  First {} bytes:", head_len);
    for chunk in hex.chunks(16) {
        println!("    {}", chunk.join(" "));
    }

    println!("  Disasm (until first ret or 32 instr):");
    let mut decoder = Decoder::with_ip(32, &bytes, va.raw() as u64, DecoderOptions::NONE);
    let mut instr = Instruction::default();
    let mut formatter = FastFormatter::new();
    let mut output = String::new();
    let mut count = 0;
    let mut last_field_disp: Option<u32> = None;
    while decoder.can_decode() && count < 32 {
        decoder.decode_out(&mut instr);
        if instr.is_invalid() {
            println!("    [invalid instruction at offset {}]", count);
            break;
        }
        output.clear();
        formatter.format(&instr, &mut output);
        let marker = if is_field_load_candidate(&instr) {
            let disp = instr.memory_displacement32();
            last_field_disp = Some(disp);
            format!(" <- candidate disp=0x{:X}", disp)
        } else {
            String::new()
        };
        println!("    0x{:08X}  {}{}", instr.ip(), output, marker);
        count += 1;
        if matches!(instr.mnemonic(), iced_x86::Mnemonic::Ret | iced_x86::Mnemonic::Retf) {
            break;
        }
    }

    let helper_result = disasm::find_field_load_displacement(&bytes, 32);
    println!(
        "  find_field_load_displacement => {} (last candidate seen: {})",
        helper_result.map_or("None".to_string(), |v| format!("0x{:X}", v)),
        last_field_disp.map_or("None".to_string(), |v| format!("0x{:X}", v))
    );
    if let Some(v) = helper_result {
        let verdict = if v == expected {
            "MATCH baseline"
        } else if (0..=0x200).contains(&v) {
            "differs from baseline but plausible"
        } else {
            "IMPLAUSIBLE (likely wrong instruction matched)"
        };
        println!("  vs expected 0x{:X}: {}", expected, verdict);
    }
}

fn is_field_load_candidate(instr: &Instruction) -> bool {
    use iced_x86::{Mnemonic, OpKind, Register};
    instr.mnemonic() == Mnemonic::Mov
        && instr.op_count() == 2
        && instr.op0_kind() == OpKind::Register
        && instr.op1_kind() == OpKind::Memory
        && instr.memory_base() != Register::None
}
