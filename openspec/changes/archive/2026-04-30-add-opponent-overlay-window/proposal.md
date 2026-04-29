## Why

The `/overlay` route already renders the in-game tracker layout
(opponent revealed cards on the left, compact pip-count deck panel
on the right). It just lives inside the main BrowserWindow, so the
user has to alt-tab to see it during a Hearthstone match — which is
exactly the friction the overlay was supposed to remove. This change
spawns a real transparent always-on-top BrowserWindow that hosts the
same `/overlay` route, ties its show/hide to Hearthstone running, and
exposes a single user-facing toggle in Settings.

## What Changes

- **NEW** `apps/desktop/src/main/overlay-window.ts`: spawns a second
  `BrowserWindow` configured as transparent, frameless, always-on-top,
  skipTaskbar, and full-screen on the primary display. Loads the same
  renderer URL with `#/overlay`. Click-through is already handled at
  the React layer via `pointer-events: none` on the root with
  `pointer-events: auto` islands for the panels (no `setIgnoreMouseEvents`
  needed in v1).
- **NEW** `OverlayManager` (a small class in the same file) owning
  the show/hide lifecycle:
  - `enable()` — creates the window if it doesn't exist; shows it.
  - `disable()` — hides and destroys the window.
  - `setVisibleForGame(running: boolean)` — driven by Hearthstone
    process detection; when the user has the overlay enabled, this
    decides whether the window is visible right now.
  - Idempotent: calling `enable()` twice is a no-op.
- **NEW** Hearthstone running-state signal. The `hearthwatcher`
  status already implies HS is running (it can only ingest logs from
  a live install), but its `kind` enum doesn't carry a clean boolean.
  `hearthmirror.isAlive()` is closer — true when the mirror has a
  PID for a live `Hearthstone.exe`. Poll it once every 3 s in the
  main process; pass changes through to `OverlayManager.setVisibleForGame`.
- **NEW** `useAppearanceStore` extension: a `gameOverlay: boolean`
  preference (default `false`). When the user toggles it on, the
  renderer fires a new `overlay:set-enabled(boolean)` IPC; main calls
  `overlayManager.enable()` / `disable()` accordingly. The preference
  also persists in the same `hdt.appearance` localStorage key.
- **MODIFIED** `Settings.tsx`'s "Overlay" category: replaces the
  current "Section Under Construction" placeholder with a single
  toggle row — "Show in-game overlay window" — wired to the new
  preference.
- **NEW** i18n keys: `settings.overlay.enableTitle`,
  `settings.overlay.enableDescription`,
  `settings.overlay.runningHint` (a small subtitle that says "active
  while Hearthstone is running").
- **MODIFIED** `OverlayView.tsx`: nothing — it already renders the
  right thing. The change is invisible from the component's POV.
- **NEW** main-process tests for `OverlayManager` (with mocked
  `BrowserWindow`) and renderer tests for the Settings toggle row.

Non-goals:
- No window-position tracking against `Hearthstone.exe` (a follow-up
  change can wire `Get-Process` window rect polling). v1 is full-screen
  on the primary monitor; the `OverlayView` layout is already
  positioned with `absolute top-10 left-10` / `right-10` so the panels
  land in the right places without window tracking.
- No per-display picker. v1 always uses the primary display.
- No `setIgnoreMouseEvents` mouse-passthrough. The component-level
  `pointer-events` discipline is enough; we revisit if a user reports
  mis-targeted clicks.
- No keyboard shortcut to toggle. Settings UI is the only entry
  point in v1.
- No transparent rendering on Linux (it's already a Windows-first
  app per `CLAUDE.md` / DEVELOPMENT_PLAN.md). The overlay window
  attempts transparency on macOS but is not validated there.

## Capabilities

### New Capabilities
- `overlay-window`: main-process lifecycle management of the
  transparent always-on-top BrowserWindow that hosts the
  `/overlay` route, including the Hearthstone-running visibility
  trigger and the IPC contract for the renderer toggle.

### Modified Capabilities
- `appearance-preferences`: adds `gameOverlay: boolean` to the
  persisted preferences, with a getter/setter pair, mirroring the
  existing density and accent fields.

## Impact

- `apps/desktop/src/main/overlay-window.ts` (new) +
  `apps/desktop/src/main/overlay-window.test.ts` (new).
- `apps/desktop/src/main/index.ts` — start the overlay manager once
  the app is ready. The manager registers an IPC handler and a
  3 s poll for `hearthmirror.isAlive()`.
- `apps/desktop/src/preload/index.ts` — `overlay.setEnabled(enabled)`
  bridge.
- `apps/desktop/src/renderer/src/stores/appearance-store.ts` —
  `gameOverlay` field + setter; updates persistence shape.
- `apps/desktop/src/renderer/src/components/Settings.tsx` — replace
  the Overlay placeholder with the toggle row.
- `apps/desktop/src/renderer/tests/Settings.overlay.test.tsx` (new).
- `apps/desktop/src/renderer/tests/appearance-store.test.ts` —
  extend with `gameOverlay` round-trip cases.
- `resources/locales/en-US.json`, `resources/locales/zh-CN.json` —
  three new keys.
- No changes to `LiveDeckPanel`, `OverlayView`, `OpponentCardsPanel`,
  `@hdt/core`, `@hdt/hearthdb`, or any other capability.
