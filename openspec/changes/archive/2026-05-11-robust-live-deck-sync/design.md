## Context

The current deck persistence path has two separate concepts:

- `DeckStore` is the local source of truth for renderer deck lists and match attribution.
- `DeckSyncService` can read `hearthmirror.getDecks()` and save live Collection decks into the store, but it is only called once during main-process startup after the card database loads.

This makes the system fragile. If Hearthstone is launched after HDT.js, or the player edits decks in Hearthstone's Collection screen, the renderer keeps showing stale local data. The affected surfaces are broader than the My Decks page: Collection should refresh the player's decks after deck editing, and the pre-match DeckSelectDialog must use the newest saved deck identities so match statistics attach to the right deck version.

No new external dependency is required. The implementation stays on Electron IPC, Zustand, better-sqlite3, and the existing HearthMirror facade.

Expected file structure after implementation:

```text
apps/desktop/src/main/
  deck-sync-service.ts
  deck-sync-host.ts
  deck-ipc.ts
  deck-store.ts
  ipc.ts
apps/desktop/src/preload/
  index.ts
apps/desktop/src/renderer/src/
  components/
    Collection.tsx
    DeckSelectDialog.tsx
    Decklist.tsx
    DecksPage.tsx
  hooks/
    use-decks.ts
  stores/
    decks-store.ts
  i18n/
    messages.ts
```

## Goals / Non-Goals

**Goals:**

- Provide one main-process synchronization path shared by startup, My Decks, Collection, and DeckSelectDialog.
- Make sync idempotent and safe to call repeatedly.
- Preserve cached/local decks when HearthMirror is unavailable, partially unavailable, or returns `null`.
- Surface sync status through IPC so renderer screens can show cached data without implying live freshness.
- Rename user-facing "Saved Decks" labels to "My Decks" where the persisted deck list is meant.

**Non-Goals:**

- No periodic background polling loop in this change.
- No deletion/pruning of local decks based on live Hearthstone absence.
- No cloud/account merge model.
- No changes to collection progress math or match history aggregation.

## Decisions

### Decision 1: Centralize sync in a main-process DeckSyncHost

**Context:** Multiple renderer surfaces need the same live sync before reading decks.

**Options:**

- Each renderer component calls `hearthmirror.getDecks()` and then `decks.saveFromLive()`.
- Add one `decks:sync-from-live` IPC handler backed by a shared main-process sync host.

**Choice:** Add a shared main-process sync host and expose it through `window.hdt.decks.syncFromLive()`.

**Rationale:** Renderer code should not know how to map live decks to hero classes, filter non-collectible cards, or update SQLite. A central host keeps the mapping and error handling consistent and lets startup, route entry, and dialog entry share the same logic.

### Decision 2: Use request-time sync instead of a background polling loop

**Context:** The user specifically needs fresh data when entering Collection and before selecting a deck for a match.

**Options:**

- Poll HearthMirror every N seconds while the app is open.
- Sync on application startup only.
- Sync on demand before deck-dependent surfaces read local decks.

**Choice:** Sync on demand for My Decks, Collection, and DeckSelectDialog, while keeping startup sync as a best-effort warmup.

**Rationale:** On-demand sync is cheaper, easier to reason about, and matches the moments where stale data harms the user. A background loop can be added later if we need near-real-time deck mutation detection outside these surfaces.

### Decision 3: Treat HearthMirror unavailable as a non-destructive status

**Context:** `getDecks()` returns `null` when Hearthstone is closed or the CollectionManager is not initialized.

**Options:**

- Clear live-synced rows when live decks cannot be read.
- Throw to the renderer and show an error page.
- Return `{ ok: false, reason }` while preserving the local deck store.

**Choice:** Preserve all local decks and return a structured status.

**Rationale:** `null` means "cannot read now", not "the user has zero decks". Clearing or failing the UI would destroy the offline persistence value added by the previous change.

### Decision 4: Single-flight concurrent sync

**Context:** Collection and DeckSelectDialog may mount close together, and multiple components can call `useDecks()`.

**Options:**

- Let every caller run an independent HearthMirror read/write cycle.
- Debounce in the renderer.
- Coalesce concurrent main-process sync requests into one in-flight promise.

**Choice:** The main-process sync host uses single-flight behavior and returns the same result to concurrent callers.

**Rationale:** Main-process coalescing protects SQLite and HearthMirror regardless of how many renderer windows or components exist.

### Decision 5: Live deck identity upserts by `liveDeckId`

**Context:** Hearthstone live deck IDs are stable identities for Collection decks, while manual/imported decks do not always have a live ID.

**Options:**

- Always create a new local deck on every sync.
- Match by name/class/cards.
- Upsert rows with `source = hearthstone-live` and `liveDeckId`.

**Choice:** Upsert live-synced rows by `liveDeckId`; manual/imported decks remain independent.

**Rationale:** The live ID is the least ambiguous identity. Name/card matching can conflate copies or renamed decks, and creating new rows breaks match attribution history.

## Risks / Trade-offs

- **HearthMirror returns stale or partial data** -> The sync result reports skipped/error counts and never clears decks on partial reads.
- **Card database is not ready** -> The sync IPC returns a not-ready status until the main process has installed the real card lookup.
- **Deck edits race with match start** -> DeckSelectDialog waits for sync completion or timeout before rendering saved choices, then still permits cached choices if sync fails.
- **Repeated sync bumps versions too often** -> `DeckStore.saveFromLive` must only bump deck version when the canonical card list changes.
- **Account switching remains ambiguous** -> This change does not introduce account-scoped deck stores; that needs a separate account model.

## Migration Plan

1. Add the sync result types and single-flight host around the existing `DeckSyncService`.
2. Extend `DeckStore.saveFromLive` tests to assert live-ID upsert, version bump only on card-list changes, and no local deletion on failed sync.
3. Expose `syncFromLive()` through deck IPC and preload.
4. Update renderer stores/hooks to support "sync then list" without blocking forever.
5. Rename visible "Saved Decks" labels to "My Decks" in both locales.
6. Add route/dialog trigger points and tests.

Rollback is low-risk: removing renderer calls to `syncFromLive()` leaves the existing local deck list behavior intact.

## Open Questions

- Should a later change scope live-synced decks by cached player account ID to avoid mixing decks across accounts on the same Windows user profile?
- Should a later change add periodic background sync while Hearthstone is focused, or is route/dialog-triggered sync sufficient?
