//! `getOpponentSecrets` — opposing secrets currently in play.
//!
//! Reports `cardId` for each secret entity. This IS an information leak
//! from the opposing player's perspective; HDT historically exposes it
//! for research/training, and users with fairness concerns disable
//! display in the UI layer (out-of-scope here).

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::entity::{
    discover_player_ids, iter_entity_map, read_entity_card_id, read_entity_controller,
    read_game_state_singleton, read_realtime_zone,
};
use crate::reflection::tags::zone;
use napi_derive::napi;

#[napi(object)]
pub struct SecretEntity {
    pub entity_id: i32,
    pub card_id: String,
    pub zone_position: i32,
}

#[napi(object)]
pub struct OpponentSecretsResult {
    pub secrets: Vec<SecretEntity>,
    pub count: i32,
}

pub async fn get_opponent_secrets_internal(
    runtime: &MonoRuntime,
) -> Result<Option<OpponentSecretsResult>, ScryError> {
    let Some(gs) = read_game_state_singleton(runtime)? else {
        return Ok(None);
    };
    let (_, opposing_id) = discover_player_ids(runtime, &gs);
    let Some(opposing_id) = opposing_id else {
        return Ok(None);
    };

    let mem = &runtime.memory;
    let mut secrets = Vec::new();

    for (entity_id, entity) in iter_entity_map(runtime, &gs)? {
        if read_realtime_zone(mem, &entity)? != zone::SECRET {
            continue;
        }
        if read_entity_controller(runtime, &entity)? != opposing_id {
            continue;
        }
        secrets.push(SecretEntity {
            entity_id,
            card_id: read_entity_card_id(runtime, &entity),
            zone_position: entity
                .read_int32_field(mem, crate::reflection::field_paths::FLD_REALTIME_ZONE_POS)?
                .unwrap_or(0),
        });
    }

    let count = secrets.len() as i32;
    Ok(Some(OpponentSecretsResult { secrets, count }))
}
