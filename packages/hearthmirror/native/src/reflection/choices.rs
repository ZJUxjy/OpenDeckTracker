//! `getChoices` — active mulligan + general (Discover) choice groups.
//!
//! Walks `GameState.s_instance.m_choicesMap` (a `Blizzard.T5.Core.Map`)
//! and demultiplexes entries by `<ChoiceType>k__BackingField`:
//!   * `MULLIGAN (1)` → `mulligan` slot
//!   * `GENERAL (2)`  → `general` slot
//!   * Other ChoiceType values → silently dropped (future enum
//!     additions don't crash today's TS layer).
//!
//! Per-group `cards` reads `<Entities>k__BackingField` as a `List<int>`
//! of entity ids (NOT object pointers — see design D8) and resolves
//! each id to a card id by re-walking `m_entityMap`.

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::entity::{
    iter_choices_map, read_game_state_singleton, resolve_entity_card_id,
};
use crate::reflection::field_paths::*;
use crate::reflection::tags::choice_type;
use napi_derive::napi;

/// MonoArray header size before the first element. Mirrors the constant
/// in `crate::collections::list` (private there); we duplicate here
/// rather than promote to public because this file is the only other
/// site that needs raw-i32 array reads.
const MONO_ARRAY_DATA_OFFSET: u32 = 0x10;

#[napi(object)]
pub struct ChoiceCard {
    pub entity_id: i32,
    pub card_id: String,
}

#[napi(object)]
pub struct ChoiceGroup {
    pub source_entity_id: i32,
    pub count_min: i32,
    pub count_max: i32,
    pub cards: Vec<ChoiceCard>,
}

#[napi(object)]
pub struct ChoicesResult {
    pub mulligan: Option<ChoiceGroup>,
    pub general: Option<ChoiceGroup>,
}

pub async fn get_choices_internal(
    runtime: &MonoRuntime,
) -> Result<Option<ChoicesResult>, ScryError> {
    let Some(gs) = read_game_state_singleton(runtime)? else {
        return Ok(None);
    };

    let mem = &runtime.memory;
    let mut mulligan: Option<ChoiceGroup> = None;
    let mut general: Option<ChoiceGroup> = None;

    for (_choices_id, choices_obj) in iter_choices_map(runtime, &gs)? {
        let ct = choices_obj
            .read_int32_field(mem, FLD_CHOICE_TYPE)?
            .unwrap_or(0);
        let count_min = choices_obj
            .read_int32_field(mem, FLD_CHOICE_COUNT_MIN)?
            .unwrap_or(0);
        let count_max = choices_obj
            .read_int32_field(mem, FLD_CHOICE_COUNT_MAX)?
            .unwrap_or(0);
        let source = choices_obj
            .read_int32_field(mem, FLD_CHOICE_SOURCE)?
            .unwrap_or(0);

        // Read `<Entities>k__BackingField` as List<int>: get the items
        // array pointer + size, then read raw i32s. ListView assumes
        // element-as-pointer which would mis-interpret raw ints.
        let cards = read_choice_card_ids(runtime, &gs, &choices_obj)?;

        let group = ChoiceGroup {
            source_entity_id: source,
            count_min,
            count_max,
            cards,
        };
        if ct == choice_type::MULLIGAN {
            mulligan = Some(group);
        } else if ct == choice_type::GENERAL {
            general = Some(group);
        }
    }

    Ok(Some(ChoicesResult { mulligan, general }))
}

/// Read `<Entities>k__BackingField` from a Choices object as a
/// `List<int>` and resolve each entity id to its card id via
/// `m_entityMap`.
fn read_choice_card_ids(
    runtime: &MonoRuntime,
    gs: &crate::mono::object::MonoObject,
    choices_obj: &crate::mono::object::MonoObject,
) -> Result<Vec<ChoiceCard>, ScryError> {
    let mem = &runtime.memory;
    let Some(list_ptr) = choices_obj.read_pointer_field(mem, FLD_CHOICE_ENTITIES)? else {
        return Ok(Vec::new());
    };

    // List<T> layout: vtable, monitor, _items: T[], _size: i32, _version: i32.
    // _items at +0x08, _size at +0x0C (per `crate::collections::list`).
    let items_ptr = mem.read_remote_ptr(list_ptr + 0x08)?;
    let size = mem.read_i32(list_ptr + 0x0C)?.max(0) as usize;
    if items_ptr.is_null() || size == 0 {
        return Ok(Vec::new());
    }

    let data_start = items_ptr + MONO_ARRAY_DATA_OFFSET;
    let mut out = Vec::with_capacity(size);
    for i in 0..size as u32 {
        // Each int is 4 bytes inline; NOT a pointer.
        let eid = mem.read_i32(data_start + i * 4)?;
        let card_id = resolve_entity_card_id(runtime, gs, eid);
        out.push(ChoiceCard {
            entity_id: eid,
            card_id,
        });
    }
    Ok(out)
}
