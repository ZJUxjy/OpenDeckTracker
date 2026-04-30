# Implementation Tasks

## 1. Native crate: getHearthstoneWindow

- [x] 1.1 In `packages/hearthmirror/native/Cargo.toml` add the `Win32_UI_WindowsAndMessaging` feature to the `windows` crate's feature list. Run `cargo build --manifest-path packages/hearthmirror/native/Cargo.toml`; expect green.
- [x] 1.2 Create `packages/hearthmirror/native/src/window.rs` with a public `pub fn get_hearthstone_window() -> Option<HearthstoneWindow>` (free fn, not napi-rs binding) that calls `FindWindowW` for class `UnityWndClass` + window-name `Hearthstone`, then `GetWindowRect`, `IsIconic`, `IsWindowVisible`. Return `None` when `FindWindowW` returns null. Define `pub struct HearthstoneWindow { x, y, width, height, minimized, visible }` with `#[derive(Debug, Clone, Copy)]`. No napi types here yet — keep it pure Rust for unit testing.
- [x] 1.3 Register the `window` module in `packages/hearthmirror/native/src/lib.rs`.
- [x] 1.4 Add a napi-rs binding in the existing napi binding module (find where `isAlive` is exposed; add a sibling `getHearthstoneWindow` that wraps `window::get_hearthstone_window` and converts the option/struct into a napi-friendly `Option<HearthstoneWindow>` with a `#[napi(object)]` struct mirror).
- [x] 1.5 Run `pnpm --filter @hdt/hearthmirror-native build`; expect green. Run any existing rust unit tests; expect green.
- [x] 1.6 Commit: `feat(hearthmirror-native): add getHearthstoneWindow Win32 binding`.

## 2. TypeScript wrapper

- [x] 2.1 Add a failing test in `packages/hearthmirror/src/hearthmirror.test.ts` (or a new sibling file): `mirror.getHearthstoneWindow()` proxies to `native.getHearthstoneWindow`. Cover: (a) returns the native object verbatim when native returns one; (b) returns `null` when native returns `null`; (c) returns `null` when native throws (catch + null fallback); (d) the exported `HearthstoneWindow` type matches the documented shape. Run; expect failure.
- [x] 2.2 Modify `packages/hearthmirror/src/native.ts` to declare the `getHearthstoneWindow` native binding signature.
- [x] 2.3 Modify `packages/hearthmirror/src/hearthmirror.ts` to expose `async getHearthstoneWindow(): Promise<HearthstoneWindow | null>` on the `HearthMirror` class. Apply the same lazy-connect path as the other reflection methods. Catch native errors and resolve to `null`.
- [x] 2.4 Export `HearthstoneWindow` from `packages/hearthmirror/src/index.ts`.
- [x] 2.5 Run wrapper tests; expect green.
- [x] 2.6 Commit: `feat(hearthmirror): wrap getHearthstoneWindow in HearthMirror class`.

## 3. HearthstoneWindowTracker

- [x] 3.1 Add failing tests in `apps/desktop/src/main/hearthstone-window-tracker.test.ts` covering ALL scenarios from `specs/hearthstone-window-tracker/spec.md`: (a) dormant before first client; (b) starts on first addClient with immediate poll; (c) stops on last removeClient; (d) bounds-only-on-diff; (e) appearance emits bounds-then-visibility; (f) null result → visibility false; (g) brief jitter (4 false + 1 true within window) does NOT emit false; (h) sustained 5 false → emits one false; (i) thrown native call treated as null. Use `vi.useFakeTimers()` and an injected `getWindow: () => Promise<HearthstoneWindow | null>`. Run; expect failure.
- [x] 3.2 Create `apps/desktop/src/main/hearthstone-window-tracker.ts` exporting `createHearthstoneWindowTracker({ getWindow, intervalMs?, falseStreakThreshold? })` returning `{ addClient, removeClient, subscribe, stop }`. Internal state: `clientCount`, `pollHandle`, `falseStreak`, `lastBounds`, `lastVisible`, `subscribers`. Default `intervalMs = 200`, `falseStreakThreshold = 5`.
- [x] 3.3 Define exported types: `TrackerEvent = { kind: 'bounds'; bounds: BoundsRect } | { kind: 'visibility'; visible: boolean }` and `BoundsRect = { x, y, width, height }`.
- [x] 3.4 Run tracker tests; expect green.
- [x] 3.5 Commit: `feat(desktop): add HearthstoneWindowTracker (200ms poll + diff events)`.

## 4. Bootstrap rewire + delete overlay-poller

- [x] 4.1 Modify `apps/desktop/src/main/index.ts`: replace `createOverlayPoller(...)` with `createHearthstoneWindowTracker({ getWindow: () => getHearthMirror().getHearthstoneWindow() })`. Subscribe once and fan events out to BOTH managers: `bounds` events → `mgr.setBounds(rect)` for both; `visibility` events → `mgr.setVisibleOnScreen(visible)` for both. The idempotent `enablePlayer/disable...` wrappers stay; only the poller they ref-count changes.
- [x] 4.2 Delete `apps/desktop/src/main/overlay-poller.ts` and `apps/desktop/src/main/overlay-poller.test.ts`.
- [x] 4.3 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0. Run main-process tests; expect green.
- [x] 4.4 Commit: `refactor(desktop): replace createOverlayPoller with HearthstoneWindowTracker`.

## 5. OverlayManager: setBounds + setVisibleOnScreen

- [x] 5.1 Update existing `apps/desktop/src/main/overlay-window.test.ts`: rename `setRunning` scenarios to `setVisibleOnScreen` (verb only). Add new failing tests: (a) initial bounds in BrowserWindow constructor are `{ x: 0, y: 0, width: 1, height: 1 }` (not the work-area sizing); (b) `setBounds(rect)` before `enable()` is remembered and applied at create time; (c) `setBounds(rect)` after `enable()` calls `BrowserWindow.setBounds(rect)`; (d) `setBounds(rect)` with the same rect twice in a row only invokes the underlying call once; (e) `setVisibleOnScreen(true)` shows; (f) `setVisibleOnScreen(false)` hides; (g) `setRunning` is no longer on the prototype (TypeScript / runtime check). Run; expect failure.
- [x] 5.2 Modify `apps/desktop/src/main/overlay-window.ts`:
  - Drop the `screen.getPrimaryDisplay().workArea` read; constructor `BrowserWindow` opts hard-code `{ x: 0, y: 0, width: 1, height: 1 }`.
  - Add private fields `private pendingBounds: BoundsRect | null = null` and `private lastAppliedBounds: BoundsRect | null = null`.
  - Add `setBounds(rect: BoundsRect): void`: if no window exists yet, store in `pendingBounds`; if a window exists and `rect` differs from `lastAppliedBounds`, call `this.win.setBounds(rect)` and update `lastAppliedBounds`. Idempotent on repeated identical rects.
  - In `createWindow()`, after construction, if `pendingBounds !== null`, apply it.
  - Replace `setRunning(running: boolean)` with `setVisibleOnScreen(visible: boolean)`. Internal field rename: `gameRunning` → `visibleOnScreen`. Update `syncVisibility` to use the new field.
- [x] 5.3 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0 (callers in §4 already use the new method names). Run overlay-window tests; expect green.
- [x] 5.4 Commit: `feat(desktop): OverlayManager.setBounds + setVisibleOnScreen`.

## 6. IPC: hearthmirror:get-window

- [x] 6.1 Add a new IPC handler in `apps/desktop/src/main/ipc.ts`: `ipcMain.handle('hearthmirror:get-window', () => swallow('getHearthstoneWindow', () => hm().getHearthstoneWindow(), null))` — mirrors the existing `hearthmirror:isAlive` shape with the same `swallow` helper.
- [x] 6.2 Add `getWindow: (): Promise<HearthstoneWindow | null> => ipcRenderer.invoke('hearthmirror:get-window')` to `apps/desktop/src/preload/index.ts` under the `hearthmirror` namespace, alongside the existing reflection methods.
- [x] 6.3 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 6.4 Commit: `feat(desktop): expose hearthmirror:get-window IPC + preload binding`.

## 7. Final validation and archive

- [x] 7.1 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 7.2 Run the full renderer + main test suite (excluding pre-existing sqlite-ABI failures and the pre-existing `App.i18n.test.tsx` zh-CN failure documented in earlier changes); expect green. The renderer tests are unchanged by this work — no failures expected there.
- [x] 7.3 Run `npx openspec validate add-overlay-window-tracking --strict`; expect "Change ... is valid".
- [x] 7.4 Manual smoke (Hearthstone running on primary display, fullscreen-windowed mode): launch `pnpm dev`, enable both overlays in Settings. Confirm: (a) the player overlay appears on the LEFT of the HS window (not the display edge); (b) the opponent overlay appears on the RIGHT of the HS window; (c) moving the HS window with Win+arrow keys re-snaps the overlays within ~200 ms; (d) minimizing HS hides the overlays within ~1 s; (e) restoring HS shows them within 200 ms.
- [x] 7.5 Manual smoke (multi-display): drag HS to display 2. Confirm both overlays follow to display 2.
- [x] 7.6 Manual smoke (windowed mode): switch HS to "Windowed" mode (small window). Confirm the overlays size to the small HS window and stay anchored as the user drags HS around.
- [x] 7.7 Run `git status` to confirm only in-scope files changed.
- [x] 7.8 Archive change via `npx openspec archive add-overlay-window-tracking --yes`.
