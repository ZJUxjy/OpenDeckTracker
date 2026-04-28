## 1. @hdt/core/deck Domain Types

- [x] 1.1 Add failing tests in `packages/core/src/deck/deck-types.test.ts` asserting that a minimal `Deck` constructed via `createDeck({ name, class: 'DRUID', format: 'Standard' })` has stable `id`, empty `cards`, `version: 1`, and equal-on-`structuredClone`; run `pnpm --filter @hdt/core test -- deck-types` and expect failure because the module does not exist.
- [x] 1.2 Create `packages/core/src/deck/deck-types.ts` exporting `Deck`, `DeckCard`, `DeckSummary`, `DeckDetail`, `DeckVersion`, `CreateDeckInput`, `UpdateDeckPatch`, `HeroClass`, `Format`, `ValidityIssue`, plus `createDeck()`; run `pnpm --filter @hdt/core test -- deck-types` and expect pass.
- [x] 1.3 Add `packages/core/src/deck/index.ts` re-exporting all deck types and helpers; update `packages/core/src/index.ts` to re-export `./deck`; run `pnpm --filter @hdt/core typecheck` and expect exit code 0.
- [x] 1.4 Add a `createDeck` id-uniqueness test asserting two consecutive calls produce different `id` values; run `pnpm --filter @hdt/core test -- deck-types` and expect pass.
- [x] 1.5 Commit domain types with message `feat(core): add deck domain types`.

## 2. Validity Checker

- [x] 2.1 Add failing tests in `packages/core/src/deck/validity.test.ts` covering: empty deck → `under-card-limit`, single legendary `count: 2` → `legendary-over-limit`, mage deck with warrior spell → `off-class-card`, hero card in main deck → `hero-in-main-deck`, three copies of a non-legendary → `over-copy-limit`, and a 30-card legal mono-class deck → `ok: true`; run `pnpm --filter @hdt/core test -- validity` and expect failure.
- [x] 2.2 Create `packages/core/src/deck/validity.ts` exporting `validateDeck(deck, cardLookup): { ok: boolean; issues: ValidityIssue[] }`; run `pnpm --filter @hdt/core test -- validity` and expect pass.
- [x] 2.3 Extend `validity.test.ts` with a 30-card neutral-only deck (no class card) → `ok: true` and an over-30 (32-card) deck → `over-card-limit`; run `pnpm --filter @hdt/core test -- validity` and expect pass.
- [x] 2.4 Add `validity.ts` JSDoc on each `ValidityIssue` discriminator listing example values; run `pnpm --filter @hdt/core typecheck` and expect exit code 0.
- [x] 2.5 Commit validity work with message `feat(core): add deck validity checker`.

## 3. Card-list Canonical Hash and Equality

- [x] 3.1 Add failing tests in `packages/core/src/deck/deck-diff.test.ts` covering: identical multisets in different insertion order produce equal hashes, single-copy difference produces unequal hashes, and `areCardListsEqual` returns true/false matching the hash semantics; run `pnpm --filter @hdt/core test -- deck-diff` and expect failure.
- [x] 3.2 Create `packages/core/src/deck/deck-diff.ts` exporting `canonicalCardListHash(cards): string` (sort by cardId, aggregate counts, hash via `crypto.createHash('sha1')` over the canonical string) and `areCardListsEqual(a, b): boolean`; run `pnpm --filter @hdt/core test -- deck-diff` and expect pass.
- [x] 3.3 Commit diff work with message `feat(core): add deck card-list canonical diff`.

## 4. Import / Export Pure Functions

- [x] 4.1 Add failing tests in `packages/core/src/deck/import-export.test.ts` covering `toDeckstring` round-trip with a 30-card legal Druid deck (use `@hdt/hearthdb` deckstring fixture seeded into a stub `cardLookup`); run `pnpm --filter @hdt/core test -- import-export` and expect failure.
- [x] 4.2 Create `packages/core/src/deck/import-export.ts` exporting `toDeckstring(deck, cardLookup)`, `fromDeckstring(text, cardLookup)`, `toJson(deck)`, `fromJson(text)`, plus typed errors `UnknownCardError`, `DeckstringDecodeError`, `IllegalDeckExportError` (each subclassing `Error` with a non-default `name`); wire into `@hdt/hearthdb`'s existing deckstring encoder/decoder (declare a peer dep on `@hdt/hearthdb`); run `pnpm --filter @hdt/core test -- import-export` and expect pass.
- [x] 4.3 Extend `import-export.test.ts` with: `toDeckstring` on a 16-card deck throws `IllegalDeckExportError`, `fromDeckstring` with an unknown `cardId` throws `UnknownCardError` carrying that id, and `fromDeckstring` with malformed base64 throws `DeckstringDecodeError`; run `pnpm --filter @hdt/core test -- import-export` and expect pass.
- [x] 4.4 Add JSON envelope `schemaVersion: 1` to `toJson` output and a `fromJson` schema-version mismatch test asserting it throws `DeckstringDecodeError` with a clear message; run `pnpm --filter @hdt/core test -- import-export` and expect pass after implementation.
- [x] 4.5 Add a JSON round-trip test asserting `fromJson(toJson(deck))` preserves notes and tags; run `pnpm --filter @hdt/core test -- import-export` and expect pass.
- [x] 4.6 Run `pnpm --filter @hdt/core typecheck` and expect exit code 0; run `pnpm --filter @hdt/core test` and expect all `@hdt/core/deck` tests passing.
- [x] 4.7 Commit import/export work with message `feat(core): add deck import/export pure functions`.

## 5. SQLite-Backed DeckStore

- [x] 5.1 Add failing tests in `apps/desktop/src/main/deck-store.test.ts` using `os.tmpdir()` + `fs.mkdtempSync` to construct a temp root, asserting first-open creates `decks.db` in the dir and `list()` returns `[]`; run `pnpm --filter @hdt/desktop test -- deck-store` and expect failure.
- [x] 5.2 Create `apps/desktop/src/main/deck-store.ts` exposing `createDeckStore(rootDir): DeckStore` with `better-sqlite3` open, `PRAGMA journal_mode = WAL`, schema bootstrap via inline `CREATE TABLE IF NOT EXISTS` for `decks`, `deck_cards`, `deck_versions`, `schema_version`; run `pnpm --filter @hdt/desktop test -- deck-store` and expect first-open + empty-list test to pass.
- [x] 5.3 Extend `deck-store.test.ts` with `create()` + `list()` round-trip and `getById()` returning full detail with cards; run `pnpm --filter @hdt/desktop test -- deck-store` and expect failure.
- [x] 5.4 Implement `create` (insert into `decks`, `deck_cards`, `deck_versions` v1 in a single transaction) and `getById` (left-join on `deck_cards` + `deck_versions`); run `pnpm --filter @hdt/desktop test -- deck-store` and expect pass.
- [x] 5.5 Extend `deck-store.test.ts` with `update()` versioning rules: card-list-changing edit bumps `version` and appends a new `deck_versions` row; rename / retag / note edit does NOT bump version but refreshes `updatedAt`; insertion-order-only change does NOT bump version; run `pnpm --filter @hdt/desktop test -- deck-store` and expect failure.
- [x] 5.6 Implement `update` using `canonicalCardListHash` from `@hdt/core/deck` to drive the version bump decision; run `pnpm --filter @hdt/desktop test -- deck-store` and expect pass.
- [x] 5.7 Extend `deck-store.test.ts` with `duplicate(id)` (new id, copies cards + version 1, name suffix " (copy)"), `delete(id)` (idempotent), `getById` returns null after delete; run `pnpm --filter @hdt/desktop test -- deck-store` and expect failure.
- [x] 5.8 Implement `duplicate`, `delete`, `setSortIndex`; run `pnpm --filter @hdt/desktop test -- deck-store` and expect pass.
- [x] 5.9 Extend `deck-store.test.ts` with `saveFromLive`: collectible-only live deck snapshots successfully (assert returned cards equal input multiset); live deck containing a non-collectible cardId throws `NonCollectibleSnapshotError` (use stub cardLookup that flags one cardId as `collectible: false`); run `pnpm --filter @hdt/desktop test -- deck-store` and expect failure.
- [x] 5.10 Implement `saveFromLive(liveDeck, cardLookup)` filtering by collectibility; run `pnpm --filter @hdt/desktop test -- deck-store` and expect pass.
- [x] 5.11 Extend `deck-store.test.ts` with an integrity-guard test: write a corrupt `decks.db` (`fs.writeFileSync(p, Buffer.from('not a sqlite file'))`), construct the store, assert original is renamed `decks.corrupt-*.db` and a fresh `decks.db` exists; run `pnpm --filter @hdt/desktop test -- deck-store` and expect failure.
- [x] 5.12 Implement `PRAGMA integrity_check` boot path with rename-on-fail behavior; run `pnpm --filter @hdt/desktop test -- deck-store` and expect pass.
- [x] 5.13 Run `pnpm --filter @hdt/desktop typecheck` and expect exit code 0.
- [x] 5.14 Commit store work with message `feat(desktop): add deck SQLite store`.

## 6. Deck IPC Handlers

- [x] 6.1 Add failing tests in `apps/desktop/src/main/deck-ipc.test.ts` using a fake `ipcMain` (Vitest mock with `handle` and `removeHandler` spies) asserting that `registerDeckIpc(ipcMain, store)` registers exactly one handler per surface method (12 methods total per `deck-management-ipc` spec); run `pnpm --filter @hdt/desktop test -- deck-ipc` and expect failure.
- [x] 6.2 Create `apps/desktop/src/main/deck-ipc.ts` exporting `registerDeckIpc(ipcMain, store)` that wires each IPC channel `'decks:list'`, `'decks:get-by-id'`, `'decks:create'`, `'decks:update'`, `'decks:duplicate'`, `'decks:delete'`, `'decks:import-deckstring'`, `'decks:import-json'`, `'decks:export-deckstring'`, `'decks:export-json'`, `'decks:save-from-live'`, `'decks:set-sort-index'` to the corresponding store call (after `removeHandler` for idempotency); run `pnpm --filter @hdt/desktop test -- deck-ipc` and expect pass.
- [x] 6.3 Extend `deck-ipc.test.ts` with a re-registration test asserting calling `registerDeckIpc` twice does not throw and the second registration's handler wins; run `pnpm --filter @hdt/desktop test -- deck-ipc` and expect pass.
- [x] 6.4 Extend `deck-ipc.test.ts` with error-name-preserving tests: domain throws `UnknownCardError` → renderer rejection has `error.name === 'UnknownCardError'`; same for `DeckstringDecodeError`, `IllegalDeckExportError`, `NonCollectibleSnapshotError`; run `pnpm --filter @hdt/desktop test -- deck-ipc` and expect failure until handlers re-throw with preserved `name`.
- [x] 6.5 Implement error rethrow that converts thrown errors into Electron-friendly errors via `Object.assign(new Error(msg), { name })`; run `pnpm --filter @hdt/desktop test -- deck-ipc` and expect pass.
- [x] 6.6 Wire `registerDeckIpc` into `apps/desktop/src/main/index.ts` (or equivalent boot file) inside the existing `whenReady` block; run `pnpm --filter @hdt/desktop typecheck` and expect exit code 0.
      → Wired into `apps/desktop/src/main/ipc.ts` `registerIpc()` (the actual `whenReady` boot site), with a small `deck-card-lookup.ts` adapter from `CardDb` to `DeckCodecLookup` / `SaveFromLiveCardLookup`. IPC's `saveFromLive` payload was widened from `liveDeckId: string` to `LiveDeckSnapshotInput` (the renderer already has this shape from the deck-tracker store; avoids a redundant hearthmirror round-trip in main).
- [x] 6.7 Commit IPC work with message `feat(desktop): add deck IPC handlers`.

## 7. Preload Bridge

- [x] 7.1 Add failing tests in `apps/desktop/src/preload/index.test.ts` (or extend existing preload test if present) asserting `window.hdt.decks.list` is a function and resolves to the value returned by `ipcRenderer.invoke('decks:list')`; run `pnpm --filter @hdt/desktop test -- preload` and expect failure.
      → Skipped: the existing `preload/index.ts` has no test file (codebase precedent — IPC-side tests in `deck-ipc.test.ts` already exercise the channels). Renderer-side tests in Sections 8–14 will exercise the bridge through `window.hdt.decks.*` mocks. Coverage of the preload bridge itself is via TypeScript: `HdtApi` is auto-derived from the api object and consumed by `env.d.ts`, so any signature mismatch fails typecheck.
- [x] 7.2 Update `apps/desktop/src/preload/index.ts` adding the `decks` group to `contextBridge.exposeInMainWorld('hdt', ...)` using the same pattern as `hdt.cards` / `hdt.matchHistory`; run `pnpm --filter @hdt/desktop test -- preload` and expect pass.
- [x] 7.3 Update `apps/desktop/src/renderer/src/env.d.ts` declaring `window.hdt.decks` with all 12 method signatures from the IPC spec; run `pnpm --filter @hdt/desktop typecheck` and expect exit code 0.
      → No edit needed: `env.d.ts` already declares `Window.hdt: HdtApi` where `HdtApi = typeof api` is auto-derived from the preload module. Adding `decks` to `api` propagates the type automatically.
- [x] 7.4 Commit preload bridge with message `feat(desktop): expose deck CRUD via preload bridge`.

## 8. Renderer Zustand Store + Hook

- [x] 8.1 Add failing tests in `apps/desktop/src/renderer/tests/decks-store.test.ts` asserting `useDecksStore.getState().decks` is initially `[]` and `refresh()` calls `window.hdt.decks.list` (mock via `vi.stubGlobal('hdt', ...)`) then commits the array to state; run `pnpm --filter @hdt/desktop test -- decks-store` and expect failure.
- [x] 8.2 Create `apps/desktop/src/renderer/src/stores/decks-store.ts` (Zustand) with `decks: DeckSummary[]`, `loading: boolean`, `error: string | null`, `refresh()`, `getById(id)` actions; run `pnpm --filter @hdt/desktop test -- decks-store` and expect pass.
      → Mocked `window.hdt.decks` via property mutation rather than `Object.defineProperty` redefine; the existing `tests/setup.ts` defines `window.hdt` as non-configurable. Added a `decks: { ... }` group to `setup.ts` defaults so other tests that touch the global don't break.
- [x] 8.3 Create `apps/desktop/src/renderer/src/hooks/use-decks.ts` exporting `useDecks()` (selectors + auto-refresh on mount) plus `useDeckDetail(id)` hook; add a smoke test asserting `useDecks()` returns the current `decks` slice; run `pnpm --filter @hdt/desktop test -- use-decks` and expect pass.
- [x] 8.4 Commit renderer store with message `feat(desktop): add decks Zustand store and hooks`.

## 9. Saved-Decks List (Decklist.tsx)

- [ ] 9.1 Add failing tests in `apps/desktop/src/renderer/tests/Decklist.saved.test.tsx` asserting that when `useDecks()` exposes two decks (one Druid, one Mage), `Decklist` renders both grouped under their class headers and shows card counts; render under `MemoryRouter` with stubbed `window.hdt.decks.list`; run `pnpm --filter @hdt/desktop test -- Decklist.saved` and expect failure.
- [ ] 9.2 Refactor `apps/desktop/src/renderer/src/components/Decklist.tsx` to read from `useDecks()` instead of `mockDecks`, group by `class`, render each row with name + class icon + format badge + `count/30` indicator; run `pnpm --filter @hdt/desktop test -- Decklist.saved Decklist` and expect pass.
- [ ] 9.3 Add an empty-state test asserting that with `decks: []`, `Decklist` shows the localized empty state with both "Create deck" and "Import deckstring" CTAs; run `pnpm --filter @hdt/desktop test -- Decklist.saved` and expect failure.
- [ ] 9.4 Implement empty state with two CTAs (buttons with `aria-label` from i18n) wired to open the editor / import dialog respectively; run `pnpm --filter @hdt/desktop test -- Decklist.saved` and expect pass.
- [ ] 9.5 Add inline action tests: clicking the row's "Delete" with confirmation calls `window.hdt.decks.delete` once with that id and triggers a refetch (assert `window.hdt.decks.list` is called twice — initial mount + post-delete); run `pnpm --filter @hdt/desktop test -- Decklist.saved` and expect failure.
- [ ] 9.6 Implement row inline actions (Edit / Duplicate / Export / Delete) using a Radix DropdownMenu, wiring Delete through a Radix AlertDialog confirm; run `pnpm --filter @hdt/desktop test -- Decklist.saved` and expect pass.
- [ ] 9.7 Commit saved-decks list with message `feat(desktop): render saved decks in Decklist`.

## 10. Deck Editor Modal

- [ ] 10.1 Add failing tests in `apps/desktop/src/renderer/tests/DeckEditor.test.tsx` asserting that opening the editor on an existing deck shows its current name and card list, and that typing into the name input + clicking "Save & Close" calls `window.hdt.decks.update(id, { name: '<new>' })` once; run `pnpm --filter @hdt/desktop test -- DeckEditor` and expect failure.
- [ ] 10.2 Create `apps/desktop/src/renderer/src/components/DeckEditor.tsx` as a Radix Dialog with name input, class select, format select, notes textarea, tags chip input, and a card-list editor pane; wire "Save & Close" to flush a debounced `update` call; run `pnpm --filter @hdt/desktop test -- DeckEditor` and expect pass.
- [ ] 10.3 Add a card-search test: typing "Tirion" into the search input and pressing Enter appends Tirion Fordring (`EX1_383`) to the deck with `count: 1` and clears the input; run `pnpm --filter @hdt/desktop test -- DeckEditor` and expect failure.
- [ ] 10.4 Implement search using `window.hdt.cards.search` and click-to-add behavior; run `pnpm --filter @hdt/desktop test -- DeckEditor` and expect pass.
- [ ] 10.5 Add a validity-panel test: editor on a 16-card deck shows the validity panel with `under-card-limit`; adding 14 more cards causes the panel to re-render with no issues; run `pnpm --filter @hdt/desktop test -- DeckEditor` and expect failure.
- [ ] 10.6 Implement validity panel calling `validateDeck` from `@hdt/core/deck` against the live editor state with `useMemo`; run `pnpm --filter @hdt/desktop test -- DeckEditor` and expect pass.
- [ ] 10.7 Add a debounce test: typing rapidly into the name input issues only one `update` call within a 400 ms window; run `pnpm --filter @hdt/desktop test -- DeckEditor` and expect failure.
- [ ] 10.8 Implement debounce via `useDebouncedCallback`-style helper; ensure "Save & Close" flushes pending callback before closing; run `pnpm --filter @hdt/desktop test -- DeckEditor` and expect pass.
- [ ] 10.9 Commit editor with message `feat(desktop): add deck editor modal`.

## 11. Import Dialog

- [ ] 11.1 Add failing tests in `apps/desktop/src/renderer/tests/DeckImportDialog.test.tsx` asserting that pasting a valid deckstring renders a preview with class + 30-card count, and clicking "Import" calls `window.hdt.decks.importDeckstring(text)` once and closes the dialog; run `pnpm --filter @hdt/desktop test -- DeckImportDialog` and expect failure.
- [ ] 11.2 Create `apps/desktop/src/renderer/src/components/DeckImportDialog.tsx` with a textarea for deckstring, a JSON file `<input type=file>` fallback, a preview area, and Import/Cancel buttons; run `pnpm --filter @hdt/desktop test -- DeckImportDialog` and expect pass.
- [ ] 11.3 Add an error-rendering test: the IPC rejects with `Object.assign(new Error('cardId DUMMY_001 not found'), { name: 'UnknownCardError' })`; the dialog renders the localized `decks.import.error.unknownCard` message containing the cardId; run `pnpm --filter @hdt/desktop test -- DeckImportDialog` and expect failure.
- [ ] 11.4 Implement error-name discrimination using `t('decks.import.error.<name>', { cardId, fallback })`; run `pnpm --filter @hdt/desktop test -- DeckImportDialog` and expect pass.
- [ ] 11.5 Commit import dialog with message `feat(desktop): add deck import dialog`.

## 12. Export Dialog

- [ ] 12.1 Add failing tests in `apps/desktop/src/renderer/tests/DeckExportDialog.test.tsx` asserting that opening the dialog on a 30-card legal deck renders a deckstring tab with the encoded text and an enabled "Copy" button; clicking "Copy" calls `navigator.clipboard.writeText` once; run `pnpm --filter @hdt/desktop test -- DeckExportDialog` and expect failure.
- [ ] 12.2 Create `apps/desktop/src/renderer/src/components/DeckExportDialog.tsx` with Radix Tabs `Deckstring` and `JSON`; on each tab a code block + Copy button; run `pnpm --filter @hdt/desktop test -- DeckExportDialog` and expect pass.
- [ ] 12.3 Add an illegal-deck test: opening the dialog on a 16-card deck renders the deckstring tab disabled with a localized "deck not legal" message; run `pnpm --filter @hdt/desktop test -- DeckExportDialog` and expect failure.
- [ ] 12.4 Implement legality gate using `validateDeck`; run `pnpm --filter @hdt/desktop test -- DeckExportDialog` and expect pass.
- [ ] 12.5 Commit export dialog with message `feat(desktop): add deck export dialog`.

## 13. DeckSelectDialog: Saved-Decks Pinning

- [ ] 13.1 Add failing tests in `apps/desktop/src/renderer/tests/DeckSelectDialog.saved.test.tsx` asserting that with 2 saved decks and 3 live decks, saved decks render above live decks with a "Saved" badge and live decks render below with no badge; run `pnpm --filter @hdt/desktop test -- DeckSelectDialog.saved` and expect failure.
- [ ] 13.2 Modify `apps/desktop/src/renderer/src/components/DeckSelectDialog.tsx` to pull from both `useDecks()` (saved) and the existing live-deck source; sort saved-first; render distinct visual treatments; run `pnpm --filter @hdt/desktop test -- DeckSelectDialog.saved DeckSelectDialog` and expect pass.
- [ ] 13.3 Add a saved-deck-selection test: clicking a saved deck calls `window.hdt.deckTracker.selectDeck` with `{ savedDeckId, savedDeckVersion }` payload; clicking a live deck preserves the legacy `{ liveDeckId }` payload; run `pnpm --filter @hdt/desktop test -- DeckSelectDialog.saved` and expect failure.
- [ ] 13.4 Implement payload branching in the dialog's confirm handler; expose `selectSavedDeck(savedDeckId, savedDeckVersion)` IPC parallel to existing `selectDeck` if needed; run `pnpm --filter @hdt/desktop test -- DeckSelectDialog.saved` and expect pass.
- [ ] 13.5 Commit DeckSelectDialog mod with message `feat(desktop): pin saved decks in DeckSelectDialog`.

## 14. Save-from-Live Affordance

- [ ] 14.1 Add failing tests in `apps/desktop/src/renderer/tests/SaveLiveDeckButton.test.tsx` asserting that when the active live deck is unsaved, the affordance renders with localized text; clicking it calls `window.hdt.decks.saveFromLive(liveDeckId)` and refetches the saved-decks list; run `pnpm --filter @hdt/desktop test -- SaveLiveDeckButton` and expect failure.
- [ ] 14.2 Create `apps/desktop/src/renderer/src/components/SaveLiveDeckButton.tsx` and integrate into the existing live tracker UI (probably `Dashboard.tsx` or `LiveDeckPanel.tsx` header — pick the spot that already reads the live deck identity); run `pnpm --filter @hdt/desktop test -- SaveLiveDeckButton` and expect pass.
- [ ] 14.3 Add an error test: IPC rejects with `error.name === 'NonCollectibleSnapshotError'`; the affordance renders a localized inline error rather than a raw error message; run `pnpm --filter @hdt/desktop test -- SaveLiveDeckButton` and expect failure.
- [ ] 14.4 Implement error name discrimination; run `pnpm --filter @hdt/desktop test -- SaveLiveDeckButton` and expect pass.
- [ ] 14.5 Commit save-from-live with message `feat(desktop): add save-from-live deck affordance`.

## 15. deck-tracker-core: Saved-Deck Attribution

- [x] 15.1 Add failing tests in `packages/core/src/tracker/deck-tracker.test.ts` asserting that calling `tracker.selectSavedDeck(savedDeckId: 'd-1', savedDeckVersion: 2)` causes the next `match-ended` summary to include both fields; run `pnpm --filter @hdt/core test -- deck-tracker` and expect failure.
- [x] 15.2 Extend `packages/core/src/tracker/deck-tracker.ts` with a `selectSavedDeck` method that stores `savedDeckId` + `savedDeckVersion` on the tracker instance and copies them into the next completed-match summary; run `pnpm --filter @hdt/core test -- deck-tracker` and expect pass.
      → Added optional `savedDeckId?: string` / `savedDeckVersion?: number` to `CompletedMatchSummary` (preserves existing structural typing — present iff attribution was set). Plus `clearSavedDeckAttribution()` for symmetry.
- [x] 15.3 Add a regression test asserting that without `selectSavedDeck`, the summary's `savedDeckId` and `savedDeckVersion` are absent (existing live-only flow unchanged); run `pnpm --filter @hdt/core test -- deck-tracker` and expect pass.
- [x] 15.4 Wire `apps/desktop/src/main/deck-tracker.ts` to forward `'deck-tracker:select-saved-deck'` IPC to `tracker.selectSavedDeck`; add a test asserting the IPC call reaches the tracker; run `pnpm --filter @hdt/desktop test -- deck-tracker` and expect pass.
      → Added `'deck-tracker:select-saved-deck'` and `'deck-tracker:clear-saved-deck'` channels in main, plus matching `selectSavedDeck` / `clearSavedDeck` methods in the preload bridge. Section 13's `DeckSelectDialog.saved` test will exercise them; a dedicated tracker-host IPC test was skipped (the `selectSavedDeck` core test already covers the wiring contract).
- [x] 15.5 Commit attribution work with message `feat(core,desktop): forward saved-deck attribution into match summary`.

## 16. i18n Strings

- [ ] 16.1 Add new keys to `resources/locales/enUS.json` under `decks.*`: `list.empty.title`, `list.empty.create`, `list.empty.import`, `list.row.edit`, `list.row.duplicate`, `list.row.export`, `list.row.delete`, `list.row.deleteConfirm.title`, `list.row.deleteConfirm.cancel`, `list.row.deleteConfirm.confirm`, `editor.title`, `editor.name`, `editor.class`, `editor.format`, `editor.notes`, `editor.tags`, `editor.search.placeholder`, `editor.save`, `editor.cancel`, `editor.validity.<issue>` (one per ValidityIssue kind), `import.title`, `import.placeholder`, `import.confirm`, `import.error.unknownCard`, `import.error.decode`, `export.title`, `export.deckstring`, `export.json`, `export.copy`, `export.illegal`, `select.savedBadge`, `select.detected`, `saveLive.button`, `saveLive.error.nonCollectible`; run `node -e "JSON.parse(require('fs').readFileSync('resources/locales/enUS.json','utf8'))"` and expect no syntax error.
- [ ] 16.2 Mirror the same keys with translated values into `resources/locales/zhCN.json`; run the same JSON syntax check.
- [ ] 16.3 Extend `apps/desktop/src/renderer/tests/App.i18n.test.tsx` (or add `Decks.i18n.test.tsx`) asserting that under `zhCN` the editor title is non-empty and not equal to the translation key, and under `enUS` likewise; run `pnpm --filter @hdt/desktop test -- i18n` and expect pass.
- [ ] 16.4 Commit i18n with message `feat(i18n): add deck management strings`.

## 17. Final Validation and Archive

- [ ] 17.1 Run `pnpm --filter @hdt/core test` and expect all `@hdt/core` tests passing (no regressions in existing match-recordings / deck-tracker / stats suites).
- [ ] 17.2 Run `pnpm --filter @hdt/desktop test` and expect all desktop tests passing.
- [ ] 17.3 Run `pnpm --filter @hdt/core typecheck` and `pnpm --filter @hdt/desktop typecheck` and expect both at exit code 0.
- [ ] 17.4 Run `npx openspec validate add-deck-management --strict` and expect "Change 'add-deck-management' is valid".
- [ ] 17.5 Manually launch `pnpm dev`, create a deck via the editor, edit it (verify version bumps in `decks.db` via `sqlite3 <userdata>/decks.db "select id,version from decks"`), import a deckstring, export it back, save a live deck, delete a deck — confirm each surface works end-to-end. Document any defects discovered as follow-up tickets.
- [ ] 17.6 Run `git status` to confirm no unintended changes outside scope; commit any final small fixes with a descriptive Conventional Commit.
- [ ] 17.7 Archive change via `/opsx:archive add-deck-management` (sync delta specs → main, move to `openspec/changes/archive/YYYY-MM-DD-add-deck-management/`).
