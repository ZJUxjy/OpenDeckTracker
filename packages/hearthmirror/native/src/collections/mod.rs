use crate::error::ScryError;
use crate::mono::offsets::MonoOffsets;

pub mod custom_map;
pub mod dict;
pub mod glist;
pub mod list;

// The bundled runtime uses the 32-bit Mono/.NET reference-type layout where
// managed instance fields begin at object.data_start and each field-sized word
// occupies one pointer-width slot.
const DICTIONARY_ENTRIES_WORD_INDEX: u32 = 1;
const DICTIONARY_COUNT_WORD_INDEX: u32 = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ReferenceTypeLayout {
    object_data_start: u32,
    word_size: u32,
}

impl ReferenceTypeLayout {
    pub(crate) fn from_offsets(offsets: &MonoOffsets) -> Result<Self, ScryError> {
        let object_data_start = u32::try_from(offsets.structs.object.data_start).map_err(|_| {
            ScryError::Unsupported(format!(
                "object.data_start out of 32-bit range: {}",
                offsets.structs.object.data_start
            ))
        })?;
        let word_size = u32::try_from(offsets.ptr_size).map_err(|_| {
            ScryError::Unsupported(format!("ptr_size out of range: {}", offsets.ptr_size))
        })?;
        if word_size > std::mem::size_of::<u32>() as u32 {
            return Err(ScryError::Unsupported(format!(
                "32-bit Mono/.NET reference layout requires 32-bit pointers, got {}",
                offsets.ptr_size
            )));
        }
        Ok(Self {
            object_data_start,
            word_size,
        })
    }

    pub(crate) fn word_offset(self, index: u32) -> Result<u32, ScryError> {
        let delta = index
            .checked_mul(self.word_size)
            .ok_or_else(|| ScryError::Unsupported("reference layout offset overflow".into()))?;
        self.object_data_start
            .checked_add(delta)
            .ok_or_else(|| ScryError::Unsupported("reference layout offset overflow".into()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ListLayout {
    pub(crate) items_offset: u32,
    pub(crate) size_offset: u32,
}

pub(crate) fn list_layout(offsets: &MonoOffsets) -> Result<ListLayout, ScryError> {
    let layout = ReferenceTypeLayout::from_offsets(offsets)?;
    Ok(ListLayout {
        items_offset: layout.word_offset(0)?,
        size_offset: layout.word_offset(1)?,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DictionaryLayout {
    pub(crate) entries_offset: u32,
    pub(crate) count_offset: u32,
}

pub(crate) fn dictionary_layout(offsets: &MonoOffsets) -> Result<DictionaryLayout, ScryError> {
    let layout = ReferenceTypeLayout::from_offsets(offsets)?;
    Ok(DictionaryLayout {
        entries_offset: layout.word_offset(DICTIONARY_ENTRIES_WORD_INDEX)?,
        count_offset: layout.word_offset(DICTIONARY_COUNT_WORD_INDEX)?,
    })
}

#[cfg(test)]
mod tests {
    use super::{dictionary_layout, list_layout};
    use crate::mono::offsets::MonoOffsets;

    #[test]
    fn list_layout_uses_runtime_object_header_and_word_slots() {
        let offsets = MonoOffsets::bundled_unity_2021_3().unwrap();
        let layout = list_layout(&offsets).unwrap();
        let object_data_start = u32::try_from(offsets.structs.object.data_start).unwrap();
        let ptr_size = u32::try_from(offsets.ptr_size).unwrap();

        assert_eq!(layout.items_offset, object_data_start);
        assert_eq!(layout.size_offset, object_data_start + ptr_size);
    }

    #[test]
    fn dictionary_layout_uses_runtime_reference_word_offsets() {
        let offsets = MonoOffsets::bundled_unity_2021_3().unwrap();
        let layout = dictionary_layout(&offsets).unwrap();
        let object_data_start = u32::try_from(offsets.structs.object.data_start).unwrap();
        let ptr_size = u32::try_from(offsets.ptr_size).unwrap();

        assert_eq!(layout.entries_offset, object_data_start + ptr_size);
        assert_eq!(layout.count_offset, object_data_start + ptr_size * 6);
    }
}
