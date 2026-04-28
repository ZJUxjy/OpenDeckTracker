## Context

`add-hearthmirror-bridge` (Phase A–F) committed to a single global `static MIRROR: Mutex<Option<mono::MonoRuntime>>` populated lazily on first reflector call. Each napi entry point (`with_runtime` / `with_runtime_or` / `is_alive`) does:

```rust
let mut guard = MIRROR.lock();
if guard.is_none() { *guard = try_init(); }
let Some(rt) = guard.as_ref() else { return Ok(None); };
f(rt)
```

This shape only retries when the previous `try_init()` returned `None`. Once `Ok` runtime is cached, **the cache is permanent for the lifetime of the Electron process**. `MonoRuntime::init()` captures:

1. A PID from `find_pid("Hearthstone.exe")`.
2. An `OwnedProcessHandle` (Win32 `OpenProcess` HANDLE) bound to that PID.
3. The `mono-2.0-bdwgc.dll` base address inside that PID.
4. The disasm-located `mono_get_root_domain` virtual address.
5. The `root_domain` global (read once, cached as `RemotePtr`).
6. An `Arc<MonoOffsets>` table (refined by `OffsetProber` against that PID's mono build).

If Hearthstone exits and a new instance starts (different PID), every cached value above is stale. The Win32 HANDLE may still be alive (kernel keeps it open until we drop), but reads return either zero pages, garbage from a recycled allocation, or `ERROR_PARTIAL_COPY`. From the reflector's perspective: `find_image_cached("Assembly-CSharp.dll")` walks the linked list at the captured `root_domain` address and either:

- reads NULL → returns `ModuleNotFound` immediately, or
- reads a stale list head → walks zero or wrong entries → returns `ModuleNotFound`.

A second failure mode: HS is alive but on the splash screen when init runs. `Assembly-CSharp.dll` isn't loaded yet, so the walk legitimately returns `ModuleNotFound`. The list is re-read on every call, so this case **does** self-heal once Assembly-CSharp loads — but only if the captured PID is still valid. The two failure modes overlap because the user's Hearthstone may both be in early boot AND restart between client-launch retries.

Stakeholders:
- The user, who currently must launch the app in a specific order to get any tracking.
- Future spike runs that diagnose reflector failures — today they cannot tell "process gone" from "field offset wrong" because both surface as `ModuleNotFound`.
- The `add-deck-management` Section 17.5 manual smoke (and any future end-to-end smoke) — depends on the live tracker working when the user starts the app first.

## Goals / Non-Goals

**Goals:**

- Detect a captured-process death within one reflector tick (≤500 ms median).
- Detect a captured-process replacement (PID changed) within one tick of the next reflector call.
- Self-heal when Hearthstone enters from splash → main menu mid-session, without restart.
- Bound re-init attempts when Hearthstone is genuinely closed (don't hot-loop `find_pid` + `OpenProcess`).
- Preserve the existing napi surface — no new public function names; `isAlive` semantics tightened, not broken.
- Add diagnostic visibility: a single line per invalidation, plus a queryable `pid()` / `reinit_count` for spike dumps.
- Zero impact on renderer code paths.

**Non-Goals:**

- Hot-swapping `MonoOffsets` mid-session for a different mono build (e.g. patch day).
- Recovering from Hearthstone updates that change `Assembly-CSharp` class layout — that requires re-running the offset prober's class-finding, which is its own change.
- A queue / retry buffer at the napi or TS layer for individual reflector calls. The polling cadence covers it.
- Renderer-side spinner / banner. The existing status pill already reflects `isAlive`.
- A full process-watcher loop in main process.

## Decisions

### D1. Where the liveness check lives

**Context:** We need to detect "the process I was bound to is gone or has been replaced" before each reflector call. Three plausible homes for the check.

**Options:**

- **A.** In `MonoRuntime` itself: `MonoRuntime::is_process_alive_and_same()` calls `GetExitCodeProcess` on its handle and `find_pid` to compare current PID.
- **B.** In the napi wrapper (`lib.rs::with_runtime`): wrapper owns the staleness logic, `MonoRuntime` stays oblivious to its own validity.
- **C.** Separate `RuntimeHealth` watchdog struct that wraps `MonoRuntime` and gates access.

**Choice:** **A**, with the wrapper in `lib.rs` calling it.

**Rationale:** Liveness is a property of the runtime instance (it owns the handle and PID). Putting the probe on `MonoRuntime` keeps it co-located with the handle, available to integration tests directly, and makes the wrapper logic straightforward (`if rt.is_process_alive_and_same() { reuse } else { invalidate + reinit }`). Option C adds indirection for no win — there is one consumer. Option B leaks handle internals to the wrapper.

### D2. How to detect process death

**Context:** Win32 offers a few ways. We need cheap (called every poll) and correct (no false positives that would flap).

**Options:**

- **A.** `GetExitCodeProcess(handle, &mut code)` — returns `STILL_ACTIVE (259)` while running, exit code otherwise. Caveat: a process that legitimately exits with code 259 looks alive (rare in practice but possible).
- **B.** `WaitForSingleObject(handle, 0)` — returns `WAIT_TIMEOUT` while alive, `WAIT_OBJECT_0` on exit. Same cost, no `STILL_ACTIVE` ambiguity.
- **C.** Re-run `find_pid("Hearthstone.exe")` and compare with our captured PID.

**Choice:** **B** (primary) + **C** (secondary, only when B says alive).

**Rationale:**

- B is the most authoritative liveness signal Win32 offers and avoids the 259 ambiguity.
- A 0-timeout `WaitForSingleObject` is the canonical "is this kernel object signaled" probe — no thread suspension.
- Even when B reports alive, a *different* `Hearthstone.exe` instance could be the one the user is now playing. So we additionally check that `find_pid` returns the same PID we captured. If it returns a different PID, the user has restarted and we should re-init even though our old handle is still technically valid (the old process is exiting but not yet fully gone).
- B + C cover both "captured process died" and "captured process is alive but no longer the active one".

### D3. Single-retry-on-`ModuleNotFound` semantics

**Context:** Even with D1 + D2, there is a residual case: HS is alive, PID is unchanged, but the runtime was initialized too early (splash screen) and now `Assembly-CSharp` *should* be loaded but our cached `root_domain` walk is reading correctly and just returning the same stale empty list. (Spec'd theoretically; in practice the linked list head is re-read each call so this case usually self-heals.)

**Options:**

- **A.** No special handling — rely on the linked-list re-read self-healing the case.
- **B.** Single retry: when `find_image_cached("Assembly-CSharp.dll")` returns `ModuleNotFound`, invalidate the runtime once, re-init, replay the call.
- **C.** Treat `ModuleNotFound(Assembly-CSharp.dll)` as a re-init trigger always, no retry budget.

**Choice:** **B**.

**Rationale:** A is too lenient — spike 0003 already shows the linked-list re-read can return stale data when the captured `root_domain` itself is wrong. C risks hot-looping when Hearthstone is genuinely on splash and init can run but find no AC. B caps the cost at one extra init per failing reflector call — a few hundred ms once in a blue moon — and hands control back to the next poll if it still fails.

The retry is keyed specifically on `Assembly-CSharp.dll`. Other images (e.g. `blizzard.bgsclient.dll` for `getAccountId`) loading later is not a steady-state concern; their misses fall through normally.

### D4. Re-init back-off when Hearthstone is closed

**Context:** When HS is genuinely not running, every `with_runtime` call would otherwise rerun `find_pid` (a process-list enumeration — relatively expensive). At 500 ms cadence × 12 reflectors that is up to 24 enumerations per second.

**Options:**

- **A.** No back-off — re-attempt on every call.
- **B.** Fixed back-off: after a failed `try_init`, ignore subsequent attempts for `N` ms.
- **C.** Exponential back-off (250 ms → 500 ms → 1 s → 2 s, capped).

**Choice:** **B with N = 2000 ms** (configurable via `HDT_HEARTHMIRROR_REINIT_BACKOFF_MS` env var for development).

**Rationale:** Process enumeration is not free (Toolhelp snapshot ≈ a few ms × hundreds of processes). 2 s back-off is unnoticeable to a user starting Hearthstone (typical splash-to-main-menu is 5–15 s) and shaves enumeration load by 4× during the closed-Hearthstone idle. C's exponential is overkill — the user-visible latency between actually launching HS and seeing the deck tracker register is bounded by `B`, so longer back-offs trade UX for negligible CPU savings.

The back-off resets on any successful `try_init`, so a successful → exit → restart cycle does not start cold.

### D5. Where the `MIRROR` mutex semantics change

**Context:** Today the mutex protects `Option<MonoRuntime>`. Adding the back-off requires also tracking `last_failed_init_at`.

**Options:**

- **A.** Keep `Option<MonoRuntime>`, add a separate `Mutex<Instant>` for the back-off timer.
- **B.** Replace with `Mutex<RuntimeSlot>` where `RuntimeSlot { runtime: Option<MonoRuntime>, last_failed_init: Option<Instant>, reinit_count: u64 }`.

**Choice:** **B**.

**Rationale:** Two separate mutexes invite races (init succeeds while another thread checks back-off). One struct keeps the invariants together. Existing call sites are short — the migration is mechanical.

### D6. Logging and diagnostics

**Context:** Spike 0003 already calls out F-track findings tied to runtime state. We need to leave breadcrumbs without forcing a new logging dependency.

**Options:**

- **A.** Use the existing `eprintln!` lines (already present in `runtime.rs` for OffsetProber warnings).
- **B.** Add `tracing` crate dependency.
- **C.** Quiet mode — silent invalidation, only diagnostics dump on demand.

**Choice:** **A** plus a `pid()` / `reinit_count()` getter for `dump_reflection` to print.

**Rationale:** Existing OffsetProber lines already use `eprintln!`. Matching that keeps the noise floor and ops surface consistent. `tracing` would be nice but introducing it for one feature is overkill. We keep the door open for a future log-routing change without blocking on it now.

### D7. Test strategy

**Context:** Three layers to cover.

**Options:** Combination chosen below.

**Choice:**

- **Unit tests** in `runtime.rs` — fakes for liveness probe (using `Mutex<bool>` flag) drive the staleness branch deterministically. Cheap, no Hearthstone needed.
- **Wrapper tests** in `lib.rs` — extract `with_runtime` body into a helper that takes a closure for the liveness probe so a test can flip the staleness flag and assert the re-init / retry path runs.
- **Integration test** gated on `cfg(feature = "integration")` — manually documented procedure (since automating "kill Hearthstone, restart it, observe recovery" inside cargo is brittle). The test asserts a single positive case: `is_alive()` returns true, then user externally kills HS, then `is_alive()` returns false within one call. Test marked `#[ignore]` by default.

## Risks / Trade-offs

- **[Risk] `WaitForSingleObject(handle, 0)` returning `WAIT_FAILED` for transient kernel reasons** → treat any non-`WAIT_TIMEOUT` result as "not alive"; the next tick will retry init.
- **[Risk] `find_pid` enumeration race**: between probe and use, the PID we read could exit. → harmless: the next tick observes it. We log a single line, do not crash.
- **[Risk] Back-off period delays first-detection of Hearthstone start** by up to `D4`'s value → 2 s tradeoff is documented; users with patience-sensitive workflows can lower via env var.
- **[Risk] The `ModuleNotFound`-triggered re-init in D3 could itself fail** → the retry budget is 1; the call falls through to the original error, the renderer sees `null` from `swallow()`, the next poll tries again. Net cost: one extra init.
- **[Trade-off] Mutex contention** on the new `RuntimeSlot` for high-frequency reflector calls. We were already serializing on the same mutex; the critical section gets a few extra micro-ops. Polling cadence (500 ms in the hot phase) makes this a non-issue.
- **[Trade-off] No persistent diagnostics across app restarts.** `reinit_count` resets to 0 on each Electron launch. Sufficient for spike tests, would need addressing for telemetry — not in scope.
- **[Trade-off] D3's single-retry assumes `Assembly-CSharp.dll` is the canary.** If a future hearthmirror surface adds a reflector that depends only on a different image (e.g. `blizzard.bgssdk.dll`), it still falls through normally. The retry trigger could be widened later if we observe the same staleness pattern there.

## Migration Plan

This is a binary patch to the native crate. No data migration. No spec rename / removal. Rollout:

1. Land the change in a feature branch.
2. Run unit tests + clippy.
3. Manual smoke per the spike 0003 Run pattern: launch `pnpm dev` while Hearthstone is closed, then start Hearthstone, observe deck tracker registers within 2 s of HS reaching main menu.
4. Manual smoke part 2: with deck tracker active, exit Hearthstone, observe `useHearthMirrorStatus` flips grey within one poll.
5. Restart Hearthstone, observe re-registration without app restart.
6. Add `## Run 15` to spike doc with the recovery measurements.

Rollback: revert the commit. The wrapper change is local; no schema, no DB, no IPC contract.

## Open Questions

- **Should we widen the retry trigger in D3 from just `Assembly-CSharp.dll` to all `ModuleNotFound`?** Defer until we observe the pattern for another image. For now AC is the canary.
- **Should the back-off be per-state (closed vs. mid-init)?** Probably no — single state machine is simpler; documented value works.
- **Should we expose `pid` / `reinit_count` over IPC for the renderer to display?** Not unless a debug overlay needs it. For now the dump_reflection example carries it.

## Final touched-files tree

```
packages/hearthmirror/native/
├── src/
│   ├── lib.rs                # MIRROR slot type + with_runtime/with_runtime_or rewrites + is_alive
│   ├── handle.rs             # raw_handle() pub accessor for liveness probe
│   ├── process.rs            # (unchanged — find_pid already public)
│   └── mono/
│       └── runtime.rs        # store pid; is_process_alive_and_same(); pid()/reinit_count() getters
├── tests/
│   └── integration_runtime_recovery.rs  # NEW (feature-gated, #[ignore])
└── examples/
    └── dump_reflection.rs    # add the runtime: pid=… line at the top of output
```
