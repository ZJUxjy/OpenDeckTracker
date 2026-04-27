## Why

The live deck tracker currently treats the remaining deck as the original deck minus seen cards, so cards shuffled or generated into the friendly deck never appear in the tracked deck list. This blocks the current deck-tracker polish path in `DEVELOPMENT_PLAN.md`: before overlay and deeper HearthWatcher work depend on the tracker, the in-match deck view needs to reflect common effects that add cards back into the player's library.

## What Changes

- Track known friendly cards that are currently in the `DECK` zone but exceed the original deck composition as shuffled-in deck cards.
- Include shuffled-in cards in the live deck snapshot's remaining deck list and header count, so the renderer shows them as real deck rows rather than only as an extras badge.
- Preserve the current behavior for drawn/played original cards: original copies still leave the deck when they move to hand, board, secret, or graveyard.
- Keep existing extra-card reporting for generated/stolen cards seen outside the deck, but separate it from cards that are currently in the deck.
- Add focused domain and renderer tests covering one and multiple shuffled-in cards, including duplicate copies.

## Non-goals

- Do not implement a full Power.log / HearthWatcher event feed in this change.
- Do not infer hidden face-down shuffled cards whose `cardId` is unknown in memory.
- Do not track opponent deck additions or reveal opposing hidden deck contents.
- Do not redesign the deck tracker UI beyond showing shuffled-in friendly deck cards in the existing live deck panel.
- Do not change deck identification or manual deck selection behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `deck-tracker-core`: Friendly remaining-deck computation and live deck rendering must include known cards shuffled or generated into the player's deck during a match.

## Impact

- Affected code:
  - `packages/core/src/game/deck-snapshot.ts`
  - `packages/core/src/tracker/remaining-algorithm.ts`
  - `packages/core/src/tracker/deck-tracker.ts`
  - `packages/core/src/tracker/expand-copies.ts`
  - `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`
- Affected tests:
  - `packages/core/src/tracker/remaining-algorithm.test.ts`
  - `packages/core/src/tracker/deck-tracker.test.ts`
  - `packages/core/src/tracker/expand-copies.test.ts`
  - `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx`
- APIs:
  - `DeckTrackerSnapshot.deck.remaining` continues to be `{ cardId, count }[]`, but may now include cards not present in `deck.original`.
  - `DeckTrackerSnapshot.deck.extras` remains for seen extra cards outside the deck and should not be the primary representation for known cards currently in the deck.
- Dependencies:
  - No new runtime dependencies are expected.
