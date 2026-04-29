# Implementation Tasks

## 1. Appearance Store Extension

- [x] 1.1 Add failing tests in `apps/desktop/src/renderer/tests/appearance-store.test.ts` for: (a) default `gameOverlay === false`; (b) round-trip after `setGameOverlay(true)`; (c) legacy payload without `gameOverlay` parses cleanly; (d) `setGameOverlay(true)` invokes `window.hdt.overlay.setEnabled(true)` (mock `window.hdt.overlay`). Run; expect failure.
- [x] 1.2 Modify `apps/desktop/src/renderer/src/stores/appearance-store.ts`:
  - Add `gameOverlay: boolean` to the state and to `readStored()` / `writeStored()`.
  - Add `setGameOverlay(next: boolean)` that persists and fires `window.hdt?.overlay?.setEnabled?.(next)` (optional-chained so unit tests without the bridge don't crash).
- [x] 1.3 Run `pnpm --filter @hdt/desktop typecheck` and the appearance store tests; expect green.
- [x] 1.4 Commit with message `feat(desktop): add gameOverlay preference to appearance store`.

## 2. OverlayManager (main process)

- [x] 2.1 Add failing tests in `apps/desktop/src/main/overlay-window.test.ts` covering:
  - (a) `enable()` creates a window with the prescribed options (mock `BrowserWindow` constructor; assert constructor args include `transparent: true`, `frame: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `focusable: false`, `show: false`);
  - (b) the loaded URL or file path includes `#/overlay`;
  - (c) `setRunning(true)` after `enable()` calls `show()` on the window;
  - (d) `setRunning(false)` after 3 consecutive false polls hides the window (use a fake timer-driven poller fed by a controllable mock for `hearthmirror.isAlive`);
  - (e) a single `false` poll followed by `true` does NOT hide;
  - (f) a thrown `isAlive()` is treated as `false`;
  - (g) `disable()` hides without destroying;
  - (h) `dispose()` destroys.
  Use the same `vi.hoisted` + `vi.mock('electron', …)` pattern as `deck-ipc.test.ts`. Run; expect failure.
- [x] 2.2 Create `apps/desktop/src/main/overlay-window.ts` exporting `class OverlayManager` with the public API from the spec. Constructor takes `{ rendererUrl, preloadPath, isAlive: () => Promise<boolean> }` so the test can inject a fake `isAlive`. Internal state: `userEnabled`, `gameRunning`, `falseStreak` (for the throttle), and a `setInterval` handle.
- [x] 2.3 Run the OverlayManager tests; expect pass.
- [x] 2.4 Commit with message `feat(desktop): add OverlayManager for transparent in-game window`.

## 3. Main Process Wiring

- [x] 3.1 Update `apps/desktop/src/main/index.ts` to instantiate `OverlayManager` after `whenReady()`. Resolve renderer URL the same way `createMainWindow` does; pass the same `preload` path. Hook `app.on('before-quit', () => overlayManager.dispose())`.
- [x] 3.2 Register the IPC handler `overlay:set-enabled` in `apps/desktop/src/main/ipc.ts` (or in `overlay-window.ts` via a `registerOverlayIpc(manager)` helper called from `ipc.ts`). Handler calls `manager.enable()` / `manager.disable()`.
- [x] 3.3 Add `overlay.setEnabled` to `apps/desktop/src/preload/index.ts` and to the renderer-side `window.hdt` typings. Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 3.4 Commit with message `feat(desktop): wire overlay window IPC + main bootstrap`.

## 4. Boot-Time Re-fire

- [x] 4.1 Add failing test in `apps/desktop/src/renderer/tests/appearance-apply.test.tsx` (or a new test file): mounting `AppearanceApplyEffect` with a stored `gameOverlay: true` MUST call `window.hdt.overlay.setEnabled(true)` exactly once on mount. Run; expect failure.
- [x] 4.2 Update `AppearanceApplyEffect.tsx` so its mount-time effect also reads `gameOverlay` from the store and fires `window.hdt?.overlay?.setEnabled?.(gameOverlay)`. Subsequent toggles already fire from `setGameOverlay`; this only handles the boot path.
- [x] 4.3 Run the appearance-apply tests; expect pass.
- [x] 4.4 Commit with message `feat(desktop): re-fire overlay enabled on app boot`.

## 5. Settings Overlay Panel

- [ ] 5.1 Add failing tests in `apps/desktop/src/renderer/tests/Settings.overlay.test.tsx` covering: (a) opening the Overlay category shows a row with `settings.overlay.enableTitle`; (b) the "Section Under Construction" placeholder is gone from the Overlay panel; (c) clicking the toggle flips `useAppearanceStore.getState().gameOverlay` and invokes the IPC mock; (d) the toggle reflects the current store state on render; (e) zh-CN locale renders Chinese labels.
- [ ] 5.2 Modify `apps/desktop/src/renderer/src/components/Settings.tsx`:
  - Replace the Overlay branch (currently caught by the catch-all `['overlay', 'notifications', 'data', 'audio'].includes(activeCategory)` block) with a dedicated branch.
  - Render one `settings-row` styled toggle row using the same toggle pattern as the existing General toggles (autoStart etc.).
  - The "Section Under Construction" catch-all stays for `['notifications', 'data', 'audio']` only.
- [ ] 5.3 Run the regression token grep test (`tests/theme-tokens-grep.test.ts`); expect pass.
- [ ] 5.4 Commit with message `feat(desktop): add Overlay toggle to Settings`.

## 6. i18n Strings

- [x] 6.1 Add new keys under `settings.overlay.*` in `resources/locales/en-US.json`: `enableTitle` ("Show in-game overlay"), `enableDescription` ("Display the deck tracker as a transparent always-on-top window during a Hearthstone match."), `runningHint` ("Active only while Hearthstone is running"). JSON parse check.
- [x] 6.2 Mirror with translated values in `resources/locales/zh-CN.json`. JSON parse check.
- [x] 6.3 Commit with message `feat(i18n): add overlay-window settings strings`.

## 7. Final Validation and Archive

- [ ] 7.1 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [ ] 7.2 Run the full renderer + main test suite (excluding the pre-existing sqlite-ABI failures); expect green.
- [ ] 7.3 Run `npx openspec validate add-opponent-overlay-window --strict`; expect "Change … is valid".
- [ ] 7.4 Manual smoke (Hearthstone running): launch `pnpm dev`, open Settings → Overlay, toggle on; the transparent overlay window should appear above Hearthstone with the same layout as the `#/overlay` route inside the main window. Toggle off; the overlay window hides.
- [ ] 7.5 Manual smoke (Hearthstone not running): toggle on with HS closed; overlay window does NOT appear. Launch HS; within ~3 s the overlay appears. Close HS; within ~9 s the overlay hides (the throttle suppresses single-tick mirror jitter).
- [ ] 7.6 Run `git status` to confirm only in-scope files changed.
- [ ] 7.7 Archive change via `/opsx:archive add-opponent-overlay-window`.
