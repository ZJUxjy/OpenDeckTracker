# overlay-drag-positioning Specification

## Purpose
TBD - created by archiving change draggable-overlay-titlebar. Update Purpose after archive.
## Requirements
### Requirement: Top tablist row is the OS drag handle

The top `<div role="tablist">` of `apps/desktop/src/renderer/src/components/TrackerPanelTabs.tsx` SHALL declare `WebkitAppRegion: 'drag'` so the user can move each frameless overlay BrowserWindow by clicking and dragging that row. Tab pill buttons (`TabPill`), the effects-count badge inside the effects pill, and the close button in `OverlayView` / `OpponentOverlayView` SHALL declare `WebkitAppRegion: 'no-drag'` so click and hover behavior is preserved.

This drag region SHALL apply to both overlay routes (`/overlay`, `/overlay-opponent`). It MAY be unconditionally declared in shared component code; framed BrowserWindows ignore the `app-region` style, so the main window is unaffected.

#### Scenario: Drag region is declared on the tablist

- **WHEN** a smoke test reads `TrackerPanelTabs.tsx`
- **THEN** the tablist `<div>` carries an inline style or class that resolves to `-webkit-app-region: drag`.

#### Scenario: Tab buttons opt out of drag

- **WHEN** the smoke test inspects each `TabPill` button element
- **THEN** the button carries an inline style or class that resolves to `-webkit-app-region: no-drag`.

#### Scenario: Close button opts out of drag

- **GIVEN** the existing `NO_DRAG` style on the close button in `OverlayView` and `OpponentOverlayView`
- **WHEN** the user clicks the close button at the right edge of the tablist row
- **THEN** the click registers as a button click (not a drag-region hit) and the close handler runs.

#### Scenario: Click on tab pill switches tab without starting a drag

- **WHEN** the user clicks the "全局效果" tab pill
- **THEN** the active tab changes to `effects` and no window-drag is initiated.

### Requirement: User drag is recorded as an offset relative to tracker bounds

`OverlayWindowManager` (`apps/desktop/src/main/overlay-window.ts`) SHALL listen to its `BrowserWindow`'s `moved` event. When a `moved` event fires that is NOT the result of an internal `setBounds` call, the manager SHALL compute `userOffset = currentBounds - lastTrackerBounds` and store it on the instance. `lastTrackerBounds` is the most recent rect passed to the public `setBounds(rect)` API.

The manager SHALL distinguish internal moves from user drags using a transient `isApplyingTrackerBounds` flag set true around the internal `BrowserWindow.setBounds(...)` call and cleared in a microtask.

The `userOffset` is two integers `{ dx, dy }`. Width/height changes from drag are NOT captured (only x/y).

#### Scenario: User drag updates the offset

- **GIVEN** an enabled `OverlayWindowManager` whose last tracker bounds were `{ x: 100, y: 50, width: 320, height: 800 }`
- **WHEN** the user drags the window so its new position becomes `{ x: 140, y: 70 }`
- **THEN** the manager's `userOffset` becomes `{ dx: 40, dy: 20 }`.

#### Scenario: Programmatic setBounds does NOT update offset

- **GIVEN** an enabled manager with `userOffset = { dx: 0, dy: 0 }`
- **WHEN** the tracker calls `setBounds({ x: 200, y: 50, width: 320, height: 800 })` programmatically
- **AND** the BrowserWindow's resulting `moved` event fires
- **THEN** the manager's `userOffset` remains `{ dx: 0, dy: 0 }` (the flag suppresses recomputation).

#### Scenario: Successive drags compose

- **GIVEN** `userOffset = { dx: 40, dy: 20 }` from a prior drag
- **WHEN** the user drags again so the window position changes by another `{ +10, -5 }` relative to the tracker-derived position
- **THEN** the new `userOffset` is `{ dx: 50, dy: 15 }` (it is recomputed against `lastTrackerBounds`, not added to the previous offset).

### Requirement: Tracker bounds are composed with the user offset

When the public `setBounds(rect)` API is called (by the bootstrap-level `HearthstoneWindowTracker` subscriber), the manager SHALL store `rect` as `lastTrackerBounds` and apply `{ x: rect.x + userOffset.dx, y: rect.y + userOffset.dy, width: rect.width, height: rect.height }` to the BrowserWindow. The same idempotency rule (suppress when bounds equal `lastAppliedBounds`) applies to the composed result.

The composed result SHALL be clamped to the work-area of the display containing the composed `(x, y)` so the overlay cannot be pushed entirely off-screen by an extreme prior drag combined with a small HS window. Clamp logic uses Electron's `screen.getDisplayMatching(rect)` and the display's `workArea`.

#### Scenario: Composed bounds with non-zero offset

- **GIVEN** `userOffset = { dx: 40, dy: 20 }` and `lastTrackerBounds = { x: 100, y: 50, width: 320, height: 800 }`
- **WHEN** the tracker calls `setBounds({ x: 110, y: 50, width: 320, height: 800 })`
- **THEN** the BrowserWindow receives `setBounds({ x: 150, y: 70, width: 320, height: 800 })`.

#### Scenario: Composed bounds clamp to display work-area

- **GIVEN** `userOffset = { dx: 100000, dy: 0 }` (user drag pushed it absurdly far right)
- **AND** the display's work-area `right` edge is at `x = 1920`
- **WHEN** the tracker calls `setBounds({ x: 100, y: 50, width: 320, height: 800 })`
- **THEN** the BrowserWindow receives a rect whose `x + width <= 1920` (clamped to work-area).

#### Scenario: Idempotent suppression survives composition

- **GIVEN** the manager has just applied composed bounds `R` and stored `lastAppliedBounds = R`
- **WHEN** `setBounds` is called with the same tracker rect (so the composed result is again `R`)
- **THEN** `BrowserWindow.setBounds` is NOT invoked a second time.

### Requirement: Offset is per-instance and not persisted across restarts

Each `OverlayWindowManager` instance SHALL maintain its own `userOffset`. Player and opponent overlays have independent offsets. The offset SHALL NOT be persisted to disk in this change; it is reinitialized to `{ dx: 0, dy: 0 }` whenever a new manager instance is constructed (typically once per Electron process startup).

`dispose()` SHALL NOT separately clear or save the offset (process exit makes it moot).

#### Scenario: Player and opponent offsets are independent

- **WHEN** the user drags only the player overlay (offset becomes `{ dx: 30, dy: 0 }`)
- **THEN** the opponent manager's offset remains `{ dx: 0, dy: 0 }`.

#### Scenario: Offset resets on app restart

- **GIVEN** a session where the player overlay was dragged to `userOffset = { dx: 50, dy: 50 }`
- **WHEN** the app is quit and relaunched
- **THEN** the new `OverlayWindowManager` instances both start with `userOffset = { dx: 0, dy: 0 }`.

