//! `getBoardState` — friendly + opposing minions on the board, sorted
//! by zone position. Enchantments are filtered out (they belong to
//! their parent minion's effects, not the player-facing board display).
//!
//! Per-entity selection criteria:
//! * `m_realTimeZone == zone::PLAY`
//! * `read_entity_controller(...) == friendly_id` (or opposing_id)
//! * `read_entity_tag(..., CARDTYPE) != ENCHANTMENT`
//!
//! Returns `None` when no match is active (`GameState.s_instance` NULL,
//! or controller-id discovery fails). See change `design.md` D7 for the
//! "all in-match readers degrade to `null` not `Err`" rationale.

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::entity::{
    discover_player_ids, iter_entity_map, read_entity_card_id, read_entity_controller,
    read_entity_tag, read_game_state_singleton, read_realtime_combat_stats, read_realtime_zone,
};
use crate::reflection::tags::{card_type, tags, zone};
use napi_derive::napi;

#[napi(object)]
pub struct BoardEntity {
    pub entity_id: i32,
    pub card_id: String,
    pub zone_position: i32,
    pub attack: i32,
    pub health: i32,
    pub damage: i32,
}

#[napi(object)]
pub struct BoardStateResult {
    pub friendly: Vec<BoardEntity>,
    pub opposing: Vec<BoardEntity>,
}

pub async fn get_board_state_internal(
    runtime: &MonoRuntime,
) -> Result<Option<BoardStateResult>, ScryError> {
    let Some(gs) = read_game_state_singleton(runtime)? else {
        return Ok(None);
    };
    let (friendly_id, opposing_id) = discover_player_ids(runtime, &gs);
    let (Some(friendly_id), Some(opposing_id)) = (friendly_id, opposing_id) else {
        return Ok(None);
    };

    let mem = &runtime.memory;
    let mut friendly = Vec::new();
    let mut opposing = Vec::new();

    for (entity_id, entity) in iter_entity_map(runtime, &gs)? {
        if read_realtime_zone(mem, &entity)? != zone::PLAY {
            continue;
        }
        let ctrl = read_entity_controller(runtime, &entity)?;
        // Exclude enchantments from board display (they're attached
        // effects, not standalone minions).
        if read_entity_tag(runtime, &entity, tags::CARDTYPE)? == card_type::ENCHANTMENT {
            continue;
        }

        let stats = read_realtime_combat_stats(runtime, &entity)?;
        let board_entity = BoardEntity {
            entity_id,
            card_id: read_entity_card_id(runtime, &entity),
            zone_position: stats.zone_position,
            attack: stats.attack,
            health: stats.health,
            damage: stats.damage,
        };

        if ctrl == friendly_id {
            friendly.push(board_entity);
        } else if ctrl == opposing_id {
            opposing.push(board_entity);
        }
    }

    friendly.sort_by_key(|e| e.zone_position);
    opposing.sort_by_key(|e| e.zone_position);

    Ok(Some(BoardStateResult { friendly, opposing }))
}
