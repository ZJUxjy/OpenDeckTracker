## ADDED Requirements

### Requirement: OverlayManager.setBounds repositions the window

The `OverlayManager` SHALL expose `setBounds(bounds: { x: number; y:
number; width: number; height: number }): void`, which calls
`BrowserWindow.setBounds(bounds)` if the window exists. If no window
has been created yet (the manager has never been `enable`d), the
call MUST be remembered and applied to the next-created window.

`setBounds` MUST be idempotent — passing the same bounds twice in
a row results in at most one `BrowserWindow.setBounds` call (the
second is suppressed).

#### Scenario: setBounds before enable is remembered

- **GIVEN** an `OverlayManager` that has not been enabled
- **WHEN** `setBounds({ x: 100, y: 200, width: 1280, height: 720 })`
  is called, then `enable()` is called
- **THEN** the spawned BrowserWindow's bounds equal the previously-
  set rect

#### Scenario: setBounds after enable resizes immediately

- **GIVEN** an enabled `OverlayManager` whose window currently has
  bounds `{ x: 0, y: 0, width: 1920, height: 1080 }`
- **WHEN** `setBounds({ x: 50, y: 50, width: 1280, height: 720 })`
  is called
- **THEN** the BrowserWindow's `setBounds` is invoked once with the
  new rect

#### Scenario: setBounds with same value is suppressed

- **GIVEN** an enabled manager whose last applied bounds were
  `{ x: 50, y: 50, width: 1280, height: 720 }`
- **WHEN** `setBounds` is called again with the same rect
- **THEN** `BrowserWindow.setBounds` is NOT invoked a second time

### Requirement: OverlayManager.setVisibleOnScreen replaces setRunning

The `OverlayManager` SHALL expose
`setVisibleOnScreen(visible: boolean): void`. This input replaces
the previous `setRunning(running: boolean)` method.

Final visibility becomes `userEnabled AND visibleOnScreen`. When
either flips to `false`, the window is hidden; when both are
`true`, it is shown.

The `setRunning` method SHALL be removed from `OverlayManager`.
The bootstrap-level fan-out responsibility moves entirely to the
new `HearthstoneWindowTracker`.

#### Scenario: setVisibleOnScreen(true) shows a previously-hidden window

- **GIVEN** an enabled manager with `visibleOnScreen === false`
  (window hidden)
- **WHEN** `setVisibleOnScreen(true)` is called
- **THEN** the BrowserWindow's `show()` is invoked and the window
  is visible

#### Scenario: setVisibleOnScreen(false) hides a visible window

- **GIVEN** an enabled manager with `visibleOnScreen === true`
- **WHEN** `setVisibleOnScreen(false)` is called
- **THEN** the BrowserWindow's `hide()` is invoked and the window
  is hidden

#### Scenario: setRunning is no longer part of the public surface

- **WHEN** TypeScript code attempts to call
  `OverlayManager.prototype.setRunning`
- **THEN** the type system rejects the call (the method does not
  exist)

### Requirement: Hearthstone-window tracker drives visibility and bounds

The main process SHALL drive each `OverlayManager`'s
`setVisibleOnScreen(...)` and `setBounds(...)` from a single
`HearthstoneWindowTracker` instance (the bootstrap-level
`createOverlayPoller` factory is removed in this change).

The tracker is started/stopped via its own `addClient` / `removeClient`
ref count. The bootstrap MUST `addClient` when an overlay is enabled
and `removeClient` when an overlay is disabled. The tracker MUST stop
polling when the last client is removed.

The bootstrap subscribes to the tracker once and fans both event
kinds (bounds-change, visibility-change) out to BOTH overlay
managers identically — the two windows occupy the SAME bounds, so
their CSS-level positioning of panels on opposite sides keeps them
visually distinct.

The throttle that prevents brief HS minimize / restore from
flickering the overlay lives inside the tracker (5 consecutive
false polls at the 200 ms cadence, see
`hearthstone-window-tracker` spec). The bootstrap layer no longer
contains throttle state.

#### Scenario: Bounds change fans out to both managers

- **GIVEN** both overlay managers are enabled
- **WHEN** the tracker emits a bounds event with
  `{ x: 100, y: 100, width: 1280, height: 720 }`
- **THEN** `setBounds` is called once on each manager with the
  same rect

#### Scenario: Brief mirror jitter does not flicker the overlay

- **GIVEN** at least one overlay is enabled and visible
- **WHEN** the underlying native call returns `null` once and then
  a visible window on the next poll
- **THEN** the overlay window is not hidden (the tracker's
  throttle suppresses the single-tick `false`)

#### Scenario: Hearthstone genuinely closes hides the overlay

- **GIVEN** at least one overlay is enabled and visible
- **WHEN** the underlying native call returns `null` for 5
  consecutive polls
- **THEN** the overlay window's `isVisible()` returns `false`

#### Scenario: Disabling both stops the tracker

- **GIVEN** both managers were enabled (tracker running)
- **WHEN** both have been `disable`d
- **THEN** the tracker has stopped polling

## MODIFIED Requirements

### Requirement: Main process spawns a transparent overlay BrowserWindow

The desktop main process SHALL provide an `OverlayManager`
(`apps/desktop/src/main/overlay-window.ts`) that lazily creates a
`BrowserWindow` configured for in-game overlay use. The class is
parameterized by a `routeHash` constructor option (default
`'/overlay'`) so the same class can host either the player or the
opponent route. Two instances are created at bootstrap.

The overlay window MUST be created with these options:

- `transparent: true`
- `frame: false`
- `resizable: false`, `movable: false`
- `skipTaskbar: true`
- `alwaysOnTop: true`, raised to `'screen-saver'` level via
  `setAlwaysOnTop` after creation
- `focusable: false`
- `hasShadow: false`
- `show: false` until the renderer signals ready
- bounds initially `{ x: 0, y: 0, width: 1, height: 1 }` so the
  window exists but is effectively invisible until the
  `HearthstoneWindowTracker` calls `setBounds(...)` with the
  Hearthstone window's actual rect.
- the same `preload`, `contextIsolation`, `sandbox`, and
  `nodeIntegration` settings as the main window
- `backgroundThrottling: false` so the in-match deck-tracker stays
  live when the overlay is occluded by Hearthstone

The window MUST load the same renderer bundle as the main window with
the hash route set to the manager's `routeHash` (default
`#/overlay`).

The `OverlayManager` MUST expose a public surface:

- `enable(): void` — creates the window if absent and shows it
  (subject to the visibleOnScreen gate below). Idempotent.
- `disable(): void` — hides the window if present. Does not destroy.
- `setBounds(bounds): void` — repositions / resizes the window.
- `setVisibleOnScreen(visible: boolean): void` — fed by the
  `HearthstoneWindowTracker`; combined with `userEnabled` to
  compute final visibility. The class itself MUST NOT own a poll
  timer.
- `dispose(): void` — destroys the window and clears any internal
  resources. Called on `app.before-quit`.

Final visibility is `userEnabled AND visibleOnScreen`. When either
flips to `false`, the window is hidden; when both are `true`, it
is shown.

#### Scenario: Window is not created at app start

- **WHEN** the main process completes its `whenReady()` phase
  without `enable()` being called on a manager
- **THEN** that manager has not spawned a BrowserWindow

#### Scenario: enable() spawns a window with the prescribed options

- **WHEN** `OverlayManager.enable()` is called for the first time
  with `visibleOnScreen === true` on a manager whose `routeHash` is
  `'/overlay'`
- **THEN** a new BrowserWindow exists with `transparent: true`,
  `frame: false`, `alwaysOnTop: true`, `skipTaskbar: true`,
  `focusable: false`
- **AND** the window's loaded URL or file ends with `#/overlay`

#### Scenario: enable() honors an alternate routeHash

- **WHEN** `OverlayManager.enable()` is called on a manager
  constructed with `routeHash: '/overlay-opponent'`
- **THEN** the spawned window's loaded URL or file ends with
  `#/overlay-opponent`

#### Scenario: enable() with not-on-screen keeps the window hidden

- **GIVEN** `OverlayManager.setVisibleOnScreen(false)` was called
- **WHEN** `OverlayManager.enable()` runs
- **THEN** the window is created but `isVisible()` returns `false`

#### Scenario: disable() hides without destroying

- **GIVEN** the overlay window is currently visible
- **WHEN** `disable()` is called
- **THEN** `isVisible()` returns `false` AND the window is not
  destroyed (`isDestroyed()` returns `false`)

#### Scenario: dispose() tears the window down

- **WHEN** `dispose()` is called (e.g. via `app.before-quit`)
- **THEN** the overlay window's `isDestroyed()` returns `true`

## REMOVED Requirements

### Requirement: Hearthstone-running signal drives visibility

**Reason**: Replaced by the new
`Hearthstone-window tracker drives visibility and bounds`
requirement above. The 3-second `hearthmirror.isAlive()` poll is
folded into the new 200 ms `getHearthstoneWindow()` poll, which
provides both the running signal AND the bounds + minimized state
that this change needs.

**Migration**: The `createOverlayPoller` factory is deleted. The
bootstrap rewires to `createHearthstoneWindowTracker` instead.
External consumers: none (the factory was internal to
`apps/desktop/src/main/`).
