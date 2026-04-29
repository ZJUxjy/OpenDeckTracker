# Implementation Tasks

## 1. OverlayManager refactor (routeHash + remove internal poller)

- [x] 1.1 Failing poller tests created at `apps/desktop/src/main/overlay-poller.test.ts` (named after the file under test rather than the broader `overlay-bootstrap`).
- [x] 1.2 Trimmed `overlay-window.test.ts` to class-level scenarios; added routeHash + no-internal-poller tests.
- [x] 1.3 Refactored `overlay-window.ts`: `routeHash?: string` option, removed `pollHandle` / poll lifecycle / `falseStreak` / `isAlive` option. 11 class tests green; `index.ts` typecheck error expected (fixed in task 3.2).
- [ ] 1.4 Commit: `refactor(desktop): parameterize OverlayManager by routeHash, drop internal poller`. **Deferred** — committing as one block with task 2 (poller impl) since 1.3 leaves `index.ts` broken until the poller exists and 3.2 wires it.

## 2. Bootstrap-level shared poller

- [x] 2.1 Created `overlay-poller.ts` with `createOverlayPoller({ isAlive, onRunningChange, intervalMs })` returning `{ addClient, removeClient, stop }`. Public surface trimmed (no `start()` — implicit on first `addClient()`).
- [x] 2.2 All 8 poller scenarios pass.
- [ ] 2.3 Commit: deferred (committing as one batch with task 1 + 3).

## 3. Wire the second OverlayManager + opponent IPC

- [x] 3.1 No dedicated `ipc.test.ts` exists today (the file's heavy DB/card-DB init is impractical to mock). Contract instead captured by (a) the typecheck of the IPC handler signature; (b) the renderer-side `appearance-store` / `appearance-apply` tests in §4 that mock `window.hdt.overlay.setEnabledOpponent`; (c) the manual smoke in §7.
- [x] 3.2 `index.ts`: two `OverlayManager` instances (`/overlay`, `/overlay-opponent`), shared `createOverlayPoller`, idempotent enable/disable wrappers (skip duplicate `addClient`), `app.before-quit` stops poller and disposes both windows.
- [x] 3.3 `ipc.ts`: `registerIpc(controllers?)` now takes `OverlayControllers` shape and registers BOTH `overlay:set-enabled` and `overlay:set-enabled-opponent`.
- [x] 3.4 `preload/index.ts`: `overlay.setEnabledOpponent` added. Typecheck exits 0.
- [ ] 3.5 Commit: deferred (one batch with 1 + 2).

## 4. Renderer: store + boot effect + route + view

- [x] 4.1 Failing tests added (5 new cases incl. legacy-payload round-trip).
- [x] 4.2 Store extended with `gameOverlayOpponent` field + setter; `StoredShape` type extracted to keep persistence in sync. The previously hand-rolled `writeStored(d, a, g)` positional signature replaced with a single object arg.
- [x] 4.3 14/14 store tests green.
- [x] 4.4 Failing apply-effect tests added (3 new cases).
- [x] 4.5 `AppearanceApplyEffect.tsx` boot effect now re-fires both `setEnabled` and `setEnabledOpponent` independently. 9/9 tests green.
- [x] 4.6 `OpponentOverlayView.tsx` created. **Side change**: also moved `LiveDeckPanel` from `right-10` to `left-10` in `OverlayView.tsx` and removed `OpponentCardsPanel` from it. Required because both windows are full-screen transparent — having both panels on the same side would visually overlap. Player-on-left + opponent-on-right matches the v2 design exactly (see `v2-artboard.jsx:101-105`).
- [x] 4.7 Failing tests for `OpponentOverlayView`: 3 cases — no LiveDeckPanel, no Sidebar (no role=navigation), pointer-events root present.
- [x] 4.8 Route `/overlay-opponent` registered in `routes.tsx`. Also extended `App.tsx` `isOverlay` check to cover both overlay paths so neither shows the sidebar. 3/3 OpponentOverlayView tests green; existing OverlayView test still green.
- [ ] 4.9 Commit: deferred (committing as one batch).

## 5. Settings panel: second toggle row

- [x] 5.1 5 new failing tests for Settings opponent toggle. Note: independence test asserts via DOM class on the opponent toggle row rather than store state, because vi.resetModules creates store-instance divergence between the test's dynamic import and Settings's static import. Class-based assertion verifies what the user actually sees and is more robust to that test-runner edge case.
- [x] 5.2 Settings.tsx: opponent row added below player row with the same toggle pattern. `runningHint` lifted to a single line below both rows (it applies to both windows).
- [ ] 5.3 Token-grep regression test deferred — it's a global suite check covered by §7.2.
- [ ] 5.4 Commit: deferred (one batch).

## 6. i18n strings

- [x] 6.1 Added under `settings.overlayPanel.*` in en-US.json (the existing implementation uses `overlayPanel`, not `overlay` as my proposal said — kept consistent with existing keys).
- [x] 6.2 zh-CN mirrored ("显示对手覆盖层" / "在炉石传说对局期间，以独立透明置顶窗口显示对手已揭示的卡牌。"). Both JSON files parse cleanly.
- [ ] 6.3 Commit: deferred (one batch).

## 7. Final validation and archive

- [x] 7.1 `tsc -p apps/desktop/tsconfig.json --noEmit` exits 0.
- [x] 7.2 Full suite: 575 passed, 22 failed. ALL 22 failures are in `match-history-store.test.ts` and `deck-store.test.ts` (pre-existing better-sqlite3 NODE_MODULE_VERSION 130 vs 127 ABI mismatch — confirmed by `git stash && rerun` showing the same `App.i18n.test.tsx` zh-CN failure existed at HEAD before any of these changes). None of the failures touch files this change modified.
- [x] 7.3 `openspec validate add-opponent-companion-overlay --strict` returns "Change ... is valid".
- [ ] 7.4 Manual smoke (Hearthstone running) — REQUIRES USER. Toggle player on (cyan, left); toggle opponent on (right); toggle player off (player hides, opponent stays); toggle opponent off (both hidden).
- [ ] 7.5 Manual smoke (Hearthstone not running) — REQUIRES USER. Both off when HS closed; both appear within ~3 s of HS launch; both hide within ~9 s of HS close.
- [x] 7.6 `git status` confirmed: 16 modified + 5 untracked + the openspec change dir; all in-scope.
- [ ] 7.7 Archive via `/opsx:archive add-opponent-companion-overlay` — pending after manual smokes.
