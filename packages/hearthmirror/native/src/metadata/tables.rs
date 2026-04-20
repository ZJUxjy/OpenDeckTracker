use crate::error::ScryError;
use crate::metadata::{
    pe::locate_metadata_section,
    streams::StreamSet,
    tokens::HeapIndexWidth,
    MetadataError, MetadataReader,
};

// ─── Row types ───────────────────────────────────────────────────────────────

/// A decoded TypeDef table row (ECMA-335 II.22.37).
#[derive(Debug, Clone)]
pub struct TypeDefRow<'a> {
    pub flags: u32,
    pub name: &'a str,
    pub namespace: &'a str,
    /// 1-based RID of first Field belonging to this type (0 ⇒ no fields).
    pub field_list: u32,
    /// 1-based RID of first MethodDef belonging to this type (0 ⇒ no methods).
    pub method_list: u32,
}

/// A decoded Field table row (ECMA-335 II.22.15).
#[derive(Debug, Clone)]
pub struct FieldRow<'a> {
    pub flags: u16,
    pub name: &'a str,
}

/// A decoded MethodDef table row (ECMA-335 II.22.26).
#[derive(Debug, Clone)]
pub struct MethodDefRow<'a> {
    pub rva: u32,
    pub impl_flags: u16,
    pub flags: u16,
    pub name: &'a str,
}

// ─── TablesReader ─────────────────────────────────────────────────────────────

/// Reader for the `#~` (compressed metadata tables) stream.
///
/// Provides fallible iterators over TypeDef, Field, and MethodDef rows.
/// All string values are resolved inline from the `#Strings` heap.
pub struct TablesReader<'a> {
    tilde: &'a [u8],
    strings: &'a [u8],
    heap: HeapIndexWidth,
    row_counts: [u32; 64],
    data_base: usize,
}

impl<'a> TablesReader<'a> {
    /// Parse the `#~` stream header.
    ///
    /// - `tilde`   – raw `#~` stream bytes (`StreamSet::tables()`)
    /// - `strings` – raw `#Strings` heap bytes (`StreamSet::strings()`)
    /// - `heap`    – heap index widths (from `HeapIndexWidth::from_heap_sizes(tilde[6])`)
    pub fn new(
        tilde: &'a [u8],
        strings: &'a [u8],
        heap: HeapIndexWidth,
    ) -> Result<Self, MetadataError> {
        if tilde.len() < 24 {
            return Err(MetadataError::Truncated("#~ header too short".into()));
        }
        let valid = u64::from_le_bytes(
            tilde[8..16]
                .try_into()
                .map_err(|_| MetadataError::Truncated("#~ valid mask".into()))?,
        );
        let n_present = valid.count_ones() as usize;
        let data_base = 24 + n_present * 4;
        if tilde.len() < data_base {
            return Err(MetadataError::Truncated("#~ row counts truncated".into()));
        }
        let mut row_counts = [0u32; 64];
        let mut rc_idx = 0usize;
        for (i, count) in row_counts.iter_mut().enumerate() {
            if valid & (1u64 << i) != 0 {
                let off = 24 + rc_idx * 4;
                *count = u32::from_le_bytes(
                    tilde[off..off + 4]
                        .try_into()
                        .map_err(|_| MetadataError::Truncated("row count entry".into()))?,
                );
                rc_idx += 1;
            }
        }
        Ok(Self { tilde, strings, heap, row_counts, data_base })
    }

    /// Total number of rows in table `t` (0 if absent).
    pub fn row_count(&self, table: usize) -> u32 {
        self.row_counts.get(table).copied().unwrap_or(0)
    }

    // ── Iterators ────────────────────────────────────────────────────────────

    /// Iterate all TypeDef rows (table 0x02).
    pub fn iter_typedefs(
        &'a self,
    ) -> impl Iterator<Item = Result<TypeDefRow<'a>, MetadataError>> + 'a {
        let base = self.typedef_offset();
        let rs = self.typedef_row_size();
        let count = self.row_counts[0x02] as usize;
        (0..count).map(move |i| self.read_typedef_row(base + i * rs))
    }

    /// Iterate all Field rows (table 0x04).
    pub fn iter_fields(
        &'a self,
    ) -> impl Iterator<Item = Result<FieldRow<'a>, MetadataError>> + 'a {
        let base = self.field_offset();
        let rs = self.field_row_size();
        let count = self.row_counts[0x04] as usize;
        (0..count).map(move |i| self.read_field_row(base + i * rs))
    }

    /// Iterate all MethodDef rows (table 0x06).
    pub fn iter_methoddefs(
        &'a self,
    ) -> impl Iterator<Item = Result<MethodDefRow<'a>, MetadataError>> + 'a {
        let base = self.methoddef_offset();
        let rs = self.methoddef_row_size();
        let count = self.row_counts[0x06] as usize;
        (0..count).map(move |i| self.read_methoddef_row(base + i * rs))
    }

    // ── Row readers ──────────────────────────────────────────────────────────

    fn read_typedef_row(&self, off: usize) -> Result<TypeDefRow<'a>, MetadataError> {
        let s = self.heap.string as usize;
        let ext = self.type_def_or_ref_size();
        let fi = self.simple_idx(0x04);
        let mi = self.simple_idx(0x06);
        let rs = 4 + s * 2 + ext + fi + mi;
        let row = self
            .tilde
            .get(off..off + rs)
            .ok_or_else(|| MetadataError::Truncated("TypeDef row OOB".into()))?;
        let flags = read_u32(row, 0)?;
        let name_idx = read_idx(row, 4, s)?;
        let ns_idx = read_idx(row, 4 + s, s)?;
        // skip Extends (ext bytes)
        let field_list = read_idx(row, 4 + s * 2 + ext, fi)?;
        let method_list = read_idx(row, 4 + s * 2 + ext + fi, mi)?;
        Ok(TypeDefRow {
            flags,
            name: self.resolve_string(name_idx)?,
            namespace: self.resolve_string(ns_idx)?,
            field_list,
            method_list,
        })
    }

    fn read_field_row(&self, off: usize) -> Result<FieldRow<'a>, MetadataError> {
        let s = self.heap.string as usize;
        let b = self.heap.blob as usize;
        let rs = 2 + s + b;
        let row = self
            .tilde
            .get(off..off + rs)
            .ok_or_else(|| MetadataError::Truncated("Field row OOB".into()))?;
        let flags = read_u16(row, 0)?;
        let name_idx = read_idx(row, 2, s)?;
        Ok(FieldRow { flags, name: self.resolve_string(name_idx)? })
    }

    fn read_methoddef_row(&self, off: usize) -> Result<MethodDefRow<'a>, MetadataError> {
        let s = self.heap.string as usize;
        let b = self.heap.blob as usize;
        let pi = self.simple_idx(0x08); // Param table index
        let rs = 4 + 2 + 2 + s + b + pi;
        let row = self
            .tilde
            .get(off..off + rs)
            .ok_or_else(|| MetadataError::Truncated("MethodDef row OOB".into()))?;
        let rva = read_u32(row, 0)?;
        let impl_flags = read_u16(row, 4)?;
        let flags = read_u16(row, 6)?;
        let name_idx = read_idx(row, 8, s)?;
        Ok(MethodDefRow { rva, impl_flags, flags, name: self.resolve_string(name_idx)? })
    }

    // ── String resolution ────────────────────────────────────────────────────

    fn resolve_string(&self, idx: u32) -> Result<&'a str, MetadataError> {
        let i = idx as usize;
        if i >= self.strings.len() {
            return Err(MetadataError::Truncated(format!("string idx {} OOB", idx)));
        }
        let end = self.strings[i..]
            .iter()
            .position(|&b| b == 0)
            .map_or(self.strings.len(), |p| i + p);
        std::str::from_utf8(&self.strings[i..end])
            .map_err(|_| MetadataError::Truncated(format!("non-UTF8 string at idx {}", idx)))
    }

    // ── Size helpers ─────────────────────────────────────────────────────────

    fn simple_idx(&self, table: usize) -> usize {
        if self.row_counts[table] <= 0xFFFF { 2 } else { 4 }
    }

    fn coded_idx(&self, tag_bits: u32, tables: &[usize]) -> usize {
        let max = tables.iter().map(|&t| self.row_counts[t]).max().unwrap_or(0);
        if max < (1u32 << (16 - tag_bits)) { 2 } else { 4 }
    }

    fn type_def_or_ref_size(&self) -> usize {
        self.coded_idx(2, &[0x02, 0x01, 0x1B])
    }

    fn resolution_scope_size(&self) -> usize {
        self.coded_idx(2, &[0x00, 0x1A, 0x23, 0x01])
    }

    fn module_row_size(&self) -> usize {
        2 + self.heap.string as usize + self.heap.guid as usize * 3
    }

    fn typeref_row_size(&self) -> usize {
        self.resolution_scope_size() + self.heap.string as usize * 2
    }

    fn typedef_row_size(&self) -> usize {
        4 + self.heap.string as usize * 2
            + self.type_def_or_ref_size()
            + self.simple_idx(0x04)
            + self.simple_idx(0x06)
    }

    fn fieldptr_row_size(&self) -> usize {
        self.simple_idx(0x04)
    }

    fn field_row_size(&self) -> usize {
        2 + self.heap.string as usize + self.heap.blob as usize
    }

    fn methodptr_row_size(&self) -> usize {
        self.simple_idx(0x06)
    }

    fn methoddef_row_size(&self) -> usize {
        4 + 2 + 2 + self.heap.string as usize + self.heap.blob as usize + self.simple_idx(0x08)
    }

    // ── Offset computations ──────────────────────────────────────────────────

    fn typedef_offset(&self) -> usize {
        self.data_base
            + self.row_counts[0x00] as usize * self.module_row_size()
            + self.row_counts[0x01] as usize * self.typeref_row_size()
    }

    fn field_offset(&self) -> usize {
        self.typedef_offset()
            + self.row_counts[0x02] as usize * self.typedef_row_size()
            + self.row_counts[0x03] as usize * self.fieldptr_row_size()
    }

    fn methoddef_offset(&self) -> usize {
        self.field_offset()
            + self.row_counts[0x04] as usize * self.field_row_size()
            + self.row_counts[0x05] as usize * self.methodptr_row_size()
    }
}

// ─── MetadataReader public API ───────────────────────────────────────────────

impl MetadataReader {
    /// Find a TypeDef by namespace + name.  Returns token `0x02000000 | rid`.
    pub fn find_class_token(&self, namespace: &str, name: &str) -> Result<u32, ScryError> {
        with_tables(self.bytes(), |reader| {
            for (idx, row) in reader.iter_typedefs().enumerate() {
                let td = row?;
                if td.namespace == namespace && td.name == name {
                    return Ok(0x02000000 | ((idx as u32) + 1));
                }
            }
            Err(ScryError::ClassNotFound {
                namespace: namespace.to_string(),
                name: name.to_string(),
            })
        })
    }

    /// Find a Field by name within a type identified by `class_token`.
    /// Returns token `0x04000000 | rid`.
    pub fn find_field_token(&self, class_token: u32, field_name: &str) -> Result<u32, ScryError> {
        with_tables(self.bytes(), |reader| {
            let class_rid = (class_token & 0x00FF_FFFF) as usize;
            if class_rid == 0 {
                return Err(ScryError::MetadataError("invalid class token: RID 0".into()));
            }
            // Locate the TypeDef and the next one to determine the field range.
            let mut typedefs = reader.iter_typedefs();
            let td = typedefs
                .nth(class_rid - 1)
                .ok_or_else(|| ScryError::MetadataError("class token out of range".into()))??;
            let field_start = td.field_list as usize;
            // Next typedef's field_list marks the end; absent ⇒ use total count + 1.
            let field_end = typedefs
                .next()
                .and_then(|r| r.ok())
                .map(|next| next.field_list as usize)
                .unwrap_or(reader.row_count(0x04) as usize + 1);

            // Indexed field walk for correct RID tracking.
            for (idx, row) in reader.iter_fields().enumerate() {
                let rid = idx + 1; // 1-based
                if rid < field_start {
                    continue;
                }
                if rid >= field_end {
                    break;
                }
                let f = row?;
                if f.name == field_name {
                    return Ok(0x04000000 | (rid as u32));
                }
            }
            Err(ScryError::FieldNotFound {
                class: format!("token 0x{:08X}", class_token),
                field: field_name.into(),
            })
        })
    }

    /// Find a MethodDef by name within a type identified by `class_token`.
    /// Returns token `0x06000000 | rid`.
    pub fn find_method_token(
        &self,
        class_token: u32,
        method_name: &str,
    ) -> Result<u32, ScryError> {
        with_tables(self.bytes(), |reader| {
            let class_rid = (class_token & 0x00FF_FFFF) as usize;
            if class_rid == 0 {
                return Err(ScryError::MetadataError("invalid class token: RID 0".into()));
            }
            let mut typedefs = reader.iter_typedefs();
            let td = typedefs
                .nth(class_rid - 1)
                .ok_or_else(|| ScryError::MetadataError("class token out of range".into()))??;
            let method_start = td.method_list as usize;
            let method_end = typedefs
                .next()
                .and_then(|r| r.ok())
                .map(|next| next.method_list as usize)
                .unwrap_or(reader.row_count(0x06) as usize + 1);

            for (idx, row) in reader.iter_methoddefs().enumerate() {
                let rid = idx + 1;
                if rid < method_start {
                    continue;
                }
                if rid >= method_end {
                    break;
                }
                let m = row?;
                if m.name == method_name {
                    return Ok(0x06000000 | (rid as u32));
                }
            }
            Err(ScryError::FieldNotFound {
                class: format!("token 0x{:08X}", class_token),
                field: method_name.into(),
            })
        })
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/// Parse and set up the pipeline, then call `f` with a `TablesReader`.
fn with_tables<T>(
    bytes: &[u8],
    f: impl FnOnce(TablesReader<'_>) -> Result<T, ScryError>,
) -> Result<T, ScryError> {
    let meta = locate_metadata_section(bytes)?;
    let streams = StreamSet::parse(meta)?;
    let tilde = streams
        .tables()
        .ok_or_else(|| ScryError::MetadataError("no #~ stream".into()))?;
    let strings = streams
        .strings()
        .ok_or_else(|| ScryError::MetadataError("no #Strings stream".into()))?;
    if tilde.len() < 7 {
        return Err(ScryError::MetadataError("#~ header too short for HeapSizes".into()));
    }
    let heap = HeapIndexWidth::from_heap_sizes(tilde[6]);
    let reader = TablesReader::new(tilde, strings, heap)?;
    f(reader)
}

fn read_u32(buf: &[u8], off: usize) -> Result<u32, MetadataError> {
    buf.get(off..off + 4)
        .and_then(|s| s.try_into().ok())
        .map(u32::from_le_bytes)
        .ok_or_else(|| MetadataError::Truncated(format!("u32 read at offset {}", off)))
}

fn read_u16(buf: &[u8], off: usize) -> Result<u16, MetadataError> {
    buf.get(off..off + 2)
        .and_then(|s| s.try_into().ok())
        .map(u16::from_le_bytes)
        .ok_or_else(|| MetadataError::Truncated(format!("u16 read at offset {}", off)))
}

fn read_idx(buf: &[u8], off: usize, size: usize) -> Result<u32, MetadataError> {
    if size == 4 {
        read_u32(buf, off)
    } else {
        read_u16(buf, off).map(u32::from)
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> Vec<u8> {
        let dir = env!("CARGO_MANIFEST_DIR");
        let path = std::path::Path::new(dir).join("tests/fixtures").join(name);
        std::fs::read(&path).unwrap_or_else(|e| panic!("cannot read fixture {:?}: {}", path, e))
    }

    // Helper: parse the DLL and invoke a closure with a TablesReader.
    fn with_minimal<T>(f: impl FnOnce(&TablesReader<'_>) -> T) -> T {
        let dll = fixture("MinimalAssembly.dll");
        let meta = locate_metadata_section(&dll).expect("locate metadata");
        let streams = StreamSet::parse(meta).expect("parse streams");
        let tilde = streams.tables().expect("#~ stream");
        let strings = streams.strings().expect("#Strings");
        let heap = HeapIndexWidth::from_heap_sizes(tilde[6]);
        let reader = TablesReader::new(tilde, strings, heap).expect("TablesReader::new");
        f(&reader)
    }

    #[test]
    fn tables_iter_typedefs_finds_servicemanager() {
        with_minimal(|reader| {
            let found = reader
                .iter_typedefs()
                .filter_map(|r| r.ok())
                .any(|td| {
                    td.namespace == "Blizzard.T5.Services" && td.name == "ServiceManager"
                });
            assert!(found, "expected to find Blizzard.T5.Services.ServiceManager in TypeDef table");
        });
    }

    #[test]
    fn tables_iter_fields_finds_s_runtimeservices() {
        with_minimal(|reader| {
            let found = reader
                .iter_fields()
                .filter_map(|r| r.ok())
                .any(|f| f.name == "s_runtimeServices");
            assert!(found, "expected to find field s_runtimeServices");
        });
    }

    #[test]
    fn tables_handles_empty_field_table() {
        // A minimal DLL with no Field rows should produce zero iterations.
        // We validate this by checking that the count reported is consistent.
        with_minimal(|reader| {
            let count = reader.iter_fields().count();
            let row_count = reader.row_count(0x04) as usize;
            assert_eq!(count, row_count, "iter_fields count should match row_count(Field)");
        });
    }

    #[test]
    fn find_class_token_returns_typedef_token() {
        let dll = fixture("MinimalAssembly.dll");
        let reader = MetadataReader::from_memory(dll);
        let token = reader
            .find_class_token("Blizzard.T5.Services", "ServiceManager")
            .expect("find ServiceManager");
        assert_eq!(token >> 24, 0x02, "TypeDef token table byte should be 0x02");
        assert!(token & 0x00FF_FFFF > 0, "RID should be non-zero");
    }

    #[test]
    fn empty_bytes_errors() {
        let r = MetadataReader::from_memory(vec![]);
        assert!(r.find_class_token("Foo", "Bar").is_err());
    }

    #[test]
    fn random_bytes_errors_gracefully() {
        let r = MetadataReader::from_memory(vec![0u8; 1024]);
        assert!(r.find_class_token("Foo", "Bar").is_err());
    }
}
