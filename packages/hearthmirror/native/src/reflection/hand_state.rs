//! `getHandState` — friendly hand cards (full info) + opposing hand
//! count (no card ids — opposing-hand contents are unknown to the
//! friendly player except for revealed cards, which are out-of-scope).

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::entity::{
    discover_player_ids, iter_entity_map, read_entity_card_id, read_entity_controller,
    read_game_state_singleton, read_realtime_zone,
};
use crate::reflection::tags::zone;
use napi_derive::napi;

#[napi(object)]
pub struct HandCard {
    pub entity_id: i32,
    pub card_id: String,
    pub zone_position: i32,
}

#[napi(object)]
pub struct HandStateResult {
    pub friendly_hand: Vec<HandCard>,
    pub opposing_hand_count: i32,
}

pub async fn get_hand_state_internal(
    runtime: &MonoRuntime,
) -> Result<Option<HandStateResult>, ScryError> {
    let Some(gs) = read_game_state_singleton(runtime)? else {
        return Ok(None);
    };
    let (friendly_id, opposing_id) = discover_player_ids(runtime, &gs);
    let (Some(friendly_id), Some(opposing_id)) = (friendly_id, opposing_id) else {
        return Ok(None);
    };

    let mem = &runtime.memory;
    let mut friendly_hand = Vec::new();
    let mut opposing_hand_count = 0;

    for (entity_id, entity) in iter_entity_map(runtime, &gs)? {
        if read_realtime_zone(mem, &entity)? != zone::HAND {
            continue;
        }
        let ctrl = read_entity_controller(runtime, &entity)?;
        if ctrl == friendly_id {
            friendly_hand.push(HandCard {
                entity_id,
                card_id: read_entity_card_id(runtime, &entity),
                zone_position: entity
                    .read_int32_field(mem, crate::reflection::field_paths::FLD_REALTIME_ZONE_POS)?
                    .unwrap_or(0),
            });
        } else if ctrl == opposing_id {
            opposing_hand_count += 1;
        }
    }

    friendly_hand.sort_by_key(|c| c.zone_position);

    Ok(Some(HandStateResult {
        friendly_hand,
        opposing_hand_count,
    }))
}
