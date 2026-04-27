//! `getBoardState` — friendly + opposing board cards, sorted by zone
//! position. Heroes, hero powers, and enchantments are filtered out
//! because they are not opponent deck-history cards.
//!
//! Per-entity selection criteria:
//! * `m_realTimeZone == zone::PLAY`
//! * `read_entity_controller(...) == friendly_id` (or opposing_id)
//! * `read_entity_tag(..., CARDTYPE)` is not HERO / HERO_POWER / ENCHANTMENT
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
        // Exclude always-present actors/effects that should not be
        // recorded as opponent cards.
        if !is_trackable_board_card_type(read_entity_tag(runtime, &entity, tags::CARDTYPE)?) {
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

fn is_trackable_board_card_type(card_type_value: i32) -> bool {
    !matches!(
        card_type_value,
        card_type::HERO | card_type::HERO_POWER | card_type::ENCHANTMENT
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trackable_board_card_type_excludes_non_card_history_entities() {
        assert!(!is_trackable_board_card_type(card_type::HERO));
        assert!(!is_trackable_board_card_type(card_type::HERO_POWER));
        assert!(!is_trackable_board_card_type(card_type::ENCHANTMENT));
    }

    #[test]
    fn trackable_board_card_type_keeps_played_cards() {
        assert!(is_trackable_board_card_type(card_type::MINION));
        assert!(is_trackable_board_card_type(card_type::SPELL));
        assert!(is_trackable_board_card_type(card_type::WEAPON));
    }
}
