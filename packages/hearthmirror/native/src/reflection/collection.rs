use crate::collections::dict;
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

pub async fn get_collection_internal(
    runtime: &MonoRuntime,
) -> Result<Option<Vec<CardResult>>, ScryError> {
    let Some(instance) =
        runtime.get_singleton(CLS_COLLECTION_MANAGER.0, CLS_COLLECTION_MANAGER.1)?
    else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    // CollectionManager.s_instance → .m_collectibleCards (Dictionary<int, CollectionCardData>)
    let Some(dict_ptr) = instance.read_pointer_field(mem, FLD_COLLECTIBLE_CARDS)? else {
        return Ok(None);
    };

    // Dictionary entry layout: hash(4) + next(4) + key(4) + value(4) = 16 bytes
    let entry_ptrs = dict::iter_entries(mem, dict_ptr, 16, 50_000)?;
    let mut cards = Vec::with_capacity(entry_ptrs.len());
    for entry in entry_ptrs {
        // key is at +8 in the entry (dbf_id as int)
        let dbf_id = mem.read_i32(entry.addr + 0x08)?;
        // value is at +12 (pointer to CollectionCardData object)
        let card_addr = mem.read_remote_ptr(entry.addr + 0x0C)?;
        if card_addr.is_null() {
            continue;
        }
        if let Some(card_obj) = instance.child_from_address(mem, card_addr)? {
            cards.push(CardResult {
                dbf_id,
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
