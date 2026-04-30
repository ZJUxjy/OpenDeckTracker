## Why

The just-shipped overlay windows (player + opponent) are pinned to
the **full work area of the primary display** — the main process
calls `screen.getPrimaryDisplay().workArea` once at window creation
and never moves the BrowserWindow afterwards. That works for users
running Hearthstone in fullscreen on display 1, but breaks for:

- **Multi-display setups** — Hearthstone on display 2 leaves our
  overlay floating on display 1, completely useless.
- **Windowed Hearthstone** — the panels render at top-10 / right-10
  of the *display* edge, not the *Hearthstone window* edge, so they
  drift far away from the actual game.
- **Resizable Hearthstone** — moving / resizing the HS window leaves
  our overlay stuck in place.
- **Minimized / Alt-tabbed Hearthstone** — the overlay still draws
  even though the user is on a different desktop, because our
  show/hide gate only checks `hearthmirror.isAlive()` (process is
  running ≠ window is on screen).

The original C# HDT app pins its overlay to the Hearthstone window
itself: position + size + visibility all track the HS window in
real time. This change brings us to the same level — the overlay
becomes a true *in-game* overlay rather than a generic full-screen
transparent window we hope the user happens to put behind
Hearthstone.

## What Changes

- **NEW** Rust API in `@hdt/hearthmirror-native`:
  `getHearthstoneWindow()` returning
  `{ x, y, width, height, minimized, visible } | null`. Implemented
  via `FindWindowW("UnityWndClass", "Hearthstone")` +
  `GetWindowRect` + `IsIconic` + `IsWindowVisible`. Returns `null`
  when no HS window is found (HS not running, or running but no
  window yet during boot).
- **NEW** TypeScript wrapper in `@hdt/hearthmirror`:
  `mirror.getHearthstoneWindow(): Promise<HearthstoneWindow | null>`
  with the same shape.
- **NEW** Main-process `HearthstoneWindowTracker`
  (`apps/desktop/src/main/hearthstone-window-tracker.ts`): owns a
  `setInterval(200)` poller of `getHearthstoneWindow()` and emits
  `bounds-change` and `visibility-change` events to subscribers.
  Replaces the bootstrap-level `createOverlayPoller`'s role of
  "drive overlay visibility" — running-detection collapses into the
  same poller.
- **MODIFIED** `OverlayManager`:
  - Adds `setBounds(rect: { x; y; width; height }): void` that calls
    `BrowserWindow.setBounds(rect)`.
  - Removes the static `screen.getPrimaryDisplay().workArea` call
    inside `createWindow()`. The window starts at `{ x: 0, y: 0,
    width: 1, height: 1 }` (so it exists but is effectively
    invisible) and the tracker calls `setBounds` on first poll.
  - `setRunning(true)` no longer alone causes the window to show —
    visibility now also requires "HS window is visible AND not
    minimized."
- **MODIFIED** Main bootstrap (`apps/desktop/src/main/index.ts`):
  - Replaces `createOverlayPoller` with
    `createHearthstoneWindowTracker`.
  - On `bounds-change`: forwards the new bounds to BOTH overlay
    managers. Each overlay window gets the SAME bounds (they
    z-order independently via Electron's window stack; the panels
    render on opposite sides via existing CSS so they don't overlap).
  - On `visibility-change`: forwards to both managers as the new
    `setVisibleOnScreen(boolean)` signal. Overlay shows iff
    `userEnabled AND visibleOnScreen` (replacing the earlier
    `userEnabled AND gameRunning`). The 3-strike-false throttle
    moves to the visibility transition (so brief minimize/restore
    flicker doesn't ping-pong the overlay).
- **NEW** New `hearthmirror:get-window` IPC channel (mirrors the
  existing `hearthmirror:isAlive` shape). The renderer doesn't use
  it directly in v1 — it exists for future debugging UIs and
  end-to-end tests.
- **REMOVED** The bootstrap-level `createOverlayPoller` factory (its
  responsibility folds into `HearthstoneWindowTracker`).
  **BREAKING** for anything that imported `createOverlayPoller` —
  internal-only, no external consumers.
- **Non-goals (deferred to follow-up changes):**
  - Per-window remembered offsets (user-customized panel positions
    inside the HS window). v1 anchors to HS edges via the existing
    `top-10 left-10` / `top-10 right-10` CSS.
  - Panel resize handles. Use design's default sizes.
  - Win32 `setIgnoreMouseEvents` true click-through. v1 keeps the
    existing CSS `pointer-events: none` root + `auto` islands
    pattern, which works fine because the overlay window now sizes
    to HS bounds — clicks outside the panel islands hit the OS
    desktop, not our transparent fill.
  - Hearthstone exclusive-fullscreen support (where no other window
    can render on top). The overlay only works in HS's
    "Windowed (Fullscreen)" mode; HS's exclusive mode is documented
    as unsupported. (Most HS players are already on Windowed
    Fullscreen by default.)
  - Detection of *occlusion* by other apps (Discord call window,
    notifications). The OS handles this via z-order through
    `alwaysOnTop: 'screen-saver'` — sufficient for v1.
  - DPI-scaling correctness across displays with different DPI.
    Single-DPI assumed for v1; mixed-DPI is a future concern.

## Capabilities

### New Capabilities

- `hearthstone-window-tracker`: Domain rules and lifecycle for the
  main-process tracker that polls the Hearthstone window's bounds /
  minimized / visible state and emits change events. Defines the
  poll cadence, debounce policy, and the contract the tracker
  honors when HS is not running.

### Modified Capabilities

- `overlay-window`: The window manager gains a `setBounds` method
  and a `setVisibleOnScreen` visibility input. The "running →
  visible" gate becomes "visibleOnScreen → visible." The static
  primary-display sizing requirement is replaced with a tracker-
  driven sizing requirement.
- `hearthmirror-api`: Surface gains `getHearthstoneWindow()` (the
  wrapper that proxies to the new native call).

## Impact

- `packages/hearthmirror/native/Cargo.toml` — add the
  `Win32_UI_WindowsAndMessaging` feature to the `windows` crate.
- `packages/hearthmirror/native/src/window.rs` (new) — the Win32
  call, plus napi-rs binding.
- `packages/hearthmirror/native/src/lib.rs` — export `window` module.
- `packages/hearthmirror/src/native.ts` + `hearthmirror.ts` — TS
  wrapper.
- `apps/desktop/src/main/hearthstone-window-tracker.ts` (new) —
  the polling tracker.
- `apps/desktop/src/main/overlay-window.ts` — `setBounds` +
  `setVisibleOnScreen`, drop static workArea sizing.
- `apps/desktop/src/main/index.ts` — replace `createOverlayPoller`
  with the tracker; wire bounds + visibility fan-out.
- `apps/desktop/src/main/overlay-poller.ts` — DELETE.
- `apps/desktop/src/main/overlay-poller.test.ts` — DELETE.
- `apps/desktop/src/main/ipc.ts` — register
  `hearthmirror:get-window`.
- `apps/desktop/src/preload/index.ts` — add `hearthmirror.getWindow`
  binding.
- No renderer-side changes. The existing CSS `top-10 left-10` /
  `top-10 right-10` keeps anchoring to overlay window edges, which
  now equal HS window edges.
- No DB / IPC schema migrations.
- No new external dependencies (the `windows` crate is already a
  dep; we just enable an extra feature).
