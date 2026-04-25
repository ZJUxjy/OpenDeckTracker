## 1. Core Failing Tests

- [x] 1.1 In `packages/core/src/tracker/remaining-algorithm.test.ts`, add a test named `includes known shuffled cards that are currently in deck`; test body creates `original = DeckSnapshot.fromDeckCards([{ cardId: 'Fireball', count: 2 }])`, calls `computeRemaining({ originalDeck: original, seenEntities: [], deckEntities: [e(10, 'Albatross', 'DECK')], localControllerId: 1 })`, and expects `remaining.countOf('Fireball') === 2`, `remaining.countOf('Albatross') === 1`, `remaining.total() === 3`, and `extras === []`.
- [x] 1.2 In `packages/core/src/tracker/remaining-algorithm.test.ts`, add a test named `only adds same-card shuffled overflow`; test body uses original `Fireball x2`, one seen `Fireball` in HAND, two known `Fireball` entities in DECK, and expects final `remaining.countOf('Fireball') === 2`.
- [x] 1.3 In `packages/core/src/tracker/remaining-algorithm.test.ts`, add a test named `does not double-count known original deck entities`; test body uses original `Fireball x2`, no seen cards, one known `Fireball` in DECK, and expects `remaining.countOf('Fireball') === 2` and `remaining.total() === 2`.
- [x] 1.4 In `packages/core/src/tracker/remaining-algorithm.test.ts`, add a test named `ignores face-down deck entities for displayed card rows`; test body uses original `Fireball x2`, one deck entity with empty `cardId`, and expects `remaining.entries()` to equal `[{ cardId: 'Fireball', count: 2 }]`.
- [x] 1.5 Run `pnpm --filter @hdt/core test remaining-algorithm`; expected output: the new tests fail because `computeRemaining` does not yet accept/use `deckEntities`.

## 2. Core Implementation

- [x] 2.1 In `packages/core/src/game/deck-snapshot.ts`, add a pure `add(other: DeckSnapshot | readonly { readonly cardId: string; readonly count?: number }[]): DeckSnapshot` method that returns a new snapshot with counts summed; expected existing `subtract`, `extras`, and `entries` behavior remains unchanged.
- [x] 2.2 In `packages/core/src/tracker/remaining-algorithm.ts`, update `computeRemaining` args to include `deckEntities: readonly Entity[]`; expected existing call sites temporarily fail typecheck until updated.
- [x] 2.3 In `packages/core/src/tracker/remaining-algorithm.ts`, implement the design formula: `baseRemaining = originalDeck.subtract(seenSnapshot)`, `knownDeckSnapshot = DeckSnapshot.fromCardIds(filteredDeckEntityCardIds)`, `shuffledIntoDeck = baseRemaining.extras(knownDeckSnapshot)`, `remaining = baseRemaining.add(shuffledIntoDeck)`, `extras = originalDeck.extras(seenSnapshot)`.
- [x] 2.4 Update all existing `computeRemaining` calls in `packages/core/src/tracker/remaining-algorithm.test.ts` to pass `deckEntities: []`; expected old tests compile without behavior changes.
- [x] 2.5 Run `pnpm --filter @hdt/core test remaining-algorithm`; expected output: all remaining-algorithm tests pass.
- [x] 2.6 In `packages/core/src/tracker/deck-tracker.ts`, update `buildSnapshot()` to pass `deckEntities: this.game.localPlayer.deck` into `computeRemaining`; expected TypeScript has no remaining missing-argument errors.
- [x] 2.7 In `packages/core/src/tracker/deck-tracker.test.ts`, add a test named `includes known shuffled-in deck cards in snapshot remaining`; test setup uses an identified deck with `A x2`, `deckState.friendlyDeck` containing one face-down entity and `{ entityId: 200, cardId: 'ALBATROSS' }`, then expects `tracker.getSnapshot().deck?.remaining` to contain `{ cardId: 'ALBATROSS', count: 1 }`.
- [x] 2.8 Run `pnpm --filter @hdt/core test deck-tracker remaining-algorithm`; expected output: all selected core tracker tests pass.
- [x] 2.9 Commit core changes with message `fix(core): include shuffled cards in live deck remaining`; expected `git status --short` no longer shows unstaged core files from this group.

## 3. Renderer Failing Tests

- [x] 3.1 In `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx`, add `ALBATROSS: { name: 'Bad Luck Albatross', cost: 3, rarity: 'RARE' }` to `CARD_DEFS`; expected card lookup stubs can resolve the shuffled card.
- [x] 3.2 In `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx`, add a test named `renders remaining-only shuffled cards as physical rows`; test snapshot uses `original: [{ cardId: 'CS2_029', count: 2 }]` and `remaining: [{ cardId: 'CS2_029', count: 2 }, { cardId: 'ALBATROSS', count: 1 }]`, then expects three `card-copy-row` elements and one row containing `Bad Luck Albatross`.
- [x] 3.3 In `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx`, add a test named `animates shuffled-in row when it leaves remaining`; test starts with `remaining` containing `ALBATROSS x1`, rerenders with only the original remaining cards, and expects the `Bad Luck Albatross` row to have `animate-deck-exit`.
- [x] 3.4 Run `pnpm --filter @hdt/desktop test LiveDeckPanel`; expected output: the new renderer tests fail because `LiveDeckPanel` still expands `deck.original`.

## 4. Renderer Implementation

- [x] 4.1 In `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`, change `cardIds` to derive from the union of `deck.original` and `deck.remaining`; expected `useCardDefs` resolves metadata for remaining-only cards.
- [x] 4.2 In `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`, change visible copy expansion to `expandDeckToCopies(deck.remaining)` instead of expanding `deck.original` and filtering by remaining counts; expected shuffled cards absent from original can render.
- [x] 4.3 In `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`, keep exit animation comparison based on `remainingCount`; expected existing drawn-card animation tests still pass.
- [x] 4.4 Run `pnpm --filter @hdt/desktop test LiveDeckPanel`; expected output: all `LiveDeckPanel` tests pass.
- [x] 4.5 Commit renderer changes with message `fix(desktop): render shuffled cards in live deck panel`; expected `git status --short` no longer shows unstaged renderer files from this group.

## 5. Validation

- [x] 5.1 Run `pnpm --filter @hdt/core test`; expected output: all core tests pass.
- [x] 5.2 Run `pnpm --filter @hdt/desktop test LiveDeckPanel`; expected output: all focused renderer tests pass.
- [x] 5.3 Run `pnpm typecheck`; expected output: all workspace TypeScript projects pass.
- [x] 5.4 Run `pnpm exec openspec validate track-shuffled-cards-in-live-deck --strict`; expected output: `Change 'track-shuffled-cards-in-live-deck' is valid`.
- [x] 5.5 Update `openspec/changes/track-shuffled-cards-in-live-deck/tasks.md` checkboxes to `[x]` for completed tasks; expected `pnpm exec openspec status --change track-shuffled-cards-in-live-deck` reports apply-required artifacts complete.
- [x] 5.6 Commit OpenSpec updates with message `docs(openspec): propose shuffled card deck tracking`; expected the change directory is staged and committed.
