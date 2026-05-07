## Context

`DeckTrackerSnapshot` already exposes `friendlyHand`, and `LiveDeckPanel` already renders the player's in-match deck state using card definitions, card-preview hover behavior, localized text, and Console theme tokens. The missing piece is a dedicated hand section that uses the snapshot's current hand order rather than the remaining-deck sort order.

The hand section belongs in the existing player tracker panel because the user is trying to answer a different question than "what remains in deck": "what is currently in my hand, in the same positional order I see in-game?" This should be implemented as a renderer change first, with core changes only if the current snapshot loses hand position information.

Final expected file footprint:

```text
apps/desktop/src/renderer/src/components/
  LiveDeckPanel.tsx          # add friendly-hand section below remaining cards
apps/desktop/src/renderer/src/i18n/
  *.ts                       # add localized section labels / empty text if needed
apps/desktop/src/renderer/tests/
  LiveDeckPanel.test.tsx     # add ordering and rendering coverage
packages/core/src/tracker/
  deck-tracker.ts            # only if friendlyHand must carry position metadata
  deck-tracker.test.ts       # only if snapshot ordering/data shape changes
```

No new external dependency is required; existing React, Zustand, Tailwind, i18n, and `@hdt/hearthdb` lookup paths are sufficient.

## Goals / Non-Goals

**Goals:**

- Render a friendly-hand section below the remaining-card section in the player deck tracker.
- Preserve in-game hand order by mapping left-to-right hand positions to top-to-bottom rows.
- Use localized card names and existing card-definition lookup/cache behavior.
- Keep the existing remaining-deck list behavior unchanged.
- Keep the change independently testable with renderer unit tests, and core tests only if snapshot ordering changes.

**Non-Goals:**

- Do not add opponent hand rendering.
- Do not add manual card manipulation or hand editing.
- Do not change compact pip rows, draw animations, remaining-card sorting, or remaining-card counts.
- Do not introduce a new IPC channel unless the current snapshot cannot carry the required order.

## Decisions

### Decision 1: Render hand cards from snapshot data in `LiveDeckPanel`

**Context:** The tracker snapshot already feeds `LiveDeckPanel`, and the panel already resolves card definitions for visible card rows.

**Options:**

- Add a new renderer-only section using `snapshot.friendlyHand`.
- Create a separate hand panel/component mounted elsewhere.
- Add a new IPC subscription directly to HearthMirror hand state.

**Choice:** Add the section to `LiveDeckPanel`, below the remaining-card list.

**Rationale:** This keeps the user's deck and current hand in one glanceable player tracker surface, avoids another data subscription path, and reuses existing card-definition and preview behavior.

### Decision 2: Preserve hand order before display sorting

**Context:** Remaining cards sort by cost/name/cardId, but hand cards must reflect physical in-game hand order.

**Options:**

- Reuse the remaining-deck sort comparator.
- Display `snapshot.friendlyHand` in array order.
- Change `friendlyHand` to carry `{ cardId, zonePosition }` and sort by `zonePosition` in the renderer.

**Choice:** Prefer the core snapshot to provide hand cards in `zonePosition` order, then render `snapshot.friendlyHand` in array order. If implementation finds the current string array can be unstable, promote the snapshot shape to include position metadata and normalize in core.

**Rationale:** The renderer should not infer game order from card names or costs. Keeping order normalization close to HearthMirror data makes tests simpler and prevents UI sorting from accidentally breaking the in-game order contract.

### Decision 3: Use a compact row style distinct from remaining cards

**Context:** Hand rows are current held cards, not remaining deck copies. Users must be able to visually separate the two regions.

**Options:**

- Reuse deck-copy rows exactly.
- Create a distinct hand row treatment with a section header and optional position index.
- Use large card images in the tracker panel.

**Choice:** Add a labeled hand section with compact card rows, localized names, mono position/count metadata where useful, and existing token colors.

**Rationale:** A section header and compact rows make the distinction clear without consuming too much overlay height. Large images are already available through hover preview and would make the tracker less scannable.

### Decision 4: No new dependency

**Context:** The change is UI composition over existing snapshot/card database data.

**Options:**

- Add a virtual-list or layout dependency.
- Use existing React/Tailwind utilities.

**Choice:** Use existing dependencies only.

**Rationale:** The hand has a small maximum size and does not justify extra dependency surface. Version/deprecation risk is avoided by using the current stack.

## Risks / Trade-offs

### Performance

[Risk] Resolving card definitions for both remaining cards and hand cards could duplicate IPC lookups.  
Mitigation: Reuse the existing card definition batching/cache pattern in `LiveDeckPanel`; resolve the union of visible card IDs where practical.

### Compatibility

[Risk] `snapshot.friendlyHand` may currently be only a `string[]`, and array order may depend on HearthMirror's return order.  
Mitigation: Verify with core tests. If needed, sort by `zonePosition` before snapshot construction or change the snapshot hand entry shape in a narrow, typed way.

### UI density

[Risk] Adding a hand section below remaining cards can make the overlay taller or force more scrolling.  
Mitigation: Keep the hand section compact, avoid cards within cards, and preserve stable row heights.

### Security

[Risk] None beyond existing renderer data display; hand data is local game state already available through the tracker snapshot.  
Mitigation: Do not add remote fetch paths or new privileges.

## Migration Plan

1. Implement renderer rendering and tests using the current `friendlyHand` data.
2. Add or adjust core snapshot ordering tests if the implementation touches snapshot ordering.
3. Add i18n keys for the hand section.
4. Run targeted renderer/core tests and desktop typecheck.

Rollback is straightforward: remove the new hand section rendering and any snapshot-shape changes if introduced.

## Open Questions

- Is `snapshot.friendlyHand` currently guaranteed to be ordered by `zonePosition`, or does core need to normalize it explicitly?
- Should hidden/unknown friendly hand entries ever render as placeholder rows, or should empty `cardId` entries be omitted from the hand section?
