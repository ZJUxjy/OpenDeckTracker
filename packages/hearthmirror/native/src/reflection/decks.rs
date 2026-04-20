use crate::collections::list;
use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::object::MonoObject;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct DeckCardResult {
    pub dbf_id: i32,
    pub count: i32,
    pub premium: i32,
}

#[napi(object)]
pub struct DeckResult {
    pub id: i64,
    pub name: String,
    pub hero: String,
    pub format_type: i32,
    pub deck_type: i32,
    pub cards: Vec<DeckCardResult>,
}

/// Read a single deck object into a DeckResult.
/// Exported for reuse by arena.rs.
pub fn read_deck_from_object(
    mem: &ProcessMemory,
    deck: &MonoObject,
) -> Result<DeckResult, ScryError> {
    let id = deck.read_int64_field(mem, FLD_DECK_ID)?.unwrap_or(0);
    let name = deck
        .read_string_field(mem, FLD_DECK_NAME)?
        .unwrap_or_default();
    let hero = deck
        .read_string_field(mem, FLD_DECK_HERO)?
        .unwrap_or_default();
    let format_type = deck
        .read_int32_field(mem, FLD_DECK_FORMAT_TYPE)?
        .unwrap_or(0);
    let deck_type = deck
        .read_int32_field(mem, FLD_DECK_TYPE)?
        .unwrap_or(0);

    // Deck.m_slots is a List<DeckCardData>
    let cards = if let Some(slots_ptr) = deck.read_pointer_field(mem, FLD_DECK_SLOTS)? {
        // Each element in the List is a reference (pointer, 4 bytes) to a DeckCardData object
        let elem_ptrs = list::iter_element_ptrs(mem, slots_ptr, 4, 1000)?;
        let mut cards = Vec::with_capacity(elem_ptrs.len());
        for elem_ptr in elem_ptrs {
            let card_addr = mem.read_remote_ptr(elem_ptr)?;
            if card_addr.is_null() {
                continue;
            }
            if let Some(card_obj) = deck.child_from_address(mem, card_addr)? {
                cards.push(DeckCardResult {
                    dbf_id: card_obj
                        .read_int32_field(mem, FLD_CARD_DBF_ID)?
                        .unwrap_or(0),
                    count: card_obj
                        .read_int32_field(mem, FLD_CARD_COUNT)?
                        .unwrap_or(0),
                    premium: card_obj
                        .read_int32_field(mem, FLD_CARD_PREMIUM)?
                        .unwrap_or(0),
                });
            }
        }
        cards
    } else {
        Vec::new()
    };

    Ok(DeckResult {
        id,
        name,
        hero,
        format_type,
        deck_type,
        cards,
    })
}

pub async fn get_decks_internal(
    runtime: &MonoRuntime,
) -> Result<Option<Vec<DeckResult>>, ScryError> {
    let Some(instance) =
        runtime.get_singleton(CLS_COLLECTION_MANAGER.0, CLS_COLLECTION_MANAGER.1)?
    else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    // CollectionManager.s_instance → .m_decks (List<CollectionDeck>)
    let Some(decks_ptr) = instance.read_pointer_field(mem, FLD_DECKS)? else {
        return Ok(None);
    };

    // Each element is a reference (4 bytes) to a CollectionDeck object
    let elem_ptrs = list::iter_element_ptrs(mem, decks_ptr, 4, 5000)?;
    let mut decks = Vec::with_capacity(elem_ptrs.len());
    for elem_ptr in elem_ptrs {
        let deck_addr = mem.read_remote_ptr(elem_ptr)?;
        if deck_addr.is_null() {
            continue;
        }
        if let Some(deck_obj) = instance.child_from_address(mem, deck_addr)? {
            decks.push(read_deck_from_object(mem, &deck_obj)?);
        }
    }

    Ok(Some(decks))
}
