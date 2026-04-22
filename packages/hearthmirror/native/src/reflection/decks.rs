//! `getDecks` — every CollectionDeck the player has saved.
//!
//! Closes spike 0003 R-17. Walks
//! `CollectionManager.s_instance.m_decks` (a
//! `Blizzard.T5.Core.Map<long, CollectionDeck>`) via
//! `crate::collections::custom_map::iter_entries`. The Phase-1 stub
//! used `dict::iter_entries` which produced the
//! `CollectionOverflow{max=5000}` error because the map's count word
//! sits at a different offset than `Dictionary._count`.
//!
//! ## DeckResult schema
//!
//! Mirrors upstream `D:\code\hearthmirror-rs/hm-rpc/src/protocol.rs`
//! `DeckResult` exactly so the TS layer can adopt the same shape:
//!
//! ```text
//! { id, name, hero, format_type, deck_type, season_id, cardback_id,
//!   create_date_microsec, cards: [{ card_id, count, premium }] }
//! ```
//!
//! `CollectionDeckSlot.m_count` is a pointer to a boxed `int` — Mono
//! stores boxed primitives as `MonoObject` header (8 bytes) + the
//! value. The actual i32 lives at `+0x10` within the box (verified live
//! 2026-04-21 against upstream `hm-rpc/src/handler.rs::read_slot_count`
//! + the `debug_read_raw` probe at lines 709–798). NULL pointer means
//!   "default count" → 1 copy.
//!
//! `CollectionDeckSlot` does not declare a `premium` field (premium
//! lives on `CollectibleCard`, not on the deck slot — different code
//! path). We report `premium = 0` for every slot to maintain the
//! schema; consumers should cross-reference `getCollection` for premium
//! state.

use crate::collections::custom_map;
use crate::collections::list;
use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::object::MonoObject;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use crate::remote_ptr::RemotePtr;
use napi_derive::napi;

/// Soft cap on `CollectionManager.m_decks`. The largest observed deck
/// count for a long-tenured account is ~30; 1024 leaves generous
/// headroom while still triggering `CollectionOverflow` on layout drift.
const MAX_DECKS: usize = 1024;

/// Soft cap on a deck's slot list. Standard decks have 30 slots
/// (1 hero + 30 cards, sometimes counted differently); 256 covers
/// future format expansions like Hero Power slots.
const MAX_DECK_SLOTS: usize = 256;

/// Mono boxed-int value offset within the boxed `MonoObject`. Constant
/// across recent Mono runtimes (verified live; see file-header doc).
const BOXED_INT_VALUE_OFFSET: u32 = 0x10;

/// Default deck-slot count when the boxed pointer is null. Hearthstone
/// writes slots without an explicit count to mean "one copy".
const DEFAULT_SLOT_COUNT: i32 = 1;

#[napi(object)]
pub struct DeckCardResult {
    pub card_id: String,
    pub count: i32,
    pub premium: i32,
}

#[napi(object)]
pub struct DeckResult {
    pub id: i64,
    pub name: String,
    pub hero: String,
    pub format_type: i32,
    pub deck_type: i32,
    pub season_id: i32,
    pub cardback_id: i32,
    pub create_date_microsec: i64,
    pub cards: Vec<DeckCardResult>,
}

/// Read a `CollectionDeckSlot.m_count` boxed-int via the `+0x10`
/// stable offset. NULL pointer → [`DEFAULT_SLOT_COUNT`].
fn read_boxed_int(mem: &ProcessMemory, ptr: Option<RemotePtr>) -> Result<i32, ScryError> {
    match ptr {
        None => Ok(DEFAULT_SLOT_COUNT),
        Some(p) => mem.read_i32(p + BOXED_INT_VALUE_OFFSET),
    }
}

/// Read a single `CollectionDeck` MonoObject into a `DeckResult`.
/// Exported for reuse by `edited_deck.rs` and `arena.rs`.
pub fn read_deck_from_object(
    mem: &ProcessMemory,
    deck: &MonoObject,
) -> Result<DeckResult, ScryError> {
    let id = deck
        .read_int64_field(mem, FLD_COLLECTION_DECK_ID)?
        .unwrap_or(0);
    let name = deck
        .read_string_field(mem, FLD_COLLECTION_DECK_NAME)?
        .unwrap_or_default();
    let hero = deck
        .read_string_field(mem, FLD_COLLECTION_DECK_HERO)?
        .unwrap_or_default();
    let format_type = deck
        .read_int32_field(mem, FLD_COLLECTION_DECK_FORMAT)?
        .unwrap_or(0);
    let deck_type = deck
        .read_int32_field(mem, FLD_COLLECTION_DECK_TYPE)?
        .unwrap_or(0);
    let season_id = deck
        .read_int32_field(mem, FLD_COLLECTION_DECK_SEASON)?
        .unwrap_or(0);
    let cardback_id = deck
        .read_int32_field(mem, FLD_COLLECTION_DECK_CARDBACK)?
        .unwrap_or(0);
    let create_date_microsec = deck
        .read_int64_field(mem, FLD_COLLECTION_DECK_CREATE_DATE)?
        .unwrap_or(0);

    // CollectionDeck.m_slots is `List<CollectionDeckSlot>`.
    let cards = if let Some(slots_ptr) = deck.read_pointer_field(mem, FLD_COLLECTION_DECK_SLOTS)? {
        let elem_ptrs = list::iter_element_ptrs(mem, slots_ptr, 4, MAX_DECK_SLOTS)?;
        let mut out = Vec::with_capacity(elem_ptrs.len());
        for elem_ptr in elem_ptrs {
            let slot_addr = mem.read_remote_ptr(elem_ptr)?;
            if slot_addr.is_null() {
                continue;
            }
            let Some(slot_obj) = deck.child_from_address(mem, slot_addr)? else {
                continue;
            };
            let card_id = slot_obj
                .read_string_field(mem, FLD_DECK_SLOT_CARD_ID)?
                .unwrap_or_default();
            let count_ptr = slot_obj.read_pointer_field(mem, FLD_DECK_SLOT_COUNT)?;
            let count = read_boxed_int(mem, count_ptr)?;
            out.push(DeckCardResult {
                card_id,
                count,
                premium: 0,
            });
        }
        out
    } else {
        Vec::new()
    };

    Ok(DeckResult {
        id,
        name,
        hero,
        format_type,
        deck_type,
        season_id,
        cardback_id,
        create_date_microsec,
        cards,
    })
}

pub async fn get_decks_internal(
    runtime: &MonoRuntime,
) -> Result<Option<Vec<DeckResult>>, ScryError> {
    let Some(instance) =
        runtime.get_singleton(CLS_COLLECTION_MANAGER.0, CLS_COLLECTION_MANAGER.1)?
    else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    let Some(map_ptr) = instance.read_pointer_field(mem, FLD_DECKS)? else {
        // CollectionManager exists but the map is null — interpret as
        // "logged-in user has no saved decks". Return Some(empty) so
        // the TS layer can distinguish from "no CollectionManager".
        return Ok(Some(Vec::new()));
    };

    let entries = custom_map::iter_entries(mem, map_ptr, MAX_DECKS)?;
    let mut decks = Vec::with_capacity(entries.len());
    for (_key, deck_ptr) in entries {
        if deck_ptr.is_null() {
            continue;
        }
        let Some(deck_obj) = MonoObject::from_address(mem, deck_ptr, runtime.offsets.clone())?
        else {
            continue;
        };
        decks.push(read_deck_from_object(mem, &deck_obj)?);
    }
    Ok(Some(decks))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `read_boxed_int(None, _)` MUST return [`DEFAULT_SLOT_COUNT`] —
    /// the Phase-1 chain didn't read counts at all, so this is the
    /// first guarded behaviour for a NULL pointer field.
    #[test]
    fn read_boxed_int_null_returns_default() {
        let mem = ProcessMemory::new(crate::handle::OwnedProcessHandle::current());
        assert_eq!(read_boxed_int(&mem, None).unwrap(), DEFAULT_SLOT_COUNT);
    }

    /// The boxed-int offset is stable per upstream `read_slot_count` —
    /// lock the constant against accidental edits.
    #[test]
    fn boxed_int_value_offset_is_0x10() {
        assert_eq!(BOXED_INT_VALUE_OFFSET, 0x10);
    }
}
