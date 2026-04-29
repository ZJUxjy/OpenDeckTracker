## Context

The Electron main process today owns exactly one BrowserWindow
(`createMainWindow` in `apps/desktop/src/main/window.ts`). The
renderer routes `/overlay` to a click-through layout
(`OverlayView.tsx`) that's been waiting for a real overlay host since
the Console redesign. Two main-process broadcast channels —
`deck-tracker:state` and `hearthwatcher:status` — already iterate
`BrowserWindow.getAllWindows()` and push to every window, so adding a
second window automatically gets state updates with zero broadcaster
changes.

We have a Hearthstone-running signal in `hearthmirror.isAlive()`,
which returns true only when the 32-bit Rust mirror sub-process has
located a live `Hearthstone.exe` and successfully read at least the
service locator. Polling it is cheap (a single JSON-RPC round-trip
per call).

## Goals / Non-Goals

**Goals:**
- A real always-on-top transparent BrowserWindow that hosts the
  existing `/overlay` route while the user is in Hearthstone.
- One user-facing toggle. No knob explosion.
- Auto-show / auto-hide tied to Hearthstone running.
- Persistence: the toggle survives restarts via the existing
  appearance store.

**Non-Goals:**
- No tracking of `Hearthstone.exe`'s window rectangle. The overlay
  is full-screen on the primary display in v1.
- No per-monitor picker, no opacity slider, no scale knob.
- No `setIgnoreMouseEvents` toggle. Click-through is handled in CSS.
- No "Linux works too" claims. Windows-first.

## Decisions

### D1 — Where the overlay-running signal comes from

**Context.** We need to know when Hearthstone is running so the
overlay window auto-shows. Three sources are at hand: hearthwatcher
status (`kind: 'ready'` ≈ HS is alive), `hearthmirror.isAlive()`,
and a fresh `tasklist`/PowerShell `Get-Process` poll.

**Choice.** `hearthmirror.isAlive()`, polled every 3 s.

**Rationale.**
- Hearthwatcher's signal is delayed by log-rotation handling and
  doesn't cleanly report "process gone".
- A separate `Get-Process` poll duplicates work the mirror already
  does — the mirror crashed-or-not detection lives in
  `hearthmirror-runtime-validation` and is the canonical signal.
- 3 s is the lowest cadence that doesn't feel laggy when launching
  HS; it's also far below the mirror's own internal cadence so we
  don't add load.

The poller is a simple `setInterval` started inside the OverlayManager.
It clears the interval on `app.quit()` (registered via
`app.on('before-quit', …)`).

### D2 — Window lifecycle: lazy create vs always-create-and-hide

**Context.** Should the overlay window be created at app start and
hidden, or created on first enable and destroyed on disable?

**Options.**
1. Create-and-hide at app start.
2. Lazy create on enable, destroy on disable.
3. Lazy create on enable, hide on disable, destroy on app exit.

**Choice.** Option 3 (the simple variant of 2 that doesn't pay the
re-create cost on toggle).

**Rationale.**
- Option 1 burns memory + a renderer for users who never enable
  the overlay (default off).
- Option 2 makes the toggle feel slow on second use — Electron
  takes ~150 ms to spin up a new BrowserWindow.
- Option 3 hides on disable (instant) and destroys at app exit.
  The window's renderer still subscribes to broadcasts while hidden;
  CPU cost is tiny since the panels render nothing meaningful when
  no in-match snapshot is present.

### D3 — Click-through model

**Context.** A transparent overlay must not steal mouse events from
Hearthstone except over the panels themselves.

**Options.**
1. `BrowserWindow.setIgnoreMouseEvents(true, { forward: true })`
   — main-process opt-in, requires the renderer to message back to
   re-enable mouse events when over a panel.
2. Pure CSS: `pointer-events: none` on the root, `pointer-events:
   auto` on each panel.
3. Both.

**Choice.** Option 2.

**Rationale.** The CSS approach is already in `OverlayView.tsx`
(line 9: `pointer-events-none`; lines 10/16: `pointer-events-auto`).
No main-process plumbing, no IPC race, no message-back handshake.
A future change can layer (1) on top if a user reports clicks
landing on invisible Electron chrome — but transparent windows on
Windows already pass mouse events through transparent pixels in
practice.

### D4 — IPC contract

A single IPC channel: `overlay:set-enabled(enabled: boolean)`.

The renderer never queries the overlay's state; the source of truth
is the `gameOverlay` preference in the appearance store, which is
already persisted. On boot, the appearance store's apply-effect
reads the saved preference and (if true) fires
`overlay:set-enabled(true)` once.

The main process treats the IPC as advisory: "the user wants the
overlay, please honor it." The actual visibility is the AND of
`(user enabled) AND (Hearthstone running)`.

### D5 — Window options

```ts
new BrowserWindow({
  transparent: true,
  frame: false,
  resizable: false,
  movable: false,
  skipTaskbar: true,
  alwaysOnTop: true,
  focusable: false,            // no focus stealing
  fullscreenable: false,
  hasShadow: false,
  show: false,                 // we call .show() once loaded
  width: <primary-display-work-area.width>,
  height: <primary-display-work-area.height>,
  x: 0,
  y: 0,
  webPreferences: {
    preload: <same as main window>,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    backgroundThrottling: false,  // keep tracker live when occluded
  },
});

// After window creation:
win.setAlwaysOnTop(true, 'screen-saver');  // above fullscreen apps
```

We use `screen-saver` level (the highest non-protected) to sit above
Hearthstone's borderless-windowed mode.

### D6 — Renderer / preload reuse

The same preload script and the same renderer bundle are loaded.
The hash-based router resolves `#/overlay` to `OverlayView`.
`I18nProvider`, `AppearanceApplyEffect`, and the deck-tracker store
all subscribe in the overlay window exactly as they do in the main
window — including locale and accent — so the user sees consistent
chrome across both.

### D7 — Persistence shape extension

The appearance store currently persists
`{ density: 'comfortable' | 'compact', accent: 'cyan' | 'teal' | 'violet' }`
under `localStorage.hdt.appearance`. We add `gameOverlay: boolean`
with default `false`. Existing stored payloads without the field
parse cleanly (the fallback hits `false`).

## Risks / Trade-offs

- **Risk:** Some Windows GPU drivers + transparent BrowserWindow +
  `screen-saver` always-on-top combinations cause flickering or
  full-screen artifacts.
  → **Mitigation:** the overlay is opt-in; users who hit driver
  bugs can flip it off. We document the option to disable hardware
  acceleration (already a Settings toggle, even if it's UI-only
  today) as a workaround.

- **Risk:** Hearthstone briefly drops the mirror connection
  mid-match (e.g. the runtime-validation back-off kicks in). The
  3 s poll then sees `isAlive() === false` for a few ticks and
  hides the overlay.
  → **Mitigation:** the visibility transition is throttled — a
  `false` reading must persist for 3 consecutive polls (≈ 9 s)
  before we hide. A `true` reading flips visibility immediately.
  This trades a 9 s lag on graceful HS exit for resilience to
  the runtime-recovery jitter we already know happens.

- **Trade-off:** v1 doesn't follow `Hearthstone.exe`'s window
  rectangle. Borderless-windowed (the standard HS setup) makes
  this fine. Truly windowed HS at 1280×720 in the corner of a
  4K monitor will render the panels in the wrong absolute
  positions. We ship it; the next change (`add-overlay-window-tracking`)
  closes that gap.

- **Trade-off:** No `setIgnoreMouseEvents`. If a transparent pixel
  somehow steals a click, the only fix users have is the kill
  switch (toggle off). We accept this in v1 because the CSS layout
  has been click-through-correct since the Console redesign and
  no bug has been observed in dev.
