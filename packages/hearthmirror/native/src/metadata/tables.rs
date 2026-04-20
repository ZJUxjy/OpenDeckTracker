use crate::error::ScryError;
use crate::metadata::MetadataReader;

impl MetadataReader {
    /// Find a TypeDef by full name (namespace + name). Returns the ECMA-335
    /// metadata token (0x02000000 | row_idx) on success.
    pub fn find_class_token(&self, namespace: &str, name: &str) -> Result<u32, ScryError> {
        let bytes = self.bytes();
        let metadata = locate_cli_metadata(bytes)?;
        let (strings_stream, tilde_stream) = parse_metadata_streams(metadata)?;
        let typedefs = parse_typedef_table(tilde_stream, strings_stream)?;

        for (idx, td) in typedefs.iter().enumerate() {
            if td.namespace == namespace && td.name == name {
                // ECMA-335 II.22.37: TypeDef token = 0x02000000 | (row + 1)
                return Ok(0x02000000 | ((idx + 1) as u32));
            }
        }

        Err(ScryError::ClassNotFound {
            name: format!("{}.{}", namespace, name),
        })
    }
}

/// Locate the raw CLI metadata bytes within a .NET PE file.
fn locate_cli_metadata(bytes: &[u8]) -> Result<&[u8], ScryError> {
    if bytes.len() < 0x40 {
        return Err(ScryError::MetadataError(
            "file too small for DOS header".into(),
        ));
    }

    let e_lfanew =
        u32::from_le_bytes([bytes[0x3C], bytes[0x3D], bytes[0x3E], bytes[0x3F]]) as usize;
    if bytes.len() < e_lfanew + 24 + 2 {
        return Err(ScryError::MetadataError("PE NT headers truncated".into()));
    }

    let opt_hdr_off = e_lfanew + 24;
    let file_hdr_off = e_lfanew + 4;
    let magic = u16::from_le_bytes([bytes[opt_hdr_off], bytes[opt_hdr_off + 1]]);

    let data_dir_off = match magic {
        0x10B => opt_hdr_off + 0x60, // PE32
        0x20B => opt_hdr_off + 0x70, // PE32+
        m => {
            return Err(ScryError::MetadataError(format!(
                "unknown OptionalHeader magic 0x{:04X}",
                m
            )))
        }
    };

    // COM descriptor is DataDirectory[14]
    let com_off = data_dir_off + 14 * 8;
    if bytes.len() < com_off + 8 {
        return Err(ScryError::MetadataError(
            "COM descriptor entry truncated".into(),
        ));
    }
    let cli_rva = u32::from_le_bytes([
        bytes[com_off],
        bytes[com_off + 1],
        bytes[com_off + 2],
        bytes[com_off + 3],
    ]) as usize;
    if cli_rva == 0 {
        return Err(ScryError::MetadataError(
            "no CLI header (not a .NET assembly)".into(),
        ));
    }

    let num_sections =
        u16::from_le_bytes([bytes[file_hdr_off + 2], bytes[file_hdr_off + 3]]) as usize;
    let optional_header_size =
        u16::from_le_bytes([bytes[file_hdr_off + 16], bytes[file_hdr_off + 17]]) as usize;
    let sections_off = opt_hdr_off + optional_header_size;

    let rva_to_offset = |rva: usize| -> Option<usize> {
        for s in 0..num_sections {
            let sh = sections_off + s * 40;
            if bytes.len() < sh + 40 {
                return None;
            }
            let virt_sz =
                u32::from_le_bytes([bytes[sh + 8], bytes[sh + 9], bytes[sh + 10], bytes[sh + 11]])
                    as usize;
            let virt_addr = u32::from_le_bytes([
                bytes[sh + 12],
                bytes[sh + 13],
                bytes[sh + 14],
                bytes[sh + 15],
            ]) as usize;
            let raw_off = u32::from_le_bytes([
                bytes[sh + 20],
                bytes[sh + 21],
                bytes[sh + 22],
                bytes[sh + 23],
            ]) as usize;
            let raw_sz = u32::from_le_bytes([
                bytes[sh + 16],
                bytes[sh + 17],
                bytes[sh + 18],
                bytes[sh + 19],
            ]) as usize;
            if rva >= virt_addr && rva < virt_addr + virt_sz.max(raw_sz) {
                return Some(raw_off + (rva - virt_addr));
            }
        }
        None
    };

    let cli_off = rva_to_offset(cli_rva).ok_or_else(|| {
        ScryError::MetadataError(format!("CLI RVA 0x{:X} not in any section", cli_rva))
    })?;

    if bytes.len() < cli_off + 16 {
        return Err(ScryError::MetadataError("CLI header truncated".into()));
    }

    // IMAGE_COR20_HEADER: MetaData IMAGE_DATA_DIRECTORY at offset 8
    let meta_rva = u32::from_le_bytes([
        bytes[cli_off + 8],
        bytes[cli_off + 9],
        bytes[cli_off + 10],
        bytes[cli_off + 11],
    ]) as usize;
    let meta_size = u32::from_le_bytes([
        bytes[cli_off + 12],
        bytes[cli_off + 13],
        bytes[cli_off + 14],
        bytes[cli_off + 15],
    ]) as usize;

    let meta_off = rva_to_offset(meta_rva).ok_or_else(|| {
        ScryError::MetadataError(format!("metadata RVA 0x{:X} not in any section", meta_rva))
    })?;

    if bytes.len() < meta_off + meta_size {
        return Err(ScryError::MetadataError(
            "metadata section truncated".into(),
        ));
    }

    Ok(&bytes[meta_off..meta_off + meta_size])
}

#[derive(Debug)]
struct TypeDefRow {
    namespace: String,
    name: String,
}

fn parse_metadata_streams(metadata: &[u8]) -> Result<(&[u8], &[u8]), ScryError> {
    if metadata.len() < 16 {
        return Err(ScryError::MetadataError("metadata too short".into()));
    }
    let sig = u32::from_le_bytes([metadata[0], metadata[1], metadata[2], metadata[3]]);
    if sig != 0x424A5342 {
        return Err(ScryError::MetadataError(format!(
            "bad metadata signature 0x{:08X}",
            sig
        )));
    }
    let version_len = u32::from_le_bytes([metadata[12], metadata[13], metadata[14], metadata[15]]);
    let version_padded = ((version_len + 3) & !3) as usize;
    let mut off = 16 + version_padded;
    if metadata.len() < off + 4 {
        return Err(ScryError::MetadataError(
            "metadata stream header missing".into(),
        ));
    }
    let _flags = u16::from_le_bytes([metadata[off], metadata[off + 1]]);
    let n_streams = u16::from_le_bytes([metadata[off + 2], metadata[off + 3]]);
    off += 4;

    let mut strings_offset: Option<(usize, usize)> = None;
    let mut tilde_offset: Option<(usize, usize)> = None;

    for _ in 0..n_streams {
        if metadata.len() < off + 8 {
            return Err(ScryError::MetadataError("stream entry truncated".into()));
        }
        let stream_off = u32::from_le_bytes([
            metadata[off],
            metadata[off + 1],
            metadata[off + 2],
            metadata[off + 3],
        ]) as usize;
        let stream_size = u32::from_le_bytes([
            metadata[off + 4],
            metadata[off + 5],
            metadata[off + 6],
            metadata[off + 7],
        ]) as usize;
        off += 8;

        let name_start = off;
        let mut name_end = off;
        while name_end < metadata.len() && metadata[name_end] != 0 {
            name_end += 1;
        }
        let name = std::str::from_utf8(&metadata[name_start..name_end])
            .map_err(|_| ScryError::MetadataError("non-utf8 stream name".into()))?
            .to_string();
        off = ((name_end + 1 + 3) & !3).min(metadata.len());

        match name.as_str() {
            "#Strings" => strings_offset = Some((stream_off, stream_size)),
            "#~" => tilde_offset = Some((stream_off, stream_size)),
            _ => {}
        }
    }

    let (so, ss) =
        strings_offset.ok_or_else(|| ScryError::MetadataError("no #Strings stream".into()))?;
    let (to, ts) = tilde_offset.ok_or_else(|| ScryError::MetadataError("no #~ stream".into()))?;

    Ok((&metadata[so..so + ss], &metadata[to..to + ts]))
}

fn parse_typedef_table(tilde: &[u8], strings: &[u8]) -> Result<Vec<TypeDefRow>, ScryError> {
    if tilde.len() < 24 {
        return Err(ScryError::MetadataError("#~ header truncated".into()));
    }
    let heap_sizes = tilde[6];
    let strings_idx_size: usize = if heap_sizes & 1 != 0 { 4 } else { 2 };
    let guid_idx_size: usize = if heap_sizes & 2 != 0 { 4 } else { 2 };

    let valid = u64::from_le_bytes([
        tilde[8], tilde[9], tilde[10], tilde[11], tilde[12], tilde[13], tilde[14], tilde[15],
    ]);
    let n_tables = valid.count_ones() as usize;
    let header_len = 24 + n_tables * 4;
    if tilde.len() < header_len {
        return Err(ScryError::MetadataError("#~ row counts truncated".into()));
    }

    let mut row_counts = [0u32; 64];
    let mut rc_idx = 0;
    for (i, row_count) in row_counts.iter_mut().enumerate() {
        if valid & (1u64 << i) != 0 {
            let off = 24 + rc_idx * 4;
            *row_count =
                u32::from_le_bytes([tilde[off], tilde[off + 1], tilde[off + 2], tilde[off + 3]]);
            rc_idx += 1;
        }
    }

    let typedef_count = row_counts[0x02];
    let typeref_count = row_counts[0x01];
    let typespec_count = row_counts[0x1B];
    let field_count = row_counts[0x04];
    let methoddef_count = row_counts[0x06];
    let module_count = row_counts[0x00];

    let typedef_or_ref_size: usize =
        if typedef_count.max(typeref_count).max(typespec_count) <= (1 << 14) {
            2
        } else {
            4
        };
    let field_idx_size: usize = if field_count <= 0xFFFF { 2 } else { 4 };
    let methoddef_idx_size: usize = if methoddef_count <= 0xFFFF { 2 } else { 4 };

    let typedef_row_size = 4
        + strings_idx_size  // name
        + strings_idx_size  // namespace
        + typedef_or_ref_size
        + field_idx_size
        + methoddef_idx_size;

    let resolution_scope_size: usize = {
        let max_rows = [
            module_count,
            row_counts[0x1A],
            row_counts[0x23],
            typeref_count,
        ]
        .iter()
        .copied()
        .max()
        .unwrap_or(0);
        if max_rows <= (1 << 14) {
            2
        } else {
            4
        }
    };

    let module_row_size = 2 + strings_idx_size + guid_idx_size * 3;
    let typeref_row_size = resolution_scope_size + strings_idx_size + strings_idx_size;

    let mut tables_off = header_len;
    tables_off += module_count as usize * module_row_size;
    tables_off += typeref_count as usize * typeref_row_size;

    let typedef_total = typedef_count as usize * typedef_row_size;
    if tilde.len() < tables_off + typedef_total {
        return Err(ScryError::MetadataError(format!(
            "TypeDef table overruns #~ stream ({} need, {} avail)",
            typedef_total,
            tilde.len().saturating_sub(tables_off)
        )));
    }

    let read_strings_idx = |buf: &[u8], off: usize| -> u32 {
        if strings_idx_size == 4 {
            u32::from_le_bytes([buf[off], buf[off + 1], buf[off + 2], buf[off + 3]])
        } else {
            u16::from_le_bytes([buf[off], buf[off + 1]]) as u32
        }
    };

    let read_string = |idx: u32| -> Result<String, ScryError> {
        let i = idx as usize;
        if i >= strings.len() {
            return Err(ScryError::MetadataError(format!("strings idx {} OOB", idx)));
        }
        let end = strings[i..]
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(strings.len() - i);
        Ok(String::from_utf8_lossy(&strings[i..i + end]).into_owned())
    };

    let mut out = Vec::with_capacity(typedef_count as usize);
    for row in 0..typedef_count as usize {
        let off = tables_off + row * typedef_row_size;
        // skip flags (4)
        let name_idx = read_strings_idx(tilde, off + 4);
        let ns_idx = read_strings_idx(tilde, off + 4 + strings_idx_size);
        out.push(TypeDefRow {
            name: read_string(name_idx)?,
            namespace: read_string(ns_idx)?,
        });
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_bytes_errors() {
        let r = MetadataReader::from_memory(vec![]);
        let err = r.find_class_token("Foo", "Bar");
        assert!(err.is_err());
    }

    #[test]
    fn random_bytes_errors_gracefully() {
        let r = MetadataReader::from_memory(vec![0u8; 1024]);
        let err = r.find_class_token("Foo", "Bar");
        assert!(err.is_err());
    }
}
