# Spike 0004 — In-game "currently selected play deck" Mono field

**Goal**: find a Mono field that, while the user is on the Play screen,
holds the deck id of the deck the user has clicked on (the deck about
to be queued). Outcome decides whether `add-deck-tracker-mvp`'s
`InGameDeckIdentifier` ships with auto-detection from memory or stays
dialog-only.

**Spike date**: 2026-04-22 (HDT.js iteration session)

## Method

Used existing diagnostic CLIs against a running Hearthstone process:

1. `cargo run --example diag_images -- "<class>"` — find a candidate
   class.
2. `cargo run --example diag_klass_fields -- 0x<klass>` — dump field
   names + offsets.
3. `cargo run --example diag_static_chain -- 0x<klass> s_instance ...` —
   verify the reachable chain.

## Findings

### Candidates probed

| Class                                | Verdict | Reason                                                                      |
|--------------------------------------|---------|-----------------------------------------------------------------------------|
| `CollectionManager`                  | ❌      | No `m_lastSelectedDeck` / `m_currentDeckId` / similar; only `m_EditedDeck`. |
| `DeckPickerTrayDisplay`              | ✅      | Has `s_instance` + `m_selectedCustomDeckBox` + `m_visualsFormatType`.      |
| `DeckPickerState`                    | ❌      | Class doesn't exist (it's HearthMirror's DTO name, not a game class).      |

### Confirmed chain

```
DeckPickerTrayDisplay.s_instance       (Assembly-CSharp.dll, MonoBehaviour singleton)
  ├─ m_visualsFormatType : i32           ← current format tab (Wild/Standard/Classic/Twist)
  └─ m_selectedCustomDeckBox             (CollectionDeckBox UI component)
       ├─ m_deckID         : i64         ← THIS is the saved-deck id we want
       └─ m_deckTemplateId : i32         ← > 0 for Blizzard template (PvP starter / event) decks
```

Cross-referenced against upstream HearthMirror's
`HearthMirror.decompiled.cs:2549` (`InternalGetDeckPickerState`)
which reads exactly the same fields.

### Lifecycle constraint

`DeckPickerTrayDisplay.s_instance` is **null until the user opens the
Play menu's deck-picker scene**. In main menu / collection / settings /
mid-match the class hasn't been instantiated and `runtime_info` is
NULL — `MonoRuntime::get_singleton` returns `Ok(None)`, the reflector
returns `null`, the orchestrator falls back to `CallbackDeckIdentifier`
(dialog flow).

This matches upstream behaviour and is the correct degraded path:
the dialog covers Practice / Brawl / Adventure / Tavern Brawl modes
where the deck picker UI never loads to begin with.

### Validity by mode

Based on the same upstream code path:

| Mode                       | `s_instance` available? | Deck id readable?                       |
|----------------------------|--------------------------|------------------------------------------|
| Standard / Wild Ranked     | ✅                       | ✅ (`m_deckID > 0`)                      |
| Standard / Wild Casual     | ✅                       | ✅ (`m_deckID > 0`)                      |
| Friendly Challenge         | ✅                       | ✅ (`m_deckID > 0`)                      |
| Tavern Brawl (custom deck) | ✅                       | ✅ (`m_deckID > 0`)                      |
| Tavern Brawl (template)    | ✅                       | template-only (`m_deckTemplateId > 0`)   |
| Practice (Innkeeper)       | ❌ (different scene)     | n/a — dialog fallback                    |
| Adventure / Solo Content   | ❌ (different scene)     | n/a — dialog fallback                    |
| Battlegrounds / Mercs      | ❌ (different scene)     | out-of-scope per M2 non-goals            |

## Outcome

Reflector implemented as `getSelectedDeckId` →
`Promise<{ deckId: bigint, templateDeckId: number, formatType: number } | null>`.
`@hdt/core`'s `InGameDeckIdentifier` now consumes it: matches `deckId`
against `getDecks()` results, returns the matching saved deck or
`null` (which triggers the dialog fallback).

## Live-validation status (2026-04-22)

- Verified live: `s_instance` == NULL when on main menu (correct).
- Pending verification: deck-id read while on Play screen — to be
  done as part of `add-deck-tracker-mvp` Section 7.
