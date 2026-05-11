## Context

The previous change `robust-live-deck-sync` established `DeckSyncHost`
as the single-flight, request-time live deck sync entry point. The host
already handles concurrency and unavailable-Hearthstone gracefully, but
every sync trigger today is renderer-initiated (route mount).
Investigation of upstream HDT surfaced three additional sync patterns
worth adopting:

- Sync on queue entry, not just on mount of deck-dependent surfaces.
- Reattach live decks by card-list content, not only by id.
- Dedupe collection snapshots by content hash so the user-visible
  timestamp tracks actual change moments.

These are independently small but share a theme: aligning our
request-time sync model with upstream's event-driven, content-aware
sync without introducing background polling or schema upheaval.

Expected file structure after implementation:

```text
apps/desktop/src/main/
  deck-sync-host.ts        # unchanged contract
  match-start-sync-trigger.ts   # NEW
  match-start-sync-trigger.test.ts
  ipc.ts                   # wires phase subscription
  deck-store.ts            # saveFromLive reattach branch
  deck-store.test.ts
  collection-snapshot-store.ts  # hash dedup
  collection-snapshot-store.test.ts
  collection-progress.ts   # unchanged (consumes new snapshot result)
  collection-progress.test.ts
```

## Goals / Non-Goals

**Goals:**

- Trigger live deck sync on the `IDLE → PRE_MATCH` phase transition.
- Merge content-equivalent live decks under one local row even when the
  Hearthstone live id changes.
- Keep the user-visible "last updated" timestamp meaningful when nothing
  has changed.
- Reuse existing primitives (`canonicalCardListHash`, `deckSyncHost`,
  `CollectionSnapshotStore`) without new dependencies.

**Non-Goals:**

- No background polling.
- No merge UI; reattach is silent and only acts on unambiguous single
  matches against existing live-synced rows.
- No bulk reattach pass at startup — reattach happens during normal
  `saveFromLive` calls.

## Decisions

### Decision 1: Where to subscribe to the phase event

**Options:**

- In `deck-tracker.ts` itself, calling the host directly.
- In `ipc.ts`, after host construction.

**Choice:** `ipc.ts`. `deck-tracker.ts` already exposes
`onDeckTrackerPhase()`. Layering sync inside the tracker would couple
gameplay state to renderer-data plumbing. Wiring at `ipc.ts` keeps the
subscription next to `deckSyncHost.setService(deckSync)` where the host
itself is wired.

### Decision 2: Trigger debounce

**Choice:** Subscriber-level minimum interval (default 5000 ms) between
queued syncs.

**Rationale:** Phase oscillations during match setup can fire
`PRE_MATCH` twice in close succession. The host's single-flight handles
**overlap** but does not throttle **distinct sequential** calls. A 5 s
interval matches HDT's `_lastAutoImport` and stays well under
user-perceptible refresh latency. Encapsulated in
`match-start-sync-trigger.ts` so the logic is independently testable
with a clock injection.

### Decision 3: Fingerprint reattach scope

**Options:**

- Reattach across any deck (live or app-managed) when content matches.
- Reattach only when an existing **live-synced** row matches.

**Choice:** Only existing live-synced rows (`source ===
'hearthstone-live'`).

**Rationale:** Promoting an app-managed deck to live-synced is a
visible mutation users might not expect (it gates that row's update
path going forward). Restricting to already-live rows targets the
actual upstream-driven scenario: Hearthstone assigned a new deck id for
the same content (rename, clone, delete + re-import).

### Decision 4: Reattach disambiguation

**Choice:** Only act when **exactly one** live-synced row matches the
`(class, format, canonical card-list hash)` tuple. Multiple matches →
fall through to insert; zero matches → fall through to insert (today's
behavior).

**Rationale:** Avoids the upstream "ask the user" branch without
introducing UI; the insert-then-let-future-dedup-handle-it model
degrades to today's behavior in the ambiguous case.

### Decision 5: Hash storage for collection snapshot

**Options:**

- Compute hash inline at save time, store under a new `collection_meta`
  key.
- Add a `collection_hash` column to `collection_cards`.

**Choice:** New `collection_meta` key `cardsHash`. Keeps the schema
migration additive and one-line; meta values are already strings.

### Decision 6: lastUpdatedAt semantics when hash unchanged

**Choice:** `CollectionSnapshotStore.save()` returns the **existing**
snapshot (cards + original `lastUpdatedAt`) when the incoming hash
equals the stored hash. The store does not call `upsertMeta(...)` in
that case.

**Rationale:** This makes "last updated" mean "last time card counts
actually changed", which is what users want to see in the offline
banner. `collection-progress.ts` already reads
`saved.lastUpdatedAt` from `save()`'s return value, so no caller change
is required.

### Decision 7: Canonical hash algorithm for collection

**Choice:** Sort `(dbfId, premium)` ascending, then join
`${dbfId}:${premium}:${count}` with `|`. Reuses the pattern in
`canonicalCardListHash` (`packages/core/src/deck/deck-diff.ts`) and is
stable across re-encoded JSON / row order changes.

## Risks / Trade-offs

- **Risk:** Reattach picks the wrong row when multiple decks share an
  identical card list within the same (class, format).
  **Mitigation:** Skip reattach entirely when more than one row
  matches; the new live id then creates a new row, preserving the
  duplicate-but-correct status quo.
- **Risk:** Phase oscillations during match setup could fire `PRE_MATCH`
  multiple times. **Mitigation:** 5 s debounce in
  `match-start-sync-trigger`.
- **Trade-off:** Collection dedup means a no-op live read does not
  refresh the offline-banner timestamp. Acceptable: live success still
  flips `mirrorAlive: true`, so the offline banner is not shown.

## Migration Plan

Additive only:

- `collection_meta` gains a new `cardsHash` row; first `save()` after
  upgrade computes and stores it. Subsequent saves dedup against it.
- `deck-store.ts` schema is unchanged; the reattach lookup uses existing
  columns and the in-memory hash recomputation.
- `ipc.ts` adds a single subscriber call. No IPC channel additions or
  preload changes.
