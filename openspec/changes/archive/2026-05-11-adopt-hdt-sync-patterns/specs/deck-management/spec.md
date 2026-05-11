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
syncs of the same unchanged live deck MUST return the same local deck
id and MUST NOT bump the deck version. If the live card list changes,
the store MUST update the row and bump the version exactly once for
that card-list change. Name, class, format, and cover metadata changes
MUST refresh the row without creating a duplicate local deck.

When `liveDeck.liveDeckId` is provided but **no existing row** matches
that id, the store MUST attempt a content-fingerprint reattach against
rows whose `source === 'hearthstone-live'`. The fingerprint is the
tuple `(class, format, canonicalCardListHash(cards))`. If **exactly
one** existing live-synced row matches, the store MUST adopt the new
`liveDeckId` onto that row, refresh the row's name (and any other
metadata) without bumping the version (since card content is identical),
and MUST NOT insert a new row. If **zero or more than one** live-synced
rows match, the store MUST insert a new live-synced row as before. The
reattach scan MUST ignore rows whose `source !== 'hearthstone-live'`
so app-managed decks are never silently promoted to live-synced.

When `liveDeck.liveDeckId` is absent, `saveFromLive` MUST create a
normal app-managed saved deck and MUST NOT mark it as Hearthstone-live
synced.

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

- **GIVEN** a local live-synced deck created from `liveDeckId === 123`
  at version 1
- **WHEN** `saveFromLive()` is called with the same live deck id and a
  changed card list
- **THEN** the returned detail has the same local deck id
- **AND** the deck version is 2

#### Scenario: New live id with identical content reattaches to the existing live-synced row

- **GIVEN** a local live-synced deck created from `liveDeckId === 100`
  with a specific card list at version 1
- **WHEN** `saveFromLive()` is called with `liveDeckId === 200` and the
  same `(class, format, cards)`
- **THEN** the returned detail has the original local deck id
- **AND** `findByLiveDeckId(200)` resolves to that same local deck
- **AND** `findByLiveDeckId(100)` returns `null`
- **AND** the deck version is unchanged (still 1)

#### Scenario: Ambiguous fingerprint match falls through to insert

- **GIVEN** two local live-synced decks with the same
  `(class, format, cards)` but different `liveDeckId`s
- **WHEN** `saveFromLive()` is called with a third `liveDeckId` and the
  same content
- **THEN** a new live-synced row is inserted
- **AND** both original rows remain resolvable by their original
  `liveDeckId`s

#### Scenario: App-managed deck is never reattached

- **GIVEN** an app-managed saved deck (no live id) with a known card list
- **WHEN** `saveFromLive()` is called with a fresh `liveDeckId` and the
  same `(class, format, cards)`
- **THEN** a new live-synced row is inserted
- **AND** the existing app-managed deck retains its id and `source`

#### Scenario: Manual live snapshot without id is not live-synced

- **GIVEN** a live snapshot input without `liveDeckId`
- **WHEN** `saveFromLive(liveDeck)` is called
- **THEN** the created deck has no Hearthstone-live source metadata
- **AND** a later sync with a different `liveDeckId` does not overwrite
  it
