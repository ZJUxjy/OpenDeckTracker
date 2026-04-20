use super::MetadataError;
use pelite::pe32::{PeFile, Pe};

/// Extract the raw BSJB metadata section bytes from a .NET PE image.
///
/// Uses `pelite` to validate the PE header and locate the COM descriptor
/// (`DataDirectory[14]`), then reads the `MetaData IMAGE_DATA_DIRECTORY`
/// from the CLI header and returns a subslice of `image` covering the
/// BSJB metadata section.
///
/// Both PE32 (magic 0x10B) and PE32+ (magic 0x20B) images are supported.
pub fn locate_metadata_section(image: &[u8]) -> Result<&[u8], MetadataError> {
    match pe_magic(image) {
        Some(0x10B) => {
            let pe = PeFile::from_bytes(image)
                .map_err(|e| MetadataError::InvalidPe(format!("{}", e)))?;
            let com_rva = com_data_dir_rva_pe32(&pe)?;
            let cli_off = pe
                .rva_to_file_offset(com_rva)
                .map_err(|_| MetadataError::Truncated("CLI header RVA".into()))?;
            extract_metadata_bytes(image, cli_off)
        }
        Some(0x20B) => {
            use pelite::pe64::{PeFile as PeFile64, Pe as Pe64};
            let pe = PeFile64::from_bytes(image)
                .map_err(|e| MetadataError::InvalidPe(format!("{}", e)))?;
            let data_dirs = pe.data_directory();
            let com = data_dirs.get(14).ok_or(MetadataError::NotDotNet)?;
            if com.VirtualAddress == 0 {
                return Err(MetadataError::NotDotNet);
            }
            let cli_off = pe
                .rva_to_file_offset(com.VirtualAddress)
                .map_err(|_| MetadataError::Truncated("CLI header RVA".into()))?;
            extract_metadata_bytes(image, cli_off)
        }
        _ => Err(MetadataError::InvalidPe("not a valid PE image".into())),
    }
}

fn pe_magic(image: &[u8]) -> Option<u16> {
    let e_lfanew = u32::from_le_bytes(image.get(0x3C..0x40)?.try_into().ok()?) as usize;
    let magic_off = e_lfanew.checked_add(24)?;
    let bytes = image.get(magic_off..magic_off + 2)?;
    Some(u16::from_le_bytes([bytes[0], bytes[1]]))
}

fn com_data_dir_rva_pe32(pe: &PeFile<'_>) -> Result<u32, MetadataError> {
    let data_dirs = pe.data_directory();
    let com = data_dirs.get(14).ok_or(MetadataError::NotDotNet)?;
    if com.VirtualAddress == 0 {
        return Err(MetadataError::NotDotNet);
    }
    Ok(com.VirtualAddress)
}

/// Read BSJB metadata bytes from `image` given the file offset of IMAGE_COR20_HEADER.
fn extract_metadata_bytes(image: &[u8], cli_off: usize) -> Result<&[u8], MetadataError> {
    // IMAGE_COR20_HEADER: MetaData IMAGE_DATA_DIRECTORY is at offset 8
    let cli = image
        .get(cli_off..cli_off + 16)
        .ok_or_else(|| MetadataError::Truncated("CLI header".into()))?;

    let meta_rva = u32::from_le_bytes([cli[8], cli[9], cli[10], cli[11]]);
    let meta_size = u32::from_le_bytes([cli[12], cli[13], cli[14], cli[15]]) as usize;

    if meta_rva == 0 {
        return Err(MetadataError::NotDotNet);
    }

    let meta_off = raw_rva_to_offset(image, meta_rva)
        .ok_or_else(|| MetadataError::Truncated("metadata RVA not in any section".into()))?;

    image
        .get(meta_off..meta_off + meta_size)
        .ok_or_else(|| MetadataError::Truncated("metadata section extends beyond image".into()))
}

/// Minimal raw RVA → file-offset walk using the PE section table.
fn raw_rva_to_offset(image: &[u8], rva: u32) -> Option<usize> {
    let e_lfanew = u32::from_le_bytes(image.get(0x3C..0x40)?.try_into().ok()?) as usize;
    let file_hdr = e_lfanew.checked_add(4)?;
    let n = u16::from_le_bytes(image.get(file_hdr + 2..file_hdr + 4)?.try_into().ok()?) as usize;
    let opt_size =
        u16::from_le_bytes(image.get(file_hdr + 16..file_hdr + 18)?.try_into().ok()?) as usize;
    let sections_base = e_lfanew.checked_add(24)?.checked_add(opt_size)?;

    for i in 0..n {
        let sh = sections_base.checked_add(i.checked_mul(40)?)?;
        let va = u32::from_le_bytes(image.get(sh + 12..sh + 16)?.try_into().ok()?) as usize;
        let raw_sz =
            u32::from_le_bytes(image.get(sh + 16..sh + 20)?.try_into().ok()?) as usize;
        let virt_sz =
            u32::from_le_bytes(image.get(sh + 8..sh + 12)?.try_into().ok()?) as usize;
        let raw_off =
            u32::from_le_bytes(image.get(sh + 20..sh + 24)?.try_into().ok()?) as usize;
        let span = virt_sz.max(raw_sz);
        let r = rva as usize;
        if r >= va && r < va + span {
            return Some(raw_off + (r - va));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> Vec<u8> {
        let dir = env!("CARGO_MANIFEST_DIR");
        let path = std::path::Path::new(dir).join("tests/fixtures").join(name);
        std::fs::read(&path).unwrap_or_else(|e| panic!("cannot read fixture {:?}: {}", path, e))
    }

    #[test]
    fn locate_metadata_section_finds_bsjb() {
        let dll = fixture("MinimalAssembly.dll");
        let result = locate_metadata_section(&dll);
        assert!(result.is_ok(), "expected Ok, got {:?}", result.err());
        let section = result.unwrap();
        assert_eq!(
            &section[0..4],
            b"BSJB",
            "metadata section should begin with BSJB signature"
        );
    }

    #[test]
    fn locate_metadata_section_rejects_garbage() {
        let result = locate_metadata_section(&[0u8; 64]);
        assert!(result.is_err(), "expected Err for garbage input");
    }
}
