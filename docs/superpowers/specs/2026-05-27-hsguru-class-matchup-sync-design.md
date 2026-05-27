# HSGuru Class Matchup Sync Design

## Context

HDT.js already syncs HSGuru popular decks into the Deck Finder. The current
pipeline reads the HSGuru meta page, follows each archetype to its deck
variants, transforms each variant into a `PopularDeck`, and persists the result
to `popular-decks/synced.json`.

That data currently contains deck-level winrate and game count only. HSGuru deck
detail pages also expose a class matchup table for the individual deck, with
opponent class, winrate, total games, and share of games. This design adds that
per-deck class matchup data to sync and renders it as a compact matchup matrix
in Deck Finder.

## Goals

- Sync per-deck HSGuru class matchup rows for every synced popular deck when
  available.
- Cache matchup rows with the popular deck snapshot so Deck Finder remains
  useful offline.
- Render the selected popular deck's matchup spread by opponent class.
- Keep existing seed and legacy synced caches compatible.
- Leave a clean extension point for future deck-vs-deck or archetype-vs-archetype
  matchup matrices.

## Non-Goals

- Do not implement deck-vs-deck matchup sync in this slice.
- Do not add a new remote data source beyond HSGuru.
- Do not block popular-deck sync if one deck detail page fails to parse.
- Do not attempt to infer missing class matchups from local match history.

## Data Model

Add a small domain type in `@hdt/core/deck`:

```ts
export interface PopularDeckClassMatchup {
  opponentClass: Exclude<HeroClass, 'NEUTRAL'>;
  winratePercent: number;
  gamesCount: number;
  popularityPercent: number;
}
```

Extend `PopularDeck` with:

```ts
classMatchups?: readonly PopularDeckClassMatchup[];
```

The field is optional so bundled seed data and older synced caches remain valid.
When absent or empty, the renderer shows an explicit empty state.

Future deck-vs-deck data should not reuse this shape. It should use a separate
type such as `PopularDeckPairMatchup`, because its row/column keys are deck or
archetype ids rather than hero classes.

## Sync Flow

The sync orchestrator gains a detail-page phase after variant parsing and before
transform persistence:

1. Fetch HSGuru meta page.
2. Parse top archetypes.
3. Fetch each archetype's variant page.
4. Parse deck variants, including each variant's deck detail URL.
5. For each parsed variant, fetch the deck detail page.
6. Parse the `Class Winrate Total Games` table into class matchup rows.
7. Transform the variant into `PopularDeck`, attaching the parsed rows.
8. Persist one snapshot containing deck data and class matchups.

Detail-page failures are degraded per deck. The transformed deck is still kept,
but `classMatchups` is omitted. A total sync failure should only happen if the
existing required phases fail: meta fetch, variant fetch, transform to zero
valid decks, or cache persistence.

## Parsing

`popular-decks-sync/parser.ts` should export a pure
`parseDeckClassMatchups(html)` function. It should:

- Locate the class matchup table by nearby labels rather than exact HTML layout
  when possible.
- Parse the eleven Hearthstone classes and skip the `Total` row.
- Accept both integer and decimal winrates.
- Parse total games from values like `56 (24.2%)`.
- Return an empty array on no match instead of throwing.

Parser tests should use a fixture based on the HSGuru deck detail page shape and
cover normal rows, missing tables, `Total` row exclusion, and class-name mapping.

## Storage

`SyncedSnapshot` should move to schema version 2:

```ts
export const SYNCED_SCHEMA_VERSION = 2;
```

The cache loader should accept schema version 1 and 2:

- Version 1 decks are valid and simply have no `classMatchups`.
- Version 2 validates `classMatchups` when present.
- Corrupt rows still invalidate the cache as today.

This keeps existing users from losing their last synced popular-deck list.

## IPC and Enrichment

No new IPC channel is required for the first slice. `popular-decks:list` already
returns `PopularDeckEnriched[]`; the added `classMatchups` field flows through
that existing response.

If deck-vs-deck matrices become large, they should use a separate lazy IPC query
instead of bloating the base deck list response.

## UI

Deck Finder's selected-deck detail pane gets a new "Class Matchups" section
below the KPI cards and above the mana curve. It renders:

- Opponent class label.
- Winrate percentage.
- Game count.
- A heat color where high winrate is green, near-even is amber/accent, and low
  winrate is red.

For the first slice this can be a compact vertical heat table. It should be
implemented as a reusable component with props shaped around class matchup rows
so later matrix work can share color and formatting helpers without forcing the
same data model.

Empty state copy:

- Seed or legacy cache: "No HSGuru class matchup data for this deck yet."
- Sync in progress or parse failure can use the same empty state; detailed sync
  diagnostics remain in logs.

## Error Handling

- Network failure for a deck detail page logs the deck id and URL, then continues.
- Parse failure for a deck detail page logs zero rows and continues.
- Cache validation treats malformed `classMatchups` as an invalid cache only
  when the field is present with invalid shape.
- UI must tolerate missing, empty, or partial matchup rows.

## Testing

Core and main-process tests:

- `deck-types` type coverage for `PopularDeckClassMatchup`.
- Parser tests for `parseDeckClassMatchups`.
- Transformer test proving parsed rows attach to the transformed deck.
- Sync orchestrator test proving detail pages are fetched and partial failures
  preserve decks.
- Storage tests for schema v1 compatibility and schema v2 validation.
- Popular-decks IPC test proving enriched rows include class matchups.

Renderer tests:

- Deck Finder renders matchup rows for a selected deck.
- Deck Finder shows an empty state when matchup data is absent.
- Existing filter and sync tests continue to pass.

Verification commands:

```bash
pnpm --filter @hdt/core exec vitest run src/deck/popular-decks-seed.test.ts src/deck/popular-deck-search.test.ts
pnpm --filter @hdt/desktop exec vitest run src/main/popular-decks-sync/parser.test.ts src/main/popular-decks-sync/transformer.test.ts src/main/popular-decks-sync/storage.test.ts src/main/popular-decks-sync/index.test.ts src/main/popular-decks-ipc.test.ts src/renderer/tests/DeckFinderTab.test.tsx
pnpm --filter @hdt/core typecheck
pnpm --filter @hdt/desktop typecheck
```

## Future Deck-vs-Deck Matrix

The next slice should start from a separate design because it needs different
questions:

- Whether the matrix rows are exact deck ids, archetypes, or classes.
- Whether HSGuru exposes pairwise matchup data at deck granularity or only at
  archetype level.
- Whether the data should be synced eagerly or queried lazily for a selected
  archetype/deck.
- How large the cache can grow before it needs a separate store.

This class-matchup slice should keep those future paths open without pretending
they are already solved.
