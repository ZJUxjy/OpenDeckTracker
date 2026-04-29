### Requirement: Durable match history records

The system SHALL persist real completed constructed matches in a local match-history store owned by the Electron main process.

Each persisted match record MUST include:

- `id`: repository-assigned stable id for renderer lists.
- `fingerprint`: unique idempotency key for the real game.
- `startedAt` and `endedAt`: wall-clock timestamps.
- `durationSeconds`: non-negative duration derived from start/end timestamps.
- `result`: one of `win`, `loss`, or `unknown`.
- `playOrder`: one of `first`, `coin`, or `unknown`.
- `deckId` and `deckName`: local deck identity when known.
- `opponentName` and `opponentClass`: opponent metadata when known.
- `gameType` and `formatType`: match classification metadata.
- `source`: the recorder source, initially `deck-tracker`.

The store MUST be durable across app restarts and MUST NOT require a renderer window to be open when a match ends.

#### Scenario: Completed match is stored

- **WHEN** the tracker host receives a completed constructed match summary with a known `fingerprint`
- **THEN** the match-history store persists one record containing the summary fields
- **AND** a later query returns that record

#### Scenario: Duplicate completion is idempotent

- **WHEN** the recorder receives the same completed match summary twice with the same `fingerprint`
- **THEN** the store contains exactly one match record for that fingerprint

#### Scenario: Unknown or unsupported mode is skipped

- **WHEN** the recorder receives a completed match summary whose `gameType` / `formatType` cannot be classified as constructed
- **THEN** no match-history record is inserted

### Requirement: Player class column in match history

The match-history store SHALL persist the player's hero class on each completed-match record so the Stats page can compute matchup matrices keyed on `(playerClass, opponentClass)`.

The schema migration MUST be additive: a single nullable `player_class TEXT` column on the `match_history` table, applied via `ALTER TABLE ... ADD COLUMN ... IF NOT EXISTS` (or equivalent idempotent check) on first open. Existing rows MUST remain valid with `player_class` left as NULL.

Newly-inserted records SHALL populate `player_class` from the live deck-tracker snapshot's `deck.class` field (when present); if no deck is identified at match end, the column MUST stay NULL.

#### Scenario: Existing rows survive migration

- **GIVEN** a match-history database created before this change with N rows
- **WHEN** the store is opened post-migration
- **THEN** all N rows are still present
- **AND** their `player_class` field reads as `null`

#### Scenario: New record carries player class

- **GIVEN** a tracker snapshot whose `deck.class` is `'DRUID'`
- **WHEN** the recorder writes the corresponding match record
- **THEN** the persisted row's `player_class` is `'DRUID'`

#### Scenario: Snapshot without identified deck records null

- **GIVEN** a tracker snapshot whose `deck` is null at match end
- **WHEN** the recorder writes the match record
- **THEN** the persisted row's `player_class` is `null`

### Requirement: Stats queries and aggregation

The system SHALL expose query functions that derive Stats page data from persisted match records only.

The aggregation entry point `aggregateStats(matches, options)` SHALL accept an optional `options` parameter of shape:

```ts
interface StatsQueryOptions {
  filter: StatsTimeFilter;
  formatFilter?: FormatFilter;          // default 'all'
  includeMatchupMatrix?: boolean;       // default false
  includeTimeSeries?: boolean;          // default false
  timeSeriesGranularity?: 'daily' | 'weekly';  // default 'daily'
  includePlayOrderSplit?: boolean;      // default false
}
```

The stats query result (`StatsSummary`) MUST include the existing fields:

- `matchesPlayed`: count of records in the selected time + format filter.
- `wins` and `losses`: counts of records with known results.
- `overallWinrate`: percentage computed from `wins / (wins + losses)`, or `null` when there are no known-result matches.
- `timePlayedSeconds`: sum of `durationSeconds`.
- `averageDurationSeconds`: average duration, or `null` when there are no matches.
- `bestDeck`: deck name and winrate for the best known-result deck, or `null`.
- `classWinrates`: per-opponent-class win/loss counts derived from real records.
- `recentMatches`: newest records first.

Plus the following NEW optional fields, populated only when the corresponding `include*` flag is true:

- `matchupMatrix?: MatchupMatrix` — present when `includeMatchupMatrix === true`.
- `winrateTimeSeries?: WinrateTimeSeriesPoint[]` — present when `includeTimeSeries === true`.
- `playOrderSplit?: PlayOrderSplit` — present when `includePlayOrderSplit === true`.

Time filters MUST support `today`, `week`, `season`, and `all-time`. Unknown-result matches MUST count toward `matchesPlayed` and `timePlayedSeconds` but MUST NOT affect winrate numerator or denominator.

When `formatFilter` is non-`'all'`, ALL aggregations (existing and new) MUST be computed against the format-filtered subset.

#### Scenario: Empty history returns empty stats

- **WHEN** the match-history store has no records for the selected filter
- **THEN** the stats query returns zero counts, `null` rates, an empty `recentMatches` list, and an empty `classWinrates` list

#### Scenario: Winrate ignores unknown results

- **WHEN** the selected records contain one win, one loss, and one unknown-result match
- **THEN** `matchesPlayed` is `3`
- **AND** `overallWinrate` is `50`

#### Scenario: Recent matches are newest first

- **WHEN** three records have different `endedAt` timestamps
- **THEN** the recent matches query returns them in descending `endedAt` order

#### Scenario: Format filter narrows aggregations

- **GIVEN** records with mixed `formatType` values
- **WHEN** `aggregateStats(matches, { filter: 'all-time', formatFilter: 'standard' })` runs
- **THEN** `matchesPlayed`, `wins`, `losses`, `classWinrates`, and `recentMatches` reflect only the Standard subset

#### Scenario: Optional aggregations populate only when requested

- **GIVEN** a non-empty match list
- **WHEN** `aggregateStats(matches, { filter: 'all-time' })` runs without any `include*` flags
- **THEN** `matchupMatrix`, `winrateTimeSeries`, and `playOrderSplit` are all undefined

#### Scenario: Requested aggregations are present

- **WHEN** `aggregateStats(matches, { filter: 'all-time', includeMatchupMatrix: true, includeTimeSeries: true, includePlayOrderSplit: true })` runs
- **THEN** all three optional fields are present and non-null

### Requirement: Matchup matrix aggregation

`@hdt/core/stats` SHALL expose a pure `computeMatchupMatrix(matches)` function returning a grid keyed by `(playerClass, opponentClass)` with `{ wins, losses, winrate }` cells.

`playerClass` SHALL be sourced from the `player_class` field; rows whose value is null MUST be bucketed under the literal `'Unknown'` row. `opponentClass` SHALL be sourced from `opponent_class`; null values MUST be bucketed under the `'Unknown'` column.

Cells with zero matches MUST report `winrate: null` (not zero) so renderers can distinguish "0% winrate over 1 match" from "no matches yet".

Unknown-result matches (`result === 'unknown'`) MUST count toward neither `wins` nor `losses` and MUST NOT affect `winrate`.

#### Scenario: Single match populates the right cell

- **GIVEN** one match with `player_class='DRUID'`, `opponent_class='MAGE'`, `result='win'`
- **WHEN** `computeMatchupMatrix` runs
- **THEN** the `(DRUID, MAGE)` cell has `wins: 1, losses: 0, winrate: 100`
- **AND** all other cells have `wins: 0, losses: 0, winrate: null`

#### Scenario: Null player_class buckets under Unknown row

- **GIVEN** matches with `player_class: null`
- **WHEN** the matrix is computed
- **THEN** those records appear under the `'Unknown'` row keyed on their `opponent_class`

#### Scenario: Unknown-result matches do not affect cell winrate

- **GIVEN** one win and one unknown-result match in the same `(DRUID, MAGE)` cell
- **WHEN** the matrix is computed
- **THEN** the cell has `wins: 1, losses: 0, winrate: 100`

### Requirement: Winrate time-series aggregation

`@hdt/core/stats` SHALL expose `computeWinrateTimeSeries(matches, granularity)` returning an array of `{ bucketStart, wins, losses, winrate, matches }` points sorted ascending by `bucketStart`.

Granularity MUST support `'daily'` and `'weekly'`. Daily buckets MUST start at midnight in the host's local timezone; weekly buckets MUST start on the host's locale-conventional first day of the week (Monday in `zh-CN`, Sunday in `en-US`).

Empty buckets MUST NOT appear in the result; consumers responsible for displaying gaps must fill them client-side.

#### Scenario: Three matches across two days produce two daily points

- **GIVEN** three matches: two on day A and one on day B
- **WHEN** `computeWinrateTimeSeries(matches, 'daily')` runs
- **THEN** the result has exactly two points
- **AND** the day-A point's `matches` is `2` and the day-B point's is `1`

#### Scenario: Weekly granularity collapses days within the same week

- **GIVEN** matches on Monday and Wednesday of the same week
- **WHEN** `computeWinrateTimeSeries(matches, 'weekly')` runs
- **THEN** the result has exactly one point spanning both days

### Requirement: Play / coin order split aggregation

`@hdt/core/stats` SHALL expose `computePlayOrderSplit(matches)` returning `{ first: { wins, losses, winrate }, coin: { wins, losses, winrate }, unknown: { wins, losses, winrate } }`.

`unknown` MUST be present even when empty so consumers can shape their UI consistently. `winrate` follows the same null-on-zero-known semantics as the matchup matrix.

#### Scenario: Play / coin / unknown matches split correctly

- **GIVEN** three matches: one `playOrder: 'first'` win, one `playOrder: 'coin'` loss, one `playOrder: 'unknown'` win
- **WHEN** `computePlayOrderSplit` runs
- **THEN** `first.wins=1, first.losses=0, first.winrate=100`
- **AND** `coin.wins=0, coin.losses=1, coin.winrate=0`
- **AND** `unknown.wins=1, unknown.losses=0, unknown.winrate=100`

### Requirement: Format filter for stats aggregations

`@hdt/core/stats` SHALL expose a `FormatFilter` type (`'standard' | 'wild' | 'classic' | 'twist' | 'all'`) and a pure `filterMatchesByFormat(matches, formatFilter)` predicate. The filter MUST be applied **before** any other aggregation when an aggregation is requested with a non-`'all'` filter.

The filter mapping MUST be:

- `'standard'` → `formatType === 2`
- `'wild'` → `formatType === 1`
- `'classic'` → `formatType === 3`
- `'twist'` → `formatType === 4`
- `'all'` → no filter applied

#### Scenario: Standard filter excludes Wild matches

- **GIVEN** matches with `formatType` values `2` (Standard) and `1` (Wild)
- **WHEN** `filterMatchesByFormat(matches, 'standard')` runs
- **THEN** the result contains only the records with `formatType: 2`

#### Scenario: All filter is a no-op

- **GIVEN** any list of matches
- **WHEN** `filterMatchesByFormat(matches, 'all')` runs
- **THEN** the result equals the input list

### Requirement: Desktop Stats IPC

The Electron main process SHALL expose typed IPC handlers for Stats data queries and SHALL keep filesystem/database access out of the renderer.

The preload API MUST expose a `window.hdt.stats` namespace with functions for:

- Fetching the aggregate summary for a time filter, optionally with a query-options object.
- Fetching recent matches for a time filter and limit, optionally with a format filter.

The function signatures MUST be:

```ts
stats: {
  getSummary(filter: StatsTimeFilter, options?: StatsQueryOptions): Promise<StatsSummary>;
  listRecent(filter: StatsTimeFilter, limit: number, options?: { formatFilter?: FormatFilter }): Promise<MatchHistoryRecord[]>;
}
```

Existing renderer call sites that pass only `filter` MUST continue to work without modification (the `options` parameter is strictly additive).

The IPC handlers MUST return serializable plain objects and MUST NOT expose raw database handles or SQL strings to the renderer.

#### Scenario: Renderer queries summary through preload

- **WHEN** the renderer calls the preload Stats summary API with `season`
- **THEN** the main process returns the season-filtered aggregate stats object

#### Scenario: Renderer queries recent matches through preload

- **WHEN** the renderer calls the preload recent matches API with a limit of `5`
- **THEN** the main process returns at most five persisted records in newest-first order

#### Scenario: Renderer requests deep aggregations

- **WHEN** the renderer calls `getSummary('all-time', { formatFilter: 'standard', includeMatchupMatrix: true, includeTimeSeries: true, includePlayOrderSplit: true })`
- **THEN** the response carries `matchupMatrix`, `winrateTimeSeries`, and `playOrderSplit`, each populated from the Standard-only subset

#### Scenario: Pre-existing renderer calls remain valid

- **WHEN** the renderer calls the legacy single-arg form `getSummary('season')`
- **THEN** the call resolves with the same shape as before this change (matchup/time-series/play-order fields absent)

### Requirement: Stats page uses real data only

The Stats page SHALL render aggregate stats, class winrates, recent matches, matchup matrix, winrate time series, and play-order split from the real Stats IPC data source only.

The component MUST remove the existing hardcoded `mockMatchHistory`, `classWinrates`, and fixed summary values. When no records exist, the UI MUST show explicit empty states instead of fabricated values for any of the surfaces above.

The Stats page MUST surface a format filter pill row alongside the existing time filter, defaulting to `'all'`. Selecting a non-`'all'` format MUST refetch the summary with the new filter.

Each row in the recent matches list SHALL render a `View recording` action that opens a recording detail dialog backed by `window.hdt.recordings.get`. When no recording exists for a given `fingerprint`, the action MUST be disabled.

#### Scenario: No matches shows empty states

- **WHEN** the Stats query returns no records
- **THEN** the Recent Matches section shows an empty-state message
- **AND** summary cards do not show fabricated winrate, match count, time played, or best-deck values
- **AND** the matchup matrix renders all cells as the empty-cell placeholder
- **AND** the winrate time series chart renders the empty-state placeholder
- **AND** the play-order split cards render zero-state values

#### Scenario: Existing records populate Stats

- **WHEN** the Stats query returns persisted match records and aggregate values
- **THEN** the Recent Matches list, summary cards, class winrate chart, matchup matrix, time series chart, and play-order split render those returned values
- **AND** no hardcoded mock match names or fixed totals appear

#### Scenario: Format filter refetches and re-renders

- **GIVEN** the Stats page rendering `'all'`-filter data
- **WHEN** the user clicks the `Standard` format pill
- **THEN** the page calls `getSummary` with `formatFilter: 'standard'`
- **AND** the new response replaces the previous summary in the UI

#### Scenario: View recording opens the dialog

- **GIVEN** a recent match row whose `fingerprint` has a stored recording
- **WHEN** the user clicks the row's `View recording` action
- **THEN** a Radix Dialog opens
- **AND** the dialog calls `window.hdt.recordings.get(fingerprint)` and renders the resulting deck, hands, and timeline event list
