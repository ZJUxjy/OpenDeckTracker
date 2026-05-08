## MODIFIED Requirements

### Requirement: OverlayManager.setBounds repositions the window

The `OverlayManager` SHALL expose `setBounds(bounds: { x: number; y: number; width: number; height: number }): void`. The argument is interpreted as **tracker-derived** bounds (the position the `HearthstoneWindowTracker` would otherwise want the overlay to occupy). The manager SHALL:

1. Store `bounds` as `lastTrackerBounds`.
2. Compose the actual rect with the manager's current `userOffset` (default `{ dx: 0, dy: 0 }`): `{ x: bounds.x + userOffset.dx, y: bounds.y + userOffset.dy, width: bounds.width, height: bounds.height }`.
3. Clamp the composed rect to the work-area of the display containing it (via Electron's `screen.getDisplayMatching` + `workArea`) so the overlay cannot end up entirely off-screen.
4. Apply the composed-and-clamped rect to the `BrowserWindow` via `BrowserWindow.setBounds`.

If no window has been created yet (the manager has never been `enable`d), step 4 MUST be remembered and applied to the next-created window.

`setBounds` MUST be idempotent against the **composed** result — passing tracker bounds twice in a row that yield the same composed rect results in at most one `BrowserWindow.setBounds` call.

While step 4 is in flight, the manager SHALL set an internal `isApplyingTrackerBounds = true` flag and clear it in a microtask, so the BrowserWindow's `moved` event fired by step 4 is NOT mistaken for a user drag.

#### Scenario: setBounds before enable is remembered

- **GIVEN** an `OverlayManager` that has not been enabled, with default `userOffset = { dx: 0, dy: 0 }`
- **WHEN** `setBounds({ x: 100, y: 200, width: 1280, height: 720 })` is called, then `enable()` is called
- **THEN** the spawned BrowserWindow's bounds equal `{ x: 100, y: 200, width: 1280, height: 720 }` (composed with zero offset = unchanged).

#### Scenario: setBounds after enable repositions immediately

- **GIVEN** an enabled `OverlayManager` whose window currently has bounds `{ x: 0, y: 0, width: 1920, height: 1080 }` and `userOffset = { dx: 0, dy: 0 }`
- **WHEN** `setBounds({ x: 50, y: 50, width: 1280, height: 720 })` is called
- **THEN** the BrowserWindow's `setBounds` is invoked once with `{ x: 50, y: 50, width: 1280, height: 720 }`.

#### Scenario: setBounds with same composed result is suppressed

- **GIVEN** an enabled manager whose `userOffset` is `{ dx: 10, dy: 0 }` and `lastAppliedBounds` is `{ x: 60, y: 50, width: 1280, height: 720 }`
- **WHEN** `setBounds({ x: 50, y: 50, width: 1280, height: 720 })` is called again (same tracker rect, same offset, same composed result)
- **THEN** `BrowserWindow.setBounds` is NOT invoked a second time.

#### Scenario: setBounds composes user offset

- **GIVEN** an enabled manager with `userOffset = { dx: 40, dy: 20 }`
- **WHEN** `setBounds({ x: 100, y: 50, width: 320, height: 800 })` is called
- **THEN** the BrowserWindow's `setBounds` is invoked with `{ x: 140, y: 70, width: 320, height: 800 }` (composed; assuming the work-area accommodates it).

#### Scenario: Tracker-applied move does not corrupt the offset

- **GIVEN** an enabled manager with `userOffset = { dx: 40, dy: 20 }`
- **WHEN** the public `setBounds` is called and the resulting `BrowserWindow.setBounds` triggers a `moved` event
- **THEN** the manager's `userOffset` remains `{ dx: 40, dy: 20 }` (the `isApplyingTrackerBounds` flag suppresses recomputation).
