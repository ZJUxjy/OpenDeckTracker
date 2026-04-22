//! Cross-reference `getSelectedDeckId.deckId` against `getDecks` to
//! confirm the in-game UI selection resolves to a real saved-deck name.
//!
//! End-to-end smoke test for `InGameDeckIdentifier`'s match logic.

use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::reflection::{decks, selected_deck};

fn main() -> Result<(), ScryError> {
    let rt = MonoRuntime::init()?;

    let selected = futures::executor::block_on(selected_deck::get_selected_deck_id_internal(&rt))?;
    let Some(sel) = selected else {
        println!("getSelectedDeckId returned null — not on Play screen, or no deck highlighted.");
        return Ok(());
    };
    println!(
        "selected: deckId={} templateDeckId={} formatType={}",
        sel.deck_id, sel.template_deck_id, sel.format_type
    );

    let decks = futures::executor::block_on(decks::get_decks_internal(&rt))?;
    let Some(decks) = decks else {
        println!("getDecks returned null");
        return Ok(());
    };

    println!("\nAll {} saved decks:", decks.len());
    for d in &decks {
        let mark = if d.id == sel.deck_id { "  ★" } else { "   " };
        println!(
            "{} id={:>12}  name={:?}  hero={}  fmt={}  cards={}",
            mark, d.id, d.name, d.hero, d.format_type, d.cards.iter().map(|c| c.count).sum::<i32>()
        );
    }

    if let Some(matched) = decks.iter().find(|d| d.id == sel.deck_id) {
        println!("\n→ MATCH: deckId {} = {:?}", sel.deck_id, matched.name);
        println!("   first 5 cards:");
        for c in matched.cards.iter().take(5) {
            println!("     {} x{}", c.card_id, c.count);
        }
    } else {
        println!("\n→ NO MATCH found in saved decks (likely a template / dungeon deck)");
    }
    Ok(())
}
