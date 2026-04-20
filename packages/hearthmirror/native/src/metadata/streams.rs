use super::MetadataError;
use std::collections::HashMap;

/// ECMA-335 §II.24.2.1 — "Magic" signature that begins every metadata root.
const BSJB: u32 = 0x424A_5342; // "BSJB" little-endian: B=0x42 S=0x53 J=0x4A B=0x42

/// Parsed metadata streams extracted from a BSJB metadata root.
///
/// Provides named access to the raw stream bytes. The stream names you will
/// typically find are `"#~"`, `"#Strings"`, `"#US"`, `"#GUID"`, `"#Blob"`.
pub struct StreamSet<'a> {
    streams: HashMap<String, &'a [u8]>,
}

impl<'a> StreamSet<'a> {
    /// Parse the BSJB metadata root in `metadata` and index all stream headers.
    ///
    /// `metadata` must be the byte slice returned by `pe::locate_metadata_section`.
    pub fn parse(metadata: &'a [u8]) -> Result<Self, MetadataError> {
        // II.24.2.1 MetadataRoot layout:
        //   0..4   Magic (BSJB)
        //   4..6   MajorVersion
        //   6..8   MinorVersion
        //   8..12  Reserved
        //  12..16  VersionLength (n, padded to 4-byte boundary)
        //  16..16+n  VersionString
        //  16+padded(n)+0..+2  Flags
        //  16+padded(n)+2..+4  NumberOfStreams
        if metadata.len() < 20 {
            return Err(MetadataError::Truncated("metadata root too short".into()));
        }
        let sig = u32::from_le_bytes([metadata[0], metadata[1], metadata[2], metadata[3]]);
        if sig != BSJB {
            return Err(MetadataError::Truncated(format!(
                "bad BSJB signature 0x{:08X}",
                sig
            )));
        }
        let version_len =
            u32::from_le_bytes([metadata[12], metadata[13], metadata[14], metadata[15]]) as usize;
        let version_padded = (version_len + 3) & !3;

        let mut off = 16 + version_padded; // skip to flags
        if metadata.len() < off + 4 {
            return Err(MetadataError::Truncated("metadata stream count missing".into()));
        }
        // flags (2 bytes, always 0) + NumberOfStreams (2 bytes)
        let n_streams = u16::from_le_bytes([metadata[off + 2], metadata[off + 3]]) as usize;
        off += 4;

        let mut streams: HashMap<String, &'a [u8]> = HashMap::with_capacity(n_streams);

        for _ in 0..n_streams {
            // II.24.2.2 StreamHeader: Offset (4) + Size (4) + Name (null-terminated, padded to 4)
            if metadata.len() < off + 8 {
                return Err(MetadataError::Truncated("stream header truncated".into()));
            }
            let stream_off =
                u32::from_le_bytes([metadata[off], metadata[off + 1], metadata[off + 2], metadata[off + 3]])
                    as usize;
            let stream_size =
                u32::from_le_bytes([metadata[off + 4], metadata[off + 5], metadata[off + 6], metadata[off + 7]])
                    as usize;
            off += 8;

            // Read null-terminated name, padded to 4-byte boundary
            let name_start = off;
            let name_end = metadata[name_start..]
                .iter()
                .position(|&b| b == 0)
                .map(|p| name_start + p)
                .unwrap_or(metadata.len());
            let name = std::str::from_utf8(&metadata[name_start..name_end])
                .map_err(|_| MetadataError::Truncated("non-UTF-8 stream name".into()))?
                .to_owned();
            // Advance past name + null terminator, rounded up to 4-byte boundary
            off = (name_end + 1 + 3) & !3;

            let stream_bytes = metadata
                .get(stream_off..stream_off + stream_size)
                .ok_or_else(|| {
                    MetadataError::Truncated(format!("stream '{}' out of bounds", name))
                })?;
            streams.insert(name, stream_bytes);
        }

        Ok(Self { streams })
    }

    /// Return the raw bytes for the named stream, or `None` if absent.
    pub fn get(&self, name: &str) -> Option<&'a [u8]> {
        self.streams.get(name).copied()
    }

    /// Return the `#Strings` heap bytes.
    pub fn strings(&self) -> Option<&'a [u8]> {
        self.get("#Strings")
    }

    /// Return the `#~` (compressed tables) stream bytes.
    pub fn tables(&self) -> Option<&'a [u8]> {
        self.get("#~")
    }

    /// Return the `#GUID` heap bytes.
    pub fn guids(&self) -> Option<&'a [u8]> {
        self.get("#GUID")
    }

    /// Return the `#Blob` heap bytes.
    pub fn blobs(&self) -> Option<&'a [u8]> {
        self.get("#Blob")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metadata::pe::locate_metadata_section;

    fn fixture(name: &str) -> Vec<u8> {
        let dir = env!("CARGO_MANIFEST_DIR");
        let path = std::path::Path::new(dir).join("tests/fixtures").join(name);
        std::fs::read(&path).unwrap_or_else(|e| panic!("cannot read fixture {:?}: {}", path, e))
    }

    #[test]
    fn parse_finds_standard_streams() {
        let dll = fixture("MinimalAssembly.dll");
        let meta = locate_metadata_section(&dll).expect("locate metadata");
        let set = StreamSet::parse(meta).expect("parse streams");
        assert!(set.tables().is_some(), "#~ stream should be present");
        assert!(set.strings().is_some(), "#Strings heap should be present");
    }

    #[test]
    fn parse_rejects_truncated_data() {
        let result = StreamSet::parse(&[0u8; 4]);
        assert!(result.is_err(), "expected Err for truncated input");
    }

    #[test]
    fn get_returns_slice() {
        let dll = fixture("MinimalAssembly.dll");
        let meta = locate_metadata_section(&dll).expect("locate metadata");
        let set = StreamSet::parse(meta).expect("parse streams");
        let strings = set.strings().expect("#Strings heap");
        // The #Strings heap always starts with a null byte (empty string at index 0)
        assert_eq!(strings[0], 0, "#Strings heap[0] should be 0x00");
    }
}
