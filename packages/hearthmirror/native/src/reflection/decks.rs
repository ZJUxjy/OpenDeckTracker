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
//! `CollectionDeckSlot.m_count` changed shape in current 64-bit Hearthstone:
//! it is a `List<int>` whose buckets sum to the deck-slot copy count. Older
//! builds exposed a boxed `int`, so the reader keeps a boxed-int fallback. NULL
//! pointer means "default count" → 1 copy.
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

/// Mono boxed-int value offset retained for older Hearthstone builds where
/// `CollectionDeckSlot.m_count` was a boxed `int`.
const BOXED_INT_VALUE_OFFSET: u32 = 0x10;

/// Soft cap for the current `List<int>`-backed slot-count payload. Live 64-bit
/// Hearthstone currently stores five values; this leaves room for format drift.
const MAX_SLOT_COUNT_VALUES: usize = 16;

/// Deck slot copy counts should be tiny. Keep a broad cap so unusual modes do
/// not break, while still rejecting address fragments from layout drift.
const MAX_PLAUSIBLE_SLOT_COUNT: i32 = 99;

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

/// Read `CollectionDeckSlot.m_count`. Current Hearthstone stores this as
/// `List<int>`; older builds used a boxed `int`.
fn read_slot_count(mem: &ProcessMemory, ptr: Option<RemotePtr>) -> Result<i32, ScryError> {
    match ptr {
        None => Ok(DEFAULT_SLOT_COUNT),
        Some(p) => {
            if let Some(count) = read_list_backed_slot_count(mem, p)? {
                return Ok(count);
            }
            read_boxed_slot_count(mem, p)
        }
    }
}

fn read_list_backed_slot_count(
    mem: &ProcessMemory,
    ptr: RemotePtr,
) -> Result<Option<i32>, ScryError> {
    let elem_ptrs = match list::iter_element_ptrs(mem, ptr, 4, MAX_SLOT_COUNT_VALUES) {
        Ok(v) => v,
        Err(ScryError::CollectionOverflow { .. }) | Err(ScryError::MemoryAccess { .. }) => {
            return Ok(None);
        }
        Err(e) => return Err(e),
    };
    if elem_ptrs.is_empty() {
        return Ok(None);
    }

    let mut total = 0_i32;
    for elem_ptr in elem_ptrs {
        let count = match mem.read_i32(elem_ptr) {
            Ok(v) => v,
            Err(ScryError::MemoryAccess { .. }) => return Ok(None),
            Err(e) => return Err(e),
        };
        if count < 0 || count > MAX_PLAUSIBLE_SLOT_COUNT {
            return Ok(None);
        }
        total += count;
    }
    Ok(is_plausible_slot_count(total).then_some(total))
}

fn read_boxed_slot_count(mem: &ProcessMemory, ptr: RemotePtr) -> Result<i32, ScryError> {
    let count = mem.read_i32(ptr + BOXED_INT_VALUE_OFFSET)?;
    if is_plausible_slot_count(count) {
        Ok(count)
    } else {
        Err(ScryError::MetadataError(format!(
            "deck slot count {} outside plausible range 1..={}",
            count, MAX_PLAUSIBLE_SLOT_COUNT
        )))
    }
}

fn is_plausible_slot_count(count: i32) -> bool {
    (DEFAULT_SLOT_COUNT..=MAX_PLAUSIBLE_SLOT_COUNT).contains(&count)
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
        let elem_ptrs = list::iter_element_ptrs(mem, slots_ptr, mem.ptr_size(), MAX_DECK_SLOTS)?;
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
            let count = read_slot_count(mem, count_ptr)?;
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
    fn read_slot_count_null_returns_default() {
        let mem = ProcessMemory::new(crate::handle::OwnedProcessHandle::current());
        assert_eq!(read_slot_count(&mem, None).unwrap(), DEFAULT_SLOT_COUNT);
    }

    #[test]
    fn read_slot_count_reads_first_value_from_list_backed_count() {
        let mem = ProcessMemory::new_with_ptr_size(crate::handle::OwnedProcessHandle::current(), 8);
        let mut buf = vec![0_u8; 0x100];
        let base = buf.as_mut_ptr() as u64;
        let list_addr = base;
        let array_addr = base + 0x80;

        buf[0x10..0x18].copy_from_slice(&array_addr.to_le_bytes());
        buf[0x18..0x1C].copy_from_slice(&5_i32.to_le_bytes());
        buf[0x80 + 0x20..0x80 + 0x24].copy_from_slice(&2_i32.to_le_bytes());

        let leaked: &'static mut [u8] = Box::leak(buf.into_boxed_slice());
        let _ = leaked;

        assert_eq!(
            read_slot_count(&mem, Some(RemotePtr::new(list_addr))).unwrap(),
            2
        );
    }

    #[test]
    fn read_slot_count_sums_list_backed_count_buckets() {
        let mem = ProcessMemory::new_with_ptr_size(crate::handle::OwnedProcessHandle::current(), 8);
        let mut buf = vec![0_u8; 0x100];
        let base = buf.as_mut_ptr() as u64;
        let list_addr = base;
        let array_addr = base + 0x80;

        buf[0x10..0x18].copy_from_slice(&array_addr.to_le_bytes());
        buf[0x18..0x1C].copy_from_slice(&5_i32.to_le_bytes());
        buf[0x80 + 0x20..0x80 + 0x24].copy_from_slice(&1_i32.to_le_bytes());
        buf[0x80 + 0x24..0x80 + 0x28].copy_from_slice(&1_i32.to_le_bytes());

        let leaked: &'static mut [u8] = Box::leak(buf.into_boxed_slice());
        let _ = leaked;

        assert_eq!(
            read_slot_count(&mem, Some(RemotePtr::new(list_addr))).unwrap(),
            2
        );
    }

    /// The boxed-int offset is stable per upstream `read_slot_count` —
    /// lock the constant against accidental edits.
    #[test]
    fn boxed_int_value_offset_is_0x10() {
        assert_eq!(BOXED_INT_VALUE_OFFSET, 0x10);
    }
}
