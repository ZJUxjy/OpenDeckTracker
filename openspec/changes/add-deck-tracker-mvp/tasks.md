## 1. M1 baseline — TS facade + .node + IPC schema sync

> Prerequisite for everything in M2. The current TS facade is broken
> against the Rust schema we shipped in
> `add-hearthmirror-decks-and-in-match-readers` (R-17 + Phase 7).
> Cannot consume new reflectors from JS until this is rebuilt.

### 1.1 Rebuild native addon

- [x] 1.1.1 Run `pnpm --filter @hdt/hearthmirror-native build` (= `napi build --release`)
      to produce a fresh `hearthmirror-native.win32-x64-msvc.node` containing
      all 19 NAPI methods
- [x] 1.1.2 Run a smoke test: `node -e "console.log(Object.keys(require('./hearthmirror-native.win32-x64-msvc.node')))"`
      from `packages/hearthmirror/native/`; expect to see all 19 methods
      including `getEditedDeck`, `isMulligan`, `getBoardState`,
      `getHandState`, `getDeckState`, `getOpponentSecrets`, `getChoices`
- [x] 1.1.3 Inspect the auto-generated `index.d.ts` for type accuracy
      (in particular check `MatchPlayer.side`, `Deck.cardId` string,
      `MedalInfoData.streak/bestStarLevel`)
- [ ] 1.1.4 Commit `chore(hearthmirror-native): rebuild .node + index.d.ts for Phase 7 reflectors` (deferred — bundle with 1.3.9)

### 1.2 TS facade schema realignment (`packages/hearthmirror`)

- [x] 1.2.1 Update `src/types.ts` (renamed `Card → CollectionCard / DeckCard` for clarity)
- [x] 1.2.2 Update `src/hearthmirror.ts` (12 methods, 7 new + 5 reshaped)
- [x] 1.2.3 Update `src/index.ts` exports (added 14 new types; renamed enum exports `GameType→GameTypeEnum / FormatType→FormatTypeEnum` to avoid clash with new composite `GameType` result type)
- [x] 1.2.4 `pnpm --filter @hdt/hearthmirror typecheck` passes
- [x] 1.2.5 Update `src/hearthmirror.test.ts` to cover the new methods (29 tests, all green)
- [x] 1.2.6 `pnpm --filter @hdt/hearthmirror test` passes (29/29)

### 1.3 Electron main + preload IPC sync (`apps/desktop`)

- [x] 1.3.1 In `src/main/ipc.ts` add 7 new IPC handlers
- [x] 1.3.2 In `src/main/ipc.ts` update the `getGameType` handler signature
- [x] 1.3.3 In `src/preload/index.ts` import the 7 new types and expose 7 new wrapper functions
- [x] 1.3.4 In `src/preload/index.ts` realign existing typed Promises to the new shapes
- [x] 1.3.5 Renderer tests (11 passing — `use-hearthmirror-status.test.ts` still consumes only `BattleTag`/`isAlive` shapes which didn't change; no edits needed)
- [x] 1.3.6 `pnpm --filter @hdt/desktop typecheck` passes
- [x] 1.3.7 `pnpm --filter @hdt/desktop test` passes (11/11)
- [ ] 1.3.8 Manual smoke: `pnpm --filter @hdt/desktop dev` (deferred — covered by Section 7 live validation)
- [ ] 1.3.9 Commit (deferred — bundle with `feat(core): deck-tracker domain model` after Section 4)

## 2. M2.1 Deck-identifier spike — find the in-game "selected play deck" Mono field

- [x] 2.1 `CollectionManager` field dump — no `m_lastSelected*` / `m_selectedDeck` / `m_currentDeckId`; only `m_EditedDeck` (already used by `getEditedDeck`)
- [x] 2.2 N/A — no usable candidate on `CollectionManager`
- [x] 2.3 `DeckPickerTrayDisplay` field dump found `s_instance` (+0x0020 STATIC) + `m_selectedCustomDeckBox` (+0x0230) + `m_visualsFormatType`. Confirmed against upstream `HearthMirror.decompiled.cs:2549` (`InternalGetDeckPickerState`)
- [x] 2.4 N/A — `DeckPickerTrayDisplay` is the answer; Practice/Adventure modes legitimately don't load this scene → dialog fallback per design D5
- [x] 2.5 `docs/spikes/0004-selected-deck-field.md` written (chain + lifecycle constraints + per-mode validity table)
- [x] 2.6 Rust reflector `getSelectedDeckId` added (`src/reflection/selected_deck.rs`); returns `{ deckId: i64, templateDeckId: i32, formatType: i32 } | null`
- [x] 2.7 TS facade `HearthMirror.getSelectedDeckId()` + `SelectedDeck` type + IPC handler + preload binding all wired
- [ ] 2.8 Live-validate: pending — `s_instance` is NULL outside the Play screen (verified). Need to test on Play screen with a deck highlighted; merged into Section 7 live validation
- [ ] 2.9 Commit (deferred — bundle with Section 7 validation result commit)

## 3. M2.2 — `@hdt/core` package scaffold + domain model

### 3.1 Package scaffold

- [x] 3.1.1 `mkdir -p packages/core/{src/game,src/tracker,tests}`
- [x] 3.1.2 Create `packages/core/package.json` (deps: `@hdt/hearthmirror` only — `@hdt/hearthdb` not needed for M2)
- [x] 3.1.3 Create `packages/core/tsconfig.json` extending base + `lib: [ES2022]` only (Node env, no DOM)
- [x] 3.1.4 Create `packages/core/vitest.config.ts`
- [x] 3.1.5 Create `packages/core/src/index.ts` empty placeholder
- [x] 3.1.6 `pnpm install` to wire the new workspace + add `@hdt/core` to `tsconfig.base.json` paths
- [x] 3.1.7 `pnpm --filter @hdt/core typecheck` and `... test` pass

### 3.2 Domain model — Game / Player / Entity

- [x] 3.2.1 `src/game/types.ts`: `MatchPhase` / `Zone` / `EntityInfo` + `zoneFromNumber` helper
- [x] 3.2.2 `src/game/entity.ts`: `Entity` class with zone-projection getters
- [x] 3.2.3 `src/game/player.ts`: `Player` class (delegates entities via `_bindEntities`)
- [x] 3.2.4 `src/game/game.ts`: `Game` class with `transitionTo` / `setPlayers` / `applyEntitySnapshot` / `reset`
- [x] 3.2.5 `src/game/deck-snapshot.ts`: `DeckSnapshot` class (multiset arithmetic)
- [x] 3.2.6 Unit tests `src/game/game.test.ts` covering Entity / Player / DeckSnapshot / Game (20 tests)
- [x] 3.2.7 `src/index.ts` re-exports the public API
- [x] 3.2.8 `pnpm --filter @hdt/core test` passes (28 total, exceeds target)

### 3.3 Algorithm — `computeRemaining`

- [x] 3.3.1 `src/tracker/remaining-algorithm.ts`: `computeRemaining` + `gatherSeenEntities`
- [x] 3.3.2 Standard fixtures (empty / mid-match / stolen / multiple copies)
- [x] 3.3.3 Edge cases (empty cardId / not-in-original / `info.created === true`)
- [x] 3.3.4 8 unit tests pass

## 4. M2.3 — `DeckTracker` orchestrator + polling loop

### 4.1 Polling loop

- [x] 4.1.1 `src/tracker/polling-loop.ts`: `PollingLoop` class with `start/stop/setInterval/requestImmediate`
- [x] 4.1.2 6 unit tests with vi.useFakeTimers (interval / immediate / stop / errors-don't-kill-loop / setInterval semantics)

### 4.2 Phase machine

- [x] 4.2.1 `src/tracker/phase-machine.ts`: pure `nextPhase(currentPhase, signals)` per design D4 + spectator forces IDLE
- [x] 4.2.2 11 unit tests covering all 4 source phases × edge cases (game-over / matchInfo-disappears / spectator)

### 4.3 IDeckIdentifier abstraction

- [x] 4.3.1 `IDeckIdentifier` interface + `IdentifiedDeck` result type
- [x] 4.3.2 `InGameDeckIdentifier` STUB (Section 2 spike pending — returns null)
- [x] 4.3.3 `CallbackDeckIdentifier` + bonus `ChainedDeckIdentifier` for the main-process composition
- [x] 4.3.4 6 unit tests covering all three implementations

### 4.4 DeckTracker class

- [x] 4.4.1 `src/tracker/deck-tracker.ts`: `DeckTracker` with start/stop/on/setOriginalDeck/getSnapshot
- [x] 4.4.2 Snapshot construction skips heavy reflectors in IDLE; never calls `getCollection`
- [x] 4.4.3 Match-start logic: identifier called on IDLE→IN_MATCH transition; emits `needs-deck-selection` if null
- [x] 4.4.4 Adaptive rate: hand-size delta triggers `requestImmediate`
- [x] 4.4.5 6 DeckTracker unit tests (idle / match-started / needs-deck / callback identifier wiring / errors / on-unsubscribe)
- [x] 4.4.6 `pnpm --filter @hdt/core test` — **57 tests pass** (target was 25-30)
- [x] 4.4.7 `pnpm --filter @hdt/core typecheck` clean
- [ ] 4.4.8 Commit (deferred — bundle with renderer commits)

## 5. M2.4 — Electron main-process tracker host

- [x] 5.1 `apps/desktop/src/main/deck-tracker.ts` (NEW): host wraps `DeckTracker` + `ChainedDeckIdentifier(InGame, Callback)`; broadcasts to all BrowserWindows; stops on `before-quit`
- [x] 5.2 `src/main/ipc.ts`: 3 IPC handlers (`get-snapshot`, `select-deck`, `cancel-selection`)
- [x] 5.3 `src/preload/index.ts`: `deckTracker.{getSnapshot, selectDeck, cancelSelection, onStateChange, onEvent}`
- [x] 5.4 `main/index.ts` calls `startDeckTracker()` after `registerIpc()`
- [x] 5.5 `pnpm --filter @hdt/desktop typecheck` clean
- [ ] 5.6 Manual smoke (deferred — covered by Section 7 live validation)
- [ ] 5.7 Commit (deferred — bundle with renderer commits)

## 6. M2.5 — Renderer Zustand store + LiveDeckPanel

### 6.1 Zustand store

- [x] 6.1.1 `stores/deck-tracker-store.ts`: Zustand store with `snapshot` + `pendingSelection` + `applyEvent` action
- [x] 6.1.2 `hooks/use-deck-tracker.ts`: hook subscribes to both IPC streams + initial getSnapshot pull
- [ ] 6.1.3 Hook-level test deferred (covered by Section 7 live smoke + the 11 existing renderer tests still pass)

### 6.2 LiveDeckPanel component

- [x] 6.2.1 `components/LiveDeckPanel.tsx` — empty/PRE/IN states, sorted card rows, just-drawn highlight, extras badge, footer with hand counts
- [x] 6.2.2 `hooks/use-card-def.ts` — module-level Map cache + in-flight de-dup
- [ ] 6.2.3 Component test deferred (covered by Section 7 live smoke)

### 6.3 DeckSelectDialog component

- [x] 6.3.1 `components/DeckSelectDialog.tsx` — global modal driven by `pendingSelection` store slice; uses `event.decks` payload (no extra IPC); persists last pick to `localStorage`; pre-selects on next open. Plain Tailwind dialog (no Radix dep added)
- [ ] 6.3.2 Component test deferred (covered by Section 7 live smoke)

### 6.4 Dashboard integration

- [x] 6.4.1 `useDeckTracker()` mounted in `App.tsx`; `<DeckSelectDialog />` rendered globally in `App.tsx`; `routes.tsx` `RightPanel` switches to `LiveDeckPanel` during PRE_MATCH/IN_MATCH else falls back to existing mock `DeckTracker`
- [ ] 6.4.2 dashboard.test.tsx update deferred (existing 11 tests still pass — no regression)

### 6.5 Build + smoke test

- [x] 6.5.1 `pnpm --filter @hdt/desktop typecheck` clean
- [x] 6.5.2 `pnpm --filter @hdt/desktop test` clean (11/11)
- [ ] 6.5.3 `pnpm --filter @hdt/desktop dev` boot smoke (deferred — covered by Section 7)
- [ ] 6.5.4 Commit (deferred — bundle with Section 4-6 commits)

## 7. M2.6 — Live end-to-end validation in real matches

- [ ] 7.1 Boot Hearthstone, log in, open Electron dev mode.
      Renderer Dashboard should show "等待对局开始..." (or English
      equivalent) and main-process console should log
      `phase=IDLE` polling at 2s
- [ ] 7.2 Pick a Standard ranked deck in-game and queue. Once matched:
      - Main console shows `match-started` event with `originalDeck`
        (deck name / 30-card list)
      - LiveDeckPanel renders 30 cards, all at full count
- [ ] 7.3 Mulligan: replace 2 cards. After mulligan completes:
      - Replaced cards should NOT be marked drawn (they go back to
        deck and get re-shuffled; entity ID changes)
      - Hand cards kept SHOULD show `remaining = total - 1`
- [ ] 7.4 Play turn 1: draw 1 card, play 1 card (or just draw).
      Within 500ms of the draw:
      - Drawn card row decrements its remaining count
      - Brief highlight animation visible
- [ ] 7.5 Play several more turns. Verify:
      - `remaining + seen` stays consistent with `originalDeck.total`
      - Played cards remain decremented (don't "come back")
- [ ] 7.6 Concede or finish the match. Verify:
      - `match-ended` event fires
      - Panel returns to empty state
      - Tracker drops back to IDLE polling
- [ ] 7.7 Run a Practice / Adventure match (no in-game deck-picker).
      Verify:
      - `match-started` fires with `originalDeck === null`
      - DeckSelectDialog appears
      - User picks a saved deck → panel populates
- [ ] 7.8 Document the live results in
      `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`
      (or new `docs/spikes/0005-deck-tracker-mvp-validation.md`)
      `## Run 12` section: timing, accuracy, observed limitations
      (created/stolen mismatches expected per M2 known limits)
- [ ] 7.9 Commit `docs(spike): record deck tracker MVP live validation`

## 8. M2.7 — OpenSpec validate + final wrap-up

- [x] 8.1 `npx openspec validate add-deck-tracker-mvp --strict` passes
- [ ] 8.2 Final smoke test in the running build (deferred — covered by Section 7)
- [x] 8.3 Final metrics: ~40 files touched, ~3 600 LoC added, +97 tests (29 new in @hdt/hearthmirror, 57 in @hdt/core, 11 unchanged in @hdt/desktop), 2 commits
- [x] 8.4 Commits landed: `fe0fafd docs(openspec)` + `b004386 feat(deck-tracker)`
- [ ] 8.5 (Optional) Archive (deferred — stack with in-flight others)
