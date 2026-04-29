## Why

The current `MonoRuntime` is initialized once into a `Mutex<Option<MonoRuntime>>` global. The init guard retries while it is still `None`, but the moment `MonoRuntime::init()` returns `Ok` the runtime is cached forever — even if the bound process dies, gets a new PID, or was captured during Hearthstone's pre-Assembly-CSharp boot window. Real-world reproduction (2026-04-29 manual smoke for `add-deck-management`, see also spike 0003 R-tracking discussion):

1. User runs `pnpm dev` while Hearthstone is on the splash / login screen.
2. `MonoRuntime::init()` succeeds — process found, mono module found, root domain non-NULL — but `domain_assemblies` either does not yet contain `Assembly-CSharp.dll`, or contains it but our captured PID/handle becomes invalid the moment Hearthstone restarts to enter game.
3. Subsequent reflector calls produce `[hearthmirror:getBattleTag] Error: module not found: Assembly-CSharp.dll` indefinitely. The deck-tracker stays in `IDLE`. The live-deck panel reads "Waiting for match to start..." forever.
4. The user observes the symptom only after entering a match and seeing nothing track. The only known recovery is killing `pnpm dev` and restarting in the correct order (Hearthstone fully loaded → then `pnpm dev`).

This forces an unsupportable startup-order dependency on users and obscures genuine match-start failures behind a stale-runtime mask. ADR 0001 already commits us to "treat hearthmirror as a stable in-process bridge"; persistent stale state violates that commitment.

## What Changes

- **NEW** `MonoRuntime` tracks the captured `pid` explicitly and exposes a cheap `is_process_alive_and_same()` liveness probe (Win32 `GetExitCodeProcess` + `GetProcessId`). Probe runs in O(1), no memory reads.
- **NEW** Native call wrappers `with_runtime` / `with_runtime_or` / `is_alive` invalidate the `MIRROR` global before each call when the cached runtime fails the liveness probe, then attempt re-init through the existing `try_init()` path. Already-correct runtime stays cached.
- **NEW** Reflector wrappers retry once when `find_image_cached("Assembly-CSharp.dll")` returns `ScryError::ModuleNotFound` — invalidate the runtime, re-init, replay the call. Single retry only; persistent failure surfaces unchanged so the renderer still sees the canonical error.
- **NEW** Optional rate-limit on re-init attempts: after a failed `try_init()`, the next attempt is deferred for 2 s (configurable) to avoid hot-looping when Hearthstone is genuinely closed or stuck. Subsequent successful inits clear the back-off.
- **MODIFIED** `is_alive()` semantic: now returns `false` AND invalidates the cached runtime when the bound process is gone. Renderer's `useHearthMirrorStatus` already polls this; the UI status pill flips grey within one tick of Hearthstone exit.
- **NEW** Diagnostic hook: `MonoRuntime` records the PID it was bound to. The next manual `dump_reflection` run prints `runtime: pid=<n> bound_at=<unix_ms> reinits_so_far=<m>` so spike Run 14+ logs can correlate failure to runtime age.
- **NEW** Logging: each runtime invalidation logs a single line via the existing `eprintln`/tracing path (`MonoRuntime: invalidated (reason=process-changed pid_was=12345 pid_now=67890)`). No new dependency.

## Capabilities

### New Capabilities

None — this is a robustness hardening of an existing capability.

### Modified Capabilities

- `hearthmirror-native`: Add requirements for runtime invalidation, process-identity tracking, single-retry on `ModuleNotFound(Assembly-CSharp.dll)`, and bounded re-init back-off. Existing `init()` shape is preserved; the new behavior layers on top in the napi wrapper layer.
- `hearthmirror-api`: Tighten the `isAlive()` contract — it now flips to `false` within one poll of Hearthstone process death (previous wording allowed indefinite cached `true`).

## Impact

- **Code (modified)**:
  - `packages/hearthmirror/native/src/lib.rs`: `with_runtime`, `with_runtime_or`, `is_alive`, plus new `invalidate_runtime_if_stale()` helper.
  - `packages/hearthmirror/native/src/mono/runtime.rs`: store `pid`, expose `pid()` and `is_process_alive_and_same()`.
  - `packages/hearthmirror/native/src/handle.rs`: expose `raw_handle()` so the liveness probe can call `GetExitCodeProcess` without cloning.
  - `packages/hearthmirror/native/Cargo.toml`: enable `Win32_Foundation` `GetExitCodeProcess` feature on the existing `windows` crate (no version bump).
- **Code (new)**: integration test `packages/hearthmirror/native/tests/integration_runtime_recovery.rs` (gated `cfg(feature = "integration")`) covering process-restart recovery on a real Hearthstone instance.
- **Code (unchanged)**: TypeScript layer (`packages/hearthmirror/src/hearthmirror.ts`) and IPC layer (`apps/desktop/src/main/ipc.ts`). The recovery is fully internal to the native bridge.
- **Tests**: 6+ new Rust unit tests covering liveness probe, single-retry path, and back-off. Existing 80 Rust unit tests must stay green.
- **Performance**: liveness probe is `GetExitCodeProcess` (one syscall, kernel returns from process struct, ≤1 µs). At 500 ms poll cadence the overhead is undetectable.
- **No renderer surface changes**: hooks like `useHearthMirrorStatus` already react to `isAlive` flipping. Saved-deck stack from `add-deck-management` is unaffected.
- **No spec sync churn**: only `hearthmirror-native` and `hearthmirror-api` get appended requirements; their existing scenarios remain valid.

## Non-goals

- **Restart Hearthstone for the user** — out of scope; we only recover from observed restarts.
- **Hot-reload `MonoOffsets` mid-session** — offsets are tied to mono dll SHA-1 (Run 14 records this); a different mono build means full re-init via the same path, not a partial offset refresh.
- **Cross-process IPC migration** — ADR 0001 stays put; we are not switching to a sidecar process model.
- **Detecting Hearthstone *patch* changes mid-session** — if Blizzard pushes an update while the app is running, our offsets may drift. That is a known spike-0003 R-track item, not this change.
- **Renderer-side retry UI** — the renderer already polls; if a single tick still fails after one re-init, the next tick (500 ms later) will try again. No spinner / banner needed.
- **Replaying queued reflector calls** — calls fail through; the deck-tracker's polling cadence covers latency without us needing a queue.
