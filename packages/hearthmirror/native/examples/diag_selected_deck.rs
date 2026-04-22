//! Live-validate the `getSelectedDeckId` chain against the running game.
//!
//! Reads `DeckPickerTrayDisplay.s_instance.m_selectedCustomDeckBox.{
//! m_deckID, m_deckTemplateId}` plus `m_visualsFormatType`, prints what
//! it found (or the reason the chain is empty in this scene).

use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::reflection::field_paths::*;

fn main() -> Result<(), ScryError> {
    let rt = MonoRuntime::init()?;

    let instance = match rt.get_singleton(CLS_DECK_PICKER_TRAY.0, CLS_DECK_PICKER_TRAY.1)? {
        Some(o) => o,
        None => {
            println!("DeckPickerTrayDisplay.s_instance is null");
            println!("(Expected when not on the Play menu's deck-picker scene.)");
            return Ok(());
        }
    };
    println!("DeckPickerTrayDisplay @ {}", instance.addr);

    let mem = &rt.memory;
    let format_type = instance.read_int32_field(mem, FLD_VISUALS_FORMAT_TYPE)?.unwrap_or(0);
    println!("m_visualsFormatType = {}", format_type);

    let Some(box_obj) = instance.read_object_field(mem, FLD_SELECTED_CUSTOM_DECK_BOX)? else {
        println!("m_selectedCustomDeckBox is null (no deck currently highlighted)");
        return Ok(());
    };
    println!("m_selectedCustomDeckBox @ {}  class = {}", box_obj.addr, box_obj.fields.len());

    let deck_id = box_obj.read_int64_field(mem, FLD_DECK_BOX_DECK_ID)?.unwrap_or(0);
    let template_id = box_obj.read_int32_field(mem, FLD_DECK_BOX_TEMPLATE_ID)?.unwrap_or(0);
    println!("m_deckID         = {}", deck_id);
    println!("m_deckTemplateId = {}", template_id);

    if deck_id > 0 {
        println!("\n→ user has highlighted a saved CollectionDeck (id={})", deck_id);
    } else if template_id > 0 {
        println!("\n→ user has highlighted a Blizzard template deck (template_id={})", template_id);
    } else {
        println!("\n→ deck box is empty (very unusual; no deck selected)");
    }
    Ok(())
}
