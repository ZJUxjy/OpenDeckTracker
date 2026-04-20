use crate::error::ScryError;
use iced_x86::{Decoder, DecoderOptions, Instruction, Mnemonic, OpKind, Register};

pub const DEFAULT_PROBE_WINDOW: usize = 256;

pub fn find_field_load_displacement(code: &[u8], bitness: u32) -> Result<usize, ScryError> {
    const MAX_FIELD_DISP: u64 = 0x800;

    let mut decoder = Decoder::with_ip(bitness, code, 0, DecoderOptions::NONE);
    let mut instr = Instruction::default();
    let mut last_match: Option<u64> = None;

    while decoder.can_decode() {
        decoder.decode_out(&mut instr);

        if is_struct_field_load(&instr, MAX_FIELD_DISP) {
            last_match = Some(instr.memory_displacement64());
        }

        if instr.mnemonic() == Mnemonic::Ret {
            break;
        }
    }

    last_match.map(|disp| disp as usize).ok_or_else(|| {
        ScryError::DisasmError("no struct-field-load `mov reg, [reg+disp]` found before ret".into())
    })
}

pub fn find_first_absolute_load(code: &[u8], bitness: u32) -> Result<usize, ScryError> {
    let mut decoder = Decoder::with_ip(bitness, code, 0, DecoderOptions::NONE);
    let mut instr = Instruction::default();

    while decoder.can_decode() {
        decoder.decode_out(&mut instr);

        if instr.mnemonic() == Mnemonic::Ret {
            break;
        }

        if is_absolute_load(&instr) {
            return Ok(instr.memory_displacement64() as usize);
        }
    }

    Err(ScryError::DisasmError(
        "no `mov reg, [absolute]` found".into(),
    ))
}

fn is_struct_field_load(instr: &Instruction, max_disp: u64) -> bool {
    if !is_register_indirect_load(instr) {
        return false;
    }

    let base = instr.memory_base();
    if matches!(
        base,
        Register::EBP | Register::ESP | Register::RBP | Register::RSP
    ) {
        return false;
    }

    if instr.memory_index() != Register::None {
        return false;
    }

    instr.memory_displacement64() <= max_disp
}

fn is_register_indirect_load(instr: &Instruction) -> bool {
    instr.mnemonic() == Mnemonic::Mov
        && instr.op_count() == 2
        && instr.op0_kind() == OpKind::Register
        && instr.op1_kind() == OpKind::Memory
        && !instr.is_ip_rel_memory_operand()
        && instr.memory_base() != Register::None
}

fn is_absolute_load(instr: &Instruction) -> bool {
    instr.mnemonic() == Mnemonic::Mov
        && instr.op_count() == 2
        && instr.op0_kind() == OpKind::Register
        && instr.op1_kind() == OpKind::Memory
        && instr.memory_base() == Register::None
        && instr.memory_index() == Register::None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_probe_window_is_256() {
        assert_eq!(DEFAULT_PROBE_WINDOW, 256);
    }

    #[test]
    fn extracts_displacement_x86_simple() {
        let code = [0x8Bu8, 0x41, 0x2C, 0xC3];
        let disp = find_field_load_displacement(&code, 32).unwrap();
        assert_eq!(disp, 0x2C);
    }

    #[test]
    fn extracts_displacement_x86_other_reg() {
        let code = [0x8Bu8, 0x42, 0x10, 0xC3];
        let disp = find_field_load_displacement(&code, 32).unwrap();
        assert_eq!(disp, 0x10);
    }

    #[test]
    fn extracts_displacement_x64_simple() {
        let code = [0x48, 0x8B, 0x41, 0x2C, 0xC3];
        let disp = find_field_load_displacement(&code, 64).unwrap();
        assert_eq!(disp, 0x2C);
    }

    #[test]
    fn rejects_rip_relative_load_for_x64_field_probe() {
        let code = [0x48, 0x8B, 0x05, 0x2C, 0x00, 0x00, 0x00, 0xC3];
        assert!(find_field_load_displacement(&code, 64).is_err());
    }

    #[test]
    fn skips_arg_fetch_in_simple_getter() {
        let code = [
            0x55, 0x8B, 0xEC, 0x8B, 0x45, 0x08, 0x8B, 0x40, 0x28, 0x5D, 0xC3,
        ];
        let disp = find_field_load_displacement(&code, 32).unwrap();
        assert_eq!(disp, 0x28);
    }

    #[test]
    fn skips_intermediate_load_in_complex_getter() {
        let code = [
            0x55, 0x8B, 0xEC, 0x56, 0x8B, 0x75, 0x08, 0x8B, 0x4E, 0x08, 0xE8, 0x21, 0x28, 0x00,
            0x00, 0x8B, 0x46, 0x0C, 0x5E, 0x5D, 0xC3,
        ];
        let disp = find_field_load_displacement(&code, 32).unwrap();
        assert_eq!(disp, 0x0C);
    }

    #[test]
    fn mono_field_get_name_returns_0x04() {
        let code = [
            0x55, 0x8B, 0xEC, 0x8B, 0x45, 0x08, 0x8B, 0x40, 0x04, 0x5D, 0xC3,
        ];
        let disp = find_field_load_displacement(&code, 32).unwrap();
        assert_eq!(disp, 0x04);
    }

    #[test]
    fn mono_image_get_name_returns_0x1c() {
        let code = [
            0x55, 0x8B, 0xEC, 0x8B, 0x45, 0x08, 0x8B, 0x40, 0x1C, 0x5D, 0xC3,
        ];
        let disp = find_field_load_displacement(&code, 32).unwrap();
        assert_eq!(disp, 0x1C);
    }

    #[test]
    fn rejects_etw_decoys_in_mono_class_get_name() {
        let code = [
            0x55, 0x8B, 0xEC, 0x83, 0xE4, 0xF8, 0x83, 0xEC, 0x08, 0x83, 0x3D, 0xDC, 0x28, 0xB3,
            0x7A, 0x00, 0x8D, 0x04, 0x24, 0x56, 0x57, 0x89, 0x44, 0x24, 0x08, 0xC7, 0x44, 0x24,
            0x0C, 0xE4, 0xE9, 0xAC, 0x7A, 0x74, 0x2D, 0x64, 0xA1, 0x18, 0x00, 0x00, 0x00, 0x8B,
            0x0D, 0xAC, 0x28, 0xB3, 0x7A, 0x83, 0xF9, 0x40, 0x73, 0x09, 0x8B, 0x8C, 0x88, 0x10,
            0x0E, 0x00, 0x00, 0xEB, 0x15, 0x8B, 0x80, 0x94, 0x0F, 0x00, 0x00, 0x85, 0xC0, 0x74,
            0x09, 0x8B, 0x45, 0x08, 0x8B, 0x78, 0x2C, 0x8B, 0xC7, 0x5F, 0x5E, 0x8B, 0xE5, 0x5D,
            0xC3,
        ];
        let disp = find_field_load_displacement(&code, 32).unwrap();
        assert_eq!(disp, 0x2C);
    }

    #[test]
    fn rejects_sib_indexed_load() {
        let code = [0x8B, 0x4C, 0x88, 0x10, 0xC3];
        assert!(find_field_load_displacement(&code, 32).is_err());
    }

    #[test]
    fn rejects_too_large_displacement() {
        let code = [0x8B, 0x80, 0x00, 0x10, 0x00, 0x00, 0xC3];
        assert!(find_field_load_displacement(&code, 32).is_err());
    }

    #[test]
    fn extracts_absolute_load_x86() {
        let code = [0xA1u8, 0xEF, 0xBE, 0xAD, 0xDE, 0xC3];
        let addr = find_first_absolute_load(&code, 32).unwrap();
        assert_eq!(addr, 0xDEAD_BEEF);
    }

    #[test]
    fn absolute_search_returns_first_matching_load() {
        let code = [
            0x8B, 0x0D, 0x44, 0x33, 0x22, 0x11, // mov ecx, [0x11223344]
            0xA1, 0xEF, 0xBE, 0xAD, 0xDE, // mov eax, [0xDEADBEEF]
            0xC3,
        ];
        let addr = find_first_absolute_load(&code, 32).unwrap();
        assert_eq!(addr, 0x1122_3344);
    }

    #[test]
    fn field_load_search_skips_absolute_load() {
        let code = [0xA1u8, 0xEF, 0xBE, 0xAD, 0xDE, 0xC3];
        assert!(find_field_load_displacement(&code, 32).is_err());
    }

    #[test]
    fn extracts_absolute_load_from_non_eax_register() {
        let code = [0x8B, 0x0D, 0x44, 0x33, 0x22, 0x11, 0xC3];
        let addr = find_first_absolute_load(&code, 32).unwrap();
        assert_eq!(addr, 0x1122_3344);
    }

    #[test]
    fn extracts_segmented_absolute_load() {
        let code = [0x64u8, 0xA1, 0x18, 0x00, 0x00, 0x00, 0xC3];
        let addr = find_first_absolute_load(&code, 32).unwrap();
        assert_eq!(addr, 0x18);
    }

    #[test]
    fn absolute_search_skips_register_load() {
        let code = [0x8Bu8, 0x41, 0x2C, 0xC3];
        assert!(find_first_absolute_load(&code, 32).is_err());
    }

    #[test]
    fn returns_error_when_no_mov_load() {
        let code = [0xC3u8];
        assert!(find_field_load_displacement(&code, 32).is_err());
        assert!(find_first_absolute_load(&code, 32).is_err());
    }
}
