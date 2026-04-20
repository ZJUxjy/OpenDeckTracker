use crate::error::ScryError;

pub const DEFAULT_PROBE_WINDOW: usize = 256;
const MAX_FIELD_DISP: u32 = 0x800;

pub fn find_field_load_displacement(code: &[u8], bitness: u32) -> Result<usize, ScryError> {
    let mut cursor = 0usize;
    let mut last_match = None;

    while cursor < code.len() {
        let decoded = decode_instruction(code, cursor, bitness)?;

        if let Some(LoadPattern::Field { displacement }) = decoded.load {
            last_match = Some(displacement);
        }

        if decoded.is_ret {
            break;
        }

        cursor += decoded.len.max(1);
    }

    last_match.map(|disp| disp as usize).ok_or_else(|| {
        ScryError::DisasmError("no struct-field-load `mov reg, [reg+disp]` found before ret".into())
    })
}

pub fn find_first_absolute_load(code: &[u8], bitness: u32) -> Result<usize, ScryError> {
    let mut cursor = 0usize;

    while cursor < code.len() {
        let decoded = decode_instruction(code, cursor, bitness)?;

        if decoded.is_ret {
            break;
        }

        if let Some(LoadPattern::Absolute { address }) = decoded.load {
            return Ok(address as usize);
        }

        cursor += decoded.len.max(1);
    }

    Err(ScryError::DisasmError(
        "no `mov reg, [absolute]` found".into(),
    ))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LoadPattern {
    Absolute { address: u32 },
    Field { displacement: u32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DecodedInstruction {
    len: usize,
    is_ret: bool,
    load: Option<LoadPattern>,
}

fn decode_instruction(
    code: &[u8],
    cursor: usize,
    bitness: u32,
) -> Result<DecodedInstruction, ScryError> {
    if bitness != 32 {
        return Err(ScryError::DisasmError(format!(
            "unsupported disasm bitness: {bitness}"
        )));
    }
    if cursor >= code.len() {
        return Ok(DecodedInstruction {
            len: 1,
            is_ret: false,
            load: None,
        });
    }

    let mut offset = cursor;
    while let Some(&byte) = code.get(offset) {
        if byte == 0x64 {
            offset += 1;
        } else {
            break;
        }
    }

    let Some(&opcode) = code.get(offset) else {
        return Ok(DecodedInstruction {
            len: offset.saturating_sub(cursor).max(1),
            is_ret: false,
            load: None,
        });
    };

    let opcode_offset = offset;
    offset += 1;

    match opcode {
        0xC3 => Ok(DecodedInstruction {
            len: offset - cursor,
            is_ret: true,
            load: None,
        }),
        0xC2 => Ok(DecodedInstruction {
            len: instruction_len(offset - cursor, 2, code.len() - offset),
            is_ret: true,
            load: None,
        }),
        0xA1 => {
            let address = read_u32(code, offset)?;
            Ok(DecodedInstruction {
                len: instruction_len(offset - cursor, 4, code.len() - offset),
                is_ret: false,
                load: Some(LoadPattern::Absolute { address }),
            })
        }
        0x8B => decode_mov_load(code, cursor, opcode_offset),
        0x83 => decode_modrm_instruction(code, cursor, offset, 1),
        0xC7 => decode_modrm_instruction(code, cursor, offset, 4),
        0x89 | 0x8D | 0x85 => decode_modrm_instruction(code, cursor, offset, 0),
        0xE8 | 0xE9 => Ok(DecodedInstruction {
            len: instruction_len(offset - cursor, 4, code.len() - offset),
            is_ret: false,
            load: None,
        }),
        0xEB | 0x73 | 0x74 => Ok(DecodedInstruction {
            len: instruction_len(offset - cursor, 1, code.len() - offset),
            is_ret: false,
            load: None,
        }),
        0x50..=0x5F => Ok(DecodedInstruction {
            len: offset - cursor,
            is_ret: false,
            load: None,
        }),
        _ => Ok(DecodedInstruction {
            len: offset - cursor,
            is_ret: false,
            load: None,
        }),
    }
}

fn decode_mov_load(
    code: &[u8],
    cursor: usize,
    modrm_offset: usize,
) -> Result<DecodedInstruction, ScryError> {
    let addressing = decode_modrm_memory(code, modrm_offset + 1)?;
    let len = addressing.total_len + (modrm_offset + 1 - cursor);

    let load = if addressing.is_memory {
        if addressing.is_absolute && !addressing.has_index {
            Some(LoadPattern::Absolute {
                address: addressing.displacement,
            })
        } else if !addressing.has_index
            && !addressing.base_is_stack
            && addressing.displacement <= MAX_FIELD_DISP
        {
            Some(LoadPattern::Field {
                displacement: addressing.displacement,
            })
        } else {
            None
        }
    } else {
        None
    };

    Ok(DecodedInstruction {
        len,
        is_ret: false,
        load,
    })
}

fn decode_modrm_instruction(
    code: &[u8],
    cursor: usize,
    operand_offset: usize,
    immediate_len: usize,
) -> Result<DecodedInstruction, ScryError> {
    let addressing = decode_modrm_memory(code, operand_offset)?;
    Ok(DecodedInstruction {
        len: addressing.total_len + (operand_offset - cursor) + immediate_len.min(code.len().saturating_sub(operand_offset + addressing.total_len)),
        is_ret: false,
        load: None,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct AddressingMode {
    total_len: usize,
    is_memory: bool,
    is_absolute: bool,
    has_index: bool,
    base_is_stack: bool,
    displacement: u32,
}

fn decode_modrm_memory(code: &[u8], offset: usize) -> Result<AddressingMode, ScryError> {
    let Some(&modrm) = code.get(offset) else {
        return Ok(AddressingMode {
            total_len: 1,
            is_memory: false,
            is_absolute: false,
            has_index: false,
            base_is_stack: false,
            displacement: u32::MAX,
        });
    };

    let mode = modrm >> 6;
    let rm = modrm & 0b111;
    if mode == 0b11 {
        return Ok(AddressingMode {
            total_len: 1,
            is_memory: false,
            is_absolute: false,
            has_index: false,
            base_is_stack: false,
            displacement: u32::MAX,
        });
    }

    let mut length = 1usize;
    let mut has_index = false;
    let mut base_is_stack = matches!(rm, 0b100 | 0b101);
    let mut displacement = 0u32;
    let mut is_absolute = mode == 0 && rm == 0b101;
    let mut requires_disp32 = mode == 0 && rm == 0b101;

    if rm == 0b100 {
        let Some(&sib) = code.get(offset + length) else {
            return Ok(AddressingMode {
                total_len: length,
                is_memory: true,
                is_absolute,
                has_index,
                base_is_stack,
                displacement,
            });
        };
        length += 1;
        let index = (sib >> 3) & 0b111;
        let base = sib & 0b111;
        has_index = index != 0b100;
        base_is_stack = matches!(base, 0b100 | 0b101);
        requires_disp32 = mode == 0 && base == 0b101;
        if requires_disp32 {
            is_absolute = !has_index;
        }
    }

    let disp_len = match mode {
        0 if requires_disp32 => 4,
        0 => 0,
        1 => 1,
        2 => 4,
        _ => 0,
    };

    displacement = match disp_len {
        0 => 0,
        1 => {
            let value = code.get(offset + length).copied().unwrap_or_default() as i8;
            if value.is_negative() {
                u32::MAX
            } else {
                value as u32
            }
        }
        4 => read_u32(code, offset + length)?,
        _ => u32::MAX,
    };
    length += disp_len;

    Ok(AddressingMode {
        total_len: length,
        is_memory: true,
        is_absolute,
        has_index,
        base_is_stack,
        displacement,
    })
}

fn instruction_len(prefix_len: usize, operand_len: usize, remaining: usize) -> usize {
    prefix_len + operand_len.min(remaining)
}

fn read_u32(code: &[u8], offset: usize) -> Result<u32, ScryError> {
    let bytes = code
        .get(offset..offset + 4)
        .ok_or_else(|| ScryError::DisasmError("instruction truncated".into()))?;
    Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
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
