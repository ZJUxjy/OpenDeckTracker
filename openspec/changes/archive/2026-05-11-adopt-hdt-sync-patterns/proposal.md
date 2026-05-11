## Why

Investigation of the upstream C# Hearthstone Deck Tracker
(`D:\code\Hearthstone-Deck-Tracker`) surfaced three sync patterns we have
not yet adopted. Each closes a small but observable correctness or
freshness gap in our renderer-driven sync model:

1. HDT auto-syncs decks the moment the player enters a matchmaking
   queue (`QueueEvents.cs:51`). Today our renderer only triggers a sync
   on My Decks / Collection / DeckSelectDialog mount, so a player who
   launches straight into a quick-match without visiting those surfaces
   sees stale deck identities for match attribution.
2. HDT matches imported decks by Hearthstone deck id **and** by
   card-list content (`DeckImporter.GetImportedDecks:115`), so a deck
   that was renamed or re-saved in Hearthstone (new live id, same cards)
   is merged into the existing local row. Our `saveFromLive` matches by
   `liveDeckId` only, so the same content imported under a fresh live
   id duplicates the local row.
3. HDT only re-uploads a collection when its hash changes
   (`HSReplayNetHelper.cs`). Our snapshot stamps `lastUpdatedAt` on
   every successful live read, so the "last updated" timestamp shown to
   users in the offline banner can drift away from when the collection
   actually changed.

## What Changes

- Subscribe to deck-tracker phase transitions in the main process and
  call `deckSyncHost.syncFromLive()` on `IDLE → PRE_MATCH`. Debounce
  repeated triggers within a short window so phase oscillations don't
  hammer HearthMirror.
- Extend `DeckStore.saveFromLive`: when the incoming `liveDeckId` does
  not match any existing row, fall back to a `(class, format, canonical
  card-list hash)` lookup against rows whose `source ===
  'hearthstone-live'`. If **exactly one** matches, adopt the new
  `liveDeckId` onto that row instead of inserting a duplicate. Ambiguous
  matches (more than one) fall through to insert.
- Extend `CollectionSnapshotStore.save()` to compute a stable hash over
  the saved cards. When the new hash equals the stored hash, return the
  *existing* snapshot (preserving its `lastUpdatedAt`) instead of
  stamping a fresh time.

## Non-goals

- Do not change the deck-management UI or expose merge prompts to the
  renderer; reattach happens silently for single-match scenarios and
  skips ambiguous ones.
- Do not poll HearthMirror on a timer; the queue-entry trigger is
  event-driven, gated on existing phase transitions.
- Do not change collection progress math, the Standard/Wild split, or
  the renderer banner copy.
- Do not extend the fingerprint match to app-managed (non-live) rows in
  this change; promoting app-managed rows to live-synced is a separate
  decision.

## Capabilities

### Modified Capabilities

- `live-deck-sync`: Adds the match-start sync trigger and per-trigger
  debounce.
- `deck-management`: Extends `saveFromLive` upsert behavior with a
  content-fingerprint reattach fallback for live-synced rows.
- `collection-progress`: The collection snapshot deduplicates by content
  hash and preserves the original `lastUpdatedAt` when the underlying
  card counts have not changed.

## Impact

- Main process: `apps/desktop/src/main/ipc.ts` (phase subscription),
  `apps/desktop/src/main/match-start-sync-trigger.ts` (new debounce
  helper), `apps/desktop/src/main/deck-store.ts` (`saveFromLive`
  reattach branch + new `findLiveSyncedDeckByFingerprint` helper),
  `apps/desktop/src/main/collection-snapshot-store.ts` (hash storage
  + dedup).
- Tests: new test cases in `match-start-sync-trigger.test.ts` (new),
  `deck-store.test.ts`, `collection-snapshot-store.test.ts`,
  `collection-progress.test.ts`.
- Renderer: none — no IPC shape changes.
- **Archive order:** this change assumes the `live-deck-sync`
  capability already exists in main specs. Archive
  `robust-live-deck-sync` (with spec sync) before archiving this
  change.
