//! `getDeckState` — friendly remaining deck (entity_id + card_id) +
//! opposing deck count. Friendly deck contents are reported because the
//! player's own deck is known to them at game start; opposing deck is
//! count-only.
//!
//! Order of `friendly_deck` is unspecified — deck cards have no
//! meaningful zone position (they're shuffled).

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::entity::{
    discover_player_ids, iter_entity_map, read_entity_card_id, read_entity_controller,
    read_game_state_singleton, read_realtime_zone,
};
use crate::reflection::tags::zone;
use napi_derive::napi;

#[napi(object)]
pub struct InMatchDeckCard {
    pub entity_id: i32,
    pub card_id: String,
}

#[napi(object)]
pub struct DeckStateResult {
    pub friendly_deck: Vec<InMatchDeckCard>,
    pub opposing_deck_count: i32,
}

pub async fn get_deck_state_internal(
    runtime: &MonoRuntime,
) -> Result<Option<DeckStateResult>, ScryError> {
    let Some(gs) = read_game_state_singleton(runtime)? else {
        return Ok(None);
    };
    let (friendly_id, opposing_id) = discover_player_ids(runtime, &gs);
    let (Some(friendly_id), Some(opposing_id)) = (friendly_id, opposing_id) else {
        return Ok(None);
    };

    let mem = &runtime.memory;
    let mut friendly_deck = Vec::new();
    let mut opposing_deck_count = 0;

    for (entity_id, entity) in iter_entity_map(runtime, &gs)? {
        if read_realtime_zone(mem, &entity)? != zone::DECK {
            continue;
        }
        let ctrl = read_entity_controller(runtime, &entity)?;
        if ctrl == friendly_id {
            friendly_deck.push(InMatchDeckCard {
                entity_id,
                card_id: read_entity_card_id(runtime, &entity),
            });
        } else if ctrl == opposing_id {
            opposing_deck_count += 1;
        }
    }

    Ok(Some(DeckStateResult {
        friendly_deck,
        opposing_deck_count,
    }))
}
