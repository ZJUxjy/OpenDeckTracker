//! `getEditedDeck` — the deck currently open in the in-game collection
//! editor.
//!
//! Path: `CollectionManager.s_instance.m_EditedDeck` →
//! single `CollectionDeck` instance → reuse the same per-deck reader as
//! `getDecks`.
//!
//! Returns `None` when:
//! * `CollectionManager` is not initialised (very early startup);
//! * `m_EditedDeck` is NULL (the user is not on the deck-edit screen
//!   — typical state outside of "我的收藏 → 编辑卡组").
//!
//! The result IS a full `DeckResult` (same shape as `getDecks` entries)
//! so consumers can render it through the same UI pipeline.

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::decks::{read_deck_from_object, DeckResult};
use crate::reflection::field_paths::*;

pub async fn get_edited_deck_internal(
    runtime: &MonoRuntime,
) -> Result<Option<DeckResult>, ScryError> {
    let Some(instance) =
        runtime.get_singleton(CLS_COLLECTION_MANAGER.0, CLS_COLLECTION_MANAGER.1)?
    else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    let Some(deck_obj) = instance.read_object_field(mem, FLD_EDITED_DECK)? else {
        return Ok(None);
    };
    Ok(Some(read_deck_from_object(mem, &deck_obj)?))
}
