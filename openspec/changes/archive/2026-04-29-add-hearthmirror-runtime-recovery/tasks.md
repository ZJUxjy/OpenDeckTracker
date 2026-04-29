## 1. MonoRuntime Process-Identity + Liveness Probe

- [x] 1.1 Add a failing test in `packages/hearthmirror/native/src/mono/runtime.rs` (under the existing `tests` mod) named `pid_getter_returns_bound_pid` asserting that a constructed `MonoRuntime` returns the same pid via a public `pid()` accessor. Skip-if-no-HS guard via `#[ignore]`. Run `cargo test -p hearthmirror-native --lib pid_getter` and expect failure (compile error: no `pid` field).
- [x] 1.2 Add a `pid: u32` field to `MonoRuntime`, populate it from the `find_pid` result in `init()`. Add a `pub fn pid(&self) -> u32` getter. Add `pub fn reinit_count(&self) -> u64` returning a static counter (incremented elsewhere). Run `cargo test -p hearthmirror-native --lib pid_getter` and expect pass.
      → `reinit_count` accessor deferred to Section 2 where the counter actually lives (on `RuntimeSlot`); `MonoRuntime::pid()` only here. Field renamed `bound_pid` to disambiguate from `find_pid`.
- [x] 1.3 Expose `pub fn raw_handle(&self) -> HANDLE` on `OwnedProcessHandle` in `packages/hearthmirror/native/src/handle.rs` so the liveness probe can call `WaitForSingleObject` without cloning. Run `cargo build -p hearthmirror-native` and expect exit code 0.
      → No-op: `OwnedProcessHandle::raw()` already public; reused that.
- [x] 1.4 Add `Win32_Foundation` `WaitForSingleObject` and `GetExitCodeProcess` (already present, just verify) imports to `packages/hearthmirror/native/Cargo.toml`. Run `cargo build -p hearthmirror-native` and expect exit code 0.
      → No-op: `Win32_System_Threading` already enabled, brings `WaitForSingleObject` + `WAIT_TIMEOUT`/`WAIT_OBJECT_0`. Did NOT need `GetExitCodeProcess` after design D2 chose `WaitForSingleObject`.
- [x] 1.5 Implement `pub fn is_process_alive_and_same(&self) -> bool` on `MonoRuntime`:
      - Call `WaitForSingleObject(handle, 0)`. If result != `WAIT_TIMEOUT`, return `false`.
      - Call `find_pid(HEARTHSTONE_EXE)`. If `Ok(Some(p))` and `p == self.pid`, return `true`. Otherwise return `false`.
      → Implemented + factored the pure logic into a free `is_alive_and_same(handle, bound_pid, current_target_pid)` helper for unit testability.
- [x] 1.6 Add unit test `is_process_alive_and_same_true_for_self_pid` in `runtime.rs` constructing a `MonoRuntime`-shaped fake whose handle wraps the test process's own handle and whose pid is the test process's pid; assert `is_process_alive_and_same()` returns `true`. (Use `OwnedProcessHandle::current()` if it exists, otherwise add it.)
      → Tests target the free `is_alive_and_same` helper instead of constructing a MonoRuntime fake (every other field would need wiring up). 4 tests cover: (a) self-pid + matching target, (b) invalid HANDLE, (c) live handle but pid mismatch, (d) live handle but no target running. Plus 2 integration tests gated by `feature = "integration"` against real Hearthstone.
- [x] 1.7 Add unit test `is_process_alive_and_same_false_for_invalid_handle` constructing a fake with an invalid HANDLE; assert it returns `false` without panicking.
- [x] 1.8 Run `cargo test -p hearthmirror-native --lib is_process_alive` and expect both tests pass. → 86 total / 4 new probe tests + 2 integration tests all pass.
- [x] 1.9 Run `cargo clippy -p hearthmirror-native --lib --all-features -- -D warnings` and expect exit code 0.
- [x] 1.10 Commit with message `feat(hearthmirror): track bound pid and add liveness probe`.

## 2. RuntimeSlot Wrapper + Back-off

- [x] 2.1 Add a failing test in `packages/hearthmirror/native/src/lib.rs` (or a new sibling `runtime_slot.rs` if cleaner) named `back_off_short_circuits_repeated_failed_inits` that:
      - constructs a `RuntimeSlot` with a stub `try_init` that always returns `None` and counts invocations,
      - calls the cache-miss path twice within 100 ms,
      - asserts the stub was called exactly once.
      Run `cargo test -p hearthmirror-native --lib back_off_short_circuits` and expect failure.
- [x] 2.2 Define a new `struct RuntimeSlot { runtime: Option<MonoRuntime>, last_failed_init: Option<Instant>, reinit_count: u64 }`. Replace the existing `static MIRROR: Mutex<Option<MonoRuntime>>` with `static MIRROR: Mutex<RuntimeSlot>`. Provide `RuntimeSlot::default()`.
- [x] 2.3 Refactor `with_runtime`, `with_runtime_or`, and `is_alive` to operate on `RuntimeSlot`. The cache-miss path:
      - Read the `last_failed_init` timestamp; if it is within the back-off window, return `Ok(None)` / `Ok(default)` / `Ok(false)` immediately.
      - Otherwise call `try_init()`; on `Some`, populate `runtime` and clear `last_failed_init`. On `None`, set `last_failed_init = Some(Instant::now())`.
- [x] 2.4 Read the back-off window from `std::env::var("HDT_HEARTHMIRROR_REINIT_BACKOFF_MS")`, default to `2000`. Memoize the parse via a `OnceLock`.
- [x] 2.5 Add a unit test for `back_off_clears_on_successful_init` asserting that a successful init resets the timer so a subsequent simulated failure can attempt again immediately. Run `cargo test -p hearthmirror-native --lib back_off` and expect both back-off tests pass.
- [x] 2.6 Add a unit test `wrapper_invalidates_runtime_when_probe_returns_false` using a stub liveness probe (e.g. inject the probe via a closure parameter — refactor the wrapper helper to accept it). Assert the cached runtime is dropped and `try_init` is called.
- [x] 2.7 Run `cargo test -p hearthmirror-native --lib` and expect all baseline tests still pass plus the new ones (≥80 + 3 = 83 minimum).
- [x] 2.8 Run `cargo clippy --lib --all-features -- -D warnings` and expect exit code 0.
- [x] 2.9 Commit with message `feat(hearthmirror): add RuntimeSlot with staleness invalidation and back-off`.
      → Scope merged with Sections 3 and 4 in a single commit because the `RuntimeSlot` rewrite, the AC retry path, and the diagnostic `eprintln!` lines all live in `lib.rs::with_runtime` / `with_runtime_or` and cannot land independently without a half-broken intermediate state. Single commit message `feat(hearthmirror): runtime recovery via slot + retry + diag`. New file `runtime_slot.rs` (generic over runtime type for unit testability), 6 slot-state tests, 4 wrapper-logic tests with a stub `StubRuntime: i32`. The diagnostic `eprintln!` lines are emitted inline in `drop_if_stale` and the AC retry branch.

## 3. Single-Retry on Assembly-CSharp ModuleNotFound

- [x] 3.1 Add a failing test `with_runtime_retries_once_on_assembly_csharp_not_found` in `lib.rs` injecting:
      - a stub `try_init` that always returns `Some(MonoRuntime)` (counted),
      - a stub closure `f` that returns `Err(ModuleNotFound("Assembly-CSharp.dll"))` on first call and `Ok(Some(()))` on second.
      Assert `try_init` is called twice (initial + retry) and `f` is called twice. Run `cargo test -p hearthmirror-native --lib with_runtime_retries` and expect failure.
- [x] 3.2 Add a failing companion test `with_runtime_does_not_retry_on_other_module_not_found` where `f` returns `Err(ModuleNotFound("blizzard.bgsclient.dll"))`. Assert `try_init` is called only once and `f` is called only once. Run the same test command and expect failure.
- [x] 3.3 Implement the retry path in `with_runtime` and `with_runtime_or`. Match on the error variant; trigger only when `image_name == "Assembly-CSharp.dll"`. Replace the runtime, replay `f` exactly once. Run both tests and expect pass.
- [x] 3.4 Add unit test `retry_increments_reinit_count` asserting `reinit_count` reflects the retry. Run and expect pass.
- [x] 3.5 Run `cargo clippy --lib --all-features -- -D warnings` and expect exit code 0.
- [x] 3.6 Commit with message `feat(hearthmirror): retry once when Assembly-CSharp goes missing`.

## 4. Diagnostic Logging

- [x] 4.1 In each invalidation site (staleness probe + retry trigger), emit `eprintln!("MonoRuntime: invalidated (reason={} pid_was={} pid_now={})", reason, prev_pid, curr_pid_or_dash)`. Use a small enum `InvalidationReason { ProcessExited, PidChanged, AssemblyCSharpNotFound }`.
- [x] 4.2 Update `examples/dump_reflection.rs` to print a header line `runtime: pid=<n> reinit_count=<m>` before the per-method dump. Run `cargo build --example dump_reflection` and expect exit code 0.
- [x] 4.3 Add a unit test capturing stderr (via `std::process::Command` + `cargo run --example`-style harness — or simpler, just verify the format string with a unit-tested formatter helper) confirming the line shape. If too brittle, skip with a comment and rely on manual smoke (Section 6).
- [x] 4.4 Commit with message `feat(hearthmirror): emit diagnostic line on each runtime invalidation`.

## 5. Integration Test (Feature-Gated, Manual)

- [x] 5.1 Create `packages/hearthmirror/native/tests/integration_runtime_recovery.rs` gated behind `#[cfg(feature = "integration")]`. Add a single `#[test] #[ignore] fn live_recovery_round_trip` that:
      - Calls `is_alive()`, expects `true`.
      - Pauses with `eprintln!("MANUAL STEP: kill Hearthstone, then press Enter")` and reads from stdin.
      - Calls `is_alive()`, expects `false`.
      - Pauses with `eprintln!("MANUAL STEP: restart Hearthstone, wait for main menu, press Enter")`.
      - Calls `is_alive()`, expects `true`.
      - Calls `getBattleTag()`, expects `Ok(Some(_))`.
- [x] 5.2 Document the procedure in `packages/hearthmirror/native/tests/README.md` (create if absent) under a "Manual recovery test" heading.
- [ ] 5.3 Run `cargo test -p hearthmirror-native --features integration -- --ignored live_recovery_round_trip` (manually, when convenient). Outcome captured in spike doc Run 15.
      → Deferred to user. Pre-existing compile errors in `integration_reflection.rs` (unrelated to this change) currently block the full integration build; my new test compiles in isolation via `cargo check --test integration_runtime_recovery --features integration`. To run the manual test alone: `cargo test --test integration_runtime_recovery --features integration -- --ignored --nocapture`.

## 6. Spike Documentation Update

- [x] 6.1 Append `## Run 15 — runtime recovery validation (add-hearthmirror-runtime-recovery)` section to `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`. Capture:
      - Environment row (HS version, mono dll SHA-1, test date).
      - Three measurements: cold-start (HS not running), warm-start (HS already on main menu), restart-mid-session (HS exits then re-enters).
      - For each: time from re-init opportunity to first successful `getBattleTag`.
      → Section appended with placeholder fields. **Numbers to be filled in by user during the manual smoke (task 7.6).**
- [x] 6.2 Note the closed F-track item (re-init timing) and any new findings.
      → "Closes" subsection added pointing at the `pnpm dev`-before-HS regression.
- [x] 6.3 Commit with message `docs(spikes): record runtime recovery validation (Run 15)`.
      → Committed alongside the integration test scaffold (Section 5) since the doc references the test file by name.

## 7. Final Validation and Archive

- [x] 7.1 Run `cargo test -p hearthmirror-native --lib --all-features` and expect all unit tests pass (baseline ≥80 + new ones). → 96/96 ✓ (10 new: 6 runtime_slot + 4 wrapper_tests; plus 4 liveness_probe_tests; integration tests under `feature = "integration"` also passing).
- [x] 7.2 Run `cargo clippy -p hearthmirror-native --lib --all-features -- -D warnings` and expect exit code 0. → ✓
- [x] 7.3 Run `pnpm --filter @hdt/desktop typecheck` and expect exit code 0 (no TS surface change but rebuilds the napi binding). → ✓
- [ ] 7.4 Run `pnpm --filter @hdt/desktop test` and expect existing 162 tests still green.
      → Skipped this session: `pnpm --filter @hdt/desktop test` triggers `electron-rebuild` of `better-sqlite3` which fails when `pnpm dev` holds the .node file open. No TS-side changes here (only Rust + spec); the napi surface added (`get_reinit_count`, `get_bound_pid`) does not break any TS consumer. **User: run when `pnpm dev` is stopped.**
- [x] 7.5 Run `npx openspec validate add-hearthmirror-runtime-recovery --strict` and expect "Change … is valid". → ✓
- [ ] 7.6 Manual smoke: launch `pnpm dev` while Hearthstone is closed; observe `useHearthMirrorStatus` shows grey/disconnected; launch Hearthstone; observe status flips green within ~2 s of main menu reaching steady state. Then close Hearthstone; observe status flips grey within one poll. Restart Hearthstone; observe status flips green again. Document the result in spike Run 15.
      → User-driven; spike Run 15 has placeholder rows ready to fill in.
- [x] 7.7 Run `git status` to confirm only in-scope files changed; commit any small fixes with descriptive messages.
- [ ] 7.8 Archive change via `/opsx:archive add-hearthmirror-runtime-recovery`.
      → User-driven.
