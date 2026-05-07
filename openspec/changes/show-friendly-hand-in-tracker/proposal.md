## Why

The live deck panel currently shows remaining deck cards but does not give the player a reliable, glanceable view of their current hand inside the tracker. This fits the existing deck-tracker work in `DEVELOPMENT_PLAN.md` by extending the in-match overlay/panel surface rather than introducing a new subsystem.

## What Changes

- Add a friendly-hand section below the remaining-card list in the player deck tracker panel.
- Display current friendly hand cards in the same top-to-bottom order as their in-game left-to-right hand positions.
- Use localized card names and existing card row visual language where practical, while keeping hand rows visually distinct from remaining-deck rows.
- Keep the hand section synchronized with the existing deck-tracker snapshot updates.

## Non-goals

- Do not change opponent hand tracking or opponent overlay behavior.
- Do not change remaining-deck sorting, count logic, draw animations, or compact pip behavior.
- Do not add manual hand editing, drag-and-drop, or card play controls.
- Do not change HearthMirror native schemas unless the current hand-state payload is insufficient during implementation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deck-tracker-core`: LiveDeckPanel must render a friendly-hand section below remaining cards, ordered by current hand position instead of mana cost/name.

## Impact

- `packages/core`: May need snapshot shape or normalization helpers if current `friendlyHand` ordering is not already stable and sufficient.
- `apps/desktop/src/renderer`: Update `LiveDeckPanel` rendering, card definition loading, i18n strings, and tests.
- `apps/desktop/src/main`: No expected IPC channel changes if the existing deck-tracker snapshot already carries `friendlyHand`.
- Tests: Add/adjust core snapshot tests only if ordering or data shape changes; add renderer tests for section placement, ordering, localization, and empty state.
