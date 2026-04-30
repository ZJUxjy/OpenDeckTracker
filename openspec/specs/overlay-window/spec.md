## Purpose

Defines the in-game overlay window contract: a transparent always-on-top BrowserWindow that shows the deck tracker over Hearthstone, plus the show/hide policy that ties it to the Hearthstone process and a user-facing enable preference.
## Requirements
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
- bounds covering the full work area of the primary display
- the same `preload`, `contextIsolation`, `sandbox`, and
  `nodeIntegration` settings as the main window
- `backgroundThrottling: false` so the in-match deck-tracker stays
  live when the overlay is occluded by Hearthstone

The window MUST load the same renderer bundle as the main window with
the hash route set to the manager's `routeHash` (default
`#/overlay`).

The `OverlayManager` MUST expose a public surface:

- `enable(): void` — creates the window if absent and shows it
  (subject to the running-game gate below). Idempotent.
- `disable(): void` — hides the window if present. Does not destroy.
- `setRunning(running: boolean): void` — fed by the bootstrap-level
  Hearthstone-running fan-out; used together with the user toggle
  to compute final visibility. The class itself MUST NOT own a
  poll timer (the bootstrap layer does).
- `dispose(): void` — destroys the window and clears any internal
  resources. Called on `app.before-quit`.

Final visibility is `userEnabled AND gameRunning`. When either flips
to `false`, the window is hidden; when both are `true`, it is shown.

#### Scenario: Window is not created at app start

- **WHEN** the main process completes its `whenReady()` phase
  without `enable()` being called on a manager
- **THEN** that manager has not spawned a BrowserWindow

#### Scenario: enable() spawns a window with the prescribed options

- **WHEN** `OverlayManager.enable()` is called for the first time
  with `gameRunning === true` on a manager whose `routeHash` is
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

#### Scenario: enable() with game not running keeps the window hidden

- **GIVEN** `OverlayManager.setRunning(false)` was called
- **WHEN** `OverlayManager.enable()` runs
- **THEN** the window is created but `isVisible()` returns `false`

#### Scenario: setRunning(true) shows a previously enabled window

- **GIVEN** `enable()` was called and `gameRunning` was `false`
  (window hidden)
- **WHEN** `setRunning(true)` is called
- **THEN** the window's `show()` is called and `isVisible()` returns
  `true`

#### Scenario: disable() hides without destroying

- **GIVEN** the overlay window is currently visible
- **WHEN** `disable()` is called
- **THEN** `isVisible()` returns `false` AND the window is not
  destroyed (`isDestroyed()` returns `false`)

#### Scenario: dispose() tears the window down

- **WHEN** `dispose()` is called (e.g. via `app.before-quit`)
- **THEN** the overlay window's `isDestroyed()` returns `true`

### Requirement: Hearthstone-running signal drives visibility

The main process SHALL drive each `OverlayManager.setRunning(...)`
from a bootstrap-level poller of `hearthmirror.isAlive()`, polled
every 3 seconds. The poller fans the result out to BOTH managers.

The poll loop MUST:

- Start when EITHER manager is first enabled and stop when BOTH
  managers are disabled.
- Throttle the `false` transition: a `false` reading must persist
  across 3 consecutive polls (≈ 9 s) before `setRunning(false)` is
  called. A `true` reading flips to `setRunning(true)` immediately.
- Survive `hearthmirror.isAlive()` rejecting; a thrown reading is
  treated the same as `false`.

The throttle state lives in the bootstrap layer, not inside the
`OverlayManager` class.

#### Scenario: Brief mirror jitter does not flicker the overlay

- **GIVEN** at least one overlay is enabled and visible
- **WHEN** `hearthmirror.isAlive()` returns `false` once and then
  `true` on the next poll
- **THEN** the overlay window is not hidden (the throttle suppresses
  the single-tick `false`)

#### Scenario: Hearthstone genuinely closes hides the overlay

- **GIVEN** at least one overlay is enabled and visible
- **WHEN** `hearthmirror.isAlive()` returns `false` for 3 consecutive
  polls
- **THEN** the overlay window's `isVisible()` returns `false`

### Requirement: Renderer toggles overlay enablement via IPC

The desktop preload SHALL expose
`window.hdt.overlay.setEnabled(enabled: boolean): Promise<void>`
which forwards to an `overlay:set-enabled` IPC channel handled by
the main process. The handler MUST call
`overlayManager.enable()` for `true` and `overlayManager.disable()`
for `false`.

The renderer's `useAppearanceStore` SHALL include a
`gameOverlay: boolean` field (default `false`) with a
`setGameOverlay(next: boolean)` mutator. The mutator MUST persist
the new value to `localStorage.hdt.appearance` (alongside `density`
and `accent`) AND fire the `overlay:set-enabled` IPC.

The `AppearanceApplyEffect` (or an equivalent boot-time effect) MUST
fire `overlay:set-enabled` once on app start so a saved
`gameOverlay: true` survives a relaunch.

#### Scenario: Toggling on fires the IPC and persists

- **GIVEN** the appearance store starts with `gameOverlay: false`
- **WHEN** `useAppearanceStore.getState().setGameOverlay(true)` runs
- **THEN** `window.hdt.overlay.setEnabled(true)` is invoked
- **AND** `localStorage.hdt.appearance` contains
  `"gameOverlay": true`

#### Scenario: Saved preference survives a reload

- **GIVEN** `localStorage.hdt.appearance === '{"density":"comfortable","accent":"cyan","gameOverlay":true}'`
- **WHEN** the renderer reloads
- **THEN** `useAppearanceStore.getState().gameOverlay === true`
- **AND** the boot-time effect fires `overlay:set-enabled(true)` once

### Requirement: Settings page exposes an overlay toggle

`apps/desktop/src/renderer/src/components/Settings.tsx` SHALL render
a single toggle row in the "Overlay" sidebar category, labeled with
the new `settings.overlay.enableTitle` key. Selecting the toggle
MUST flip `useAppearanceStore.getState().gameOverlay`. A subtitle
below the title MUST read `settings.overlay.enableDescription` and
a small hint line MUST read `settings.overlay.runningHint`
("active while Hearthstone is running"). The "Section Under
Construction" placeholder that the Overlay category previously
rendered MUST be removed.

#### Scenario: Overlay panel shows the toggle, not the placeholder

- **WHEN** the user opens the Settings → Overlay category
- **THEN** a row with the localized title from
  `settings.overlay.enableTitle` is present
- **AND** the "Section Under Construction" placeholder is absent

#### Scenario: Toggle row reflects store state

- **GIVEN** `gameOverlay: true` in the store
- **WHEN** the Overlay panel renders
- **THEN** the toggle is in the on state

#### Scenario: Clicking the toggle updates the store

- **GIVEN** `gameOverlay: false`
- **WHEN** the user clicks the toggle
- **THEN** `useAppearanceStore.getState().gameOverlay === true`

#### Scenario: Overlay labels follow the active locale

- **GIVEN** the active locale is `zh-CN`
- **WHEN** the Overlay panel renders
- **THEN** the title, description, and running hint render in Chinese

### Requirement: Main process spawns a second opponent overlay BrowserWindow

The desktop main process SHALL instantiate a second `OverlayManager`
configured with `routeHash: '/overlay-opponent'`, sharing the same
constructor option shape (transparent / frame:false /
alwaysOnTop:'screen-saver' / skipTaskbar / focusable:false /
hasShadow:false / `backgroundThrottling: false` / preload /
contextIsolation / sandbox) as the player overlay manager.

The opponent window MUST load the same renderer bundle as the main
window with the hash route set to `#/overlay-opponent`.

The two managers MUST be controlled by independent `enable()` /
`disable()` calls. Both MUST receive the same `setRunning(...)`
signal from the bootstrap-level Hearthstone-running poller.

#### Scenario: Two managers exist after bootstrap

- **WHEN** the main process completes its `whenReady()` phase
- **THEN** two `OverlayManager` instances exist (one per route hash)
- **AND** neither has spawned a window yet (windows are lazy)

#### Scenario: Opponent enable() spawns its own window

- **WHEN** `opponentManager.enable()` is called for the first time
  with `gameRunning === true`
- **THEN** a new BrowserWindow exists in addition to the main window
  (and any player-overlay window) whose loaded URL or file ends with
  `#/overlay-opponent`
- **AND** that window is `transparent: true`, `frame: false`,
  `alwaysOnTop: true`, `skipTaskbar: true`, `focusable: false`

#### Scenario: Player and opponent visibility toggle independently

- **GIVEN** both managers are enabled and `gameRunning === true`
  (both windows visible)
- **WHEN** `opponentManager.disable()` is called
- **THEN** the opponent window's `isVisible()` returns `false`
- **AND** the player window's `isVisible()` returns `true`

#### Scenario: dispose() tears both windows down

- **WHEN** `app.before-quit` fires both managers' `dispose()`
- **THEN** both overlay windows' `isDestroyed()` returns `true`

### Requirement: Bootstrap-level poller fans out to both managers

The main process bootstrap (`apps/desktop/src/main/index.ts`) SHALL
own a single `setInterval(3000)` poller of `hearthmirror.isAlive()`
that calls `setRunning(...)` on both `OverlayManager` instances.

The poll loop MUST:

- Start when EITHER manager is enabled, and stop when BOTH managers
  are disabled.
- Throttle the `false` transition: a `false` reading must persist
  across 3 consecutive polls (≈ 9 s) before `setRunning(false)` is
  fanned out. A `true` reading flips to `setRunning(true)`
  immediately.
- Survive `hearthmirror.isAlive()` rejecting; a thrown reading is
  treated the same as `false`.

The throttle state MUST NOT live inside `OverlayManager` (which now
becomes a pure visibility component).

#### Scenario: Brief mirror jitter does not flicker either overlay

- **GIVEN** both overlays are enabled and visible
- **WHEN** `hearthmirror.isAlive()` returns `false` once and then
  `true` on the next poll
- **THEN** neither overlay window is hidden (the bootstrap-level
  throttle suppresses the single-tick `false`)

#### Scenario: Hearthstone genuinely closes hides both overlays

- **GIVEN** both overlays are enabled and visible
- **WHEN** `hearthmirror.isAlive()` returns `false` for 3
  consecutive polls
- **THEN** both `setRunning(false)` calls fire and both overlay
  windows' `isVisible()` return `false`

#### Scenario: Disabling both stops the poller

- **GIVEN** both managers were enabled (poller running)
- **WHEN** `playerManager.disable()` and `opponentManager.disable()`
  have both been called
- **THEN** no further `hearthmirror.isAlive()` polls fire

### Requirement: Renderer toggles opponent overlay enablement via IPC

The desktop preload SHALL expose
`window.hdt.overlay.setEnabledOpponent(enabled: boolean): Promise<void>`
which forwards to an `overlay:set-enabled-opponent` IPC channel
handled by the main process. The handler MUST call
`opponentManager.enable()` for `true` and
`opponentManager.disable()` for `false`.

The renderer's `useAppearanceStore` SHALL include a
`gameOverlayOpponent: boolean` field (default `false`) with a
`setGameOverlayOpponent(next: boolean)` mutator. The mutator MUST
persist the new value to `localStorage.hdt.appearance` (alongside
`density`, `accent`, and `gameOverlay`) AND fire the
`overlay:set-enabled-opponent` IPC.

The `AppearanceApplyEffect` (or an equivalent boot-time effect) MUST
fire `overlay:set-enabled-opponent` once on app start so a saved
`gameOverlayOpponent: true` survives a relaunch. This MUST be
independent of the existing `overlay:set-enabled` re-fire for
`gameOverlay`.

#### Scenario: Toggling opponent on fires the IPC and persists

- **GIVEN** the appearance store starts with
  `gameOverlayOpponent: false`
- **WHEN** `useAppearanceStore.getState().setGameOverlayOpponent(true)`
  runs
- **THEN** `window.hdt.overlay.setEnabledOpponent(true)` is invoked
- **AND** `localStorage.hdt.appearance` contains
  `"gameOverlayOpponent": true`

#### Scenario: Saved opponent preference survives a reload

- **GIVEN** `localStorage.hdt.appearance` contains
  `"gameOverlayOpponent": true`
- **WHEN** the renderer reloads
- **THEN** `useAppearanceStore.getState().gameOverlayOpponent === true`
- **AND** the boot-time effect fires
  `overlay:set-enabled-opponent(true)` once

#### Scenario: Legacy localStorage without opponent key parses cleanly

- **GIVEN** `localStorage.hdt.appearance ===
  '{"density":"comfortable","accent":"cyan","gameOverlay":true}'`
- **WHEN** the renderer reads the store
- **THEN** `gameOverlayOpponent === false` (default)
- **AND** no exception is thrown

### Requirement: Opponent overlay route renders only the opponent panel

The renderer SHALL register a `/overlay-opponent` route in
`apps/desktop/src/renderer/src/routes.tsx` that mounts a new
`OpponentOverlayView` component. The component MUST render
`OpponentCardsPanel` and nothing else (no `LiveDeckPanel`, no
sidebar, no app chrome).

The root element MUST follow the same `pointer-events: none` (root)
and `pointer-events: auto` (panel island) pattern as the existing
`OverlayView` so click-through is preserved.

#### Scenario: Opponent route renders only the opponent panel

- **WHEN** the renderer navigates to `/overlay-opponent`
- **THEN** the rendered DOM contains `OpponentCardsPanel`
- **AND** does NOT contain `LiveDeckPanel`
- **AND** does NOT contain the main-window `Sidebar`

### Requirement: Settings page exposes a second toggle for opponent overlay

`apps/desktop/src/renderer/src/components/Settings.tsx` SHALL render
a second toggle row in the "Overlay" sidebar category, below the
existing player overlay toggle, labeled with a new
`settings.overlay.enableOpponentTitle` key. Selecting the toggle MUST
flip `useAppearanceStore.getState().gameOverlayOpponent`. A subtitle
below the title MUST read `settings.overlay.enableOpponentDescription`.
The existing player toggle, its description, and the
`runningHint` line MUST remain present and behaviorally unchanged.

#### Scenario: Overlay panel shows two toggles

- **WHEN** the user opens the Settings → Overlay category
- **THEN** a row with the localized title from
  `settings.overlay.enableTitle` is present (player)
- **AND** a row with the localized title from
  `settings.overlay.enableOpponentTitle` is present (opponent)

#### Scenario: Opponent toggle row reflects store state

- **GIVEN** `gameOverlayOpponent: true` in the store
- **WHEN** the Overlay panel renders
- **THEN** the opponent toggle is in the on state
- **AND** the player toggle's state is unaffected by
  `gameOverlayOpponent`

#### Scenario: Clicking the opponent toggle updates only its field

- **GIVEN** `gameOverlay: true` and `gameOverlayOpponent: false`
- **WHEN** the user clicks the opponent toggle
- **THEN** `useAppearanceStore.getState().gameOverlayOpponent === true`
- **AND** `useAppearanceStore.getState().gameOverlay === true` (unchanged)

#### Scenario: Opponent labels follow the active locale

- **GIVEN** the active locale is `zh-CN`
- **WHEN** the Overlay panel renders
- **THEN** the opponent title and description render in Chinese

