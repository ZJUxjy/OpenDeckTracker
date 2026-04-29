## ADDED Requirements

### Requirement: Main process spawns a transparent overlay BrowserWindow

The desktop main process SHALL provide an `OverlayManager`
(`apps/desktop/src/main/overlay-window.ts`) that lazily creates a
second `BrowserWindow` configured for in-game overlay use.

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
the hash route set to `#/overlay`.

The `OverlayManager` MUST expose a public surface:

- `enable(): void` — creates the window if absent and shows it
  (subject to the running-game gate below). Idempotent.
- `disable(): void` — hides the window if present. Does not destroy.
- `setRunning(running: boolean): void` — fed by the game-running
  signal; used together with the user toggle to compute final
  visibility.
- `dispose(): void` — destroys the window and clears any timers.
  Called on `app.before-quit`.

Final visibility is `userEnabled AND gameRunning`. When either flips
to `false`, the window is hidden; when both are `true`, it is shown.

#### Scenario: Window is not created at app start

- **WHEN** the main process completes its `whenReady()` phase
  without `OverlayManager.enable()` being called
- **THEN** `BrowserWindow.getAllWindows().length === 1` (only the
  main window exists)

#### Scenario: enable() spawns a window with the prescribed options

- **WHEN** `OverlayManager.enable()` is called for the first time
  with `gameRunning === true`
- **THEN** a new BrowserWindow exists with `transparent: true`,
  `frame: false`, `alwaysOnTop: true`, `skipTaskbar: true`,
  `focusable: false`
- **AND** the window's loaded URL or file ends with `#/overlay`

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
- **AND** any internal poll/interval timers are cleared

### Requirement: Hearthstone-running signal drives visibility

The main process SHALL drive `OverlayManager.setRunning(...)` from
the result of `hearthmirror.isAlive()`, polled every 3 seconds.

The poll loop MUST:

- Start when `OverlayManager.enable()` is first called and stop when
  `disable()` runs.
- Throttle the `false` transition: a `false` reading must persist
  across 3 consecutive polls (≈ 9 s) before `setRunning(false)` is
  called. A `true` reading flips to `setRunning(true)` immediately.
- Survive `hearthmirror.isAlive()` rejecting; a thrown reading is
  treated the same as `false`.

#### Scenario: Brief mirror jitter does not flicker the overlay

- **GIVEN** the overlay is enabled and visible
- **WHEN** `hearthmirror.isAlive()` returns `false` once and then
  `true` on the next poll
- **THEN** the overlay window is not hidden (the throttle suppresses
  the single-tick `false`)

#### Scenario: Hearthstone genuinely closes hides the overlay

- **GIVEN** the overlay is enabled and visible
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
