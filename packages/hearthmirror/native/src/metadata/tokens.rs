/// Width (in bytes) to use when reading each heap index from the `#~` table stream.
///
/// Derived from the `HeapSizes` byte in the `#~` stream header (ECMA-335 II.24.2.6):
/// - bit 0 set → String heap index is 4 bytes (otherwise 2)
/// - bit 1 set → GUID heap index is 4 bytes   (otherwise 2)
/// - bit 2 set → Blob heap index is 4 bytes   (otherwise 2)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HeapIndexWidth {
    pub string: u8,
    pub guid: u8,
    pub blob: u8,
}

impl HeapIndexWidth {
    /// Decode from the `HeapSizes` byte in the `#~` stream header.
    pub fn from_heap_sizes(byte: u8) -> Self {
        Self {
            string: if byte & 0x01 != 0 { 4 } else { 2 },
            guid:   if byte & 0x02 != 0 { 4 } else { 2 },
            blob:   if byte & 0x04 != 0 { 4 } else { 2 },
        }
    }
}

/// A decoded ECMA-335 metadata token.
///
/// A token is a 32-bit value where:
/// - bits 31..24 encode the table index (0x00–0x3F)
/// - bits 23..0 encode the 1-based row index (RID)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Token(pub u32);

impl Token {
    /// Table identifier (upper byte).
    pub fn table_id(self) -> u8 {
        (self.0 >> 24) as u8
    }

    /// 1-based row index within the table.
    pub fn rid(self) -> u32 {
        self.0 & 0x00FF_FFFF
    }

    /// Construct a token from table id and RID.
    pub fn new(table_id: u8, rid: u32) -> Self {
        Self(((table_id as u32) << 24) | (rid & 0x00FF_FFFF))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heap_index_width_from_byte_decodes_bits() {
        let cases: &[(u8, u8, u8, u8)] = &[
            // heap_sizes, string_width, guid_width, blob_width
            (0b000, 2, 2, 2),
            (0b001, 4, 2, 2),
            (0b010, 2, 4, 2),
            (0b011, 4, 4, 2),
            (0b100, 2, 2, 4),
            (0b101, 4, 2, 4),
            (0b110, 2, 4, 4),
            (0b111, 4, 4, 4),
        ];
        for &(hs, sw, gw, bw) in cases {
            let w = HeapIndexWidth::from_heap_sizes(hs);
            assert_eq!(w.string, sw, "heap_sizes={:#03b} string", hs);
            assert_eq!(w.guid,   gw, "heap_sizes={:#03b} guid",   hs);
            assert_eq!(w.blob,   bw, "heap_sizes={:#03b} blob",   hs);
        }
    }

    #[test]
    fn token_table_id_and_rid() {
        let t = Token::new(0x02, 5);
        assert_eq!(t.table_id(), 0x02);
        assert_eq!(t.rid(), 5);
        assert_eq!(t.0, 0x02000005);
    }

    #[test]
    fn token_round_trips() {
        let raw: u32 = 0x06000042;
        let t = Token(raw);
        assert_eq!(t.table_id(), 0x06);
        assert_eq!(t.rid(), 0x42);
        assert_eq!(Token::new(t.table_id(), t.rid()).0, raw);
    }
}
