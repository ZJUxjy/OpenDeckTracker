## 1. Player-class Schema Migration

- [x] 1.1 Add failing tests in `apps/desktop/src/main/match-history-store.test.ts` covering: (a) opening a fresh DB exposes a `player_class` column; (b) opening a pre-migration DB (insert one row directly via `db.exec` without `player_class`, close, reopen via `createMatchHistoryStore`) returns the row with `player_class === null`; (c) `record(match)` with `playerClass: 'DRUID'` persists `player_class === 'DRUID'`. Run `pnpm --filter @hdt/desktop test -- match-history-store` and expect failure.
- [x] 1.2 Extend `match-history-store.ts` schema bootstrap to add `player_class TEXT` via `ALTER TABLE match_history ADD COLUMN IF NOT EXISTS player_class TEXT` (or equivalent — sqlite supports the simpler `ALTER TABLE ... ADD COLUMN` and we guard idempotency by reading `pragma table_info`). Update `MatchHistoryRow` interface and `INSERT` statement. Run the failing tests; expect pass.
- [x] 1.3 Extend `NormalizedCompletedMatch` (or pass through tracker host) with optional `playerClass?: string`. Wire the deck-tracker's match-end summary to populate it from `snapshot.deck.class` (fallback `null`). Add a `@hdt/core` test asserting `normalizeCompletedMatch` round-trips `playerClass` and a `match-recording-recorder.test.ts` test asserting the field flows from snapshot to summary.
- [x] 1.4 Run `pnpm --filter @hdt/core test` + `pnpm --filter @hdt/desktop test -- match-history-store` and expect all green.
- [x] 1.5 Commit with message `feat(stats): persist player_class on match history records`.

## 2. Format Filter Aggregation

- [ ] 2.1 Add failing tests in `packages/core/src/stats/format-filter.test.ts` covering: standard/wild/classic/twist subsetting, `'all'` is identity, empty input returns empty, mixed records subset correctly. Run `pnpm --filter @hdt/core test -- format-filter` and expect failure.
- [ ] 2.2 Create `packages/core/src/stats/format-filter.ts` exporting `type FormatFilter = 'standard' | 'wild' | 'classic' | 'twist' | 'all'` and `filterMatchesByFormat(matches, formatFilter): MatchHistoryRecord[]`. Mapping: standard→2, wild→1, classic→3, twist→4, all→identity. Run the tests; expect pass.
- [ ] 2.3 Re-export `FormatFilter` and `filterMatchesByFormat` from `@hdt/core/stats/index.ts` and `@hdt/core/index.ts`. Typecheck pass.
- [ ] 2.4 Commit with message `feat(core): add format filter for stats`.

## 3. Matchup Matrix Aggregation

- [ ] 3.1 Add failing tests in `packages/core/src/stats/matchup-matrix.test.ts` covering: (a) single match populates the right cell with `winrate: 100`; (b) empty input returns an empty matrix; (c) null `playerClass` buckets under `'Unknown'` row; (d) null `opponentClass` buckets under `'Unknown'` column; (e) unknown-result match doesn't change cell winrate (still null when only unknowns present); (f) zero-match cell reports `winrate: null`, not 0. Run `pnpm --filter @hdt/core test -- matchup-matrix` and expect failure.
- [ ] 3.2 Create `packages/core/src/stats/matchup-matrix.ts` exporting `MatchupCell { wins; losses; winrate: number | null }`, `MatchupMatrix { cells: Record<string, Record<string, MatchupCell>>, playerClasses: string[], opponentClasses: string[] }`, and `computeMatchupMatrix(matches): MatchupMatrix`. Iterate once over matches, bucket by (player, opp), compute winrate at the end. Run the tests; expect pass.
- [ ] 3.3 Add re-exports from `@hdt/core/stats/index.ts`. Typecheck pass.
- [ ] 3.4 Commit with message `feat(core): add matchup matrix aggregation`.

## 4. Winrate Time Series Aggregation

- [ ] 4.1 Add failing tests in `packages/core/src/stats/winrate-time-series.test.ts` covering: (a) two matches on same day → one daily point with `matches: 2`; (b) two matches across days → two points; (c) weekly granularity collapses Mon + Wed into one point; (d) empty input returns empty array; (e) sorted ascending by `bucketStart`; (f) unknown-result counted in `matches` but not in `wins`/`losses`. Use `Date.now()`-stable fixtures (UTC midnights). Run `pnpm --filter @hdt/core test -- winrate-time-series` and expect failure.
- [ ] 4.2 Create `packages/core/src/stats/winrate-time-series.ts` exporting `WinrateTimeSeriesPoint { bucketStart: number; wins; losses; winrate: number | null; matches }` and `computeWinrateTimeSeries(matches, granularity: 'daily' | 'weekly', locale?: 'en-US' | 'zh-CN'): WinrateTimeSeriesPoint[]`. Daily bucket = floor to local midnight; weekly bucket = floor to first day of week (Monday for zh-CN, Sunday for en-US). Run tests; expect pass.
- [ ] 4.3 Add re-exports. Typecheck pass.
- [ ] 4.4 Commit with message `feat(core): add winrate time-series aggregation`.

## 5. Play-Order Split Aggregation

- [ ] 5.1 Add failing tests in `packages/core/src/stats/play-order-split.test.ts` covering: (a) play/coin/unknown bucket separation; (b) empty input returns all-zero buckets with `winrate: null`; (c) unknown-result matches counted neither in `wins` nor `losses`. Run and expect failure.
- [ ] 5.2 Create `packages/core/src/stats/play-order-split.ts` exporting `PlayOrderBucket { wins; losses; winrate: number | null }`, `PlayOrderSplit { first; coin; unknown }`, and `computePlayOrderSplit(matches): PlayOrderSplit`. Run tests; expect pass.
- [ ] 5.3 Add re-exports. Typecheck pass.
- [ ] 5.4 Commit with message `feat(core): add play-order split aggregation`.

## 6. Wire Optional Aggregations into aggregateStats

- [ ] 6.1 Add failing tests in `packages/core/src/stats/stats-aggregation.test.ts` (extend existing or add new file) covering: (a) `aggregateStats(matches, { filter: 'all-time' })` (no flags) returns the existing shape with no `matchupMatrix`/`winrateTimeSeries`/`playOrderSplit`; (b) with all `include*` flags, all three are present; (c) `formatFilter: 'standard'` narrows ALL aggregations including the existing summary fields. Run and expect failure.
- [ ] 6.2 Update `packages/core/src/stats/stats-aggregation.ts`: extend `StatsQueryOptions` with `formatFilter?` and three `include*` flags. Apply format filter at the top of `aggregateStats`. Conditionally call the three new aggregations and attach to result. Run tests; expect pass.
- [ ] 6.3 Update `StatsSummary` interface to include the three new optional fields. Re-export anything new.
- [ ] 6.4 Commit with message `feat(core): plumb new aggregations through aggregateStats`.

## 7. Stats IPC + Preload Surface

- [ ] 7.1 Add failing tests in `apps/desktop/src/main/stats-host.test.ts` asserting that calling the IPC summary handler with `{ formatFilter: 'standard', includeMatchupMatrix: true }` returns a Standard-only `matchupMatrix`. Run and expect failure.
- [ ] 7.2 Update `stats-host.ts` to forward `options` to `aggregateStats`. Maintain backwards-compatible single-arg signature. Run tests; expect pass.
- [ ] 7.3 Update `apps/desktop/src/preload/index.ts` and `apps/desktop/src/renderer/src/env.d.ts` so `getSummary` accepts `(filter, options?)` and `listRecent` accepts `(filter, limit, options?)`. Typecheck pass.
- [ ] 7.4 Add a backwards-compat test asserting legacy single-arg `getSummary(filter)` still works. Run; expect pass.
- [ ] 7.5 Commit with message `feat(desktop): extend stats IPC with options`.

## 8. i18n Strings for Stats

- [ ] 8.1 Add new keys under `stats.*` in `resources/locales/en-US.json`: `formatFilter.{all,standard,wild,classic,twist}`, `matchup.{title,playerHeader,opponentHeader,unknownClass,emptyCell}`, `timeSeries.{title,daily,weekly,empty}`, `playOrder.{title,first,coin,unknown}`, `recordingViewer.{title,deck,startingHand,postMulliganHand,timeline,empty,close}`, `recordings.{view,unavailable}`. JSON parse check.
- [ ] 8.2 Mirror with translated values into `resources/locales/zh-CN.json`. JSON parse check.
- [ ] 8.3 Add a test in `apps/desktop/src/renderer/tests/Stats.i18n.test.tsx` asserting both en-US and zh-CN render the format filter labels. Run and expect pass after 8.1+8.2.
- [ ] 8.4 Commit with message `feat(i18n): add stats analytics strings`.

## 9. FormatFilterPills Component

- [ ] 9.1 Add failing tests in `apps/desktop/src/renderer/tests/FormatFilterPills.test.tsx` asserting: (a) renders five pills with localized labels; (b) clicking a pill calls the `onChange` prop with the corresponding `FormatFilter` value; (c) `value` prop visually highlights the active pill. Run and expect failure.
- [ ] 9.2 Create `apps/desktop/src/renderer/src/components/FormatFilterPills.tsx`. Run tests; expect pass.
- [ ] 9.3 Commit with message `feat(desktop): add format filter pills`.

## 10. MatchupMatrix Component

- [ ] 10.1 Add failing tests in `apps/desktop/src/renderer/tests/MatchupMatrix.test.tsx` covering: (a) renders an N×M grid with row/col labels for non-empty matrices; (b) renders the empty-state placeholder for an empty matrix; (c) cell with `winrate: null` renders the placeholder character (em-dash); (d) cell with high winrate gets the `bg-emerald-*` class, low winrate `bg-red-*`; (e) low-confidence cells (matches < 5) have the dim class. Run and expect failure.
- [ ] 10.2 Create `apps/desktop/src/renderer/src/components/MatchupMatrix.tsx` rendering a CSS grid. Run tests; expect pass.
- [ ] 10.3 Commit with message `feat(desktop): add matchup matrix component`.

## 11. WinrateTimeSeriesChart Component

- [ ] 11.1 Add failing tests in `apps/desktop/src/renderer/tests/WinrateTimeSeriesChart.test.tsx` covering: (a) renders a Recharts `LineChart` when given non-empty data; (b) renders empty-state placeholder for empty data; (c) granularity toggle calls `onGranularityChange` when clicked; (d) low-confidence points (matches < 3) are visually dimmed (assert via element class or aria). Run and expect failure.
- [ ] 11.2 Create `apps/desktop/src/renderer/src/components/WinrateTimeSeriesChart.tsx`. Run tests; expect pass.
- [ ] 11.3 Commit with message `feat(desktop): add winrate time-series chart`.

## 12. PlayOrderSplitCard Component

- [ ] 12.1 Add failing tests in `apps/desktop/src/renderer/tests/PlayOrderSplitCard.test.tsx` covering: (a) renders two side-by-side mini-cards (first/coin); (b) `winrate: null` renders dash, otherwise renders percent; (c) hides the `unknown` bucket when its `wins+losses === 0`. Run and expect failure.
- [ ] 12.2 Create `apps/desktop/src/renderer/src/components/PlayOrderSplitCard.tsx`. Run tests; expect pass.
- [ ] 12.3 Commit with message `feat(desktop): add play-order split card`.

## 13. MatchRecordingViewer Component

- [ ] 13.1 Add failing tests in `apps/desktop/src/renderer/tests/MatchRecordingViewer.test.tsx` covering: (a) opening on a fingerprint calls `window.hdt.recordings.get(fingerprint)`; (b) renders deck list, starting hand, post-mulligan hand, and event list from a fixture detail; (c) renders the empty-state when `get` returns `null`; (d) close button calls `onOpenChange(false)`. Run and expect failure.
- [ ] 13.2 Create `apps/desktop/src/renderer/src/components/MatchRecordingViewer.tsx` as a Radix Dialog. Run tests; expect pass.
- [ ] 13.3 Commit with message `feat(desktop): add match recording viewer dialog`.

## 14. Stats Page Layout Integration

- [ ] 14.1 Add failing tests in `apps/desktop/src/renderer/tests/Stats.deep.test.tsx` covering: (a) Stats page calls `getSummary` with all three `include*` flags; (b) renders `MatchupMatrix`, `WinrateTimeSeriesChart`, `PlayOrderSplitCard`, and `FormatFilterPills`; (c) clicking a format pill triggers a refetch with the new format filter; (d) clicking a recent-match row's `View recording` button opens the viewer dialog. Run and expect failure.
- [ ] 14.2 Update `Stats.tsx` to: store `formatFilter` in component state, pass through to `getSummary`, render the four new components in the prescribed order (winrate trend, matchup matrix, play/coin split, recent matches with view-recording action). Run tests; expect pass.
- [ ] 14.3 Run `pnpm --filter @hdt/desktop typecheck` and expect exit code 0.
- [ ] 14.4 Run `pnpm --filter @hdt/desktop test` and expect ALL green (existing + new).
- [ ] 14.5 Commit with message `feat(desktop): integrate deepened stats into Stats page`.

## 15. Final Validation and Archive

- [ ] 15.1 Run `pnpm --filter @hdt/core test` and expect all `@hdt/core` tests passing.
- [ ] 15.2 Run `pnpm --filter @hdt/desktop test` and expect all desktop tests passing.
- [ ] 15.3 Run `pnpm --filter @hdt/core typecheck` and `pnpm --filter @hdt/desktop typecheck` and expect both at exit code 0.
- [ ] 15.4 Run `npx openspec validate add-stats-analytics-deepening --strict` and expect "Change … is valid".
- [ ] 15.5 Manual smoke: launch `pnpm dev`, navigate to `/stats`, verify the four new sections render. Switch format filter to Standard and confirm refetch. Click `View recording` on a recent match (record one in-game first) and confirm the dialog renders. Switch language to `zh-CN` and confirm localized labels.
- [ ] 15.6 Run `git status` to confirm only in-scope files changed; commit any final fixes.
- [ ] 15.7 Archive change via `/opsx:archive add-stats-analytics-deepening` (sync delta specs → main, move to archive).
