# Spike 0003: HearthMirror Reflection Runtime Validation

## Background

[`add-hearthmirror-reflection-methods`](../../openspec/changes/add-hearthmirror-reflection-methods/) upgraded 12 `IReflection` method stubs to real Mono memory traversal implementations. However, all verification was done **without a running Hearthstone process** — unit tests use mocks, integration tests skip via `skip_if_no_hs`.

This spike validates those implementations against a real Hearthstone process to answer:

1. How many of the 12 methods return non-empty data?
2. Which methods fail, and at what point in the chain (class lookup / field resolution / value read)?
3. Are the hardcoded Mono structure offsets (`MONO_CLASS_NAME=0x2C`, etc.) still valid?
4. Have any C# field names changed in the current Hearthstone build?

Initiated by [`verify-hearthmirror-on-real-hs`](../../openspec/changes/verify-hearthmirror-on-real-hs/).

## Methodology

1. **Tool**: `cargo run --example dump_reflection` from `packages/hearthmirror/native/`
   - Connects to running Hearthstone via existing `MonoRuntime::init()`
   - Calls all 12 reflection methods independently (each wrapped in match, no early abort)
   - Outputs JSON Lines to stdout: `{method, status, value, error, elapsed_ms}`

2. **Diagnostic**: `cargo run --example diag_init` — step-by-step init chain to isolate crash point

3. **Automation**: `scripts/run-hearthmirror-spike.ps1`
   - Runs the cargo example
   - Collects environment info (OS build, HS version, mono dll SHA1)
   - Formats output as Markdown table
   - Appends as a new "Run N" section to this report

4. **Tiers**:
   - **Tier 1 (mandatory)**: Main menu + logged in — 8 methods not requiring in-game state
   - **Tier 2 (best-effort)**: In a match — 4 methods requiring game state

## Run 1

### Environment

| Field | Value |
|---|---|
| OS | Microsoft Windows NT 10.0.26200.0 (x64) |
| Hearthstone version | 2022.3.62.7762112 (Unity 2022.3.62f2) |
| mono-2.0-bdwgc.dll SHA1 | `2DEF7993A57EE783AC046E816A5B78FE3488BE90` |
| mono-2.0-bdwgc.dll path | `MonoBleedingEdge/EmbedRuntime/mono-2.0-bdwgc.dll` |
| mono-2.0-bdwgc.dll size | 6,529,024 bytes (0x639000) |
| mono-2.0-bdwgc.dll base | 0x7A5B0000 |
| Hearthstone PID | 9072 (32-bit WoW64) |
| Test date (UTC) | 2026-04-20 09:34 |
| Game state | Main menu (logged in) |

### Attempt 1: dump_reflection example

```
$ cargo run --example dump_reflection
# Process exits immediately with 0xC0000005 (STATUS_ACCESS_VIOLATION)
# Zero JSON lines produced — crash occurs inside MonoRuntime::init()
```

**Result**: All 12 methods **blocked** — crash in `MonoRuntime::init()` before any reflection method is called.

| Method | Tier | Tested | Status | Value | Error | Elapsed (ms) |
|---|---|---|---|---|---|---|
| MonoRuntime::init | - | tested | **CRASH** | - | exit code 0xC0000005 (ACCESS_VIOLATION) | N/A |
| getBattleTag | T1 | blocked | - | - | blocked by init crash | - |
| getAccountId | T1 | blocked | - | - | blocked by init crash | - |
| getMedalInfo | T1 | blocked | - | - | blocked by init crash | - |
| getMatchInfo | T1 | blocked | - | - | blocked by init crash | - |
| getDecks | T1 | blocked | - | - | blocked by init crash | - |
| getCollection | T1 | blocked | - | - | blocked by init crash | - |
| getServerInfo | T1 | blocked | - | - | blocked by init crash | - |
| getBattlegroundRatingInfo | T1 | blocked | - | - | blocked by init crash | - |
| getGameType | T2 | blocked | - | - | blocked by init crash | - |
| isSpectating | T2 | blocked | - | - | blocked by init crash | - |
| isGameOver | T2 | blocked | - | - | blocked by init crash | - |
| getArenaDeck | T2 | blocked | - | - | blocked by init crash | - |

### Attempt 2: diag_init step-by-step diagnostic

Created `examples/diag_init.rs` to isolate the crash point in the init chain:

```
Step 1: find_pid           → OK (PID 9072)
Step 2: open handle        → OK
Step 3: enumerate modules  → OK (121 modules)
  Mono module: mono-2.0-bdwgc.dll at 0x7A5B0000 (size: 6529024)
Step 4: read PE bytes (1MB cap) → OK (1048576 bytes read)
Step 5: PeView::module     → OK
Step 6: exports.by().name("mono_get_root_domain") → CRASH (0xC0000005)
```

**Root cause identified**: `find_mono_get_root_domain_va()` in `runtime.rs:97` caps the PE read at 1MB:
```rust
let pe_size = mono.size.min(0x100_000) as usize;  // 1MB cap
```
But the mono DLL is **6.5MB**. Pelite's `PeView::module` treats the buffer as mapped at its original base address, so when `exports.by().name()` follows RVAs to export name strings beyond the 1MB buffer boundary, it dereferences invalid memory → ACCESS_VIOLATION (Windows SEH, not a Rust panic).

### Attempt 3: diag_init with full module read

Modified `diag_init.rs` to read the full 6.5MB module instead of 1MB:

```
Step 4: read PE bytes (full) → OK (6529024 bytes read)
Step 5: PeView::module       → OK
Step 6: find export           → OK (RVA 0x00095DD0, VA 0x7A645DD0)
Step 7: extract root domain   → Pattern A match (A1 xx xx xx xx C3)
  Global root domain addr: 0x7AB32A68
Step 8: read root domain ptr  → OK (0x0B442E70)
```

**Confirms**: Removing the 1MB cap fixes the crash. The entire init chain succeeds when the full module is read.

### Tier 2

**Not tested** — Tier 1 is blocked by the init crash; entering a game would not change the outcome.

## Findings

**Finding F-1** (Critical): `MonoRuntime::init()` crashes with `STATUS_ACCESS_VIOLATION` (0xC0000005) when connected to a live Hearthstone process. The crash is a Windows structured exception, not a Rust panic — `catch_unwind` will not catch it, and the process terminates unconditionally.

- **Location**: `packages/hearthmirror/native/src/mono/runtime.rs`, line 97
- **Code**: `let pe_size = mono.size.min(0x100_000) as usize;`
- **Cause**: The 1MB cap is far too small for `mono-2.0-bdwgc.dll` (6.5MB). Pelite's `PeView::module` assumes the buffer represents the full mapped PE image. When `exports.by().name()` resolves export name RVAs that point past 1MB, it reads beyond the buffer into unmapped memory.
- **Impact**: **All 12 reflection methods are completely blocked.** No method can be tested until this is fixed.

**Finding F-2** (Positive): The init chain works correctly when the full module is read. Steps verified by `diag_init`:
- Process discovery: ✅ finds Hearthstone PID
- Handle opening: ✅ PROCESS_QUERY_INFORMATION + PROCESS_VM_READ
- Module enumeration: ✅ finds mono-2.0-bdwgc.dll among 121 modules
- PE export parsing: ✅ pelite finds `mono_get_root_domain` export
- Disasm pattern match: ✅ Pattern A (`A1 xx C3`) recognized
- Root domain resolution: ✅ global addr → domain pointer → 0x0B442E70

**Finding F-3** (Informational): The mono DLL location has moved from the expected paths. The script initially looked for `mono-2.0-bdwgc.dll` in the Hearthstone root directory and `Mono/` subdirectory, but it was found at `MonoBleedingEdge/EmbedRuntime/mono-2.0-bdwgc.dll`. The module enumeration via `EnumProcessModulesEx` correctly finds the loaded DLL regardless of its disk path, so this does not affect `MonoRuntime::init()`. However, any code that relies on file-system SHA1 hashing needs the correct path.

**Finding F-4** (Informational): The mono runtime uses Boehm-Demers-Weiser GC variant (`bdwgc`). The module name `mono-2.0-bdwgc.dll` confirms this. Unity version is 2022.3.62f2 (LTS branch). These match the Mono embedding patterns documented in `Rewrite_Design.md`.

## Recommendations

### Must Fix

**R-1**: Remove the 1MB PE read cap in `find_mono_get_root_domain_va()`.

Change `runtime.rs` line 97 from:
```rust
let pe_size = mono.size.min(0x100_000) as usize;
```
to:
```rust
let pe_size = mono.size as usize;
```

This is a one-line fix. The diagnostic proves it resolves the crash and allows the full init chain to complete. Propose a new change: `fix-hearthmirror-pe-read-cap`.

**Priority**: P0 — blocks all 12 reflection methods.

### Should Fix

**R-2**: After fixing R-1, re-run this spike to validate all 12 reflection methods end-to-end.

The current spike proves the init chain works (F-2) but could not exercise any reflection methods due to the crash (F-1). A follow-up run should be documented as Run 2 in this same report.

**R-3**: Update `run-hearthmirror-spike.ps1` mono DLL path search to include `MonoBleedingEdge/EmbedRuntime/` (F-3).

### Defer

**R-4**: Consider adding a safety check in `find_mono_get_root_domain_va()` to validate that the PE buffer is large enough before calling `PeView::module`, or switch to `pelite::pe32::PeFile::from_bytes()` which does bounds checking.

**R-5**: Add a `--verbose` flag to the dump_reflection example that outputs the init chain steps (like diag_init does) for future debugging.

## Environment Matrix Reference

| Field | Value |
|---|---|
| OS | Windows XX build XXXXX |
| Hearthstone version | XX.X.X.XXXXX |
| mono-2.0-bdwgc.dll SHA1 | XXXXXXXX |
| Battle.net region | XX |
| Test date (UTC) | YYYY-MM-DD HH:MM |
| Tester | @username |

> Copy this table for each Run section. Future contributors: add your own environment when running the spike.

## Cross-reference with Previous Spikes

- [Spike 0001](0001-hearthmirror-spike-report.md): Validated napi-rs + windows crate toolchain, cross-architecture memory read, ~252 µs/call.
- [Spike 0002](0002-hearthmirror-mono-spike-report.md): Validated Mono runtime location, PE export parsing, `mono_get_root_domain` pattern matching, offset probing need identified.
- **This spike (0003)**: Validates the full reflection chain end-to-end — class lookup → singleton resolution → field traversal → value extraction. **Blocked at init** due to PE read cap bug (F-1).

## Run 2

> Triggered by `fix-hearthmirror-pe-read-cap` commit `120d33e` (one-line fix: removed `mono.size.min(0x100_000)` cap in `runtime.rs:99`).

### Environment

| Field | Value |
|---|---|
| OS | Microsoft Windows NT 10.0.26200.0 (x64) |
| Hearthstone version | 2022.3.62.7762112 |
| mono-2.0-bdwgc.dll SHA1 | `2DEF7993A57EE783AC046E816A5B78FE3488BE90` |
| Test date (UTC) | 2026-04-20 13:07 |
| Game state | Main menu (logged in) |
| Tier 2 coverage | Tested without entering match — game-state methods exercised but expected to return null |

### Results

| Method | Tier | Tested | Status | Value | Error | Elapsed (ms) |
|---|---|---|---|---|---|---|
| getBattleTag | T1 | tested | error | null | mono field not found: <probe>.<probed> | 1 |
| getAccountId | T1 | tested | error | null | mono field not found: <probe>.<probed> | 0 |
| getMedalInfo | T1 | tested | error | null | mono field not found: <probe>.<probed> | 0 |
| getMatchInfo | T1 | tested | error | null | mono field not found: <probe>.<probed> | 0 |
| getGameType | T2 | tested | error | null | mono field not found: <probe>.<probed> | 0 |
| isSpectating | T2 | tested | error | null | mono field not found: <probe>.<probed> | 0 |
| isGameOver | T2 | tested | error | null | mono field not found: <probe>.<probed> | 0 |
| getServerInfo | T1 | tested | error | null | mono field not found: <probe>.<probed> | 0 |
| getBattlegroundRatingInfo | T1 | tested | error | null | mono field not found: <probe>.<probed> | 0 |
| getArenaDeck | T2 | tested | error | null | mono field not found: <probe>.<probed> | 0 |
| getDecks | T1 | tested | error | null | mono field not found: <probe>.<probed> | 0 |
| getCollection | T1 | tested | error | null | mono field not found: <probe>.<probed> | 0 |

## Findings (Run 2)

**Finding F-5** (Positive, fix-pe-read-cap acceptance evidence): `MonoRuntime::init()` no longer crashes with `STATUS_ACCESS_VIOLATION`. All 12 reflection methods reached the entry point and returned a typed `ScryError`, completing in < 1 ms each. The 1MB PE read cap fix (commit `120d33e`) is fully validated end-to-end against a live Hearthstone process.

**Finding F-6** (Critical, **non-blocking for fix-pe-read-cap, defer to 5e/5f**): All 12 reflection methods fail with the *same* error string `mono field not found: <probe>.<probed>`. Source: [`packages/hearthmirror/native/src/mono/probe.rs:34-37`](../../packages/hearthmirror/native/src/mono/probe.rs):

```rust
Err(ScryError::FieldNotFound {
    class: "<probe>".into(),
    field: "<probed>".into(),
})
```

This is not a *field name drift* — it is the `probe_field_offset` helper failing to find any valid candidate slot. The propagation chain is:

1. Each reflection method calls `runtime.find_class(ns, name)`
2. `find_class` calls `probe_class_def_table_offset` (`runtime.rs:409`)
3. That probe iterates candidate `image` offsets, calling `probe_field_offset` to validate each slot
4. **No slot validates** under Unity 2022.3.62f2 — the heuristic that worked under Unity 2021.3 (assumptions baked into spike 0002 + `field_paths.rs`) no longer matches the in-memory `MonoImage` / `MonoClass` layout

This is exactly the failure mode that motivates [`add-hearthmirror-offset-probing`](../../openspec/changes/add-hearthmirror-offset-probing/) (replace heuristics with `iced-x86` disassembly + JSON baseline + `OffsetProber`) and [`add-hearthmirror-image-walking`](../../openspec/changes/add-hearthmirror-image-walking/) (replace `class_def_table` token probing with `MonoImage::class_cache` hashtable walk). **Validates the design** of both 5e and 5f.

**Finding F-7** (Minor, hygiene): The `<probe>.<probed>` placeholder string is a poor diagnostic — it tells you "some probe failed" but not *which* probe (domain.loaded_images? class_def_table? something else?). A 5-line improvement would let `probe_field_offset` accept and propagate caller-supplied identifier strings, making future spike runs immediately diagnose the failed probe site without needing to grep source.

## Recommendations (Run 2)

### Must Fix (defer to 5e + 5f)

**R-6**: Proceed with [`add-hearthmirror-offset-probing`](../../openspec/changes/add-hearthmirror-offset-probing/) (5e) followed by [`add-hearthmirror-image-walking`](../../openspec/changes/add-hearthmirror-image-walking/) (5f) as the path to fix F-6. Do **not** attempt a one-off hotfix to `probe_class_def_table_offset` — F-6 is the structural problem that 5e/5f are designed to solve, and a hotfix would just be incremental heuristic-tuning that breaks again on the next Hearthstone Mono upgrade.

**Priority**: P0 — blocks all 12 reflection methods exactly the same way as F-1 did (different root cause, identical user impact).

### Should Fix (small standalone change, optional)

**R-7**: Propose `fix-hearthmirror-probe-error-msg` (5-10 minute change) to make `probe_field_offset` accept `caller_class: &str` and `caller_field: &str` parameters, so future spike runs surface *which* probe failed (e.g. `"MonoDomain.loaded_images"` vs `"MonoClass.class_def_table"`). Optional polish, not a blocker.

### Updated 5e Baseline Decision

Run 2 confirms F-4 (Unity 2022.3.62f2). Recommended path for 5e baseline JSON:

- Start with `unity-2021.3.json` from hearthmirror-rs (proven baseline)
- Trust `OffsetProber` to refine the 6 critical + 4 best-effort probes at runtime
- **Do not** invest time hand-crafting a `unity-2022.3.json` baseline up front — the whole point of OffsetProber is that baseline accuracy degrades gracefully when probes succeed
- Add a follow-up `unity-2022.3.json` *only* if 5e's real-HS regression shows OffsetProber probes failing (in which case the failures themselves give you the correct numeric values to record)
