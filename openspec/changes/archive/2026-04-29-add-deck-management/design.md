## Context

`@hdt/hearthdb` already exposes a 7898-card in-memory database with `findCard / search` plus a HearthSim-compatible deckstring encoder/decoder (5 round-trip fixtures green). The live bridge (`getDecks`) returns the user's in-game decks at runtime — UI surfaces (`DeckSelectDialog`) consume them today via `window.hdt.deckTracker.*`. `match-history-stats` already uses `better-sqlite3` (commit `a50e93e feat: record real match history stats`), so the SQLite toolchain, electron-rebuild config, and userData-dir conventions are battle-tested in this repo. `apps/desktop/src/main/match-history-store.ts` is the reference implementation pattern (constructor injection of root dir for tests, schema bootstrap on open).

What is missing: the user has no place to **save** a deck. They cannot maintain a deck off-line, attach notes to it, version it as it evolves, or import a deckstring shared by a teammate. Stats also cannot stably attribute matches to a deck dimension that survives the user editing their in-game collection.

This change is the deck-domain equivalent of `add-match-recordings`: a focused vertical slice from core domain → SQLite store → IPC → renderer. Stakeholders are (a) the user during competitive play / brewing, (b) future stats screens that need a stable `deckId` foreign key, (c) the future overlay window which will pin "currently tracked deck" UI.

## Goals / Non-Goals

**Goals:**

- Deterministic deck CRUD that survives Hearthstone restarts and works offline.
- Round-trip fidelity with HearthSim deckstrings (already proven by `@hdt/hearthdb`); save/import/export should never silently mutate cards.
- Stable saved-deck `id` for the rest of the app to attribute matches against, decoupled from the volatile in-game deck list.
- Validity *advisory*, not *enforcement*: a half-built deck must be saveable as a work-in-progress.
- "Save from current Hearthstone deck" — a single button to snapshot a live `getDecks` entry into the saved store.
- TDD: every public API in `@hdt/core/deck` and `apps/desktop/src/main/deck-store.ts` lands with a failing test first.
- IPC parity with existing `window.hdt.cards.*` / `window.hdt.matchHistory.*` shape so the renderer pattern is unsurprising.

**Non-Goals:**

- Cloud sync, account-bound decks, or multi-device merge.
- Web-source import (HSReplay URL fetch, scraping).
- Plugin marketplace / shared template store.
- Writing back to Hearthstone memory or imitating the in-game deck collection.
- Auto-syncing every live deck (user-initiated only).
- Replacing the live `DeckSelectDialog` flow — saved decks **augment** it, they do not replace it.

## Decisions

### D1. Domain ownership: `@hdt/core/deck`, mirroring `@hdt/core/recordings`

**Context:** Deck logic spans multiple consumers (main store, renderer editor, future overlay, future arena). Deck *validity*, *deckstring round-tripping*, and *version diffing* are pure functions over data — they should not live behind IPC.

**Options:**

- A. Put domain in `apps/desktop/src/main/deck-domain.ts`. Keep it close to the store.
- B. Put domain in `packages/core/src/deck/`. Pure, framework-agnostic.
- C. Put domain in `packages/hearthdb/src/deck/`. Co-locate with deckstring + cards.

**Choice:** **B**.

**Rationale:** matches the precedent set by `add-match-recordings` (timeline derivation lives in `@hdt/core`, store lives in `apps/desktop/src/main/`). `@hdt/hearthdb` is correctly scoped to *card data* — pulling deck CRUD into it would muddy the boundary. Pure-functional core also makes Vitest much simpler (no electron / sqlite imports in the test setup).

### D2. Persistence: separate `decks.db` SQLite file, not a new table in `match-history.db`

**Context:** `apps/desktop/src/main/match-history-store.ts` already owns `match-history.db`. We need a place for deck rows.

**Options:**

- A. Add `decks` / `deck_cards` / `deck_versions` tables to `match-history.db`.
- B. New `decks.db` in the same userData directory.
- C. Single file using SQLite ATTACH at runtime.

**Choice:** **B**.

**Rationale:**

- Lifecycle differs: match history is append-only; decks are hot-edited. Mixing them complicates backup/restore stories ("export my decks but not my match history").
- Stronger fault isolation: a corrupt deck row cannot prevent match-history reads.
- Migration story is cleaner: future schema changes to one file do not lock the other.
- Cost is one extra `Database.open` call at boot (~ms). Negligible.

**Foreign-key implication:** `match-history-stats` records reference `deckId`/`deckVersion` as **soft strings**, not enforced cross-DB FKs. Stats UI joins by reading both DBs in main and stitching in JS. This is exactly what `match-history-store.ts` already does for non-deck dimensions.

### D3. Versioning model: explicit "save creates a new version on canonical-card-list change"

**Context:** Stats need to distinguish "this deck won 8/12 in V1 but only 4/12 after I swapped two cards in V2". HDT (C#/WPF) increments `version` on every save where the card list changed.

**Options:**

- A. Increment on every save (regardless of diff).
- B. Diff against the latest version's card list; only bump if changed.
- C. No versioning — single mutable card list per deck.

**Choice:** **B**.

**Rationale:**

- Keeps version count meaningful (no churn from renaming a deck).
- Matches the C# HDT mental model users coming from HDT will already have.
- Diff is cheap (Map<cardId, count> equality).
- A schema with a `deck_versions` table that owns `(deck_id, version, card_list_hash, created_at)` plus a `deck_cards` table keyed on `(deck_id, version, card_id, count)` lets matches keep referring to historical versions even after the user edits.

**Edge cases:** Renaming, retagging, or note-edits do **not** create a new version. They `UPDATE decks` in place.

### D4. Live-deck integration: snapshot, not sync

**Context:** `getDecks` from the live bridge already gives us decks the user actively plays. We could two-way-sync, one-way-sync, or just snapshot on demand.

**Options:**

- A. Two-way sync (we'd have to write back to HS — impossible/banned).
- B. Continuous one-way sync (every poll, mirror the live list).
- C. User-initiated snapshot only.

**Choice:** **C**.

**Rationale:** auto-mirroring would flood the user's saved-deck list with throwaway in-game decks. A "Save this deck" button on the live tracker UI gives the user explicit control. The live `getDecks` flow remains the source of truth for *currently tracking* a match; saved decks are the source of truth for *user-curated* decks.

**Bridging:** `DeckSelectDialog` shows saved decks first (pinned), then any unsaved live decks below as "Detected in game". When the user picks an unsaved live deck, the tracker still works (matches reference an opaque live-deck id). When they pick a saved deck, matches reference `deckId@version`.

### D5. Validity: advisory checker, never blocks save

**Context:** HDT lets users save partial decks (16/30 cards) while brewing. Forcing 30-card legality at save time would be hostile to the brewing flow.

**Choice:** Save accepts any deck shape. The validity checker (`validateDeck(deck): { ok: boolean; issues: ValidityIssue[] }`) is rendered as an advisory panel in the editor. Export to a deckstring **does** require legal (the deckstring format itself doesn't tolerate illegal decks well — Blizzard would reject it on import). Live tracking via `getDecks` continues unaffected.

**Class restriction nuance:** Death Knight's rune system is out-of-scope for this change — we only check (cost ≥ 0, has class match or `NEUTRAL`, no Hero card in main deck, ≤ 1 of each Legendary, ≤ 2 of each non-Legendary, ≤ 30 total). Rune restrictions land in a follow-up.

### D6. IPC shape: `window.hdt.decks.*`, request/response only

**Context:** Existing `window.hdt.cards.*` and `window.hdt.matchHistory.*` are pure RPC. `window.hdt.deckTracker.*` adds a push channel for live updates because match state is event-driven. Saved-deck mutations are user-driven (no real-time stream).

**Choice:** Plain RPC `invoke`-style for all deck operations. The renderer's `useDecks` Zustand store is responsible for refetching after mutations. No `webContents.send`-style push channel.

**Surface:**

```ts
window.hdt.decks = {
  list(): Promise<DeckSummary[]>,
  getById(id: string): Promise<DeckDetail | null>,
  create(input: CreateDeckInput): Promise<DeckDetail>,
  update(id: string, patch: UpdateDeckPatch): Promise<DeckDetail>,
  duplicate(id: string): Promise<DeckDetail>,
  delete(id: string): Promise<void>,
  importDeckstring(text: string): Promise<DeckDetail>,
  importJson(text: string): Promise<DeckDetail>,
  exportDeckstring(id: string): Promise<string>,
  exportJson(id: string): Promise<string>,
  saveFromLive(liveDeckId: string): Promise<DeckDetail>,
  // Pinning / sort order
  setSortIndex(id: string, sortIndex: number): Promise<void>,
}
```

### D7. Renderer surface: keep current `Decklist.tsx` route, modal-based editor

**Context:** Sidebar already has a "Tracker" tab pointing at `Decklist.tsx`, and the `DeckSelectDialog` modal is established UX.

**Options:**

- A. Add new top-level routes `/decks` and `/decks/:id/edit`.
- B. Repurpose `Decklist.tsx` into a saved-decks list, keep editor as a Radix Dialog.
- C. Inline-edit the current selected deck.

**Choice:** **B**. Reuses sidebar nav, keeps the dialog vocabulary the codebase already speaks (`DeckSelectDialog`, `CardImagePopover` use Radix). New top-level routes would force breaking changes to existing navigation.

### D8. Tests: TDD per `add-match-recordings` precedent

Each task in `tasks.md` follows the red→green→commit rhythm: failing Vitest test → minimal implementation → green → conventional commit. Domain tests in `@hdt/core` use no electron/sqlite imports. Store tests inject a temp directory via the same constructor-injection trick `match-history-store.ts` uses.

## Risks / Trade-offs

- **[Risk] `decks.db` corruption stranded from the rest.** → SQLite WAL + a `pragma integrity_check` at boot; if it fails, rename to `decks.corrupt-<ts>.db` and start fresh, surfacing a notification. Match-history isolation (D2) means a fresh `decks.db` does not lose match data.
- **[Risk] Live-deck → saved-deck snapshot carries deckstring-illegal cards** (e.g., generated entities the live bridge surfaced). → snapshot path filters to `card.collectible === true` and refuses to snapshot otherwise; user gets an explanatory toast.
- **[Risk] Renderer cache drift** between `useDecks` store and the SQLite truth after multi-window edits. → the renderer is single-window today (no overlay window persistence yet), and IPC mutations always re-emit the canonical row, so the store rehydrates from the response. If a future overlay window also writes decks, we add a `decks-changed` push channel then — not now.
- **[Risk] Bumping versions for trivial card-list-equivalent edits** (e.g., import the same deckstring twice). → diff is computed on a normalized `Map<cardId, count>` (sorted, no insertion-order dependence). Identity import is a no-op.
- **[Risk] i18n coverage gaps** for the new editor strings. → new strings land in `resources/locales/{enUS,zhCN}.json` in the same task as the component using them; a smoke test in `App.i18n.test.tsx` asserts both locales render the editor.
- **[Trade-off] Soft FKs across two SQLite files** mean `match-history-store` and `deck-store` need to coordinate at the JS level, not the SQL level. → acceptable; we already do this for non-deck dimensions and the join volume is small (matches × decks).
- **[Trade-off] Validity is advisory.** → we'll see "deckstring export refused: deck has 16/30 cards" errors in Sentry-equivalent telemetry. Acceptable until the editor adds a "fix deck" CTA.

## Migration Plan

- No existing user data lives in `decks.db` (file does not exist). On first boot post-deploy, the store creates the file with `schema_version = 1`.
- Future schema bumps land via a `migrations/<n>__description.sql` directory pattern (mirror `match-history-store.ts`'s convention if/when it adopts one — today both stores can stay simple).
- Rollback: deleting `decks.db` from userData reverts the user to no-saved-decks state. Live tracking is unaffected.

## Open Questions

- **Deck cover art**: should saved decks store a chosen "cover card" image to render in the list? Default to the highest-cost legendary, or let the user pick? → Default to "first legendary by cost descending, fall back to most-expensive card"; user can override later. Defer the override UI to a follow-up.
- **Import error recovery**: if a deckstring decodes but contains a card no longer in `Cards.json` (Wild rotation drop, e.g.), do we fail import or save with placeholders? → Fail import with a specific error message (`UnknownCardError`); the user can manually fix.
- **Sort order**: alphabetical, by class, by recency, or user-pinned? → user-pinned `sortIndex` int per deck; default sort key is `(class, name)` for unpinned. Pinning UI defers to a follow-up.

## Final directory tree (touched files only)

```
packages/core/src/
├── deck/
│   ├── deck-types.ts             # Deck, DeckCard, DeckVersion, ValidityIssue, ...
│   ├── deck-types.test.ts
│   ├── validity.ts               # validateDeck()
│   ├── validity.test.ts
│   ├── deck-diff.ts              # canonicalCardListHash(), areCardListsEqual()
│   ├── deck-diff.test.ts
│   ├── import-export.ts          # toDeckstring/fromDeckstring/toJson/fromJson
│   ├── import-export.test.ts
│   └── index.ts
└── index.ts                      # re-export `deck/`

apps/desktop/src/main/
├── deck-store.ts                 # SQLite-backed store, root-dir constructor inject
├── deck-store.test.ts
├── deck-ipc.ts                   # registerDeckIpc(ipcMain, store)
└── deck-ipc.test.ts

apps/desktop/src/preload/
└── index.ts                      # adds `window.hdt.decks` bridge

apps/desktop/src/renderer/src/
├── stores/
│   └── decks-store.ts            # Zustand
├── hooks/
│   └── use-decks.ts
├── components/
│   ├── Decklist.tsx              # MOD: drives saved-decks list
│   ├── DeckSelectDialog.tsx      # MOD: prefer saved decks
│   ├── DeckEditor.tsx            # NEW
│   ├── DeckImportDialog.tsx      # NEW
│   ├── DeckExportDialog.tsx      # NEW
│   └── (tests/*.tsx)
└── env.d.ts                      # MOD: type window.hdt.decks

resources/locales/
├── enUS.json                     # MOD: decks.* keys
└── zhCN.json                     # MOD: decks.* keys
```
