# deck-finder Specification

## Purpose
TBD - created by archiving change add-deck-finder. Update Purpose after archive.
## Requirements
### Requirement: Popular-deck domain types

`@hdt/core/deck` SHALL export a `PopularDeck` interface and a
`PopularDeckArchetype` union type.

`PopularDeckArchetype` MUST be the literal union
`'Aggro' | 'Midrange' | 'Control' | 'Combo' | 'Tempo' | 'Ramp'`.

`PopularDeck` MUST have these fields:

- `id: string` — stable kebab-case id, unique across the seed.
- `name: string` — human-readable deck title.
- `class: HeroClass` — drawn from the existing `HeroClass` union
  in `@hdt/core/deck/deck-types.ts`.
- `format: Format` — drawn from the existing `Format` union.
- `archetype: PopularDeckArchetype`
- `deckstring: string` — Hearthstone-format deckstring; the source
  of truth for card list, mana curve, and dust cost.
- `winratePercent: number` — integer 0-100.
- `gamesCount: number` — non-negative integer.
- `dustCost: number` — non-negative integer (in dust).
- `author: string` — author handle / display name.
- `updatedAt: string` — ISO-8601 date string.

#### Scenario: Type union members are exhaustive

- **WHEN** `PopularDeckArchetype` is checked at compile time
- **THEN** the union exactly contains
  `Aggro`, `Midrange`, `Control`, `Combo`, `Tempo`, `Ramp`

#### Scenario: PopularDeck shape

- **GIVEN** a sample `PopularDeck` literal
- **WHEN** the literal is type-checked
- **THEN** all required fields are present with the types listed
  above
- **AND** no field beyond those listed is required

### Requirement: Vendored popular-deck seed list

`@hdt/core/deck/popular-decks-seed.ts` SHALL export a constant
`POPULAR_DECKS_SEED: readonly PopularDeck[]` containing 50 to 200
entries sourced from the HSGuru spike snapshot (multi-variant: up to
5 variants per archetype). Every represented hero class MUST have at
least 5 entries.

Every entry's `deckstring` MUST decode cleanly via the existing
`@hdt/hearthdb` `decodeDeck`, and the decoded blueprint's `format`
MUST match the entry's declared `format`. Full `validateDeck`
coverage is not required at this layer because that would require
loading the CardDb inside a `@hdt/core` test; class/legality
validation is enforced when the user IMPORTS a popular deck via the
existing `decks:import-deckstring` IPC, which already runs full
validation.

Every entry's `id` MUST be unique within the list. Every entry's
`winratePercent` MUST be in `[0, 100]`. Every entry's `gamesCount`
and `dustCost` MUST be non-negative integers.

The seed file MUST be tagged with a top-of-file comment documenting
its maintenance burden (Hearthstone meta drift) and the rotation
cadence the maintainer follows.

#### Scenario: All seed deckstrings decode cleanly

- **WHEN** every entry in `POPULAR_DECKS_SEED` is run through
  `decodeDeck`
- **THEN** none throw
- **AND** the decoded deck's class matches the entry's `class`

#### Scenario: Decoded format matches declared format

- **WHEN** every entry is decoded and its blueprint's `format` enum
  is mapped back to the `Format` union ('Standard'/'Wild'/'Classic'/'Twist')
- **THEN** that mapping equals the entry's declared `format`

#### Scenario: Seed list has reasonable diversity

- **WHEN** the seed list is grouped by `class`
- **THEN** at least 10 distinct hero classes are represented
- **AND** at least 4 distinct archetypes are represented
- **AND** every represented class has at least 5 entries

#### Scenario: Seed entries have unique ids

- **WHEN** the `id` field is collected across the seed list
- **THEN** the resulting `Set` size equals `seed.length`

### Requirement: Filter and sort utilities

`@hdt/core/deck/popular-deck-search.ts` SHALL export pure functions
`filterPopularDecks(list, criteria)` and `sortPopularDecks(list,
sort)`.

`PopularDeckFilterCriteria` is an object with optional fields:

- `classFilter?: HeroClass | 'all'`
- `archetypeFilter?: PopularDeckArchetype | 'all'`
- `formatFilter?: Format`
- `maxDust?: number` — entries with `dustCost > maxDust` are
  excluded.
- `includesCardName?: string` — case-insensitive substring match
  against any card name in the deck (resolution provided by the
  caller via a `cardNamesByDeckId: Record<string, string[]>` arg —
  the search function itself does NOT decode deckstrings).
- `excludesCardName?: string` — exclude deck if ANY card name
  matches.

`PopularDeckSort` is the literal union
`'popular' | 'winrate' | 'updated' | 'cheapest'`. Sort order:

- `'popular'` → `gamesCount` descending
- `'winrate'` → `winratePercent` descending
- `'updated'` → `updatedAt` descending (most recent first)
- `'cheapest'` → `dustCost` ascending

Both functions MUST be pure (no I/O, no side effects, deterministic
on input).

#### Scenario: classFilter='all' returns the full list

- **WHEN** `filterPopularDecks(seed, { classFilter: 'all' })`
  is called
- **THEN** the result equals the input list (no entries removed)

#### Scenario: classFilter narrows to one class

- **WHEN** `filterPopularDecks(seed, { classFilter: 'MAGE' })`
  is called
- **THEN** every entry in the result has `class === 'MAGE'`

#### Scenario: maxDust excludes pricier decks

- **WHEN** `filterPopularDecks(seed, { maxDust: 5000 })` is called
- **THEN** every entry in the result has `dustCost <= 5000`

#### Scenario: includesCardName uses provided card-name lookup

- **GIVEN** `cardNamesByDeckId = { 'd1': ['Fireball', 'Polymorph'] }`
- **WHEN** `filterPopularDecks([deck1], { includesCardName: 'fire',
  cardNamesByDeckId })` is called
- **THEN** the result contains `deck1`

#### Scenario: excludesCardName drops decks containing the card

- **GIVEN** `cardNamesByDeckId = { 'd1': ['Fireball'] }`
- **WHEN** `filterPopularDecks([deck1], { excludesCardName: 'fireball',
  cardNamesByDeckId })` is called
- **THEN** the result is empty

#### Scenario: sort 'winrate' orders by descending winrate

- **WHEN** `sortPopularDecks(seed, 'winrate')` is called
- **THEN** the result is non-strictly descending in
  `winratePercent`

#### Scenario: sort 'cheapest' orders by ascending dustCost

- **WHEN** `sortPopularDecks(seed, 'cheapest')` is called
- **THEN** the result is non-strictly ascending in `dustCost`

### Requirement: Mana-curve and key-cards derivation

`apps/desktop/src/main/popular-decks-derived.ts` SHALL export
`computeManaCurve(deckstring, cardLookup)` and
`computeKeyCards(deckstring, cardLookup)`.

These helpers live in the main process (not `@hdt/core`) because the
underlying `decodeDeck` from `@hdt/hearthdb` depends on Node's
`Buffer` and is not renderer-safe. The renderer receives the derived
data pre-baked via the `popular-decks:list` IPC payload.

`computeManaCurve` MUST return an 8-element array
`[c0, c1, c2, c3, c4, c5, c6, c7+]` where each cell is the
COUNT of card *copies* with that mana cost in the deck (not unique
cards). Cards with cost 7 or higher fall into the last bucket.

`computeKeyCards` MUST return an array of `{ name: string; count: number;
cost: number }` entries sorted by in-deck count descending then by
cost ascending, capped at 12 entries.

Both functions take a `cardLookup: (dbfId: number) => CardDef | null`
caller-provided synchronous lookup so they remain pure.

#### Scenario: Mana curve sums to deck size

- **GIVEN** a deckstring decoding to 30 cards
- **WHEN** `computeManaCurve(deckstring, cardLookup)` is called
- **THEN** the sum of the returned array is 30

#### Scenario: Cost-7-plus cards bucket at index 7

- **GIVEN** a deck containing one cost-8 and one cost-12 card
- **WHEN** `computeManaCurve(deckstring, cardLookup)` is called
- **THEN** index 7 of the returned array contains 2

#### Scenario: Key cards capped at 12

- **GIVEN** a deck with 30 unique-named cards (1-of)
- **WHEN** `computeKeyCards(deckstring, cardLookup)` is called
- **THEN** the result has length 12

#### Scenario: Key cards order by count then cost

- **GIVEN** a deck with `Fireball x2 (cost 4)` and `Frostbolt x1
  (cost 2)`
- **WHEN** `computeKeyCards(deckstring, cardLookup)` is called
- **THEN** the result names are `['Fireball', 'Frostbolt']` in that order

