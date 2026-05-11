## Requirements

### Requirement: @hdt/core/deck domain module

`@hdt/core` SHALL expose a `deck/` submodule containing the deck domain
model (`Deck`, `DeckCard`, `DeckVersion`, `ValidityIssue`,
`CreateDeckInput`, `UpdateDeckPatch`) and pure functions for
validation, diffing, and import/export. The module MUST NOT depend on
Electron, `better-sqlite3`, React, or any renderer-only package.

#### Scenario: Domain types available without electron import

- **WHEN** a consumer imports `@hdt/core/deck` in a Vitest test that
  has no Electron polyfill
- **THEN** the import succeeds and the domain types compile under
  TypeScript strict mode

#### Scenario: Module re-exports through @hdt/core barrel

- **WHEN** a consumer imports `Deck` from `@hdt/core`
- **THEN** the type resolves to the same definition exported from
  `@hdt/core/deck`

### Requirement: Deck domain model

`@hdt/core/deck` SHALL define a `Deck` shape that includes a stable
identifier, display name, hero class, format, version history pointer,
free-form notes, free-form tags, optional cover-card identifier, and
optional sort index, plus a `DeckCard` shape keyed by `cardId` with a
`count` (1 or 2 for collectible cards).

A `Deck` MUST also carry creation and modification timestamps and a
soft-delete flag SHALL NOT be modeled in this change.

#### Scenario: Minimal deck shape round-trips through structured clone

- **WHEN** a `Deck` value is constructed with required fields only
  (id, name, class, format, version, cards, createdAt, updatedAt) and
  passed through `structuredClone`
- **THEN** the cloned value is deeply equal to the input

### Requirement: Deck validity checker

`@hdt/core/deck` SHALL expose a pure function
`validateDeck(deck, cardLookup): { ok: boolean; issues: ValidityIssue[] }`
that flags every legality concern without throwing.

The checker MUST detect:

- Total card count not equal to 30.
- Any card with `count > 2`.
- Any Legendary-rarity card with `count > 1`.
- Any card whose declared class is not the deck's class and is not
  `NEUTRAL`.
- A Hero-type card present in the main deck.

The checker MUST NOT block save: it returns advisory issues only. The
caller decides whether to block downstream actions like deckstring
export.

Out of scope for this change: Death Knight rune restrictions and
format-rotation legality (Wild vs. Standard set membership).

#### Scenario: Empty deck reports under-30 issue

- **WHEN** `validateDeck` is called on a deck with `cards: []`
- **THEN** `ok` is `false` and the issue list contains an
  `under-card-limit` issue with `required: 30`, `actual: 0`

#### Scenario: Two-of legendary flagged

- **WHEN** a deck contains a single Legendary `cardId` with
  `count: 2`
- **THEN** `ok` is `false` and the issue list contains a
  `legendary-over-limit` issue naming the card

#### Scenario: Off-class card flagged

- **WHEN** a Mage deck contains a Warrior-class spell
- **THEN** `ok` is `false` and the issue list contains an
  `off-class-card` issue naming the card

#### Scenario: Legal 30-card mono-class deck passes

- **WHEN** `validateDeck` is called on a 30-card Druid deck with all
  copies within limits and all cards either Druid or NEUTRAL
- **THEN** `ok` is `true` and the issue list is empty

### Requirement: Deck card-list canonical hash and equality

`@hdt/core/deck` SHALL expose a pure function
`canonicalCardListHash(cards): string` that returns a stable hash over
the sorted-by-cardId, count-aggregated card list, plus
`areCardListsEqual(a, b): boolean`.

The hash MUST be insertion-order independent.

#### Scenario: Insertion order does not change hash

- **GIVEN** two card lists with identical (cardId, count) multisets
  in different insertion order
- **WHEN** `canonicalCardListHash` is computed for both
- **THEN** the two hashes are equal

#### Scenario: Single-copy difference produces unequal hash

- **GIVEN** two card lists differing by a single (cardId, count) pair
- **WHEN** `canonicalCardListHash` is computed for both
- **THEN** the two hashes are not equal

### Requirement: Deck import / export pure functions

`@hdt/core/deck` SHALL expose `toDeckstring(deck)`, `fromDeckstring(text)`,
`toJson(deck)`, and `fromJson(text)` pure functions that round-trip a
valid 30-card deck through the HearthSim deckstring format and through
the app's stable JSON envelope respectively.

`fromDeckstring` MUST surface card-not-found errors as a typed
`UnknownCardError` that names the missing `cardId`. `fromDeckstring`
MUST surface decode errors as a typed `DeckstringDecodeError`.

`toDeckstring` MUST refuse to encode an invalid (per `validateDeck`)
deck and return a typed `IllegalDeckExportError`.

The JSON envelope MUST include a `schemaVersion` field so future
schema changes can fail-fast on stale exports.

#### Scenario: Round-trip a 30-card legal deck through deckstring

- **GIVEN** a legal 30-card Druid deck
- **WHEN** the deck is encoded via `toDeckstring` and the result is
  decoded via `fromDeckstring`
- **THEN** the decoded deck has the same hero class, format, and
  card list (per `areCardListsEqual`)

#### Scenario: Encode invalid deck refuses

- **GIVEN** a 16-card Druid deck (incomplete)
- **WHEN** the deck is passed to `toDeckstring`
- **THEN** the call throws `IllegalDeckExportError`

#### Scenario: Decode unknown cardId raises typed error

- **GIVEN** a deckstring whose decoded card list references a
  `cardId` not present in the active `@hdt/hearthdb` lookup
- **WHEN** the deckstring is passed to `fromDeckstring`
- **THEN** the call throws `UnknownCardError` carrying the missing
  `cardId`

#### Scenario: JSON round-trip preserves notes and tags

- **GIVEN** a saved deck with notes and tags populated
- **WHEN** the deck is encoded via `toJson` and decoded via
  `fromJson`
- **THEN** the decoded deck's notes and tags equal the input's

### Requirement: SQLite-backed deck store in main process

`apps/desktop/src/main/deck-store.ts` SHALL provide a SQLite-backed
`DeckStore` exposing a CRUD API equivalent to the IPC surface. The
store MUST accept its root directory via constructor injection so
tests can use a temporary directory.

The store MUST own its own SQLite file (`decks.db`), separate from
`match-history.db`. The schema MUST be created on first open and
versioned via a `schema_version` table. WAL mode MUST be enabled.

The store SHALL expose at minimum:

- `list(): DeckSummary[]`
- `getById(id: string): DeckDetail | null`
- `create(input: CreateDeckInput): DeckDetail`
- `update(id: string, patch: UpdateDeckPatch): DeckDetail`
- `duplicate(id: string): DeckDetail`
- `delete(id: string): void`
- `setSortIndex(id: string, sortIndex: number): void`

#### Scenario: First open bootstraps schema

- **GIVEN** an empty temp directory
- **WHEN** `DeckStore` is constructed with that directory and `list()`
  is called
- **THEN** `decks.db` exists in the directory, `schema_version` is 1,
  and `list()` returns an empty array

#### Scenario: Create then list returns the new deck

- **WHEN** a deck is created via `create({ name, class: 'DRUID',
  format: 'Standard', cards: [...] })` and then `list()` is called
- **THEN** the listed array contains a summary whose `id` matches the
  created deck and whose `name` and `class` match the input

#### Scenario: Get by id returns full detail with cards

- **WHEN** `getById(id)` is called for an existing deck
- **THEN** the returned `DeckDetail` carries the full card list with
  per-card counts

#### Scenario: Get by missing id returns null

- **WHEN** `getById(id)` is called for an id that has never existed
- **THEN** the result is `null`

#### Scenario: Delete is idempotent

- **WHEN** `delete(id)` is called twice for the same id
- **THEN** the first call removes the deck and the second call
  succeeds without throwing

### Requirement: Versioned card-list updates

`DeckStore.update` SHALL bump the deck's `version` and append a row to
`deck_versions` IF AND ONLY IF the canonical card list changed
(per `canonicalCardListHash`). Renames, retags, and note-edits MUST
NOT bump the version.

#### Scenario: Card-list edit creates a new version

- **GIVEN** an existing deck at version 1
- **WHEN** `update(id, { cards: <changed list> })` is called
- **THEN** the deck's `version` becomes 2 and `deck_versions` contains
  rows for both versions

#### Scenario: Rename does not bump version

- **GIVEN** an existing deck at version 1
- **WHEN** `update(id, { name: 'New Name' })` is called
- **THEN** the deck's `version` is still 1 and the deck row's
  `updatedAt` is refreshed

#### Scenario: No-op card edit does not bump version

- **GIVEN** an existing deck at version 1
- **WHEN** `update(id, { cards: <same multiset, different insertion order> })`
  is called
- **THEN** the deck's `version` is still 1

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

### Requirement: SQLite integrity guard at boot

`DeckStore` SHALL run `PRAGMA integrity_check` on first open. If the
result is anything other than `ok`, the store SHALL rename the file
to `decks.corrupt-<timestamp>.db` and bootstrap a fresh `decks.db`,
returning a typed warning so the host can surface a notification.

#### Scenario: Corrupt file is preserved and replaced

- **GIVEN** a userData directory containing a `decks.db` whose
  integrity check fails
- **WHEN** `DeckStore` is constructed
- **THEN** the directory contains both a fresh empty `decks.db` and a
  `decks.corrupt-*.db` rename of the original

#### Scenario: Healthy file is reused

- **GIVEN** a userData directory containing a healthy `decks.db`
- **WHEN** `DeckStore` is constructed
- **THEN** no rename occurs and `list()` returns the existing decks

### Requirement: Non-destructive live deck snapshot cache

The desktop app SHALL cache live Hearthstone deck snapshots into local saved-deck storage so the Decks page can show known decks when Hearthstone is not running.

The sync MUST be non-destructive:

- Manual decks created or edited by the user MUST NOT be overwritten by live sync.
- Live-synced decks MUST be marked with app-managed metadata that ties them to the Hearthstone deck id or stable card-list signature.
- When the same live deck is observed again, the app SHALL update the corresponding live-synced record rather than creating duplicate rows.
- If a live deck contains non-collectible cards, the sync SHALL skip that deck and continue syncing other decks.

#### Scenario: Live Hearthstone decks are cached

- **GIVEN** Hearthstone is running and `hearthmirror.getDecks()` returns two constructed decks
- **WHEN** the deck sync service runs
- **THEN** the local deck store contains live-synced records for those decks
- **AND** the Decks page can list them after Hearthstone closes

#### Scenario: Manual deck is not overwritten

- **GIVEN** a user-created saved deck named `Ramp Druid`
- **AND** HearthMirror returns a live deck also named `Ramp Druid`
- **WHEN** the deck sync service runs
- **THEN** the user-created saved deck remains unchanged
- **AND** any live-synced update applies only to an app-managed live-synced record

#### Scenario: Repeated sync avoids duplicates

- **GIVEN** a live-synced deck already exists for Hearthstone deck id `42`
- **WHEN** HearthMirror returns deck id `42` again with the same card list
- **THEN** the local deck store still contains one live-synced record for that live deck

#### Scenario: Non-collectible live deck is skipped

- **GIVEN** HearthMirror returns a deck containing a generated token card
- **WHEN** the deck sync service runs
- **THEN** that deck is not saved
- **AND** sync continues for other valid decks
