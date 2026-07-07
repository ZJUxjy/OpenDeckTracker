//! x86 disassembly helpers for Mono offset probing.
//!
//! These helpers wrap [`iced_x86::Decoder`] for the two recognition patterns
//! used by [`crate::mono::probe::OffsetProber`]:
//!
//! 1. **Absolute 32-bit memory load** (`MOV reg, ds:[imm32]`) — used to recover
//!    the address of a static field stored in the export prologue, e.g.
//!    `mono_get_root_domain` returns the global root-domain pointer.
//! 2. **Base + small displacement load** (`MOV reg, [base+disp8/disp32]`) —
//!    used to recover the byte offset of a struct field accessed by a public
//!    Mono export, e.g. `mono_class_get_name` reads `MonoClass.name @ +0x2C`.
//!
//! Both helpers operate on raw byte slices and return `None` when no matching
//! instruction is found or when decoding fails on a truncated buffer. They
//! never panic.

use iced_x86::{Decoder, DecoderOptions, Instruction, Mnemonic, OpKind, Register};

/// Default number of bytes to feed the decoder when probing an export.
///
/// 256 bytes covers the prologue + first few real instructions of typical
/// Mono exports, where the field-access pattern lives. Larger windows risk
/// matching the wrong instruction; smaller windows risk missing it.
pub const DEFAULT_PROBE_WINDOW: usize = 256;

/// Scan `bytes` for the first instruction matching `MOV reg, ds:[imm32]`
/// (32-bit absolute memory load) and return the absolute displacement value.
///
/// `bitness` MUST be 32 — pattern selection is bitness-specific. Returns
/// `None` if no matching instruction is found, if `bitness != 32`, or if the
/// decoder produces an invalid instruction (truncated input, unknown opcode).
pub fn find_first_absolute_load(bytes: &[u8], bitness: u32) -> Option<u32> {
    if bitness != 32 {
        return None;
    }
    let mut decoder = Decoder::new(bitness, bytes, DecoderOptions::NONE);
    let mut instr = Instruction::default();
    while decoder.can_decode() {
        decoder.decode_out(&mut instr);
        if instr.is_invalid() {
            return None;
        }
        if instr.mnemonic() == Mnemonic::Mov
            && instr.op_count() == 2
            && instr.op0_kind() == OpKind::Register
            && instr.op1_kind() == OpKind::Memory
            && instr.memory_base() == Register::None
            && instr.memory_index() == Register::None
            && instr.memory_displ_size() >= 4
        {
            return Some(instr.memory_displacement32());
        }
    }
    None
}

/// Scan for the first global-pointer load used by `mono_get_root_domain`.
///
/// * 32-bit Mono uses `MOV reg, ds:[imm32]`; returns the absolute imm32.
/// * 64-bit Mono normally uses RIP-relative memory operands such as
///   `MOV reg, [rip+disp32]`; returns the resolved effective address.
pub fn find_first_global_pointer_load(bytes: &[u8], bitness: u32, ip: u64) -> Option<u64> {
    if bitness == 32 {
        return find_first_absolute_load(bytes, bitness).map(u64::from);
    }
    if bitness != 64 {
        return None;
    }

    let mut decoder = Decoder::with_ip(bitness, bytes, ip, DecoderOptions::NONE);
    let mut instr = Instruction::default();
    while decoder.can_decode() {
        decoder.decode_out(&mut instr);
        if instr.is_invalid() {
            return None;
        }
        if instr.mnemonic() == Mnemonic::Mov
            && instr.op_count() == 2
            && instr.op0_kind() == OpKind::Register
            && instr.op1_kind() == OpKind::Memory
            && instr.memory_base() == Register::RIP
            && instr.memory_index() == Register::None
        {
            return Some(instr.memory_displacement64());
        }
    }
    None
}

/// Scan `bytes` for the **last** instruction matching `MOV reg, [base+disp]`
/// (load through a base register with a constant displacement) and return
/// the displacement value.
///
/// "Last" because Mono export prologues commonly do `mov eax, [ecx]` to load
/// a vtable / outer field first, then the *real* field-of-interest read
/// follows. Picking the last match before the function returns yields the
/// target offset.
///
/// `bitness` MUST be 32 or 64. Returns `None` if no matching instruction is
/// found, if the bitness is unsupported, or on decoder failure.
pub fn find_field_load_displacement(bytes: &[u8], bitness: u32) -> Option<u32> {
    if bitness != 32 && bitness != 64 {
        return None;
    }
    let mut decoder = Decoder::new(bitness, bytes, DecoderOptions::NONE);
    let mut instr = Instruction::default();
    let mut last: Option<u32> = None;
    while decoder.can_decode() {
        decoder.decode_out(&mut instr);
        if instr.is_invalid() {
            break;
        }
        if instr.mnemonic() == Mnemonic::Ret || instr.mnemonic() == Mnemonic::Retf {
            break;
        }
        if instr.mnemonic() == Mnemonic::Mov
            && instr.op_count() == 2
            && instr.op0_kind() == OpKind::Register
            && instr.op1_kind() == OpKind::Memory
            && instr.memory_base() != Register::None
            && instr.memory_base() != Register::RIP
            && instr.memory_index() == Register::None
        {
            let displ = instr.memory_displacement64();
            if displ <= 0x400 {
                last = Some(displ as u32);
            }
        }
    }
    last
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absolute_load_recognized_in_canonical_pattern() {
        // mov eax, ds:[0x12345678] ; ret
        let bytes = [0xA1, 0x78, 0x56, 0x34, 0x12, 0xC3];
        assert_eq!(find_first_absolute_load(&bytes, 32), Some(0x1234_5678));
    }

    #[test]
    fn field_load_displacement_recognized_in_canonical_pattern() {
        // mov eax, [ecx+0Ch] ; ret
        let bytes = [0x8B, 0x41, 0x0C, 0xC3];
        assert_eq!(find_field_load_displacement(&bytes, 32), Some(0x0C));
    }

    #[test]
    fn field_load_displacement_recognized_in_x64_pattern() {
        // mov rax, [rcx+28h] ; ret
        let bytes = [0x48, 0x8B, 0x41, 0x28, 0xC3];
        assert_eq!(find_field_load_displacement(&bytes, 64), Some(0x28));
    }

    #[test]
    fn field_load_displacement_skips_x64_indexed_tls_noise() {
        // mov rcx, [rdx+rax*8+1480h] ; thunk TLS lookup noise
        // mov rax, [rdi+50h]         ; actual field load
        // ret
        let bytes = [
            0x48, 0x8B, 0x8C, 0xC2, 0x80, 0x14, 0x00, 0x00, 0x48, 0x8B, 0x47, 0x50, 0xC3,
        ];
        assert_eq!(find_field_load_displacement(&bytes, 64), Some(0x50));
    }

    #[test]
    fn field_load_displacement_ignores_late_x64_indexed_tls_noise() {
        // mov rax, [rdi+50h]         ; actual field load
        // mov rcx, [rdx+rax*8+1480h] ; later thunk TLS lookup noise
        // ret
        let bytes = [
            0x48, 0x8B, 0x47, 0x50, 0x48, 0x8B, 0x8C, 0xC2, 0x80, 0x14, 0x00, 0x00, 0xC3,
        ];
        assert_eq!(find_field_load_displacement(&bytes, 64), Some(0x50));
    }

    #[test]
    fn field_load_displacement_ignores_x64_global_and_large_tls_noise() {
        // mov rax, [rdi+50h]          ; actual field load
        // mov eax, [rip+123456h]      ; global flag
        // mov rdx, [rcx+1780h]        ; TLS/profiling slot, not a struct field
        // ret
        let bytes = [
            0x48, 0x8B, 0x47, 0x50, 0x8B, 0x05, 0x56, 0x34, 0x12, 0x00, 0x48, 0x8B, 0x91, 0x80,
            0x17, 0x00, 0x00, 0xC3,
        ];
        assert_eq!(find_field_load_displacement(&bytes, 64), Some(0x50));
    }

    #[test]
    fn neither_helper_matches_nop_only_function() {
        // nop ; nop ; ret
        let bytes = [0x90, 0x90, 0xC3];
        assert_eq!(find_first_absolute_load(&bytes, 32), None);
        assert_eq!(find_field_load_displacement(&bytes, 32), None);
    }

    #[test]
    fn neither_helper_panics_on_truncated_input() {
        // 0xA1 expects 4-byte immediate but only 1 byte follows
        let bytes = [0xA1, 0x78];
        assert_eq!(find_first_absolute_load(&bytes, 32), None);
        assert_eq!(find_field_load_displacement(&bytes, 32), None);
    }

    #[test]
    fn invalid_bitness_returns_none() {
        let bytes = [0xA1, 0x78, 0x56, 0x34, 0x12, 0xC3];
        assert_eq!(find_first_absolute_load(&bytes, 64), None);
        assert_eq!(find_field_load_displacement(&bytes, 16), None);
    }

    #[test]
    fn global_load_recognizes_x64_rip_relative_pattern() {
        // mov rax, [rip+1234h] ; ret
        // The effective address is next_ip (base + 7) + 0x1234.
        let bytes = [0x48, 0x8B, 0x05, 0x34, 0x12, 0x00, 0x00, 0xC3];
        assert_eq!(
            find_first_global_pointer_load(&bytes, 64, 0x0000_7FF6_1000_0000),
            Some(0x0000_7FF6_1000_123B)
        );
    }

    #[test]
    fn field_load_picks_last_field_access_before_ret() {
        // mov eax, [ecx]    ; vtable load
        // mov eax, [eax+10h] ; field load (the one we want)
        // ret
        let bytes = [0x8B, 0x01, 0x8B, 0x40, 0x10, 0xC3];
        assert_eq!(find_field_load_displacement(&bytes, 32), Some(0x10));
    }
}
