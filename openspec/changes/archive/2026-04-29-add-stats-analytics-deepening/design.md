## Context

`match-history-stats` (commit `a50e93e`) and `match-recordings` (archived 2026-04-28) put a complete data foundation in place:

- `apps/desktop/src/main/match-history-store.ts` — SQLite `match_history` table keyed on `fingerprint`, columns `started_at`, `ended_at`, `result`, `play_order`, `deck_id`, `deck_name`, `opponent_class`, `game_type`, `format_type`, `source`. WAL mode, idempotent inserts. Already populates `play_order` and `format_type` for every recorded constructed match.
- `apps/desktop/src/main/stats-host.ts` — exposes `getSummary` and `listRecent` IPC handlers, each taking a `StatsTimeFilter`. Reads via `MatchHistoryStore.getAllForFilter()`, runs `@hdt/core/stats` aggregation, returns `StatsSummary`.
- `@hdt/core/stats/stats-aggregation.ts` — pure aggregation: `aggregateStats(matches, options)` returns the current `StatsSummary` shape (overall, time played, best deck, recent matches, class winrates).
- `apps/desktop/src/main/match-recording-store.ts` — filesystem-backed store at `<userData>/recordings/<id>/`. Each recording has `recording.json` (summary + initial state + timeline) and `events.jsonl` (raw Power events). `recordings:list` and `recordings:get` IPC handlers exist.
- `apps/desktop/src/renderer/src/components/Stats.tsx` — renders the entry-level slice. No deep filters, no matchup matrix, no link from recent matches into recordings.

The existing data model has every field this change needs: `play_order` for play/coin split, `format_type` for format filter, `opponent_class` for matchup matrix. We do not need a schema migration. The change is **pure aggregation + UI**.

Stakeholders:
- Players who want serious analysis ("am I bad on the coin?", "do I drop matches against Mage specifically?", "is my winrate trending up this week?").
- The recording feature, currently invisible — without a UI entrypoint, the recording-store work is dead weight.
- Future deck-attribution stats (`savedDeckId`-aware) — laid the groundwork but landing as a follow-up so this change stays focused.

## Goals / Non-Goals

**Goals:**

- Surface every analysis dimension already captured in `match_history.db` (matchup, format, play order, time series).
- Make recordings discoverable through the Stats page.
- Keep aggregation logic in `@hdt/core/stats` (pure functions, easy to unit-test, no IPC / DB / React).
- Backwards-compatible IPC: existing `getSummary(filter)` calls still work; new `options` is opt-in.
- Render-zero-cost when a stat is opted out: if the renderer doesn't request `includeMatchup`, main process skips computing the matrix.
- New components match the existing `Stats.tsx` visual language (orange accent, `#1C1C24` cards, Recharts grids).

**Non-Goals:**

- DB schema changes (no new columns, no migrations).
- Deck-attribution-based stats — deferred to a follow-up.
- Per-class time series — only overall in this change.
- Recording editing / deletion — stats is read-only.
- Replay scrubber UI — viewer renders a static event list.
- New IPC channels — reuse `recordings:get` for the viewer.

## Decisions

### D1. Where the new aggregations live

**Context:** Three plausible locations.

**Options:**

- **A.** Add functions to existing `packages/core/src/stats/stats-aggregation.ts` — single big file.
- **B.** New per-aggregation files: `matchup-matrix.ts`, `winrate-time-series.ts`, `play-order-split.ts`.
- **C.** Module split: `packages/core/src/stats/aggregations/{matchup,timeSeries,playOrder}.ts`.

**Choice:** **B**. One file per pure function family.

**Rationale:** stats-aggregation.ts is already getting large and mixes concerns (filtering, summary, class winrate, recent matches). Splitting per-aggregation gives:
- One test file per concern (no test cross-contamination).
- Clean barrel re-exports from `@hdt/core/stats/index.ts`.
- Future per-aggregation refactors don't churn the omnibus file.
C is over-nesting for three modules; reconsider if we add many more.

### D2. Player-class resolution for the matchup matrix

**Context:** The matchup matrix groups by `(playerClass, opponentClass)`. `opponentClass` is on every record (`opponent_class` column). `playerClass` is **not** stored directly. Today the only way to know the player's class is to look at the recorded `deckName` (free-form) or join with deck-management's saved deck.

**Options:**

- **A.** Don't compute matchup matrix until DB schema gains a `player_class` column (deferred to schema migration).
- **B.** Best-effort guess: parse the heroId from `deckName` heuristics, fall back to `'Unknown'` row.
- **C.** Add a `player_class` column now and backfill from existing records' deck association (where possible).
- **D.** Add a `player_class` column to `match_history` schema as part of this change. Backfill = NULL → `Unknown` row in the matrix; new records carry it.

**Choice:** **D**.

**Rationale:** The dimension is high-value enough to justify a small additive schema change. Adding a nullable column is non-destructive (existing rows get NULL → bucketed under "Unknown" in the matrix). The recorder already has the player class on hand at match-end time (live snapshot's `deck.class` or saved-deck attribution); piping it into the row is one line in `MatchHistoryStore.record()`. This contradicts the proposal's "no DB schema change" wording, but the cost is small and unblocks the most-requested aggregation. **Updating the proposal to reflect this — see proposal addendum below.**

> **Proposal addendum (D2 outcome):** add a single nullable `player_class TEXT` column to `match_history` and populate it on insert. Existing rows: NULL, surface as "Unknown" in the matrix.

### D3. IPC surface: extend or add new channels

**Context:** New aggregations need to flow to the renderer.

**Options:**

- **A.** New channels per aggregation: `stats:get-matchup-matrix`, `stats:get-time-series`, `stats:get-play-order-split`.
- **B.** Extend `getSummary` with optional flags: `getSummary(filter, { includeMatchup: true, includeTimeSeries: true, ... })`.
- **C.** A single `getSummary` that always returns everything.

**Choice:** **B**.

**Rationale:**

- A multiplies channels for orthogonal data the renderer typically wants together (one Stats page render fetches everything). Round-trip count grows.
- C makes every Stats page load pay full aggregation cost even for renderers that don't render the heavy bits.
- B is the middle ground: a single round trip carries everything the renderer asks for, with main process skipping computation it doesn't need. Renderer also stays simple — one `useEffect` populates the whole summary.

The `options` object also carries `formatFilter` so the same pipeline applies the format filter once across all aggregations consistently.

### D4. Time-series granularity

**Context:** `WinrateTimeSeriesPoint` needs a sensible bucket size.

**Options:**

- **A.** Daily only.
- **B.** Daily + weekly (toggle in UI).
- **C.** Configurable bucket millis.

**Choice:** **B**.

**Rationale:** Daily is the natural unit (matches a day's session). Weekly lets the player see seasonal trends without daily noise. C is overkill — no real consumer wants 6-hour buckets.

### D5. Matchup matrix bucketing for unknown classes

**Context:** Some `opponent_class` values may be `null` or unrecognized strings.

**Choice:** Bucket `null` → `'Unknown'` row/column. Render the row visually but with reduced opacity. Same for player-class side under D2.

### D6. Format filter when there's only one format

**Context:** A player who only plays Standard would see the format filter as five buttons with four always-empty results.

**Choice:** Always show all five buttons. Empty buckets render as zero-state. Reasoning: predictability beats local cleverness; users new to Wild benefit from a discoverable button.

### D7. Recording viewer scope

**Context:** `match-recordings` provides a full timeline; rendering it well is its own UX problem.

**Options:**

- **A.** Full scrubber (timeline slider + entity diff per tick).
- **B.** Static list of timeline events with cardId labels and timestamps.
- **C.** Just the metadata (deck list, mulligan).

**Choice:** **B**.

**Rationale:** A is a multi-day UX project. C wastes the timeline data. B is the bare minimum that makes the recording feature feel alive — and it's a lot more useful than nothing. Future changes can build A on top.

### D8. Color scale for matchup cells

**Context:** Visual encoding of winrate.

**Choice:** Diverging green-to-red around 50% with the existing palette (`#10B981` win, `#EF4444` loss). Cells with fewer than 5 matches dim by 50% to communicate low confidence; tooltip shows exact count.

### D9. Test strategy

- Pure functions: unit tests directly in `@hdt/core/stats`. Each aggregation module gets its own `*.test.ts` with golden-fixture matches.
- IPC layer: existing `stats-host.test.ts` extended with one test per new option flag.
- Renderer components: React Testing Library renders with stubbed `window.hdt.stats.getSummary` returning fixture data. Assertions on aria/text/data-testid.
- Recording viewer: stub `window.hdt.recordings.get` and assert key text from the fixture timeline shows up.

## Risks / Trade-offs

- **[Risk] Schema column added under D2 conflicts with future migrations.** → Migration is one `ALTER TABLE ADD COLUMN` (nullable), idempotent via `if-not-exists` check at boot. Future schema_version bumps land cleanly on top.
- **[Risk] Time-series with sparse data is misleading** (one match in a bucket → 100% or 0%). → Add a `matches` count to each point; UI dims sub-3-match points.
- **[Risk] Matchup matrix performance with large history** (10k matches × 12² cells = 1.4M cell-update operations). → Pure-JS aggregation in main process. Cap at the time filter window. Single pass over the array. ≤50ms even for 10k matches.
- **[Risk] Format filter excludes data the user expected to see** (e.g. Twist matches when they meant "everything"). → `'all'` is the default. Filter pills clearly indicate the active one.
- **[Trade-off] D7's static event list** isn't a "real" replay viewer. UX team may want more. Documented as follow-up.
- **[Trade-off] The proposal's "no schema change" wording is overridden by D2.** Single nullable column is the smallest possible addition; documented above and re-flowed in the spec delta.

## Migration Plan

1. Land the change behind no feature flag — pure additive UI + one nullable column.
2. On first boot post-deploy, `MatchHistoryStore` runs `ALTER TABLE match_history ADD COLUMN player_class TEXT` if the column does not exist. Existing rows: NULL.
3. New record inserts populate `player_class` from `tracker` snapshot's `deck.class` (when available, else NULL).
4. Stats UI renders existing rows under "Unknown" in the matchup matrix until they're replaced by new records.
5. Rollback: revert the change. The new column stays in the schema (non-destructive). No data lost.

## Open Questions

- **Should the matchup matrix collapse rows / columns when fewer than N matches exist?** Defer to UX iteration once we see real data on real users.
- **Should the time-series chart support comparison overlays (e.g. last week vs this week)?** Out of scope; future change.
- **Format filter as a global setting vs per-page?** Treat as per-page state for now; persisting to settings is a small follow-up.

## Final touched-files tree

```
packages/core/src/stats/
├── matchup-matrix.ts                # NEW
├── matchup-matrix.test.ts           # NEW
├── winrate-time-series.ts           # NEW
├── winrate-time-series.test.ts      # NEW
├── play-order-split.ts              # NEW
├── play-order-split.test.ts         # NEW
├── stats-aggregation.ts             # MOD: extend StatsSummary, options struct
└── (test extensions)

apps/desktop/src/main/
├── match-history-store.ts           # MOD: add player_class column + populate on insert
├── match-history-store.test.ts      # MOD: cover new column behavior
├── stats-host.ts                    # MOD: options parameter
└── stats-host.test.ts               # MOD: cover new options

apps/desktop/src/preload/
└── index.ts                         # MOD: getSummary/listRecent options

apps/desktop/src/renderer/src/
├── components/
│   ├── Stats.tsx                    # MOD: layout, new sections
│   ├── MatchupMatrix.tsx            # NEW
│   ├── WinrateTimeSeriesChart.tsx   # NEW
│   ├── PlayOrderSplitCard.tsx       # NEW
│   ├── FormatFilterPills.tsx        # NEW
│   └── MatchRecordingViewer.tsx     # NEW
└── env.d.ts                         # MOD: stats.* signatures

resources/locales/
├── en-US.json                       # MOD: stats.* keys
└── zh-CN.json                       # MOD: stats.* keys
```
