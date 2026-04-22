//! In-match entity / player / tag plumbing shared by all Phase-7 reflectors.
//!
//! Five reflectors (`getBoardState`, `getHandState`, `getDeckState`,
//! `getOpponentSecrets`, `getChoices`) all walk
//! `GameState.s_instance.m_entityMap` and resolve per-entity attributes
//! (controller, zone, card id, attack/health/etc.) the same way. Putting
//! the helpers here keeps each reflector file thin and avoids duplicating
//! the tag-dictionary fallback logic five times.
//!
//! See `add-hearthmirror-decks-and-in-match-readers/design.md` D1 for the
//! "shared module vs. inline duplication vs. promote to MonoObject"
//! decision rationale.

use crate::collections::{custom_map, dict};
use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::object::MonoObject;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;

/// Soft cap on `m_entityMap` size — well above the largest observed
/// entity-count for a Battlegrounds full board (~150). Triggers
/// `CollectionOverflow` if exceeded, signalling layout drift rather
/// than a transient state.
const MAX_ENTITIES: usize = 4096;

/// Soft cap on `m_playerMap` size. Hearthstone matches have 2-8 players
/// (Battlegrounds = 8); 64 keeps the safety net wide.
const MAX_PLAYERS: usize = 64;

/// Soft cap on `m_choicesMap` size. Active choice groups are typically
/// 0-2 (mulligan + maybe one Discover); 64 covers any future expansion.
const MAX_CHOICES: usize = 64;

/// Bytes per `Dictionary<int, int>` entry (`hashCode i32` + `next i32`
/// + `key i32` + `value i32`). Used by [`read_entity_tag`] to walk
///   `TagMap.m_values`.
const TAG_DICT_ENTRY_SIZE: u32 = 16;

/// Resolve `GameState.s_instance` from `Assembly-CSharp.dll`.
///
/// Returns `Ok(None)` (NOT `Err`) when:
/// * `GameState` class is not loaded (uninstalled / pre-init);
/// * `GameState` has no static-field data (cctor never ran);
/// * `s_instance` static slot reads NULL (no active match — main menu,
///   loading, mode-select screens).
///
/// Errors propagate only on genuine memory-read failures.
pub fn read_game_state_singleton(
    runtime: &MonoRuntime,
) -> Result<Option<MonoObject>, ScryError> {
    runtime.get_singleton(CLS_GAME_STATE_FOR_MATCH.0, CLS_GAME_STATE_FOR_MATCH.1)
}

/// Iterate `gs.m_entityMap` (a `Blizzard.T5.Core.Map<int, Entity>`),
/// yielding `(entity_id, entity_object)` pairs for every populated slot.
///
/// `entity_id` is read from the slot's `keySlots[i]` interpreted as a
/// raw `i32` — `Map<int, V>` stores integers inline in the key array
/// (no boxing), so `key_ptr.raw()` IS the entity id.
///
/// Null value pointers and value pointers that fail to materialise as
/// `MonoObject` (corrupted vtable etc.) are silently skipped — keeping
/// callers' filter loops simple.
pub fn iter_entity_map(
    runtime: &MonoRuntime,
    gs: &MonoObject,
) -> Result<Vec<(i32, MonoObject)>, ScryError> {
    iter_int_keyed_map(runtime, gs, FLD_ENTITY_MAP, MAX_ENTITIES)
}

/// Iterate `gs.m_playerMap` (a `Blizzard.T5.Core.Map<int, Player>`).
/// Same key-as-int convention as [`iter_entity_map`].
pub fn iter_player_map(
    runtime: &MonoRuntime,
    gs: &MonoObject,
) -> Result<Vec<(i32, MonoObject)>, ScryError> {
    iter_int_keyed_map(runtime, gs, FLD_PLAYER_MAP, MAX_PLAYERS)
}

/// Iterate `gs.m_choicesMap` (a `Blizzard.T5.Core.Map<int, Choices>`).
pub fn iter_choices_map(
    runtime: &MonoRuntime,
    gs: &MonoObject,
) -> Result<Vec<(i32, MonoObject)>, ScryError> {
    iter_int_keyed_map(runtime, gs, FLD_CHOICES_MAP, MAX_CHOICES)
}

fn iter_int_keyed_map(
    runtime: &MonoRuntime,
    gs: &MonoObject,
    field_name: &str,
    max_items: usize,
) -> Result<Vec<(i32, MonoObject)>, ScryError> {
    let mem = &runtime.memory;
    let Some(map_ptr) = gs.read_pointer_field(mem, field_name)? else {
        return Ok(Vec::new());
    };
    let entries = custom_map::iter_entries(mem, map_ptr, max_items)?;

    let mut out = Vec::with_capacity(entries.len());
    for (key_ptr, value_ptr) in entries {
        if value_ptr.is_null() {
            continue;
        }
        let key_as_int = key_ptr.raw() as i32;
        if let Some(obj) = MonoObject::from_address(mem, value_ptr, runtime.offsets.clone())? {
            out.push((key_as_int, obj));
        }
    }
    Ok(out)
}

/// Discover `(friendly_controller_id, opposing_controller_id)` by
/// walking `gs.m_playerMap` and reading each Player's `m_local: bool`.
///
/// The map key for each entry IS the controller id (Hearthstone protocol
/// invariant: player id == TAG_CONTROLLER value), so we never need to
/// scan entity tags to find the friendly side.
///
/// Returns `(None, None)` when the map is empty (pre-match) or when no
/// player has `m_local == true` (spectator mode — currently unsupported,
/// see design D6 R2). Otherwise returns `(Some(local), Some(other))`
/// for any standard 1v1 / Battlegrounds layout.
pub fn discover_player_ids(
    runtime: &MonoRuntime,
    gs: &MonoObject,
) -> (Option<i32>, Option<i32>) {
    let players = match iter_player_map(runtime, gs) {
        Ok(v) => v,
        Err(_) => return (None, None),
    };

    let mem = &runtime.memory;
    let mut friendly = None;
    let mut opposing = None;
    for (player_id, player) in players {
        let is_local = player
            .read_bool_field(mem, FLD_PLAYER_M_LOCAL)
            .unwrap_or(Some(false))
            .unwrap_or(false);
        if is_local {
            friendly = Some(player_id);
        } else {
            opposing = Some(player_id);
        }
    }
    (friendly, opposing)
}

/// Look up a single GAME_TAG value from any Hearthstone entity.
///
/// Resolution order (per design D5):
/// 1. `entity.<Tags>k__BackingField → TagMap` — runtime auto-property
///    used by in-match `Entity` objects.
/// 2. Fallback to `entity.m_tags` for older `EntityBase` shapes (e.g.
///    collection-side `EntityDef`).
///
/// Returns `0` for "tag not present" — Hearthstone's convention for
/// unset tags. Never returns `Err` for missing fields; only for genuine
/// memory-read failures.
pub fn read_entity_tag(
    runtime: &MonoRuntime,
    entity: &MonoObject,
    tag_key: i32,
) -> Result<i32, ScryError> {
    let mem = &runtime.memory;

    let tag_map_ptr = match entity.read_pointer_field(mem, FLD_TAGS_BACKING)? {
        Some(p) => Some(p),
        None => entity.read_pointer_field(mem, FLD_TAGS_LEGACY)?,
    };
    let Some(tag_map_ptr) = tag_map_ptr else {
        return Ok(0);
    };

    let Some(tag_map) = MonoObject::from_address(mem, tag_map_ptr, runtime.offsets.clone())? else {
        return Ok(0);
    };
    let Some(values_dict_ptr) = tag_map.read_pointer_field(mem, FLD_TAG_VALUES)? else {
        return Ok(0);
    };

    let entries = dict::iter_entries(mem, values_dict_ptr, TAG_DICT_ENTRY_SIZE, MAX_ENTITIES)?;
    for entry in entries {
        let key = mem.read_i32(entry.addr + 0x08)?;
        if key == tag_key {
            return mem.read_i32(entry.addr + 0x0C);
        }
    }
    Ok(0)
}

/// Convenience wrapper for [`read_entity_tag`] reading TAG_CONTROLLER
/// (50). Used by every per-entity ownership filter in the in-match
/// reflectors.
pub fn read_entity_controller(
    runtime: &MonoRuntime,
    entity: &MonoObject,
) -> Result<i32, ScryError> {
    read_entity_tag(runtime, entity, crate::reflection::tags::tags::CONTROLLER)
}

/// Read an entity's card id by trying the runtime auto-property first,
/// falling back to the legacy `EntityBase` field.
///
/// Returns the empty string when neither field resolves (typical for
/// hidden / face-down entities like opposing-hand cards).
pub fn read_entity_card_id(
    runtime: &MonoRuntime,
    entity: &MonoObject,
) -> String {
    let mem = &runtime.memory;
    if let Ok(Some(s)) = entity.read_string_field(mem, FLD_CARD_ID_BACKING) {
        if !s.is_empty() {
            return s;
        }
    }
    entity
        .read_string_field(mem, FLD_CARD_ID_LEGACY)
        .ok()
        .flatten()
        .unwrap_or_default()
}

/// Read an entity's `m_realTime*` mirror fields (zone position, attack,
/// health, damage). These are i32 fields the runtime keeps in sync with
/// the corresponding tag values for game-loop perf.
///
/// Missing fields default to 0 — neutral for arithmetic display.
pub fn read_realtime_combat_stats(
    runtime: &MonoRuntime,
    entity: &MonoObject,
) -> Result<RealtimeStats, ScryError> {
    let mem = &runtime.memory;
    Ok(RealtimeStats {
        zone_position: entity.read_int32_field(mem, FLD_REALTIME_ZONE_POS)?.unwrap_or(0),
        attack: entity.read_int32_field(mem, FLD_REALTIME_ATTACK)?.unwrap_or(0),
        health: entity.read_int32_field(mem, FLD_REALTIME_HEALTH)?.unwrap_or(0),
        damage: entity.read_int32_field(mem, FLD_REALTIME_DAMAGE)?.unwrap_or(0),
    })
}

/// Read an entity's runtime zone tag mirror (`m_realTimeZone`, an i32
/// matching one of the `tags::zone::*` constants).
pub fn read_realtime_zone(
    memory: &ProcessMemory,
    entity: &MonoObject,
) -> Result<i32, ScryError> {
    Ok(entity.read_int32_field(memory, FLD_REALTIME_ZONE)?.unwrap_or(0))
}

/// Resolve a target entity-id to its card id by re-walking
/// `m_entityMap`. Used by `getChoices` to map list-of-entity-id
/// payloads to displayable card identifiers.
///
/// Returns the empty string when no match is found.
pub fn resolve_entity_card_id(
    runtime: &MonoRuntime,
    gs: &MonoObject,
    target_entity_id: i32,
) -> String {
    let entries = match iter_entity_map(runtime, gs) {
        Ok(v) => v,
        Err(_) => return String::new(),
    };
    for (eid, entity) in entries {
        if eid == target_entity_id {
            return read_entity_card_id(runtime, &entity);
        }
    }
    String::new()
}

/// Stats common to board / hand entity rendering.
#[derive(Debug, Clone, Copy)]
pub struct RealtimeStats {
    pub zone_position: i32,
    pub attack: i32,
    pub health: i32,
    pub damage: i32,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `RealtimeStats` is plain data — sanity-check the field layout
    /// stays Copy + Clone so reflectors can return it by value freely.
    #[test]
    fn realtime_stats_is_copy() {
        fn assert_copy<T: Copy>() {}
        assert_copy::<RealtimeStats>();
    }

    /// Smoke-test the constants this module relies on are non-empty —
    /// guards against accidental clearing in `field_paths.rs`.
    #[test]
    fn required_field_paths_are_set() {
        assert!(!FLD_ENTITY_MAP.is_empty());
        assert!(!FLD_PLAYER_MAP.is_empty());
        assert!(!FLD_CHOICES_MAP.is_empty());
        assert!(!FLD_TAGS_BACKING.is_empty());
        assert!(!FLD_TAGS_LEGACY.is_empty());
        assert!(!FLD_TAG_VALUES.is_empty());
        assert_eq!(TAG_DICT_ENTRY_SIZE, 16);
    }
}
