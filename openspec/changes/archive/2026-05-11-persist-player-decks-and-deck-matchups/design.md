## Context

The app already persists user-created decks in `decks.db` and real constructed match history in `stats.sqlite`. The renderer header polls HearthMirror for BattleTag data, Stats reads aggregate data through `window.hdt.stats`, and Collection computes set progress from the live HearthMirror collection.

The current gaps are all local-state boundaries:

- Header identity disappears when Hearthstone is not running and includes fake interactive affordances.
- Match history does not persist `savedDeckId` / `savedDeckVersion`, so Stats cannot ask "how did this saved deck perform against each class?"
- Power.log completion records have result data, while deck-tracker snapshots have richer class/deck context; the durable row needs the best available union of both.
- Collection has no snapshot cache, so offline progress falls back to zero counts.
- Hearthstone deck lists are live-only unless the user manually saved/imported decks.

No new external dependency is required. This design uses existing Electron IPC, `better-sqlite3`, `@hdt/core` pure aggregators, and the existing HearthMirror/HearthWatcher surfaces.

Target file layout:

```text
apps/desktop/src/main/
  collection-progress.ts
  collection-snapshot-store.ts
  deck-store.ts
  deck-sync-service.ts
  match-history-store.ts
  player-profile-store.ts
  power-match-recorder.ts
  stats-host.ts
apps/desktop/src/preload/
  index.ts
apps/desktop/src/renderer/src/
  App.tsx
  components/
    Collection.tsx
    Stats.tsx
  hooks/
    use-hearthmirror-status.ts
packages/core/src/stats/
  saved-deck-matchups.ts
  stats-aggregation.ts
```

## Goals / Non-Goals

**Goals:**

- Persist the last known local player identity and use it as a display fallback.
- Remove misleading header controls that have hover/click UI but no behavior.
- Persist saved-deck attribution and class context on match-history rows.
- Provide saved-deck matchup stats by opponent class.
- Cache HearthMirror deck and collection snapshots for offline display.
- Keep all filesystem and SQLite access in the main process.

**Non-Goals:**

- No cloud sync, remote account model, or multi-machine merge.
- No native HearthMirror offset/reflection changes.
- No notification center or player dropdown feature.
- No automatic destructive overwrite of user-edited saved decks.
- No broad visual redesign beyond the affected controls and empty/cache states.

## Decisions

### Decision 1: Persist small app-owned state in main-process SQLite stores

**Context:** Player identity and collection snapshots are app-owned local state, not renderer preferences. They need to survive renderer reloads and be available before any renderer window opens.

**Options:**

- `localStorage` in renderer.
- JSON files under `userData`.
- `better-sqlite3` stores in main process.

**Choice:** Use main-process `better-sqlite3` stores or additive tables in a main-owned local-state database.

**Rationale:** The app already uses SQLite for durable decks and stats. Main-owned stores avoid renderer filesystem access, keep preload APIs plain-object-only, and support additive migrations with tests. JSON files would be simpler but introduce parallel persistence patterns and weaker migration checks.

### Decision 2: Use stale cache only when live HearthMirror data is unavailable

**Context:** Live HearthMirror data is authoritative when available, but offline views should not collapse to empty data if the app has a valid previous snapshot.

**Options:**

- Always show cached data until the user manually refreshes.
- Prefer live data and refresh cache on success; fall back to cache only on null/error.
- Merge live and cached data record-by-record.

**Choice:** Prefer live data, update cache on success, and fall back to the latest complete cache snapshot only when live reads fail.

**Rationale:** This preserves current real-time semantics while making offline views useful. Record-level merging would be difficult to reason about and could display partially stale collection/deck state as if it were live.

### Decision 3: Keep deck sync non-destructive

**Context:** Existing saved decks are editable. HearthMirror decks can change in-game and may have names/cards matching user-edited local decks.

**Options:**

- Overwrite matching saved decks by name/class.
- Create duplicate saved decks on every live read.
- Upsert only app-managed live-synced decks keyed by Hearthstone deck id/signature, leaving manual decks untouched.

**Choice:** Add app-managed live-synced deck metadata and upsert only those records; manual decks are never overwritten.

**Rationale:** The user asked for decks to be remembered offline, not for manual deck management to be replaced. A non-destructive sync keeps local edits safe and still makes Decks usable when the game is closed.

### Decision 4: Aggregate deck matchups from persisted match history

**Context:** Stats must work when the game is not running and must not depend on live tracker state.

**Options:**

- Compute deck matchup stats from the latest in-memory deck-tracker snapshot.
- Compute from recordings.
- Compute from persisted match-history rows with saved-deck attribution.

**Choice:** Persist `savedDeckId` / `savedDeckVersion` on match-history rows and aggregate from those rows.

**Rationale:** Match history is already the source of truth for Stats. Recordings may be absent, and live snapshots only represent the current match. Persisted attribution gives stable offline stats and keeps aggregation pure in `@hdt/core`.

### Decision 5: Reconcile duplicate match completion sources at write time

**Context:** DeckTracker emits an `unknown` result summary on match end; Power.log completion can later provide win/loss. Both paths currently call `recordCompletedMatch`.

**Options:**

- Keep `INSERT OR IGNORE`, accepting incomplete first-write-wins rows.
- Replace rows blindly on every duplicate fingerprint.
- Add an idempotent upsert that enriches existing rows when the duplicate contains more complete values.

**Choice:** Use an enrichment upsert keyed by fingerprint: keep one row, prefer known result over unknown, non-null classes/deck attribution over null, and preserve existing values when the incoming record is less complete.

**Rationale:** This avoids duplicate rows and prevents the earliest incomplete event from permanently blocking better later data.

### Decision 6: Keep the header player area display-only

**Context:** The current bell and dropdown affordances are visually interactive but have no implementation behind them.

**Options:**

- Build notification and profile menus now.
- Keep buttons but disable them.
- Remove the fake bell/dropdown and render identity as a non-clickable display control.

**Choice:** Remove the bell and dropdown chevron; render player identity in a hover-highlighted non-button container.

**Rationale:** This matches current functionality and avoids teaching users that unavailable features exist.

## Risks / Trade-offs

- [Risk] Historical rows lack saved-deck attribution and opponent class, so new deck matchup charts may be sparse at first. -> Mitigation: show explicit empty states and compute only from rows with known `savedDeckId` and known-result matches.
- [Risk] Power.log and deck-tracker completion events can arrive in different orders. -> Mitigation: use a deterministic enrichment upsert instead of first-write-wins.
- [Risk] Automatic deck sync could duplicate user decks if matching is too loose. -> Mitigation: only mutate app-managed live-synced records and keep manual records untouched.
- [Risk] Cached collection data may be stale. -> Mitigation: return `source` and `lastUpdatedAt` through IPC and show stale-cache copy in the renderer.
- [Risk] SQLite migrations can fail on locked native modules in dev environments. -> Mitigation: migrations are additive, idempotent, and covered by store-level tests; no destructive migration is required.
- [Compatibility] The preload APIs are additive except for the collection progress response gaining optional metadata. Existing callers that only read `standard`, `wild`, and `mirrorAlive` continue to work.
- [Performance] Collection snapshots can be large. -> Mitigation: persist compact `dbfId/count` rows and update only after successful live reads; Stats aggregations operate on existing match-history rows.
- [Security] BattleTag/accountId are local personal data. -> Mitigation: store only under Electron `userData`, expose only through preload plain objects, and do not transmit it over network.

## Migration Plan

1. Add idempotent schema migrations for match-history saved-deck fields and any deck live-sync metadata.
2. Add player-profile and collection-snapshot stores; first open creates empty stores.
3. Update live data paths to populate caches after successful HearthMirror reads.
4. Update match recording to write/enrich complete rows without duplicating existing rows.
5. Expose additive preload APIs and update renderer consumers.
6. Validate with focused store/core/renderer tests plus typecheck.

Rollback is straightforward for code behavior because migrations are additive and nullable. Older code will ignore the new columns/tables. If a cache is corrupt, the stores should fail closed to live-only behavior rather than blocking app startup.

## Open Questions

- Should live-synced decks be visually marked in the Decks page as "synced from Hearthstone", or remain visually identical to manually created decks for v1?
- Should the Stats page default deck selector pick the best deck, most recent deck, or first deck alphabetically when multiple saved decks have records?
- Should cached BattleTag show when Hearthstone is running but `getBattleTag()` returns null, or only when Hearthstone is not running?
