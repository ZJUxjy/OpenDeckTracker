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

### Requirement: Stats queries and aggregation

The system SHALL expose query functions that derive Stats page data from persisted match records only.

The stats query result MUST include:

- `matchesPlayed`: count of records in the selected time filter.
- `wins` and `losses`: counts of records with known results.
- `overallWinrate`: percentage computed from `wins / (wins + losses)`, or `null` when there are no known-result matches.
- `timePlayedSeconds`: sum of `durationSeconds`.
- `averageDurationSeconds`: average duration, or `null` when there are no matches.
- `bestDeck`: deck name and winrate for the best known-result deck, or `null`.
- `classWinrates`: per-opponent-class win/loss counts derived from real records.
- `recentMatches`: newest records first.

Time filters MUST support `today`, `week`, `season`, and `all-time`. Unknown-result matches MUST count toward `matchesPlayed` and `timePlayedSeconds` but MUST NOT affect winrate numerator or denominator.

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

### Requirement: Desktop Stats IPC

The Electron main process SHALL expose typed IPC handlers for Stats data queries and SHALL keep filesystem/database access out of the renderer.

The preload API MUST expose a `window.hdt.stats` namespace with functions for:

- Fetching the aggregate summary for a time filter.
- Fetching recent matches for a time filter and limit.

The IPC handlers MUST return serializable plain objects and MUST NOT expose raw database handles or SQL strings to the renderer.

#### Scenario: Renderer queries summary through preload

- **WHEN** the renderer calls the preload Stats summary API with `season`
- **THEN** the main process returns the season-filtered aggregate stats object

#### Scenario: Renderer queries recent matches through preload

- **WHEN** the renderer calls the preload recent matches API with a limit of `5`
- **THEN** the main process returns at most five persisted records in newest-first order

### Requirement: Stats page uses real data only

The Stats page SHALL render aggregate stats, class winrates, and recent matches from the real Stats IPC data source only.

The component MUST remove the existing hardcoded `mockMatchHistory`, `classWinrates`, and fixed summary values. When no records exist, the UI MUST show explicit empty states instead of fabricated match rows, percentages, totals, or class bars.

#### Scenario: No matches shows empty states

- **WHEN** the Stats query returns no records
- **THEN** the Recent Matches section shows an empty-state message
- **AND** summary cards do not show fabricated winrate, match count, time played, or best-deck values

#### Scenario: Existing records populate Stats

- **WHEN** the Stats query returns persisted match records and aggregate values
- **THEN** the Recent Matches list, summary cards, and class winrate chart render those returned values
- **AND** no hardcoded mock match names or fixed totals appear
