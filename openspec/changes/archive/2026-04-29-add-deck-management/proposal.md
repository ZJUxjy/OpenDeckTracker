## Why

Today the app can identify decks the user already runs in Hearthstone (the live-bridge `getDecks` reflector returns their saved-in-game decks) and decode/encode HearthSim deckstrings, but it cannot persist a deck of its own. Users cannot save a deck for later study, attach notes/tags, import decks from external sources, or build a deck while Hearthstone is closed. Without app-managed decks, the stats and overlay surfaces also have nothing stable to attribute matches to once the user changes their in-game deck list.

`add-deck-management` introduces app-side deck CRUD as the missing foundation for `DEVELOPMENT_PLAN.md` Phase 4 (deck stats reporting) and Phase 8 (overlay deck attribution). It builds on already-shipped infrastructure (`@hdt/hearthdb` deckstrings, `better-sqlite3`, Zustand) so the scope stays focused on the deck domain itself.

## What Changes

- **NEW** `@hdt/core/deck` module: `Deck` / `DeckCard` / `DeckVersion` domain types, `DeckManager` API (`create / list / getById / update / duplicate / delete / setSelected`), validity checker (size / dup-cap / legendary-cap / class-restriction), import/export helpers (deckstring text, JSON, snapshot from a live-bridge `getDecks` entry).
- **NEW** SQLite-backed deck store in `apps/desktop/src/main` (separate `decks.db` file in app userData dir, not co-mingled with `match-history.db`): `decks`, `deck_cards`, `deck_versions` tables with explicit migration path.
- **NEW** IPC surface `window.hdt.decks.*` exposing the DeckManager API to the renderer (mirrors the existing `window.hdt.cards.*` / `window.hdt.matchHistory.*` patterns).
- **NEW** Renderer surfaces:
  - **Deck list page** (sidebar already nav'd to "Tracker" → repurposes the existing Decklist tab into a saved-decks list grouped by class).
  - **Deck editor** modal: card search (using `@hdt/hearthdb`), add/remove with count badges, mana curve, validity panel.
  - **Import dialog**: paste deckstring or load from clipboard; "Save from current Hearthstone deck" button consuming the active live-bridge deck.
  - **Export dialog**: deckstring + JSON + copy-to-clipboard.
- **MODIFIED** `DeckSelectDialog`: prefers app-saved decks when available, falls back to live `getDecks` so unsaved-but-in-game decks still pick up matches.
- **MODIFIED** `deck-tracker-core` capability: match attribution can resolve a saved-deck `id` (in addition to the existing live-deck identifier).

## Capabilities

### New Capabilities

- `deck-management`: Domain rules and persistence contract for app-managed decks, including CRUD, validity, import/export, versioning, and SQLite schema/migration boundaries.
- `deck-management-ipc`: Main↔renderer IPC contract for `window.hdt.decks.*`, mirroring the existing card/match-history IPC patterns.
- `deck-management-ui`: Renderer behavior for the saved-decks list, editor modal, import dialog, export dialog, and DeckSelectDialog interaction.

### Modified Capabilities

- `deck-tracker-core`: Match-tracking attribution gains a saved-deck-id path so persisted matches reference an app-side deck version, not just an in-game `getDecks` entry that may disappear when the user reshapes their in-game deck list.

## Impact

- **Code (new)**: `packages/core/src/deck/` (domain + validity + import/export); `apps/desktop/src/main/deck-store.ts` + `deck-store.test.ts` + IPC handlers; `apps/desktop/src/preload/index.ts` (decks bridge); `apps/desktop/src/renderer/src/components/{DeckEditor,DeckImportDialog,DeckExportDialog,SavedDecksList}.tsx` + tests; new `useDecks` Zustand store + hook.
- **Code (modified)**: `apps/desktop/src/renderer/src/components/{Decklist,DeckSelectDialog}.tsx` to consume saved decks; `apps/desktop/src/renderer/src/env.d.ts` to type `window.hdt.decks.*`; `packages/core/src/tracker/deck-tracker.ts` to accept saved-deck attribution.
- **Dependencies**: No new runtime dependencies — `better-sqlite3`, Zustand, Radix UI, and `@hdt/hearthdb` are all already in the workspace.
- **Storage**: New file `decks.db` under app userData. Schema versioned via a `schema_version` table, applied on open. No migration from `match-history.db` (decks have never lived there).
- **i18n**: New translation keys under `decks.*` in `resources/locales/{enUS,zhCN}.json`.
- **Specs sync**: 3 new specs (`deck-management`, `deck-management-ipc`, `deck-management-ui`); 1 modified spec (`deck-tracker-core` — saved-deck attribution scenario).

## Non-goals

- **Cloud sync / multi-device deck sync** — out of scope; local-only.
- **Web import** (HSReplay.net, HearthPwn URL fetch) — deferred to a later change; this change supports clipboard paste + JSON file only.
- **Plugin / template marketplace** — out of scope.
- **Arena draft persistence** — handled separately by a future arena-management change.
- **Battlegrounds team comp tracking** — out of scope.
- **Editing in-game decks (writing to Hearthstone memory)** — read-only relationship with the live bridge; we never write back to HS.
- **Auto-import every live deck** — user-initiated only, to avoid polluting the saved list with throwaway in-game decks.
- **Replacing match history**: `match-history-stats` continues to own match records; deck-management owns the deck dimension that matches reference.
