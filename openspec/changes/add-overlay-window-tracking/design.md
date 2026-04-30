## Context

After `add-opponent-companion-overlay`, the desktop app spawns two
transparent always-on-top BrowserWindows that fill the primary
display work area. The `OverlayManager` reads
`screen.getPrimaryDisplay().workArea` once at window creation and
never resizes. A bootstrap-level `createOverlayPoller` polls
`hearthmirror.isAlive()` every 3 s, throttles `false` over 3 ticks,
and toggles a `gameRunning` flag on each manager. Final visibility
is `userEnabled AND gameRunning`.

This works as long as Hearthstone is in fullscreen on the primary
display, but the panels' anchoring is to the *display edge*, not to
the *Hearthstone window edge*. Multi-display, windowed-mode, and
moved/resized HS sessions all show the overlay in the wrong place
or on the wrong screen.

The Hearthstone client uses Unity's default window class. On
Windows the title is literally "Hearthstone" and the class name is
"UnityWndClass". `FindWindowW` + `GetWindowRect` get us the bounds;
`IsIconic` + `IsWindowVisible` give us the visibility signal. Our
existing `@hdt/hearthmirror-native` Rust crate already depends on
the `windows` crate for process detection — adding window-bounds
reading is a small extension, not a new native dependency.

## Goals / Non-Goals

**Goals:**
- Pin both overlay BrowserWindows to the live Hearthstone window
  bounds. Move when HS moves, resize when HS resizes, hide when HS
  is minimized.
- Multi-display correctness: HS on display 2 → overlays on display 2.
- Single source of truth for "should the overlay be visible right
  now?" — fold the running-detection into the same poller.
- Keep the renderer-side CSS unchanged. Panels still anchor to
  overlay window edges via `top-10 left-10` / `top-10 right-10`.
  When the overlay window's bounds match HS's bounds, that is also
  exactly the HS edges.
- Unit-testable tracker (no `windows` crate dependency at the
  TypeScript layer).

**Non-Goals:**
- Per-user remembered panel offsets (drag-and-drop reposition of
  panels inside the HS window). v1 hard-codes HS-edge anchoring.
- Panel resize handles. Use existing design defaults.
- Win32 click-through via `setIgnoreMouseEvents`. The existing CSS
  `pointer-events: none` root + `auto` islands pattern is sufficient
  in v1 because the overlay window's bounds now equal HS bounds —
  clicks outside the panel islands fall through to HS, which is the
  expected behavior.
- Hearthstone "Exclusive Fullscreen" support. In exclusive mode no
  other window renders on top regardless of `alwaysOnTop`. We
  document this as unsupported; users must use HS's "Windowed
  (Fullscreen)" mode (the default).
- Mixed-DPI displays. v1 trusts Electron's coordinate system; if
  the user has different DPI on different displays, panel
  positions may be a few pixels off.
- macOS / Linux. The Win32 calls are Windows-only; the same
  HearthstoneWindowTracker abstraction can host a CGWindowList
  implementation later, but v1 ships Windows-only.

## Decisions

### 1. Polling cadence: 200 ms

**Context:** The tracker has to follow the HS window during user
drag operations and window-snap events. Too slow → the overlay
visibly lags behind the HS window. Too fast → wasted CPU when HS
is idle.

**Options:**
- A. 100 ms (10 Hz) — smooth tracking, ~5 % more CPU on idle.
- B. 200 ms (5 Hz) — visibly smooth, low CPU.
- C. 500 ms (2 Hz) — choppy during drag, but minimal CPU.
- D. Adaptive (faster while HS bounds are changing, slower when
  static).

**Choice:** B (200 ms).

**Rationale:** A 200 ms cadence catches drag operations with
acceptable lag (one frame at 60 fps is 16 ms; 200 ms shows ~3-4
catch-up frames). 100 ms is overkill for a feature most users
interact with by clicking a panel, not by smoothly dragging HS
around. Adaptive polling is unnecessary complexity for v1; if real
users complain about lag, an adaptive backoff can land later
without changing any public API.

### 2. Tracker emits diff events, not raw polls

**Context:** Subscribers to the tracker want to react to *changes*,
not every 200 ms tick.

**Options:**
- A. Tracker emits every poll's full state.
- B. Tracker emits only on bounds-change / visibility-change.
- C. Subscribers do their own equality check.

**Choice:** B.

**Rationale:** Calling `BrowserWindow.setBounds(rect)` with bounds
that haven't changed is a no-op but still serializes / IPCs to the
window-server thread. Filtering at the source is cheap and saves
work in every subscriber. Bounds equality is a 4-field check;
trivial.

### 3. The 3-strike-false throttle moves to the visibility flip

**Context:** Today's `createOverlayPoller` throttles the `running →
stopped` transition over 3 consecutive false readings to suppress
mirror jitter. The new tracker has TWO inputs (running and
visible), but for the overlay's purposes only one signal matters:
"should the overlay show?"

**Options:**
- A. Throttle separately on each of `running` and `visible`.
- B. Combine into a single `visibleOnScreen` boolean and throttle
  the false transition there.
- C. Drop the throttle entirely (the new poll is faster — 200 ms
  vs 3000 ms — so a single false reading recovers in 200 ms).

**Choice:** B + faster threshold.

**Rationale:** The user-facing signal is "is the HS game window
currently a real visible thing on screen?" That's a single
boolean. Both "HS process not running" and "HS window minimized"
collapse to the same false. Throttling the combined boolean over
**5 polls** (≈ 1 s at 200 ms cadence) keeps the same total throttle
*duration* (~1 s) while emitting a single source-of-truth signal.

The faster cadence makes the throttle feel snappier — the user
restores HS from the taskbar and the overlay re-appears within a
second instead of three.

### 4. Reposition the BrowserWindow vs. position panels via HS bounds

**Context:** Two ways to make the panels track HS:
- A. Resize the overlay BrowserWindow to match HS bounds. Panels
  position relative to overlay window edges (existing CSS works
  unchanged).
- B. Keep the overlay full-screen, position panels via absolute
  coordinates derived from HS bounds. Pass HS bounds into the
  renderer.

**Choice:** A.

**Rationale:** A keeps the renderer untouched. The CSS `top-10
left-10` / `top-10 right-10` we already ship anchors to overlay
window edges — when the overlay window IS the HS window's
projection, those anchors automatically equal HS edges. B requires
piping HS bounds through IPC into the renderer, then the renderer
positions panels via inline styles, which fights every component
that expects to fill its parent. A is also more performant: clicks
outside the overlay window fall straight through to HS without
needing CSS pointer-events trickery. (We keep the CSS anyway as a
safety net.)

### 5. Bounds emitted to BOTH overlay windows simultaneously

**Context:** The two overlay windows (player route + opponent
route) both should track HS. Should they have separate bounds,
shared bounds, or different relative positioning?

**Options:**
- A. Same bounds for both. Each window full-fills HS bounds; CSS
  inside each route positions its single panel on its own side.
- B. Different bounds: player window covers the LEFT half of HS,
  opponent window covers the RIGHT half.
- C. Each window sized to fit just its panel, positioned inside
  HS bounds.

**Choice:** A.

**Rationale:** A matches what the renderer expects today — the
existing `OverlayView.tsx` and `OpponentOverlayView.tsx` each fill
their window with `pointer-events: none` and put their panel
island on one side. B and C make the two windows have different
bounds, complicating the tracker fan-out and potentially leaving
seams between them. A is also more flexible if a future change
adds a second panel on the same side (e.g. a turn timer next to
the player deck list) — the panel just lives in the same window.

The two windows occupy the same bounds; their z-order is whatever
Electron / the OS chooses. They render their panels on opposite
sides so they don't visually overlap. (If a future change wants to
add UI in the *middle* of the HS window, the z-order matters —
that's a problem for that change.)

### 6. Tracker uses `setInterval` directly, not Node EventEmitter

**Context:** The tracker has a small public surface (`start`,
`stop`, `subscribe`). It doesn't need full EventEmitter semantics
(once, multiple events with different shapes, on-demand removal of
specific listeners).

**Options:**
- A. Plain callback list:
  `subscribe(cb): () => void` (returns an unsubscribe).
- B. Node `EventEmitter` with named events `bounds-change` and
  `visibility-change`.
- C. RxJS `BehaviorSubject`.

**Choice:** A.

**Rationale:** The tracker has at most 2 subscribers (the two
overlay managers), shared in one process. A plain callback list is
~10 lines, fully testable, no surprises around once / off /
prependListener. EventEmitter buys nothing here. RxJS is overkill
for one boolean + one rect.

The callback signature: `subscribe((event: TrackerEvent) => void)`
where `TrackerEvent` is a discriminated union of
`{ kind: 'bounds'; bounds }` and `{ kind: 'visibility'; visible }`.

### 7. Window not found → emit visibility=false

**Context:** When `FindWindowW` returns no match (HS not running
or running but pre-window), what does the tracker emit?

**Choice:** Emit `{ kind: 'visibility', visible: false }`. Do NOT
emit a `bounds` event.

**Rationale:** Bounds without a window doesn't have a meaningful
value. Visibility is unambiguous: no window → not visible. The
overlay manager already maps "not visible" → hide window, so the
behavior is right.

When the window appears (HS launches), the next poll emits BOTH
events: bounds first (so the manager can position before showing),
then visibility=true (so the manager shows). Order matters here —
the tracker dispatches in the listed order to ensure the `show()`
happens against fresh bounds.

## Risks / Trade-offs

- **Risk:** Polling at 200 ms increases CPU when overlays are
  enabled. **Mitigation:** the tracker only polls when at least
  one overlay is enabled (same client-counted lifecycle as the
  current `createOverlayPoller`). When both overlays are disabled
  the tracker stops. Manual measurement target: < 0.5 % CPU on a
  modern machine while polling.
- **Risk:** `FindWindowW` returns the wrong window if some other
  Unity-based app uses class "UnityWndClass" with title
  "Hearthstone" (extremely unlikely, but possible).
  **Mitigation:** v1 trusts the FindWindow result. A future
  change can verify by checking the owning process's executable
  path matches "Hearthstone.exe" via `GetWindowThreadProcessId` +
  `OpenProcess` + `QueryFullProcessImageNameW`.
- **Risk:** `setBounds` during user drag of HS can cause flicker
  on the overlay edge as the window stretches.
  **Mitigation:** acceptable for v1; the same flicker happens with
  the original C# HDT app. Real users rarely drag HS during a
  match. Frame-rate-perfect tracking requires hooking
  `WM_WINDOWPOSCHANGED`, which is far out of scope.
- **Risk:** HS exclusive fullscreen renders ABOVE our
  alwaysOnTop window. **Mitigation:** documented as unsupported.
  The README / settings UI should call this out (deferred to a
  later docs / Settings change).
- **Trade-off:** A new `hearthmirror:get-window` IPC channel is
  added but not consumed by any current renderer. Cost is one
  preload binding + one channel registration. Worth keeping for
  end-to-end test scaffolding even if no UI uses it in v1.

## Migration Plan

Native crate + main-process only. No DB / IPC schema migrations.
The existing `OverlayManager` keeps the same `enable` / `disable`
/ `dispose` public surface; only `setRunning` is replaced by
`setVisibleOnScreen` and a new `setBounds` is added. The renderer
is untouched.

The `createOverlayPoller` factory is deleted. Anything that
imported it (only the bootstrap) is rewired to the tracker.

Testing strategy:
- Native crate: integration test gated behind `--features
  integration` and the presence of a real `Hearthstone.exe`
  process — same gating already used for other live-mirror tests.
- Tracker: unit tests against an injected `getHearthstoneWindow`
  function (no real Win32). Cover the full state machine: window
  appears, window moves, window minimizes, window disappears,
  jitter (false→true→false within throttle window).
- OverlayManager: extend existing class-level tests to cover
  `setBounds(rect)` calls `BrowserWindow.setBounds` and
  `setVisibleOnScreen(false)` hides the window.

## Open Questions

- *Should the tracker also poll when overlays are disabled, in
  case the user toggles overlay on mid-match and we want bounds
  ready instantly?* No — the tracker emits a fresh bounds-then-
  visibility pair within 200 ms of starting, which is fast enough
  for a toggle-on action. Saving idle CPU is worth the 200 ms
  first-emit lag.
- *Should `getHearthstoneWindow()` return Hearthstone's *client
  area* bounds or its full window bounds (including title bar in
  windowed mode)?* Full window bounds. The user runs Hearthstone
  in "Windowed Fullscreen" virtually 100 % of the time, where
  the title bar is hidden anyway. Windowed mode is an edge case
  and a 30-pixel title-bar offset is acceptable.
