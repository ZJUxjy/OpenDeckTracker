## Why

`add-real-match-history-stats` shipped the recording pipeline (commit `a50e93e`) and `add-match-recordings` shipped the per-match timeline replay infrastructure. The renderer's `Stats.tsx` page surfaces only the entry-level slice: overall winrate, matches played, time played, best deck, and a stacked bar of wins/losses by opponent class. Everything heavier listed in `DEVELOPMENT_PLAN.md` Phase 4 — matchup analysis, format breakdown, time-series trend, play/coin split, replay drill-in — is **not yet plumbed to UI**, even though the underlying data sits in `match-history.db` (and `<userData>/recordings/<id>/`) for every recorded game.

The user-visible gap is sharp: a player wanting to know "what's my Mage vs. Druid winrate in Standard this season, on the coin?" has the data on disk but no way to ask. The Stats page also offers no path from a match row to its saved recording, so the recording feature is effectively invisible.

This change closes that gap by deepening the stats domain (matchup matrix, time-series winrate, play/coin split, format filter), wiring richer aggregations through the existing `window.hdt.stats.*` IPC surface, and adding a "View recording" affordance that opens the corresponding recording detail. The change deliberately stops short of deck-attribution filtering because that intersects `add-deck-management`'s saved-deck attribution path (which already plumbs `savedDeckId` into match summaries but the renderer doesn't yet aggregate by it); a separate follow-up will close that loop.

## What Changes

- **NEW** `MatchupMatrix` aggregation in `@hdt/core/stats`: a `playerClass × opponentClass` grid of `{ wins, losses, winrate }` cells. Computed in pure TS over `MatchHistoryRecord[]`; the player's class is resolved from the saved-deck attribution when available, otherwise from the live `deck.class` on the recorded match (best-effort fallback).
- **NEW** `WinrateTimeSeriesPoint` and `computeWinrateTimeSeries(matches, granularity)` in `@hdt/core/stats`. Granularity is `daily` or `weekly`; daily is default. Each point carries `(bucketStart, wins, losses, winrate)`.
- **NEW** `PlayOrderSplit` aggregation in `@hdt/core/stats`: `{ first: { wins, losses, winrate }, coin: { wins, losses, winrate } }`. Computed over the existing `playOrder` field already captured in `match-history.db`.
- **NEW** `FormatFilter = 'standard' | 'wild' | 'classic' | 'twist' | 'all'`. The renderer-side filter pipes through to all stat aggregations via a new optional `formatFilter` parameter on `getSummary` / `listRecent` (default `'all'`, preserving existing behavior).
- **MODIFIED** `StatsSummary` shape: add optional `matchupMatrix?: MatchupMatrix`, `winrateTimeSeries?: WinrateTimeSeriesPoint[]`, `playOrderSplit?: PlayOrderSplit` fields. All optional so callers that don't request them stay zero-cost.
- **MODIFIED** `window.hdt.stats.getSummary(filter, options?)` and `listRecent(filter, limit, options?)` IPC: gain an optional `options: { formatFilter?: FormatFilter; includeMatchup?: boolean; includeTimeSeries?: boolean; includePlayOrderSplit?: boolean }` parameter. Backwards-compatible: existing renderer calls unaffected.
- **NEW** Renderer `MatchupMatrix` component: a 12×12 grid (one row per player class, one column per opponent class) rendering winrate cells with a green/red diverging colormap and `wins-losses` underneath. Cells with zero matches render as a dim em-dash.
- **NEW** Renderer `WinrateTimeSeriesChart` component: Recharts `LineChart` of daily/weekly winrate, with a granularity toggle.
- **NEW** Renderer `PlayOrderSplitCard` component: two side-by-side mini-stat cards.
- **NEW** Renderer `FormatFilterPills` component: a Standard/Wild/Classic/Twist/All toggle, sitting next to the existing time-filter pills.
- **NEW** Renderer "View recording" button on each match-history row: opens a `MatchRecordingViewer` Radix Dialog displaying the deck, the starting hand, post-mulligan hand, and the timeline list. Uses the existing `window.hdt.recordings.*` IPC.
- **MODIFIED** `Stats.tsx` layout: format filter inline with time filter; new sections under the existing summary cards in this order — winrate trend, matchup matrix, play/coin split, recent matches (now with recording drill-in).
- **NEW** i18n keys under `stats.*`: matchup labels, time-series controls, play-order split text, format filter labels, recording dialog titles, view-recording button.

## Capabilities

### New Capabilities

None — this is depth on existing capabilities, not new surface area.

### Modified Capabilities

- `match-history-stats`: extend `Stats queries and aggregation` requirement to add matchup-matrix / time-series / play-order-split aggregations and the optional format filter. Extend `Desktop Stats IPC` to add the optional `options` parameter. Extend `Stats page uses real data only` to require the new components render only when their inputs are present.
- `match-recordings`: extend `Recording IPC` to acknowledge the renderer-driven viewer pattern (no new channel — reuses `recordings:get`).
- `i18n-support`: add `stats.*` keys; ensure both `en-US.json` and `zh-CN.json` mirror the new keys.

## Impact

- **Code (new)**:
  - `packages/core/src/stats/matchup-matrix.ts` + test
  - `packages/core/src/stats/winrate-time-series.ts` + test
  - `packages/core/src/stats/play-order-split.ts` + test
  - `apps/desktop/src/renderer/src/components/{MatchupMatrix,WinrateTimeSeriesChart,PlayOrderSplitCard,FormatFilterPills,MatchRecordingViewer}.tsx` + tests
- **Code (modified)**:
  - `packages/core/src/stats/stats-aggregation.ts` — `StatsSummary` shape additions; `aggregateStats(matches, options)` accepts options struct.
  - `apps/desktop/src/main/stats-host.ts` — IPC handlers accept new `options` parameter.
  - `apps/desktop/src/preload/index.ts` — `getSummary` / `listRecent` signatures gain optional `options`.
  - `apps/desktop/src/renderer/src/env.d.ts` — type updates.
  - `apps/desktop/src/renderer/src/components/Stats.tsx` — layout extension.
  - `resources/locales/{en-US,zh-CN}.json` — `stats.*` key block.
- **Tests**: ~25 new unit tests across `@hdt/core/stats` (matrix, time series, play split, format filtering) plus ~12 renderer component tests. Existing Stats.tsx test stays green.
- **No DB schema change**: all new aggregations read from existing columns (`result`, `play_order`, `format_type`, `opponent_class`, `started_at`, `ended_at`).
- **No deck schema change**: deck-attribution-based matchup grouping defers to the follow-up below.
- **i18n**: ~20 new keys under `stats.*` (matchup, time series, play order, format, recording dialog).

## Non-goals

- **Saved-deck attribution in stats aggregations** — the `savedDeckId`/`savedDeckVersion` columns just landed via `add-deck-management`; the stats DB doesn't yet store them. Deferred to a follow-up `add-stats-saved-deck-attribution` change that touches `match-history-store` schema. This change uses live `deckId` only (existing behavior).
- **Per-deck winrate trend** — chart is overall-only in this change. Splitting by deck multiplies series count and demands a deck-picker UI; deferred.
- **Match search / free-text query** — no search box on the recent-matches list.
- **Exporting stats to CSV / image** — no export functionality.
- **Class winrate pie chart** — the existing stacked bar already covers this; pie chart is duplicate visualization. (Phase 4 mentioned it but in practice the bar chart is more legible at our row-count.)
- **Heatmap of play time** — out of scope.
- **Mulligan win-rate analysis** — needs join over recordings; deferred to a future change that builds on the recording timeline.
- **Editing/deleting recorded matches** — read-only stats surface stays read-only.
- **Cross-device sync of stats** — local-only.
