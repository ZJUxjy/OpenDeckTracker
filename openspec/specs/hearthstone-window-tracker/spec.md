# hearthstone-window-tracker Specification

## Purpose
TBD - created by archiving change add-overlay-window-tracking. Update Purpose after archive.
## Requirements
### Requirement: Native Hearthstone-window query

`@hdt/hearthmirror-native` SHALL expose a `getHearthstoneWindow()`
napi-rs binding that returns a structure with the active
Hearthstone window's bounds and visibility state, or `null` when no
matching window exists.

The implementation MUST use `FindWindowW` with class name
`UnityWndClass` and window name `Hearthstone` to locate the window,
followed by `GetWindowRect` for the bounds and `IsIconic` /
`IsWindowVisible` for the visibility flags.

The returned structure MUST contain integer pixel coordinates:

- `x: number`, `y: number` — top-left of the window in virtual-
  screen coordinates.
- `width: number`, `height: number` — derived from
  `GetWindowRect`'s right/bottom minus left/top.
- `minimized: boolean` — `IsIconic` result.
- `visible: boolean` — `IsWindowVisible` result.

The function MUST be safe to call from any thread and MUST NOT
hold any process or window handle past return.

#### Scenario: No Hearthstone window present

- **GIVEN** Hearthstone is not running
- **WHEN** `getHearthstoneWindow()` is called
- **THEN** the result is `null`

#### Scenario: Window found returns full bounds

- **GIVEN** Hearthstone is running with a 1920×1080 window at
  origin (0, 0)
- **WHEN** `getHearthstoneWindow()` is called
- **THEN** the result has `x === 0`, `y === 0`, `width === 1920`,
  `height === 1080`
- **AND** `visible === true`
- **AND** `minimized === false`

#### Scenario: Minimized window flagged

- **GIVEN** Hearthstone is running but minimized to taskbar
- **WHEN** `getHearthstoneWindow()` is called
- **THEN** the result's `minimized === true`

### Requirement: TypeScript wrapper proxies the native call

`@hdt/hearthmirror` SHALL expose
`mirror.getHearthstoneWindow(): Promise<HearthstoneWindow | null>`
which proxies to the native binding without modification, and a
matching `HearthstoneWindow` exported type.

The wrapper MUST treat thrown native errors as `null` (mirror is
not alive, native crate panicked, etc.) — the caller can distinguish
"no window" from "error" by other means if needed.

#### Scenario: Wrapper returns null on native error

- **GIVEN** the native call throws
- **WHEN** `mirror.getHearthstoneWindow()` is awaited
- **THEN** the resolved value is `null`

### Requirement: Main-process tracker polls the window state

`apps/desktop/src/main/hearthstone-window-tracker.ts` SHALL export
a `createHearthstoneWindowTracker` factory returning an object
with `addClient()`, `removeClient()`, `subscribe(cb)`, and `stop()`
methods.

The tracker MUST own a `setInterval(intervalMs)` timer (default
`200 ms`) that calls `getHearthstoneWindow()` on each tick.

The tracker MUST start polling when the first client is added and
stop polling when the last client is removed. Subscribers
registered via `subscribe(cb)` receive emitted events for the
lifetime of the tracker.

The tracker MUST emit two event kinds, in a discriminated-union
shape:

- `{ kind: 'bounds'; bounds: { x, y, width, height } }`
- `{ kind: 'visibility'; visible: boolean }`

Bounds events MUST only fire when the (x, y, width, height) tuple
differs from the most-recently-emitted bounds. Visibility events
MUST only fire when the boolean flips.

A poll where `getHearthstoneWindow()` returns `null` MUST be
treated as `visible: false`. A poll where the result has
`minimized === true` OR `visible === false` MUST also map to
`visible: false`. Any other case (a window that's visible and
not minimized) maps to `visible: true`.

When a poll first sees a window after a sequence where the window
was missing, the tracker MUST emit the bounds event BEFORE the
visibility event so subscribers can position before showing.

#### Scenario: Tracker is dormant before first client

- **WHEN** the tracker is created but no client has been added
- **THEN** no poll has occurred (`getHearthstoneWindow` was not
  called)

#### Scenario: Tracker starts polling on first addClient

- **GIVEN** a tracker with zero clients
- **WHEN** `addClient()` is called
- **THEN** a poll fires immediately
- **AND** subsequent polls fire at the configured interval

#### Scenario: Tracker stops polling when all clients are removed

- **GIVEN** a tracker with one active client
- **WHEN** `removeClient()` is called
- **THEN** the next interval tick does NOT call
  `getHearthstoneWindow`

#### Scenario: Bounds event only fires on diff

- **GIVEN** a subscriber and the tracker has emitted one bounds
  event for `(0, 0, 1920, 1080)`
- **WHEN** the next poll returns the same bounds
- **THEN** the subscriber receives no further bounds event

#### Scenario: Window appearance emits bounds-then-visibility

- **GIVEN** a tracker that has only ever seen `null` results
- **WHEN** the next poll returns a visible non-minimized window
- **THEN** the subscriber receives a `bounds` event first
- **AND** then a `visibility` event with `visible: true`

#### Scenario: Visibility false on null result

- **GIVEN** a tracker last reported `visible: true`
- **WHEN** `getHearthstoneWindow()` returns `null`
- **THEN** the subscriber receives a `visibility` event with
  `visible: false`

### Requirement: Visibility false transition is throttled

The tracker MUST throttle the visibility-true → visibility-false
transition: a `false` reading must persist across 5 consecutive
polls (≈ 1 s at the default 200 ms cadence) before a
`visibility` event with `visible: false` is emitted. The
visibility-false → visibility-true transition is NOT throttled —
a single `true` reading flips immediately.

The throttle counter MUST reset to zero on any `true` reading.

#### Scenario: Brief jitter does not flicker visibility

- **GIVEN** the tracker last emitted `visibility: true`
- **WHEN** the next 4 polls return `null` and the 5th returns a
  visible window
- **THEN** the subscriber receives no `visibility` event in this
  span (the throttle resets on the 5th tick's `true` reading)

#### Scenario: Sustained false flips after throttle elapses

- **GIVEN** the tracker last emitted `visibility: true`
- **WHEN** 5 consecutive polls return `null`
- **THEN** the subscriber receives one `visibility: false` event
  on the 5th tick

### Requirement: Tracker exposes get-window IPC channel

The desktop main process SHALL register an IPC handler for
`hearthmirror:get-window` that returns the most-recent native
result (or `null`). The handler MUST be a thin wrapper around
`mirror.getHearthstoneWindow()` — it MUST NOT cache the value
across IPC calls.

The desktop preload SHALL expose
`window.hdt.hearthmirror.getWindow(): Promise<HearthstoneWindow | null>`
which forwards to that channel. The renderer is not required to
consume this binding in v1 — it exists for end-to-end test
scaffolding.

#### Scenario: IPC channel returns the native result

- **WHEN** the renderer invokes `hearthmirror:get-window`
- **THEN** the resolved value matches what
  `mirror.getHearthstoneWindow()` returns at that moment

