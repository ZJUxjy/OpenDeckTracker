## Context

The current deck tracker has enough memory data to see friendly deck entities through `getDeckState().friendlyDeck`, but the remaining-cards algorithm only looks at cards that have left the deck zone. It computes `remaining = originalDeck - seenCards`, where `seenCards` comes from hand, board, graveyard, and secret zones. That is correct for ordinary draws, but it cannot represent a known card that an effect shuffles into the friendly deck.

The renderer has the same assumption. `LiveDeckPanel` expands `snapshot.deck.original` into physical rows, then filters by `snapshot.deck.remaining`. If `remaining` contains a card that was not in `original`, the row is never created.

Target files after this change:

```text
packages/core/src/
  game/
    deck-snapshot.ts
  tracker/
    remaining-algorithm.ts
    remaining-algorithm.test.ts
    deck-tracker.ts
    deck-tracker.test.ts
    expand-copies.ts
    expand-copies.test.ts
apps/desktop/src/renderer/
  src/components/LiveDeckPanel.tsx
  tests/LiveDeckPanel.test.tsx
openspec/changes/track-shuffled-cards-in-live-deck/
  proposal.md
  design.md
  specs/deck-tracker-core/spec.md
  tasks.md
```

No new external dependency is required.

## Goals / Non-Goals

**Goals:**

- Include known friendly cards currently in the `DECK` zone when they exceed the original-deck remaining multiset.
- Keep the existing draw/played-card behavior deterministic and pure.
- Render shuffled-in cards as normal live deck rows with card name, cost, rarity, hover image, and draw-exit behavior.
- Keep the snapshot wire shape small and source-compatible where practical.

**Non-Goals:**

- No Power.log / HearthWatcher event feed in this change.
- No inference for unknown face-down deck entities with empty `cardId`.
- No opponent deck addition tracking.
- No new visual section or separate shuffled-card UI beyond inclusion in the existing list.
- No change to deck identification, manual selection, or saved deck data.

## Decisions

### D1. Derive deck additions from known DECK-zone entities

**Context:** The memory reflector exposes friendly deck entities as `{ entityId, cardId }`, and `cardId` may be empty for face-down/unknown cards. Known shuffled cards can appear as friendly `DECK` entities with a non-empty `cardId`.

**Options:**

- Keep using only `originalDeck - seenCards`.
- Treat every known card in the deck zone as an additional card.
- Compare known deck-zone cards against the expected original remaining multiset and add only the overflow.

**Choice:** Compare known deck-zone cards against expected original remaining, then merge only overflow into `remaining`.

**Rationale:** This handles generated cards without double-counting ordinary original cards that happen to be visible in the deck. The core rule is:

```text
seen = known friendly cards outside DECK
baseRemaining = originalDeck - seen
knownDeck = known friendly cards currently in DECK
shuffledIntoDeck = knownDeck - baseRemaining
remaining = baseRemaining + shuffledIntoDeck
extras = seen - originalDeck
```

### D2. Keep shuffled-in cards inside `deck.remaining`

**Context:** Existing consumers already render `snapshot.deck.remaining`, and the user's bug is specifically that the live deck list does not grow when a card is shuffled into the deck.

**Options:**

- Add a new `deck.shuffled` field and require the renderer to merge it.
- Put shuffled-in cards in `deck.extras`.
- Put currently-in-deck additions directly in `deck.remaining`.

**Choice:** Put currently-in-deck additions directly in `deck.remaining`; keep `deck.extras` for extra cards that have been seen outside the deck.

**Rationale:** `remaining` is the user-facing "what is in my deck now" list. A known shuffled card in the deck is not merely an extra badge; it is a drawable deck card. Keeping it in `remaining` also preserves IPC compatibility because the field already exists.

### D3. Expand renderer rows from `remaining`, not `original`

**Context:** The renderer currently expands `original` into per-copy rows and filters by `remaining`. That makes cards absent from `original` impossible to display.

**Options:**

- Expand `original` and append a second expansion for non-original remaining cards.
- Expand `remaining` directly.
- Introduce a new copy model with provenance metadata.

**Choice:** Expand `deck.remaining` directly for visible rows.

**Rationale:** The visible rows should correspond to the current deck contents. Draw-exit animation can still compare previous and current remaining counts. Sorting and card definition lookup should use the union of `original` and `remaining` card ids so original and shuffled-in rows resolve metadata consistently.

### D4. Do not persist provenance yet

**Context:** Without Power.log events we cannot reliably know whether a card with the same `cardId` as an original card was generated, redrawn, or merely revealed in place.

**Options:**

- Add provenance fields such as `source: "original" | "shuffled"` to snapshot rows.
- Track provenance only in core internals.
- Track counts only for now.

**Choice:** Track counts only.

**Rationale:** Count-level correctness fixes the user-visible bug while avoiding a false sense of precision. A future HearthWatcher change can add provenance from authoritative log events.

## Risks / Trade-offs

- **[Known-only limitation]** → Hidden shuffled cards with empty `cardId` cannot be displayed by name. The snapshot still uses `friendlyDeckCount` for raw count, and this change only promises known card additions.
- **[Same-card ambiguity]** → If an effect shuffles a third copy of a card already in the original deck, the algorithm only shows the overflow when known deck-zone count exceeds expected original remaining. This is conservative and avoids double-counting.
- **[Renderer row identity]** → Copy keys based on `cardId#ordinal` are count-stable, not physical-entity stable. This matches the current copy model; future entity-id row keys can be considered when the snapshot carries entity provenance.
- **[Performance]** → The algorithm adds small multiset arithmetic over at most deck-size card counts. This remains O(n) per poll and negligible compared with IPC/reflection.
- **[Compatibility]** → `deck.remaining` can now contain card ids absent from `deck.original`. Consumers must not assume `remaining` is a subset of `original`.

## Migration Plan

1. Add failing unit tests for remaining computation with known cards in `DECK`.
2. Extend `DeckSnapshot` with a pure `add()` or `merge()` operation if needed by the algorithm.
3. Update `computeRemaining` to accept friendly deck entities and merge overflow into `remaining`.
4. Pass `this.game.localPlayer.deck` from `DeckTracker.buildSnapshot()` into the algorithm.
5. Update `LiveDeckPanel` to expand `deck.remaining` for visible rows and resolve card definitions for remaining-only ids.
6. Run focused core and renderer tests, then full typecheck/test if practical.

Rollback:

- Revert `computeRemaining` to the original `originalDeck.subtract(seenSnapshot)` behavior and switch `LiveDeckPanel` back to expanding `deck.original`.

## Open Questions

- Should a future snapshot expose shuffled-in counts separately for analytics or visual labeling? Default for this change: no, keep UI simple.
- When HearthWatcher arrives, should log-derived shuffle events override memory-derived deck additions? Default future direction: logs should be authoritative when available, with memory polling as a fallback.
