## ADDED Requirements

### Requirement: MonoRuntime captures and exposes its bound process identity

The `MonoRuntime` SHALL persist the OS process id (`pid`) it was bound to during `init()`, and SHALL expose:

- `pid() -> u32` returning the bound pid.
- `is_process_alive_and_same() -> bool` returning `true` only if BOTH the bound process is still running AND the current `Hearthstone.exe` pid (per `find_pid`) equals the bound pid.

The probe MUST be O(1) syscall cost (no memory reads, no module enumeration). It MUST NOT panic on any handle state — a kernel-level failure (`WAIT_FAILED`) MUST be treated as "not alive".

#### Scenario: Probe returns true for a freshly-init runtime

- **GIVEN** a `MonoRuntime` constructed via `init()` against a running Hearthstone
- **WHEN** `is_process_alive_and_same()` is called
- **THEN** it returns `true`

#### Scenario: Probe returns false after the bound process exits

- **GIVEN** a `MonoRuntime` whose bound process has exited
- **WHEN** `is_process_alive_and_same()` is called
- **THEN** it returns `false`

#### Scenario: Probe returns false when a different Hearthstone instance is now active

- **GIVEN** a `MonoRuntime` whose bound pid is `P1` AND `find_pid("Hearthstone.exe")` now returns `P2` with `P2 != P1`
- **WHEN** `is_process_alive_and_same()` is called
- **THEN** it returns `false`

### Requirement: Native call wrapper invalidates stale runtime before each call

The napi entry-point wrappers (`with_runtime`, `with_runtime_or`, `is_alive`) SHALL call `is_process_alive_and_same()` before reusing a cached runtime. If the probe returns `false`, the wrapper MUST replace the cached `Some(MonoRuntime)` with `None` and proceed through the normal `try_init()` re-initialization path before invoking the caller's closure.

#### Scenario: Stale runtime is replaced transparently

- **GIVEN** a cached `MonoRuntime` whose `is_process_alive_and_same()` returns `false`
- **WHEN** any reflector wrapper (e.g. `with_runtime` for `getBattleTag`) is invoked
- **THEN** the cached runtime is dropped, `try_init()` is attempted, and the caller's closure runs against the new runtime if init succeeds, or the wrapper returns `None` / `default` if init fails

#### Scenario: Healthy runtime is reused without re-init

- **GIVEN** a cached `MonoRuntime` whose `is_process_alive_and_same()` returns `true`
- **WHEN** a reflector wrapper is invoked
- **THEN** no `try_init()` runs and the cached runtime is reused

### Requirement: Single retry on Assembly-CSharp ModuleNotFound

When a reflector closure invoked through `with_runtime` / `with_runtime_or` returns `Err(ScryError::ModuleNotFound)` for `"Assembly-CSharp.dll"` specifically, the wrapper SHALL invalidate the cached runtime exactly once, attempt `try_init()`, and replay the closure once. Persistent failure after one retry MUST surface to the caller unchanged.

The retry trigger MUST be keyed on the image name: misses for other images (e.g. `blizzard.bgsclient.dll`) MUST NOT trigger the retry path.

#### Scenario: Splash-then-main-menu transition recovers within two calls

- **GIVEN** a `MonoRuntime` initialized while Hearthstone was on splash, where `Assembly-CSharp.dll` walks return `ModuleNotFound`
- **WHEN** the user enters the main menu and the next reflector call (e.g. `getMatchInfo`) is made
- **THEN** the wrapper invalidates the cached runtime, re-inits, and replays the reflector against the new runtime

#### Scenario: Persistent ModuleNotFound surfaces after one retry

- **GIVEN** a `MonoRuntime` whose post-reinit `Assembly-CSharp.dll` walk also returns `ModuleNotFound`
- **WHEN** a reflector is invoked
- **THEN** the call returns `Ok(None)` (or `Ok(default)` for `with_runtime_or`) — the renderer sees the same canonical "no data" signal as before

### Requirement: Bounded re-init back-off when init fails

After a `try_init()` that returns `None`, the runtime cache SHALL store the failure timestamp. Subsequent attempts to re-init within a configurable back-off window (default 2000 ms) MUST short-circuit and return without calling `find_pid` or `OpenProcess`. The first successful `try_init()` MUST clear the back-off timer.

The back-off duration MAY be overridden via the `HDT_HEARTHMIRROR_REINIT_BACKOFF_MS` environment variable for development.

#### Scenario: Repeated failures within the window do not enumerate processes

- **GIVEN** `try_init()` returned `None` 500 ms ago
- **WHEN** any reflector wrapper invokes the cache miss path
- **THEN** `find_pid` is NOT called and the wrapper returns the unavailable response immediately

#### Scenario: Successful init clears the back-off timer

- **GIVEN** `try_init()` returned `None` 1500 ms ago
- **AND** Hearthstone has now started
- **WHEN** the back-off window expires and the next call attempts re-init
- **THEN** `try_init()` runs, succeeds, the back-off timer is cleared, and subsequent calls reuse the new runtime

### Requirement: Diagnostic visibility for invalidation events

Each runtime invalidation (whether from staleness probe or retry trigger) SHALL emit a single diagnostic line via the existing `eprintln!` channel including the reason, the previous pid, and the current pid (if known). The runtime SHALL track and expose a monotonic `reinit_count` accessible for inclusion in the `dump_reflection` example output.

#### Scenario: Invalidation logs once per event

- **GIVEN** a cached runtime
- **WHEN** the staleness probe triggers invalidation
- **THEN** a single line of the form `MonoRuntime: invalidated (reason=… pid_was=… pid_now=…)` is written to stderr
- **AND** `reinit_count` increments by exactly one
