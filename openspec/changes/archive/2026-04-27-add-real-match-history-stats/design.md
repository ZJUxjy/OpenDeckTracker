## Context

The renderer Stats page currently owns `mockMatchHistory` and `classWinrates` arrays and renders fixed summary values. The live tracker stack can already observe match lifecycle events and current snapshots, but no module persists completed matches or exposes aggregate statistics to the renderer. The existing deck tracker design explicitly deferred match history persistence to a stats engine, so this change fills that deferred slice without changing the deck tracker UI itself.

The implementation spans `@hdt/core` domain logic, Electron main-process persistence/IPC, preload typing, and the renderer Stats page. The data source remains local and app-owned: completed matches are recorded from `DeckTracker` events, stored under Electron `app.getPath('userData')`, and queried by Stats filters.

Target structure after implementation:

```text
packages/core/src/stats/
  match-history.ts
  match-history.test.ts
  stats-aggregation.ts
  stats-aggregation.test.ts

apps/desktop/src/main/
  match-history-store.ts
  match-history-store.test.ts
  stats-host.ts
  stats-host.test.ts

apps/desktop/src/renderer/src/stores/
  stats-store.ts

apps/desktop/src/renderer/src/components/
  Stats.tsx
```

## Goals / Non-Goals

**Goals:**

- Persist one durable record per completed constructed match.
- Derive recent matches and summary stats from persisted records only.
- Remove fabricated Stats data and render honest empty states when no records exist.
- Keep aggregation logic deterministic and testable in `@hdt/core`.
- Keep Electron-specific storage and IPC in `apps/desktop`.

**Non-Goals:**

- Cloud sync, multi-profile merge, or account authentication.
- Manual match editing, imports/exports, replay/timeline views, or per-turn analytics.
- Non-constructed stats unless the existing match metadata can classify the game as constructed.
- Opponent archetype inference.
- Replacing the current deck tracker lifecycle architecture.

## Decisions

### D1: Store match history in app-local SQLite

**Context:** Match history must survive restarts and support filtered queries, recent-match lists, and future stats expansions. The project context already names `better-sqlite3` as the intended local storage layer, but the desktop package does not currently depend on it.

**Options:**

- JSON file under `userData`: simple, but fragile for concurrent writes, filtering, and future schema migration.
- IndexedDB in renderer: browser-local and easy for UI, but splits durable app data into the renderer and complicates main-process recording.
- SQLite via `better-sqlite3`: durable, queryable, main-process-owned, and aligned with the existing project direction.

**Choice:** Use SQLite in the Electron main process through `better-sqlite3`.

**Rationale:** Main process owns the tracker and can record matches without renderer availability. SQLite gives simple deduplication and aggregation queries. `pnpm view better-sqlite3 version` currently reports `12.9.0`; implementation should add the latest package with the package manager rather than pinning a guessed version in the spec.

### D2: Keep pure stats types and aggregation in `@hdt/core`

**Context:** The stats rules should be testable without Electron or native modules.

**Options:**

- Put all stats logic in `apps/desktop`: fastest wiring, but hard to test and reuse.
- Create a new `@hdt/stats` package: clean boundary, but too much package overhead for the first slice.
- Add `packages/core/src/stats`: follows the current domain-layer package and keeps logic pure.

**Choice:** Add stats domain types and aggregation functions under `packages/core/src/stats`.

**Rationale:** `@hdt/core` already owns tracker domain types and has Node/Vitest tests. Persistence adapters can consume these types from desktop without dragging Electron into core.

### D3: Record only on completed match summaries from `DeckTracker`

**Context:** Stats must represent real games, not every watcher line or intermediate state. The main process already receives `match-ended` events from `DeckTracker`.

**Options:**

- Infer completed matches from raw `Power.log` events: highest fidelity eventually, but duplicates tracker lifecycle work and needs result parsing now.
- Poll renderer state and record when Stats opens: misses games when the renderer is closed and couples recording to UI.
- Extend `DeckTracker`'s `match-ended` event with a `CompletedMatchSummary`: direct lifecycle boundary and one write point.

**Choice:** Extend `DeckTrackerEvent` so `match-ended` can include a completed-match payload with stable identifiers and result metadata.

**Rationale:** The tracker already owns phase transitions, selected deck information, match metadata, and start/end timestamps. A dedicated summary avoids having the stats recorder reverse-engineer final state from arbitrary snapshots.

### D4: Deduplicate by match fingerprint, not auto-increment id

**Context:** Tracker restarts, duplicate `match-ended` events, or app lifecycle races must not double-count a real match.

**Options:**

- Always insert and tolerate duplicates: easiest, but corrupts winrate and history.
- Use only `startedAt`: vulnerable to clock precision and restart edge cases.
- Compute a stable fingerprint from player/account, start/end time window, game metadata, deck id, opponent, and result.

**Choice:** Store a unique `fingerprint` column and make inserts idempotent.

**Rationale:** A fingerprint lets the recorder call `recordCompletedMatch` safely more than once. The exact fields can evolve, but the repository contract remains idempotent.

### D5: Query Stats through IPC and expose empty states

**Context:** Renderer Stats needs recent matches and aggregate summaries, but must not access the filesystem or SQLite directly.

**Options:**

- Push every new record over events only: good for live updates, insufficient for initial load and filters.
- IPC query only: simple and deterministic; Stats can refetch on filter changes.
- Combine query plus optional update event: useful later, but not required for initial delivery.

**Choice:** Add IPC handlers for summary and recent-match queries, exposed as `window.hdt.stats`.

**Rationale:** This mirrors existing preload patterns. The Stats page loads data on mount/filter change and renders empty states when query results are empty. The current mock arrays and fixed numbers are removed rather than hidden behind fallbacks.

## Risks / Trade-offs

- **[Result detection incomplete]** → Mitigation: require `CompletedMatchSummary.result` to be explicit (`win` / `loss` / `unknown`) and do not count `unknown` in winrate. Add tests for unknown-result handling.
- **[Non-constructed games pollute stats]** → Mitigation: filter by known constructed `gameType` / `formatType`; unclassified modes are not recorded by default.
- **[Native SQLite packaging risk]** → Mitigation: add `better-sqlite3` through pnpm, verify `pnpm --filter @hdt/desktop build/test`, and keep all SQLite usage in main process.
- **[Duplicate match-ended events]** → Mitigation: unique fingerprint and idempotent insert path.
- **[Renderer displays stale data after a match ends]** → Mitigation: Stats queries fresh data on mount/filter changes; a lightweight `stats:changed` event can be added if live refresh is needed during the same session.
- **[Privacy/local data sensitivity]** → Mitigation: store only local match metadata needed for Stats; no cloud upload; keep database under Electron `userData`.

## Migration Plan

1. Add `better-sqlite3` to `@hdt/desktop` and create a main-process match-history store under `app.getPath('userData')`.
2. Add a schema initializer with a `match_history` table and unique `fingerprint` index.
3. Add pure `@hdt/core` stats types and aggregation helpers.
4. Extend `DeckTracker` match-ended payloads with completed-match summaries.
5. Wire the desktop tracker host to record summaries and expose IPC query handlers.
6. Replace renderer mock data with `window.hdt.stats` queries and empty states.
7. Run package tests, typecheck, and desktop focused renderer tests.

Rollback: remove the stats host registration and renderer `window.hdt.stats` usage; the SQLite file can remain unused under `userData` without affecting tracker behavior.

## Open Questions

- Which exact Hearthstone `gameType` / `formatType` values should count as constructed for the first implementation?
- Can current tracker data reliably determine play/draw for every game, or should this field initially allow `unknown`?
- Can current tracker data reliably determine win/loss, or is a small HearthWatcher result parser needed before recording known results?
