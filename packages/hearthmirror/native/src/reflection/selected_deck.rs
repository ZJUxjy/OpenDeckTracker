//! `getSelectedDeckId` — the deck the user currently has highlighted in
//! the in-game deck-picker UI (the deck about to be queued).
//!
//! ## Chain (verified live during `add-deck-tracker-mvp` Section 2 spike)
//!
//! ```text
//! DeckPickerTrayDisplay.s_instance       (Assembly-CSharp.dll, MonoBehaviour singleton)
//!   ├─ m_visualsFormatType : i32           (current format tab — 1=Wild, 2=Standard, 3=Classic, 4=Twist)
//!   └─ m_selectedCustomDeckBox             (CollectionDeckBox UI object, may be null)
//!        ├─ m_deckID         : i64         (the saved deck id; > 0 = real deck)
//!        └─ m_deckTemplateId : i32         (PvP template deck id; > 0 = template deck)
//! ```
//!
//! Returns `Ok(None)` when:
//! * `DeckPickerTrayDisplay` class hasn't been initialised yet — the
//!   class is NOT loaded until the user opens the Play menu's
//!   deck-picker scene. In main menu / collection / settings the
//!   `runtime_info` is null and `s_instance` can't be reached.
//! * `s_instance` field is NULL (deck picker scene unloaded).
//! * `m_selectedCustomDeckBox` is NULL (no deck selected — unusual,
//!   typically only at the moment between scene load and first user
//!   click).
//! * Both `deckId == 0` AND `templateDeckId == 0` (a deck box without
//!   a populated saved deck — also unusual).
//!
//! Mirror reference: upstream HearthMirror's
//! `DeckPickerState.SelectedDeck` (`HearthMirror.decompiled.cs:2549`)
//! reads exactly this chain.

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct SelectedDeckResult {
    /// Saved-deck id (>0 when the user picked a custom CollectionDeck).
    pub deck_id: i64,
    /// Template-deck id (>0 when the user picked a Blizzard template).
    /// Mutually exclusive with `deck_id` in practice.
    pub template_deck_id: i32,
    /// Currently visible format tab — `PegasusShared.FormatType` enum.
    pub format_type: i32,
}

pub async fn get_selected_deck_id_internal(
    runtime: &MonoRuntime,
) -> Result<Option<SelectedDeckResult>, ScryError> {
    let Some(instance) = runtime
        .get_singleton(CLS_DECK_PICKER_TRAY.0, CLS_DECK_PICKER_TRAY.1)?
    else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    let format_type = instance
        .read_int32_field(mem, FLD_VISUALS_FORMAT_TYPE)?
        .unwrap_or(0);

    let Some(deck_box) = instance.read_object_field(mem, FLD_SELECTED_CUSTOM_DECK_BOX)? else {
        return Ok(None);
    };

    let deck_id = deck_box.read_int64_field(mem, FLD_DECK_BOX_DECK_ID)?.unwrap_or(0);
    let template_deck_id = deck_box
        .read_int32_field(mem, FLD_DECK_BOX_TEMPLATE_ID)?
        .unwrap_or(0);

    if deck_id == 0 && template_deck_id == 0 {
        return Ok(None);
    }

    Ok(Some(SelectedDeckResult {
        deck_id,
        template_deck_id,
        format_type,
    }))
}
