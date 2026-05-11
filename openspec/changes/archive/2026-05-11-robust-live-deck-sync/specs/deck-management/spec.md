## MODIFIED Requirements

### Requirement: Save-from-live snapshot

`DeckStore` SHALL accept a `saveFromLive(liveDeck): DeckDetail` call
that converts a live-bridge deck (with `cardId` + `count` pairs and a
display name) into a saved deck whose current card list mirrors the
live deck.

The store MUST refuse to snapshot a live deck whose card list contains
any non-collectible cards, throwing a typed `NonCollectibleSnapshotError`
naming the offending card(s). Collectibility is determined via the
`@hdt/hearthdb` card lookup.

When `liveDeck.liveDeckId` is provided, the store MUST treat the row as
a Hearthstone-live synced deck and upsert by that live deck id. Repeated
syncs of the same unchanged live deck MUST return the same local deck id
and MUST NOT bump the deck version. If the live card list changes, the
store MUST update the row and bump the version exactly once for that
card-list change. Name, class, format, and cover metadata changes MUST
refresh the row without creating a duplicate local deck.

When `liveDeck.liveDeckId` is absent, `saveFromLive` MUST create a normal
app-managed saved deck and MUST NOT mark it as Hearthstone-live synced.

#### Scenario: Live deck with all collectible cards is snapshotted

- **GIVEN** a live-bridge deck whose 30 cards are all collectible
- **WHEN** `saveFromLive(liveDeck)` is called
- **THEN** the returned `DeckDetail` has the same card multiset and
  the same name

#### Scenario: Live deck with a token card is rejected

- **GIVEN** a live-bridge deck containing a generated/uncollectible
  card id
- **WHEN** `saveFromLive(liveDeck)` is called
- **THEN** the call throws `NonCollectibleSnapshotError`

#### Scenario: Live deck id upserts the same local deck

- **GIVEN** a live deck with `liveDeckId === 123`
- **WHEN** `saveFromLive(liveDeck)` is called twice with the same card list
- **THEN** both returned details have the same local deck id
- **AND** the deck version is unchanged by the second call

#### Scenario: Live card edit bumps version once

- **GIVEN** a local live-synced deck created from `liveDeckId === 123` at version 1
- **WHEN** `saveFromLive()` is called with the same live deck id and a changed card list
- **THEN** the returned detail has the same local deck id
- **AND** the deck version is 2

#### Scenario: Manual live snapshot without id is not live-synced

- **GIVEN** a live snapshot input without `liveDeckId`
- **WHEN** `saveFromLive(liveDeck)` is called
- **THEN** the created deck has no Hearthstone-live source metadata
- **AND** a later sync with a different `liveDeckId` does not overwrite it
