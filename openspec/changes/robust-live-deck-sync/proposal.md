## Why

The persisted deck list added by the current player/deck persistence work is only refreshed once at application startup, so it becomes stale when Hearthstone starts later or the player edits decks in the Collection screen. This change aligns with the broader DEVELOPMENT_PLAN goal of replacing mock/static app state with live Hearthstone-backed state, without expanding into unrelated deck editing or statistics work.

## What Changes

- Add a robust live-deck synchronization capability that reads Hearthstone Collection decks through HearthMirror and upserts them into the local deck store.
- Expose a renderer-safe `window.hdt.decks.syncFromLive()` IPC call that returns sync status instead of throwing for normal Hearthstone-unavailable cases.
- Trigger synchronization before rendering deck-dependent surfaces:
  - the Collection route, so "My Decks" is refreshed after the player edits decks in Hearthstone;
  - the Deck Select dialog shown before/at match start, so match attribution uses the newest saved deck identities;
  - the My Decks route, so direct deck management opens with current live deck data when Hearthstone is available.
- Rename user-facing "Saved Decks" wording to "My Decks" where the UI is describing the user's persisted Hearthstone deck list.
- Add stale/unavailable state handling so pages keep showing cached local decks when HearthMirror is unavailable, while making the last sync result visible where useful.

## Non-goals

- Do not delete local app-created/imported decks merely because HearthMirror returns no decks or Hearthstone is closed.
- Do not implement background cloud sync, Blizzard account switching, or cross-device deck sync.
- Do not change the deck editor/import/export feature set beyond the naming and refresh behavior required here.
- Do not redesign collection progress aggregation or match history statistics.

## Capabilities

### New Capabilities

- `live-deck-sync`: Synchronizing Hearthstone live Collection decks into the local deck store with idempotent upserts, failure-safe semantics, and explicit status reporting.

### Modified Capabilities

- `deck-management`: Persisted decks gain live-sync metadata and idempotent update behavior suitable for repeated HearthMirror refreshes.
- `deck-management-ipc`: The renderer deck IPC surface gains a request/response sync operation.
- `deck-management-ui`: The saved deck list is renamed to "My Decks" and synchronizes from live before displaying when possible.
- `collection-progress`: Opening the Collection route triggers live deck synchronization in addition to collection progress loading.
- `deck-tracker-core`: The pre-match deck selection flow refreshes saved decks from live before presenting choices for match attribution.

## Impact

- Main process: `deck-sync-service`, `deck-store`, `deck-ipc`, and `ipc` startup wiring.
- Preload/renderer API: `window.hdt.decks.syncFromLive()` and related TypeScript declarations.
- Renderer UI: My Decks tab/list, Collection route mount behavior, DeckSelectDialog loading/error states, and i18n strings.
- Tests: main-process sync/store/IPC tests, renderer tests for Collection, DeckSelectDialog, and My Decks naming/refresh behavior.
