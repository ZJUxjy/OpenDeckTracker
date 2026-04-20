use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

use super::decks::{read_deck_from_object, DeckResult};

#[napi(object)]
pub struct ArenaInfoResult {
    pub deck: DeckResult,
    pub wins: i32,
    pub losses: i32,
}

pub async fn get_arena_deck_internal(
    runtime: &MonoRuntime,
) -> Result<Option<ArenaInfoResult>, ScryError> {
    let Some(instance) =
        runtime.get_singleton(CLS_DRAFT_MANAGER.0, CLS_DRAFT_MANAGER.1)?
    else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    // DraftManager.s_instance → .m_currentDeck
    let Some(deck_obj) = instance.read_object_field(mem, FLD_CURRENT_DECK)? else {
        return Ok(None);
    };

    let deck = read_deck_from_object(mem, &deck_obj)?;
    let wins = instance.read_int32_field(mem, FLD_WINS)?.unwrap_or(0);
    let losses = instance.read_int32_field(mem, FLD_LOSSES)?.unwrap_or(0);

    Ok(Some(ArenaInfoResult { deck, wins, losses }))
}
