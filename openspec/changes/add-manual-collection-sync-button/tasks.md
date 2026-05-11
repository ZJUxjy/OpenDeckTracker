## 1. i18n keys

- [x] 1.1 Add the following keys to `resources/locales/en-US.json` and `resources/locales/zh-CN.json` under the existing `collection` object:
  - `collection.sync.button.idle` (`Sync` / `同步`)
  - `collection.sync.button.syncing` (`Syncing…` / `正在同步…`)
  - `collection.sync.button.success` (`Synced` / `已同步`)
  - `collection.sync.button.error` (`Sync failed` / `同步失败`)
  - `collection.sync.button.ariaLabel.idle` (`Sync collection now` / `立即同步收藏`)
  - `collection.sync.button.ariaLabel.syncing` (`Syncing collection` / `正在同步收藏`)
- [x] 1.2 Commit i18n additions with `git add resources/locales/en-US.json resources/locales/zh-CN.json && git commit -m "i18n(collection): add manual sync button strings"`; expected output includes a new commit hash.

## 2. CollectionSyncButton component

- [x] 2.1 Create `apps/desktop/src/renderer/tests/CollectionSyncButton.test.tsx` with tests:
  - `renders idle label and is enabled by default`
  - `shows syncing label and is disabled when state is syncing`
  - `shows success label when state is success`
  - `shows error label when state is error`
  - `clicking idle button invokes onClick handler`
  - `clicking syncing button is a no-op`
  Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/CollectionSyncButton.test.tsx` and expect failures (component does not exist).
- [x] 2.2 Create `apps/desktop/src/renderer/src/components/CollectionSyncButton.tsx` exporting a controlled `CollectionSyncButton` component with prop signature `{ state: 'idle' | 'syncing' | 'success' | 'error', onClick: () => void }`. Render the lucide icon (`RefreshCw` / `Loader2` / `Check` / `AlertTriangle`) + the localized label per state. Disable the button when `state === 'syncing'`. Rerun 2.1 and expect all six tests to pass.
- [x] 2.3 Commit with `git add apps/desktop/src/renderer/src/components/CollectionSyncButton.tsx apps/desktop/src/renderer/tests/CollectionSyncButton.test.tsx && git commit -m "feat(renderer): add CollectionSyncButton component"`; expected output includes a new commit hash.

## 3. Collection.tsx refactor and wiring

- [x] 3.1 Refactor `apps/desktop/src/renderer/src/components/Collection.tsx` to extract the `getProgress` fetch logic and the `hearthmirror.getCollection` fetch logic into `useCallback` functions named `loadProgress` and `loadOwnedByDbfId`. Both existing mount-time `useEffect`s MUST still call them once on mount with the existing retry/cancel semantics preserved. Run `pnpm --filter @hdt/desktop typecheck` and expect exit 0.
- [x] 3.2 In `Collection.tsx`, add a `syncState: 'idle' | 'syncing' | 'success' | 'error'` state, a `handleSyncClick` callback that runs `Promise.allSettled([decks.syncFromLive(), loadProgress(), loadOwnedByDbfId()])` and transitions `syncState` per the spec rules in "Manual collection sync button", and the auto-revert timers (≤ 2500 ms for `success`, ≤ 3500 ms for `error`). Render `<CollectionSyncButton state={syncState} onClick={handleSyncClick} />` immediately left of the existing DB-cards stat chip in the header. Run `pnpm --filter @hdt/desktop typecheck` and expect exit 0.
- [x] 3.3 In `apps/desktop/src/renderer/tests/Collection.progress.test.tsx`, add tests:
  - `clicking the sync button calls decks.syncFromLive, collection.getProgress, and hearthmirror.getCollection in parallel`
  - `sync button shows success label when getProgress resolves`
  - `sync button shows error label when getProgress rejects`
  - `progress tiles re-render after a successful manual sync`
  Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/Collection.progress.test.tsx -t "sync button|manual sync"` and expect all four to pass.
- [x] 3.4 Commit with `git add apps/desktop/src/renderer/src/components/Collection.tsx apps/desktop/src/renderer/tests/Collection.progress.test.tsx && git commit -m "feat(renderer): wire manual sync button to refresh collection and decks"`; expected output includes a new commit hash.

## 4. Final verification

- [x] 4.1 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 4.2 Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/CollectionSyncButton.test.tsx src/renderer/tests/Collection.progress.test.tsx src/renderer/tests/SetTile.test.tsx src/renderer/tests/CollectionSetDetail.test.tsx src/renderer/tests/CollectionCardCell.test.tsx`; expect exit 0.
- [x] 4.3 Run `openspec status --change add-manual-collection-sync-button`; expected output shows all artifacts complete.
- [x] 4.4 Commit any final test-only fixes with `git commit -m "test(renderer): cover manual collection sync button"` if files changed; expected output includes a new commit hash or `nothing to commit` if no final changes were needed.
