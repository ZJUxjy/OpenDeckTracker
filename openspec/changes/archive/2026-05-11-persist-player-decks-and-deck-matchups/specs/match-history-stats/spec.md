## MODIFIED Requirements

### Requirement: Durable match history records

The system SHALL persist real completed constructed matches in a local match-history store owned by the Electron main process.

Each persisted match record MUST include:

- `id`: repository-assigned stable id for renderer lists.
- `fingerprint`: unique idempotency key for the real game.
- `startedAt` and `endedAt`: wall-clock timestamps.
- `durationSeconds`: non-negative duration derived from start/end timestamps.
- `result`: one of `win`, `loss`, or `unknown`.
- `playOrder`: one of `first`, `coin`, or `unknown`.
- `deckId` and `deckName`: live Hearthstone deck identity when known.
- `savedDeckId` and `savedDeckVersion`: app-managed saved-deck attribution when known.
- `opponentName` and `opponentClass`: opponent metadata when known.
- `gameType` and `formatType`: match classification metadata.
- `playerClass`: player hero class when known.
- `source`: the recorder source, initially `deck-tracker`.

The store MUST be durable across app restarts and MUST NOT require a renderer window to be open when a match ends.

Duplicate writes for the same `fingerprint` MUST remain idempotent while enriching incomplete rows. When an incoming duplicate contains a known result, saved-deck attribution, player class, opponent class, deck name, or opponent name that the existing row lacks, the store SHALL update the existing row with the more complete value. The store MUST NOT downgrade a known result to `unknown` or replace a non-null value with null.

#### Scenario: Completed match is stored

- **WHEN** the tracker host receives a completed constructed match summary with a known `fingerprint`
- **THEN** the match-history store persists one record containing the summary fields
- **AND** a later query returns that record

#### Scenario: Duplicate completion enriches one row

- **GIVEN** an existing match row with `result: unknown`, null `opponentClass`, and null `savedDeckId`
- **WHEN** the recorder receives the same `fingerprint` with `result: win`, `opponentClass: MAGE`, and `savedDeckId: deck-1`
- **THEN** the store contains exactly one match record for that fingerprint
- **AND** that record has `result: win`, `opponentClass: MAGE`, and `savedDeckId: deck-1`

#### Scenario: Duplicate completion does not downgrade data

- **GIVEN** an existing match row with `result: win` and `opponentClass: MAGE`
- **WHEN** the recorder receives the same `fingerprint` with `result: unknown` and null `opponentClass`
- **THEN** the persisted row still has `result: win` and `opponentClass: MAGE`

#### Scenario: Unknown or unsupported mode is skipped

- **WHEN** the recorder receives a completed match summary whose `gameType` / `formatType` cannot be classified as constructed
- **THEN** no match-history record is inserted

### Requirement: Player class column in match history

The match-history store SHALL persist the player's hero class on each completed-match record so the Stats page can compute matchup matrices keyed on `(playerClass, opponentClass)`.

The schema migration MUST be additive: a nullable `player_class TEXT` column on the `match_history` table, applied via an idempotent table-info check on first open. Existing rows MUST remain valid with `player_class` left as NULL.

Newly-inserted records SHALL populate `player_class` from the live deck-tracker snapshot's deck class or saved-deck class when present; if no deck is identified at match end, the column MUST stay NULL.

#### Scenario: Existing rows survive migration

- **GIVEN** a match-history database created before this change with N rows
- **WHEN** the store is opened post-migration
- **THEN** all N rows are still present
- **AND** their `player_class` field reads as `null`

#### Scenario: New record carries player class

- **GIVEN** a tracker snapshot whose deck class is `'DRUID'`
- **WHEN** the recorder writes the corresponding match record
- **THEN** the persisted row's `player_class` is `'DRUID'`

#### Scenario: Snapshot without identified deck records null

- **GIVEN** a tracker snapshot whose `deck` is null at match end
- **WHEN** the recorder writes the match record
- **THEN** the persisted row's `player_class` is `null`

## ADDED Requirements

### Requirement: Saved-deck attribution columns in match history

The match-history store SHALL persist saved-deck attribution on each completed-match record using nullable `saved_deck_id TEXT` and `saved_deck_version INTEGER` columns.

The migration MUST be additive and idempotent. Existing rows MUST remain valid with both fields null. New records MUST populate these fields from `NormalizedCompletedMatch.savedDeckId` and `savedDeckVersion` when present.

#### Scenario: Existing rows survive saved-deck migration

- **GIVEN** a pre-migration match-history database with existing rows
- **WHEN** the store is opened
- **THEN** the rows remain queryable
- **AND** each existing row returns `savedDeckId: undefined` or `null` and `savedDeckVersion: undefined` or `null`

#### Scenario: New record carries saved-deck attribution

- **GIVEN** a completed match with `savedDeckId: deck-1` and `savedDeckVersion: 3`
- **WHEN** the match-history store records it
- **THEN** a later query returns the same `savedDeckId` and `savedDeckVersion`

### Requirement: Completed match records include best available class context

The recorder path that writes Power.log completion results SHALL include the best available deck and class context from the latest deck-tracker snapshot.

When the snapshot contains `deck`, `opponentClass`, saved-deck attribution, or player class, the normalized match record MUST include those values. When a value is unavailable, the field MAY remain null. This requirement MUST NOT block writing result data when class data is missing.

#### Scenario: Power completion writes opponent class from snapshot

- **GIVEN** the latest deck-tracker snapshot has `opponentClass: MAGE`
- **WHEN** Power.log reports game completion and the recorder writes a completed match
- **THEN** the persisted match record has `opponentClass: MAGE`

#### Scenario: Result is recorded even when class context is unavailable

- **GIVEN** Power.log reports local player `WON`
- **AND** the latest deck-tracker snapshot has null `opponentClass`
- **WHEN** the recorder writes a completed match
- **THEN** the persisted match record has `result: win`
- **AND** `opponentClass` remains null

### Requirement: Saved-deck matchup aggregation

`@hdt/core/stats` SHALL expose a pure saved-deck matchup aggregation that accepts persisted match records and a `savedDeckId`, returning opponent-class buckets with `{ opponentClass, wins, losses, matchesPlayed, winrate }`.

The aggregation MUST:

- Include only records whose `savedDeckId` equals the requested id.
- Apply the same time and format filters as other Stats aggregations.
- Count only `win` and `loss` toward winrate.
- Ignore `unknown` result matches for winrate while still allowing `matchesPlayed` to reflect total filtered matches.
- Bucket null opponent classes under the literal `Unknown`.
- Sort by opponent class key for stable rendering.

#### Scenario: Deck matchup filters by saved deck id

- **GIVEN** records for `savedDeckId: deck-a` and `savedDeckId: deck-b`
- **WHEN** saved-deck matchup aggregation runs for `deck-a`
- **THEN** only `deck-a` records contribute to the returned buckets

#### Scenario: Deck matchup computes winrate by opponent class

- **GIVEN** two known-result matches for `deck-a` against `MAGE`, one win and one loss
- **WHEN** saved-deck matchup aggregation runs for `deck-a`
- **THEN** the `MAGE` bucket has `wins: 1`, `losses: 1`, and `winrate: 50`

#### Scenario: Unknown result does not affect winrate

- **GIVEN** one win and one unknown-result match for `deck-a` against `PRIEST`
- **WHEN** saved-deck matchup aggregation runs for `deck-a`
- **THEN** the `PRIEST` bucket has `wins: 1`, `losses: 0`, and `winrate: 100`
- **AND** `matchesPlayed` is `2`

### Requirement: Desktop saved-deck matchup Stats IPC

The Electron main process SHALL expose a typed Stats IPC handler for saved-deck matchup queries and SHALL keep database access out of the renderer.

The preload API MUST expose:

```ts
stats: {
  getSavedDeckMatchups(
    savedDeckId: string,
    filter: StatsTimeFilter,
    options?: { formatFilter?: FormatFilter },
  ): Promise<SavedDeckMatchupStats[]>;
}
```

The handler MUST return serializable plain objects and MUST NOT expose raw database handles or SQL strings to the renderer.

#### Scenario: Renderer queries saved-deck matchups

- **WHEN** the renderer calls `window.hdt.stats.getSavedDeckMatchups('deck-a', 'season', { formatFilter: 'standard' })`
- **THEN** the main process returns season-and-standard-filtered matchup buckets for `deck-a`

#### Scenario: Missing saved deck records returns empty buckets

- **WHEN** the renderer queries a saved deck id with no matching match-history rows
- **THEN** the IPC response is an empty array

### Requirement: Stats page renders selected-deck class matchups

The Stats page SHALL render a saved-deck selector for deck matchup stats. The selector MUST list saved decks from the local deck store and choose a deterministic default when possible.

The selected-deck matchup panel MUST show per-opponent-class win/loss/winrate from `window.hdt.stats.getSavedDeckMatchups`. When no saved deck is selected or no matchup rows exist, the panel MUST show an explicit empty state.

#### Scenario: Saved deck selector drives matchup query

- **GIVEN** the Stats page has loaded saved decks
- **WHEN** the user selects `Deck A`
- **THEN** the page calls `getSavedDeckMatchups` with `Deck A`'s saved deck id
- **AND** renders the returned opponent-class buckets

#### Scenario: No saved deck records shows empty state

- **GIVEN** the selected saved deck has no persisted match rows
- **WHEN** the Stats page renders the deck matchup panel
- **THEN** the panel displays a localized empty state instead of fabricated winrate values
