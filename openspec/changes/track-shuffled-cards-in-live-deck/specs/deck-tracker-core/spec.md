## MODIFIED Requirements

### Requirement: Remaining-cards algorithm

`@hdt/core` SHALL expose a `computeRemaining` function that derives the displayable friendly deck state using both cards seen outside the deck and known cards currently in the deck.

The function MUST accept:

- `originalDeck: DeckSnapshot`
- `seenEntities: Entity[]` built from friendly HAND / PLAY / GRAVEYARD / SECRET zones
- `deckEntities: Entity[]` built from the friendly DECK zone
- `localControllerId: number`

`seenEntities` MUST be filtered to entities where `entity.cardId` is non-empty AND `entity.controllerId === localControllerId` AND `entity.info.created !== true`.

`deckEntities` MUST be filtered to entities where `entity.cardId` is non-empty AND `entity.controllerId === localControllerId`.

`computeRemaining` MUST:

- Build `seenSnapshot` from filtered `seenEntities`.
- Build `baseRemaining = originalDeck.subtract(seenSnapshot)`.
- Build `knownDeckSnapshot` from filtered `deckEntities`.
- Build `shuffledIntoDeck = baseRemaining.extras(knownDeckSnapshot)`.
- Return `remaining = baseRemaining + shuffledIntoDeck`.
- Return `extras = originalDeck.extras(seenSnapshot)`.

The algorithm MUST be deterministic and pure (same inputs -> same outputs, no side effects). Known cards currently in the DECK zone that do not exceed `baseRemaining` MUST NOT be double-counted.

#### Scenario: Mid-match remaining computation

- **GIVEN** an originalDeck with 30 cards and seenEntities containing 5 distinct cards from that original deck
- **WHEN** `computeRemaining` is called with no known deck overflow
- **THEN** `remaining.total() === 25` and `extras` is empty

#### Scenario: Known shuffled card appears in remaining deck

- **GIVEN** an originalDeck of `{ Fireball: 2 }`, no seenEntities, and deckEntities containing `{ cardId: 'Albatross' }` controlled by the local player
- **WHEN** `computeRemaining` is called
- **THEN** `remaining` contains `Fireball: 2` and `Albatross: 1`
- **AND** `extras` is empty

#### Scenario: Same-card shuffled copy only adds overflow

- **GIVEN** an originalDeck of `{ Fireball: 2 }`, seenEntities containing one `Fireball`, and deckEntities containing two known `Fireball` entities
- **WHEN** `computeRemaining` is called
- **THEN** `baseRemaining` accounts for one original `Fireball`
- **AND** `remaining` contains `Fireball: 2`, representing one expected original copy plus one overflow shuffled copy

#### Scenario: Known original deck entity is not double-counted

- **GIVEN** an originalDeck of `{ Fireball: 2 }`, no seenEntities, and deckEntities containing one known `Fireball`
- **WHEN** `computeRemaining` is called
- **THEN** `remaining` contains `Fireball: 2`, not `Fireball: 3`

#### Scenario: Unknown face-down deck additions are ignored by card list

- **GIVEN** an originalDeck of `{ Fireball: 2 }` and deckEntities containing an entity with empty `cardId`
- **WHEN** `computeRemaining` is called
- **THEN** the empty-card entity does not add a row to `remaining`

#### Scenario: Stolen card outside the deck surfaces as extra

- **GIVEN** an originalDeck of `{ Fireball: 2 }` and seenEntities containing `{ cardId: 'StolenCard' }`
- **WHEN** `computeRemaining` is called
- **THEN** `remaining` still has `Fireball: 2`
- **AND** `extras === [{ cardId: 'StolenCard', count: 1 }]`

### Requirement: LiveDeckPanel supports per-copy rows, draw-pop animation, and hover card art

`apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx` SHALL render IN_MATCH deck state as physical card-copy rows, animate drawn cards out of the list, and show card art on hover.

The component MUST:

- Render one row per physical copy expanded from `snapshot.deck.remaining`, not only from `snapshot.deck.original`.
- Render remaining cards whose `cardId` is absent from `snapshot.deck.original`.
- Sort rows by mana cost ascending, then card name ascending, then `cardId` ascending.
- Use `@hdt/hearthdb` definitions for card name/cost/rarity display.
- Resolve card definitions for the union of `snapshot.deck.original` and `snapshot.deck.remaining` card ids.
- When `remaining[cardId]` decreases, animate the disappearing copy row and remove that row after the animation completes.
- Avoid keeping zero-count placeholder rows in the list.
- Show a delayed hover popup containing the card image and close it when hover ends.
- Show the header remaining count from `snapshot.deck.remaining`; the count MAY exceed the original deck total when known cards have been shuffled into the deck.

#### Scenario: Initial match render shows 30 physical rows

- **GIVEN** the user enters a match with a 30-card deck
- **WHEN** the renderer receives the first in-match snapshot
- **THEN** the panel renders 30 physical rows ordered by cost/name/cardId

#### Scenario: Shuffled-in remaining card appears as a row

- **GIVEN** an active match snapshot where `deck.original` contains `Fireball x2` and `deck.remaining` contains `Fireball x2` plus `Albatross x1`
- **WHEN** the panel renders
- **THEN** it displays three physical rows
- **AND** one row displays `Albatross`
- **AND** the header remaining count is `3`

#### Scenario: Drawn card row exits and is removed

- **GIVEN** an active match with two copies of `Fireball`
- **WHEN** one `Fireball` is drawn
- **THEN** exactly one row enters exit animation and is removed after animation completion

#### Scenario: Drawn shuffled-in card row exits and is removed

- **GIVEN** an active match snapshot where `deck.remaining` contains a shuffled-in `Albatross`
- **WHEN** the next snapshot no longer contains `Albatross`
- **THEN** the `Albatross` row enters exit animation and is removed after animation completion

#### Scenario: Hovering a row shows card image popup

- **GIVEN** a visible row with cardId `EX1_277`
- **WHEN** the user hovers long enough to pass the hover-delay threshold
- **THEN** the panel shows a popup image for `EX1_277` and hides it when hover ends
