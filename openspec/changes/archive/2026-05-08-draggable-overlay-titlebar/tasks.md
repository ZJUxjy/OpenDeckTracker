## 1. Renderer drag region declaration

- [x] 1.1 In `apps/desktop/src/renderer/src/components/TrackerPanelTabs.tsx`, add `style={{ WebkitAppRegion: 'drag' } as CSSProperties}` to the top tablist `<div role="tablist">` element. Import `CSSProperties` from `react` if not already imported.
- [x] 1.2 In the same file, add `style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}` to the inner `TabPill` `<button>` element so each tab pill stays clickable. The effects-count badge `<span>` inside the active tab pill SHALL also receive `style={{ WebkitAppRegion: 'no-drag' }}`.
- [x] 1.3 Run `pnpm --filter @hdt/desktop typecheck`; expected output: no TypeScript errors. Commit message: `feat(overlay): mark tracker tablist as window drag region`.

## 2. Main process — userOffset state and drag detection

- [x] 2.1 In `apps/desktop/src/main/overlay-window.ts`, add private fields `userOffset = { dx: 0, dy: 0 }`, `lastTrackerBounds: Rect | null = null`, and `isApplyingTrackerBounds = false` to `OverlayWindowManager`. Add a `Rect` type alias if one does not already exist (`{ x: number; y: number; width: number; height: number }`).
- [x] 2.2 In `createWindow()`, after `this.win = new BrowserWindow(...)` and the existing setup calls, attach `this.win.on('moved', () => { ... })`. Inside the handler: if `this.isApplyingTrackerBounds || this.lastTrackerBounds === null` return; else read `this.win.getBounds()` and compute `this.userOffset = { dx: cur.x - this.lastTrackerBounds.x, dy: cur.y - this.lastTrackerBounds.y }`.
- [x] 2.3 Add a unit test in `apps/desktop/src/main/overlay-window.test.ts`: "user-initiated moved event updates userOffset". Use the existing test scaffold; instantiate the manager, call `setBounds({ x: 100, y: 50, width: 320, height: 800 })`, simulate `BrowserWindow.getBounds()` returning `{ x: 140, y: 70, width: 320, height: 800 }`, fire the `moved` listener, assert `userOffset === { dx: 40, dy: 20 }`. Run `pnpm --filter @hdt/desktop test -- overlay-window.test.ts`; expected output: the new test passes alongside existing tests. Commit message: `feat(overlay): record user offset on window drag`.

## 3. Main process — compose tracker bounds with userOffset

- [x] 3.1 In `setBounds(bounds)` of `OverlayWindowManager`, refactor to: (a) store `this.lastTrackerBounds = { ...bounds }`; (b) compute `composed = { x: bounds.x + this.userOffset.dx, y: bounds.y + this.userOffset.dy, width: bounds.width, height: bounds.height }`; (c) clamp to display work-area via `screen.getDisplayMatching(composed).workArea` (import `screen` from `electron`); (d) keep the existing `lastAppliedBounds` equality short-circuit; (e) wrap the actual `this.win.setBounds(rect)` call with `this.isApplyingTrackerBounds = true; ...; queueMicrotask(() => { this.isApplyingTrackerBounds = false; });`. Same for the `pendingBounds` path inside `createWindow()`.
- [x] 3.2 Add unit test "setBounds composes userOffset onto tracker bounds": set `userOffset = { dx: 40, dy: 20 }` directly, call `setBounds({ x: 100, y: 50, width: 320, height: 800 })`, assert mock `setBounds` was called with `{ x: 140, y: 70, width: 320, height: 800 }`.
- [x] 3.3 Add unit test "composed bounds clamp to display work-area": stub `screen.getDisplayMatching` to return `workArea: { x: 0, y: 0, width: 1920, height: 1080 }`, set `userOffset = { dx: 100000, dy: 0 }`, call `setBounds({ x: 100, y: 50, width: 320, height: 800 })`, assert the applied rect's `x + width <= 1920`.
- [x] 3.4 Add unit test "programmatic setBounds does not update userOffset": set `userOffset = { dx: 0, dy: 0 }`, call `setBounds({ x: 200, y: 50, width: 320, height: 800 })`, simulate the resulting `moved` event firing while `isApplyingTrackerBounds` is true, assert `userOffset` remains `{ dx: 0, dy: 0 }`. Run `pnpm --filter @hdt/desktop test -- overlay-window.test.ts`; expected: all tests in the file pass. Commit message: `feat(overlay): compose user offset onto tracker bounds`.

- [x] 3.5 Add unit test "successive drags compose against lastTrackerBounds": establish `userOffset = { dx: 40, dy: 20 }` from a first drag, then call `setBounds({ x: 100, y: 50, ... })` (tracker tick), then simulate user drag to `{ x: 110, y: 45 }` ⇒ recompute `userOffset = { dx: 10, dy: -5 }`. Assert offset is replaced (not added) on each user-initiated move.

## 4. Manual smoke verification

- [ ] 4.1 `pnpm dev` with Hearthstone running. Click and hold the player overlay's tab row, drag 100px left, release. Confirm the overlay stays at the new position.
- [ ] 4.2 Move the Hearthstone window 200px right. Confirm the player overlay tracks the move while preserving the user-drag offset (i.e., it ends up 100px left of where the default tracker would put it).
- [ ] 4.3 Repeat 4.1 / 4.2 for the opponent overlay independently. Confirm dragging the player overlay does not affect the opponent overlay's offset.
- [ ] 4.4 Click the close button on the dragged tab row. Confirm the overlay closes and no drag-region hit eats the click.
- [ ] 4.5 Click the "全局效果" tab pill. Confirm the tab switches and no window-drag begins.
