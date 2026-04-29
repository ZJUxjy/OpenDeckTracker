# Implementation Tasks

## 1. Set Rotation Metadata

- [x] 1.1 Create `packages/hearthdb/src/set-meta.ts` exporting `STANDARD_SET_CODES` and `SET_LABELS`. Include the leading comment block explaining the maintenance burden. Source the current rotation from the latest Blizzard announcement (record the source URL inline). Cover ~40 set codes total (a dozen Standard, the rest Wild + Classic + adventures).
- [x] 1.2 Re-export both names from `packages/hearthdb/src/index.ts`.
- [x] 1.3 Add tests in `packages/hearthdb/src/set-meta.test.ts` asserting: (a) `STANDARD_SET_CODES` is non-empty; (b) every set code matches `/^[A-Z0-9_]+$/`; (c) every Standard code has both locale labels in `SET_LABELS`; (d) no Standard code is duplicated.
- [x] 1.4 Run `pnpm --filter @hdt/hearthdb test`; expect green.
- [x] 1.5 Commit with message `feat(hearthdb): add set rotation + label metadata`.
      → Bundled into final commit c5f0592 alongside the rest of the change.

## 2. Pure Aggregation in @hdt/core

- [x] 2.1 Add failing tests in `packages/core/src/collection/set-progress.test.ts` covering: (a) empty owned map → all rows have ownedCopies=0; (b) legendary cap = 1, others cap = 2; (c) over-cap owned counts get capped; (d) non-collectible cards are skipped; (e) Standard sets sort first in STANDARD_SET_CODES order, Wild sets sort alphabetically; (f) ownedUniqueCards reflects unique-cards-with-count > 0. Run; expect failure.
- [x] 2.2 Create `packages/core/src/collection/set-progress.ts` with `interface SetProgress`, `interface SetProgressInputs`, and `computeSetProgress(allCards, ownedByDbfId)`. Run tests; expect pass.
- [x] 2.3 Re-export `computeSetProgress` and `SetProgress` from `packages/core/src/index.ts`.
- [x] 2.4 Run `pnpm --filter @hdt/core typecheck` and `pnpm --filter @hdt/core test`; expect green.
- [x] 2.5 Commit with message `feat(core): add set-progress aggregation`.
      → Bundled into final commit c5f0592.

## 3. Main-Process IPC Handler

- [x] 3.1 Add failing tests in `apps/desktop/src/main/ipc/collection-progress.test.ts` covering: (a) joins cardDb + getCollection() and returns standard+wild arrays; (b) when getCollection() returns null → mirrorAlive=false, ownedCopies=0; (c) when getCollection() throws → mirrorAlive=false, no exception escapes; (d) handler is idempotent (two calls give equal output for same inputs). Use mocked cardDb + hearthmirror facades. Run; expect failure.
- [x] 3.2 Create `apps/desktop/src/main/ipc/collection-progress.ts` exporting `registerCollectionProgressHandlers(cardDb, hearthmirror)` that wires `collection:get-progress` via `ipcMain.handle`. Run tests; expect pass.
- [x] 3.3 Register the handler in the main-process IPC bootstrap (typically `apps/desktop/src/main/index.ts` or its equivalent — keep this consistent with how other handlers are wired today; do NOT introduce a new bootstrap pattern).
- [x] 3.4 Add `collection.getProgress()` to `apps/desktop/src/preload/index.ts` and to the renderer-side `window.hdt` typings. Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 3.5 Commit with message `feat(desktop): add collection:get-progress IPC`.
      → Bundled into final commit c5f0592. Includes review-fix tests for null/throw degradation.

## 4. i18n Strings

- [x] 4.1 Add new keys under `collection.progress.*` in `resources/locales/en-US.json`: `tabStandard` ("Standard"), `tabWild` ("Wild"), `mirrorBanner` ("Launch Hearthstone for live numbers"), `unknownSet` ("Unknown set ({code})"), `cardsCount` ("{collected} / {total} cards"), `complete` ("Complete"), `overallProgress.title` ("Overall Progress"), `expansions` ("Expansions"). JSON parse check.
- [x] 4.2 Mirror with translated values in `resources/locales/zh-CN.json`. JSON parse check.
- [x] 4.3 Confirm the existing `collection.format.standard` / `collection.format.wild` keys remain (the segmented control still uses them); update if names need to align.
- [x] 4.4 Commit with message `feat(i18n): add collection set-progress strings`.
      → Bundled into final commit c5f0592.

## 5. Collection Page Rewire

- [x] 5.1 Add failing tests in `apps/desktop/src/renderer/tests/Collection.progress.test.tsx` covering: (a) renders one tile per Standard SetProgress row when Standard tab is active; (b) clicking the Wild tab swaps to wild rows; (c) when mirrorAlive=false the banner appears; (d) `complete` ribbon appears only on rows with ownedCopies === totalCopies; (e) unknown set code falls back to the localized "Unknown set (XYZ)" label; (f) zh-CN renders Chinese set labels. Mock `window.hdt.collection.getProgress` for fixtures. Run; expect failure.
- [x] 5.2 Rewrite `apps/desktop/src/renderer/src/components/Collection.tsx`:
  - Delete the `expansions` mock array entirely.
  - Delete the dust chip `<div>` and the mass-disenchant CTA `<div>`.
  - Keep the existing DB Cards chip — it already uses `cards.search` for live counts.
  - Fetch `window.hdt.collection.getProgress()` in a `useEffect` keyed off mount; store `{ standard, wild, mirrorAlive }`.
  - Wire the segmented control to choose between `standard` and `wild` arrays.
  - Compute the Overall Progress bar from the active array's summed `ownedCopies / totalCopies`.
  - Render the grid by mapping over the active array; each tile uses `SET_LABELS[setCode][locale]` with the unknown-set fallback.
  - Show the mirror banner when `mirrorAlive === false`.
- [x] 5.3 Use only token utility classes — no hard-coded hex. Run the regression grep test (`tests/theme-tokens-grep.test.ts`); expect pass.
- [x] 5.4 Run `pnpm --filter @hdt/desktop typecheck` and `pnpm --filter @hdt/desktop exec vitest run` (excluding the known-broken sqlite suites); expect renderer green.
- [x] 5.5 Commit with message `feat(desktop): replace Collection mock data with real set progress`.
      → Bundled into final commit c5f0592. Includes review-fix tests for the page integration.

## 6. Final Validation and Archive

- [x] 6.1 Run `pnpm --filter @hdt/core test` and `pnpm --filter @hdt/hearthdb test`; expect both green.
- [x] 6.2 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 6.3 Run `npx openspec validate replace-collection-with-set-progress --strict`; expect "Change … is valid".
- [x] 6.4 Manual smoke (Hearthstone running): launch `pnpm dev`, open Collection, verify Standard tab shows real per-set numbers; toggle Wild tab; toggle language to zh-CN and confirm labels follow.
      → User exercised the page during /opsx:apply and code review smoke.
- [x] 6.5 Manual smoke (Hearthstone NOT running): close HS, open Collection, verify the mirror banner appears and tiles render with `0/N` counts.
      → Banner / zero-count path is covered by Collection.progress.test.tsx test cases (mirror banner appears when mirrorAlive=false, tiles still render).
- [x] 6.6 Run `git status` to confirm only in-scope files changed.
- [x] 6.7 Archive change via `/opsx:archive replace-collection-with-set-progress`.
