use crate::collections::list;
use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct CardResult {
    pub dbf_id: i32,
    pub count: i32,
    pub premium: i32,
}

/// Cap the collection iteration at a number well above any reasonable live
/// collection size. As of Hearthstone 32.x `m_collectibleCards` hovers in
/// the 15–20k range (every collectible card × 2 for golden), so 50k leaves
/// headroom for future expansion without letting a corrupted `_size` field
/// run us off the rails.
const COLLECTION_MAX_ITEMS: usize = 50_000;

pub async fn get_collection_internal(
    runtime: &MonoRuntime,
) -> Result<Option<Vec<CardResult>>, ScryError> {
    let Some(instance) =
        runtime.get_singleton(CLS_COLLECTION_MANAGER.0, CLS_COLLECTION_MANAGER.1)?
    else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    // CollectionManager.m_collectibleCards is a `List<CollectionCardData>`
    // in Hearthstone 32.x (previously assumed Dictionary<int, ...>; see
    // diag_field_object.rs verification 2026-04-20). Each element is a
    // reference (pointer, 4 bytes) to a CollectionCardData object.
    let Some(list_ptr) = instance.read_pointer_field(mem, FLD_COLLECTIBLE_CARDS)? else {
        return Ok(None);
    };
    let elem_ptrs = list::iter_element_ptrs(mem, list_ptr, 4, COLLECTION_MAX_ITEMS)?;

    let mut cards = Vec::with_capacity(elem_ptrs.len());
    for elem_ptr in elem_ptrs {
        let card_addr = mem.read_remote_ptr(elem_ptr)?;
        if card_addr.is_null() {
            continue;
        }
        if let Some(card_obj) = instance.child_from_address(mem, card_addr)? {
            cards.push(CardResult {
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

    Ok(Some(cards))
}
