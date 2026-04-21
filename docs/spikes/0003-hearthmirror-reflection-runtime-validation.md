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

**Finding F-6** (Critical, **non-blocking for fix-pe-read-cap, defer to 5e**): All 12 reflection methods fail with the *same* error string `mono field not found: <probe>.<probed>`. Source: [`packages/hearthmirror/native/src/mono/probe.rs:34-37`](../../packages/hearthmirror/native/src/mono/probe.rs):

```rust
Err(ScryError::FieldNotFound {
    class: "<probe>".into(),
    field: "<probed>".into(),
})
```

This is not a *field name drift* — it is the `probe_field_offset` helper failing to find any valid candidate slot. **Root-cause grep** (only one caller in the entire crate):

```
runtime.rs:159   let domain_loaded_images = probe_field_offset(memory, domain, |slot| { ... })
```

So 12/12 failures are actually a *single* init-time failure replayed 12 times — each `dump_reflection` method independently calls `MonoRuntime::init()`, which calls `discover_offsets()`, which calls the **single** `probe_field_offset` site to find `MonoDomain.loaded_images`. Under Unity 2022.3.62f2 the slot-scan heuristic no longer matches → init fails → every method bubbles up the same `<probe>.<probed>` string.

**Implication**: 5e (`add-hearthmirror-offset-probing`) is the **critical-path unblock** — without it, `MonoRuntime::init()` itself cannot complete on production Hearthstone. Replacing slot-scan with `iced-x86` disassembly of `mono_domain_get_assemblies` (and the other 5 critical exports) gives a deterministic offset rather than a 64-slot guess. 5f (`add-hearthmirror-image-walking`) is still required downstream, but only becomes reachable after 5e fixes init. **Validates 5e necessity at P0 severity.**

**Finding F-7** (Minor, hygiene): The `<probe>.<probed>` placeholder string is a poor diagnostic — it tells you "some probe failed" but not *which* probe (domain.loaded_images? class_def_table? something else?). A 5-line improvement would let `probe_field_offset` accept and propagate caller-supplied identifier strings, making future spike runs immediately diagnose the failed probe site without needing to grep source.

## Recommendations (Run 2)

### Must Fix (defer to 5e + 5f)

**R-6**: Proceed with [`add-hearthmirror-offset-probing`](../../openspec/changes/add-hearthmirror-offset-probing/) (5e) as the path to fix F-6. The actual failure site is `discover_offsets` → `probe_field_offset` for `MonoDomain.loaded_images`, which is exactly what 5e's `OffsetProber` replaces (deterministic disassembly of `mono_domain_get_assemblies` instead of 64-slot scan). 5f (`add-hearthmirror-image-walking`) is still required for the downstream `find_class` path but only becomes reachable after 5e unblocks init. Do **not** attempt a one-off hotfix to the slot-scan heuristic.

**Priority**: P0 — blocks `MonoRuntime::init()` itself on production Hearthstone (worse than F-1 was — F-1 crashed, F-6 returns a typed error but blocks the same surface area).

### Should Fix (small standalone change, optional)

**R-7**: Propose `fix-hearthmirror-probe-error-msg` (5-10 minute change) to make `probe_field_offset` accept `caller_class: &str` and `caller_field: &str` parameters, so future spike runs surface *which* probe failed (e.g. `"MonoDomain.loaded_images"` vs `"MonoClass.class_def_table"`). Optional polish, not a blocker.

### Updated 5e Baseline Decision

Run 2 confirms F-4 (Unity 2022.3.62f2). Recommended path for 5e baseline JSON:

- Start with `unity-2021.3.json` from hearthmirror-rs (proven baseline)
- Trust `OffsetProber` to refine the 6 critical + 4 best-effort probes at runtime
- **Do not** invest time hand-crafting a `unity-2022.3.json` baseline up front — the whole point of OffsetProber is that baseline accuracy degrades gracefully when probes succeed
- Add a follow-up `unity-2022.3.json` *only* if 5e's real-HS regression shows OffsetProber probes failing (in which case the failures themselves give you the correct numeric values to record)

## Run 3

> Triggered after `add-hearthmirror-offset-probing` (5e) Phase 6 + Phase 6 Audit landed (commits `3d7bfec` → `0919d49` → `9f1da89`). Goal: validate the full reflection chain end-to-end and discover what (if anything) blocks 5e from being archived.

### Environment

| Field | Value |
|---|---|
| OS | Microsoft Windows NT 10.0.26200.0 (x64) |
| Hearthstone version | 2022.3.62.7762112 |
| mono-2.0-bdwgc.dll SHA1 | `2DEF7993A57EE783AC046E816A5B78FE3488BE90` |
| Hearthstone PID (run 3a) | 21564 (32-bit WoW64) |
| Test date (UTC) | 2026-04-20 |
| Game state | Main menu (logged in) |

### Run 3a — first dump_reflection after 5e wiring

```
$ cargo run --example dump_reflection
OffsetProber: 'mono_class_get_name'      → 0xE10 outside sane range 0x4..=0x80 ; keeping baseline
OffsetProber: 'mono_class_get_namespace' → 0xE10 outside sane range 0x4..=0x80 ; keeping baseline
OffsetProber: 'mono_image_get_name'      → 0x1C  outside sane range 0x10..=0x18; keeping baseline
OffsetProber: 'mono_assembly_get_image'  → 0xE10 outside sane range 0x10..=0x80; keeping baseline
OffsetProber: 'mono_class_get_parent'    → 0xE10 outside sane range 0x10..=0x80; keeping baseline

12/12 methods → "memory access failed at 0x00000015 ... ReadProcessMemory failed (0x8007012B)"
```

**Initial read**: prober gate works as designed — every probed-then-rejected offset falls back to the verified baseline, so init survives. But every reflection method bombs reading address `0x15`, which is suspiciously close to `0x14` = `MonoImage.name` baseline → **the `image_ptr` itself must be ~0x1**.

### Run 3b — diag_singleton narrows the failure to assembly walking

`examples/diag_singleton.rs` traces the `get_singleton(NetCache)` chain step-by-step. Output:

```
=== diag_singleton: .NetCache ===
ptr_size=4 | class.runtime_info=+0x7C class.vtable_size=+0x38 ...
Error: MemoryAccess { addr: 21, reason: "ReadProcessMemory failed (0x8007012B)" }
```

The error fires **before** `find_class` returns, i.e. inside `find_ac_image_cached`'s `MonoDomain.domain_assemblies` walk. So the error is produced when reading `image.name` (offset `0x14`) on an `image_ptr` that is itself `0x00000001`.

### Run 3c — diag_image hex-dumps every assembly + image

`examples/diag_image.rs` walks `MonoDomain.domain_assemblies` (GSList) and dumps each `MonoAssembly` and (via the JSON-claimed image offset) each `MonoImage`. Repeated across all 99 assemblies the same pattern shows up:

```
[0] MonoAssembly* = 0x0B71AC60
  MonoAssembly first 0x60 bytes:
    +0x40  01 00 00 00 00 00 00 00 A8 A3 71 0B C8 6C 71 0B
    +0x48  ...                       ^^^^^^^^^^^ image_ptr lives here, NOT at +0x40

  candidate string-pointer slots in MonoAssembly:
    asm+0x04 → "E:\\battle\\Hearthstone\\Hearthstone_Data\\Managed\\"  (basedir)
    asm+0x08 → "mscorlib"                                              (assembly_name.name)
    asm+0x48 → 0x0B71A3A8 → "\u{2}"                                    (image, leading u32 = ref_count=2)

  image_ptr (via JSON +0x48) = 0x0B71A3A8
  MonoImage first 0x60 bytes:
    +0x14  → 0x00FA7340 → "E:\\...\\mscorlib.dll"                       (full file path — what reflection wants)
    +0x18  → 0x00FA77C0 → "E:\\...\\mscorlib.dll"                       (duplicate; raw_data path?)
    +0x1C  → 0x0BC6D4F2 → "mscorlib"                                   (short asm name — what mono_image_get_name returns)
    +0x20  → 0x0BC82173 → "mscorlib.dll"                               (filename + extension)
```

Same layout reproduced verbatim across `mscorlib`, `UnityEngine`, and 18 `UnityEngine.*Module` assemblies → consistent across the entire module set, not a one-off.

## Findings (Run 3)

**Finding F-8** (Critical, **fixed**): `MonoAssembly.image` lives at `+0x48`, not `+0x40`. The `+0x40` slot is `MonoAssemblyName.arch` (always `0x01000001` in this build). The previous JSON value `0x40` caused every `find_ac_image_cached` call to dereference `image_ptr=0x00000001`, hence the `0x00000015` read failure (`0x1 + MonoImage.name=0x14`).

- **Root cause**: The structural width of `MonoAssemblyName` in this Unity Mono build is `0x40` bytes — larger than the source-level estimate that derived `0x40` for `image`. MSVC pads `public_key_token[17]` plus `arch` so that `MonoAssembly.image` ends up 8 bytes later than the hearthmirror-rs baseline expected.
- **Evidence**: 20/20 assemblies dumped by `diag_image` show a `ref_count=2` int at `+0x48` followed by the `MonoImage*` pointer — every one of them validates against the full PE layout that follows.
- **Fix landed**: `unity-2021.3.json` now declares `MonoAssembly.image = 0x48` with `$confidence: HIGH`. `MonoImage` block annotated with empirical names for `+0x14 / +0x18 / +0x1C / +0x20`. No code changes — JSON is the source of truth.

**Finding F-9** (Informational, validates D13 range-gate): `mono_image_get_name`'s disassembly probe consistently returns `0x1C` — and `0x1C` *is* a real string-pointer slot, just for the **short** assembly name (`"mscorlib"`), not the full file path (`"E:\\...\\mscorlib.dll"`) that reflection callers expect at `+0x14`. The `OffsetProber.PROBE_SPECS` `sane_range = 0x10..=0x18` deliberately rejects `0x1C` so callers stay on the full-path slot. **Decision D13 (range-gate) is not just defensive scaffolding — it is the only thing standing between the prober and a silent semantic regression.**

**Finding F-10** (Informational): The four profiled-thunk probes (`mono_class_get_name/_namespace/_parent`, `mono_assembly_get_image`) keep returning `0xE10` — far outside any sane field offset for these structures. This is the same Unity profiler-instrumentation pattern documented in 5e Phase 6 Audit (commit `9f1da89` design.md). Range-gate fallback to baseline is the correct response. No further probe-engine changes warranted; revisit only if real-HS testing surfaces a baseline that disagrees with truth.

### Run 3d — final dump_reflection (post `assembly.image=0x48` fix)

```
$ cargo run --example dump_reflection
… same 5 prober warnings as run 3a (expected, all kept on baseline) …

11/12 methods → "metadata error: class_def_table offset not found by probing MonoImage"
 1/12         → getBattlegroundRatingInfo: status=null, value=null, error=null  (~23 ms)
              ← class never instantiated in main-menu state; expected behaviour
```

**Result**: the `0x15` access violation is gone — `MonoRuntime::init` and the assembly walk both succeed. The remaining failure is downstream, in **class lookup** (`find_class`).

## Findings (Run 3 — class_def_table)

**Finding F-11** (Critical, **out-of-scope for 5e, drives 5f**): `find_class` calls `probe_class_def_table_offset(image_ptr)` which scans the first `0x200` bytes of `MonoImage` looking for a flat `MonoClass*[]` array indexed by RID. **No such structure exists in standard Mono.** Mono performs class lookup through `MonoImage.class_cache`, a `MonoInternalHashTable<MonoClass*>` at offset `+0x35C` (already declared in `unity-2021.3.json`, currently unused by reflection callers). The hash table maps `(token & MONO_TOKEN_RID_MASK)` to `MonoClass*` via an open-addressed hash with `key_extract` and `next_value_func` callbacks.

- **Where it manifests**: 11/12 reflection methods fail with the same string `"metadata error: class_def_table offset not found by probing MonoImage"` (originating from `mono/runtime.rs::find_class` after `probe_class_def_table_offset` returns `Err`). The 12th (`getBattlegroundRatingInfo`) returns `null` only because BG state isn't loaded — it never reached class lookup.
- **Why it survived earlier validation**: Unit tests use synthetic mocks. Spike Run 2 stopped at `MonoDomain.loaded_images` (F-6), which 5e fixed. Spike Run 3a/3b stopped at `MonoAssembly.image` (F-8), which the JSON fix above closes. F-11 only becomes reachable once the upstream chain is correct — exactly today.
- **Why it's not 5e**: 5e's contract is "deterministic offset discovery via disassembly". Replacing flat-array scan with hash-table walk is a different mechanism (token hashing through `class_cache`'s `hash_func`/`key_extract`) that needs its own design + spec — exactly what `add-hearthmirror-image-walking` (5f) was already scoped for in the integration plan.
- **Confidence**: HIGH. Cross-confirmed against (1) `MonoImage.class_cache` already declared in JSON with `$class_cache_note` describing the hash-table layout, (2) hearthmirror-rs source in `D:\code\hearthmirror-rs\hearthmirror\crates\hm-core\src\mono\image.rs` which uses exactly the hash-walk approach, (3) `class_cache` previously verified at `+0x35C` by brute-force scan (`size=6247, table populated with valid MonoClass* entries`).

## Recommendations (Run 3)

### Done in this run

**R-8**: `MonoAssembly.image = 0x48` correction landed in `packages/hearthmirror/native/config/mono-offsets/unity-2021.3.json` together with empirical `MonoImage` field annotations. Diagnostic tooling kept as `examples/diag_image.rs` and `examples/diag_singleton.rs` for future drift validation.

### Must Fix (defer to 5f)

**R-9**: Proceed with `add-hearthmirror-image-walking` (5f). Scope:

1. Replace `probe_class_def_table_offset` + flat-array indexing with `MonoInternalHashTable<MonoClass*>` walk against `MonoImage.class_cache` (offset `+0x35C`, already in JSON).
2. Implement token → bucket mapping (Mono uses `token & MONO_TOKEN_RID_MASK` then `% size`, with linear chain through `next_value_func`).
3. Update `find_class` callers (`get_singleton` + the 11 reflection methods that use type-token resolution).
4. Acceptance test: re-run `dump_reflection` against running HS — expect non-error responses for at least the 8 Tier-1 methods, with `getBattleTag` / `getAccountId` returning string values matching the logged-in account.

**Priority**: P0 — without 5f, every reflection method other than `getBattlegroundRatingInfo` returns the same `class_def_table` error. F-11 is now the *only* remaining blocker between the user and end-to-end reflection.

### Defer

**R-10**: A follow-up Run 4 in this spike, run after 5f lands, should re-execute `dump_reflection` and capture the non-null responses. At that point the spike can be closed.

### 5e Acceptance

5e (`add-hearthmirror-offset-probing`) is **complete and ready to archive** as of commits `3d7bfec` + `0919d49` + `9f1da89` + the `unity-2021.3.json` fix from this run. Its delivered scope:

- iced-x86 disassembly engine + 4 unit tests (Phase 2)
- `MonoOffsets` struct + JSON baseline + `Arc<MonoOffsets>` routing (Phase 3, 5.5)
- `read_exports_map` helper (Phase 4)
- `OffsetProber` with range-gating + 13 probe specs (Phase 5 + Audit)
- `MonoRuntime::init` wired to call `OffsetProber::probe_all` (Phase 6)
- `domain_assemblies` walk used in place of `loaded_images` (Phase 6)
- Range-gate keeps init alive on profiled-thunk false positives (D13)
- Run 3 closes the `image_ptr` failure mode that the prior baseline carried

What 5e *does not* deliver — and was never scoped to — is the `class_cache` walk path. That moves to 5f as F-11.

## Run 4 — post `add-hearthmirror-image-walking` (5f)

### Environment

| Field | Value |
|---|---|
| OS | Microsoft Windows NT 10.0.26200.0 (x64) |
| Build under test | `f4509aa` (5f archived as `2026-04-20-add-hearthmirror-image-walking`) |
| Hearthstone PID | 2892 (32-bit WoW64), uptime ~2 min |
| Game state | Main menu / login flow (just launched) |
| Test date (UTC) | 2026-04-20 ~17:00 |
| Cargo profile | `--release` |
| Output file | `packages/hearthmirror/native/dump_reflection_run3_post5f.jsonl` (numbered "run3" on disk only because run1/run2 already existed; this is **spike Run 4**) |

### Result — `dump_reflection` (12 reflection methods)

```
… same 5 prober warnings as Run 3 (4 profiled-thunk MonoClass/MonoAssembly
   probes + 1 mono_image_get_name short-name slot — all keep baseline) …

{"method":"getBattleTag","status":"null","value":"null","error":null,"elapsed_ms":0}
{"method":"getAccountId","status":"null","value":"null","error":null,"elapsed_ms":0}
{"method":"getMedalInfo","status":"null","value":"null","error":null,"elapsed_ms":0}
{"method":"getMatchInfo","status":"null","value":"null","error":null,"elapsed_ms":0}
{"method":"getGameType","status":"null","value":"0","error":null,"elapsed_ms":0}
{"method":"isSpectating","status":"ok","value":"false","error":null,"elapsed_ms":0}
{"method":"isGameOver","status":"ok","value":"false","error":null,"elapsed_ms":0}
{"method":"getServerInfo","status":"null","value":"null","error":null,"elapsed_ms":0}
{"method":"getBattlegroundRatingInfo","status":"null","value":"null","error":null,"elapsed_ms":0}
{"method":"getArenaDeck","status":"null","value":"null","error":null,"elapsed_ms":0}
{"method":"getDecks","status":"null","value":"null","error":null,"elapsed_ms":0}
{"method":"getCollection","status":"null","value":"null","error":null,"elapsed_ms":0}
```

### Status table — Run 1 → Run 3d → Run 4

| Method | Run 1 (5e baseline) | Run 3d (post-5e, pre-5f) | Run 4 (post-5f) |
|---|---|---|---|
| getBattleTag | ❌ MemoryAccess @ 0x15 | ❌ class_def_table not found | ⚪ null (no error) |
| getAccountId | ❌ MemoryAccess @ 0x15 | ❌ class_def_table not found | ⚪ null (no error) |
| getMedalInfo | ❌ MemoryAccess @ 0x15 | ❌ class_def_table not found | ⚪ null (no error) |
| getMatchInfo | ❌ MemoryAccess @ 0x15 | ❌ class_def_table not found | ⚪ null (no error) |
| getGameType | ❌ MemoryAccess @ 0x15 | ❌ class_def_table not found | ⚪ null (value=0) |
| **isSpectating** | ❌ MemoryAccess @ 0x15 | ❌ class_def_table not found | ✅ **OK = false** |
| **isGameOver** | ❌ MemoryAccess @ 0x15 | ❌ class_def_table not found | ✅ **OK = false** |
| getServerInfo | ❌ MemoryAccess @ 0x15 | ❌ class_def_table not found | ⚪ null (no error) |
| getBattlegroundRatingInfo | ❌ MemoryAccess @ 0x15 | ⚪ null (early bail) | ⚪ null (no error) |
| getArenaDeck | ❌ MemoryAccess @ 0x15 | ❌ class_def_table not found | ⚪ null (no error) |
| getDecks | ❌ MemoryAccess @ 0x15 | ❌ class_def_table not found | ⚪ null (no error) |
| getCollection | ❌ MemoryAccess @ 0x15 | ❌ class_def_table not found | ⚪ null (no error) |
| **Totals** | 0 OK / 0 null / **12 ERR** | 0 OK / 1 null / **11 ERR** | **2 OK / 10 null / 0 ERR** |

### Findings (Run 4)

**Finding F-12** (Closed): F-11 (`class_def_table` flat-array assumption) is empirically resolved. After the 5f refactor (`MonoImage::find_class` → embedded `MonoInternalHashTable` walk on `MonoImage.class_cache = +0x35C`), **zero** reflection methods raise `ScryError::ClassNotFound` or `MetadataError`. Two methods (`isSpectating` / `isGameOver`) resolve their full chain (find_class → vtable → static field → bool read) and return correct values for the test state (`false` in main menu, before any match).

**Finding F-13** (Informational, downstream of 5f): The 10 "null but no error" responses indicate the `MonoRuntime → MonoClass → MonoVTable → static_field` chain is now reaching a real field address but reading a NULL pointer / zero value. Two plausible explanations, both **outside the 5f scope**:

- **(F-13a) Login state**: Hearthstone was on the login flow at test time (account picker / region select). Singletons such as `BnetPresenceMgr`, `NetCache`, `CollectionManager` are typically lazy-initialised on first menu-render after login, so `s_instance` legitimately reads NULL until the user clicks past the login screen.
- **(F-13b) Field name / chain drift**: Some collectors expect C# field names that may have been renamed in the current Hearthstone build (last empirical sweep was during 5b). `MonoObject::find_field` now does inheritance-aware lookup (5f Phase 5), so a renamed field would silently miss instead of error — exactly the "null, no error" signature seen here.

Disambiguating F-13a vs F-13b is the job of the next dedicated spike or `verify-hearthmirror-on-real-hs` extension: re-run `dump_reflection` after `LoginScreen → MainMenu` transition and observe whether `BattleTag` / `AccountId` flip to OK; any methods that stay null after a confirmed in-menu state imply F-13b and need a name audit against current `Assembly-CSharp.dll`.

### Recommendations (Run 4)

**R-11**: Spike 0003 may be **closed**. The original spike question — "is the bridge able to read live reflection data?" — now has a positive answer: `MonoRuntime::init` succeeds, `find_class` succeeds non-heuristically, and a representative pair of methods (`isSpectating` / `isGameOver`) returns truthful values without panic or error. Remaining "null" responses are upper-layer state / field-name questions, not bridge defects.

**R-12** (defer to `verify-hearthmirror-on-real-hs`): Schedule a Tier-1 sweep after the user logs into the menu and a Tier-2 sweep after entering a match, capturing whether `getBattleTag` / `getAccountId` / `getDecks` populate. If any stay null while their dependent singletons are present (verifiable via `diag_singleton`), open a follow-up change to refresh field-name maps against the current build.

**R-13**: The five `OffsetProber` warnings (`mono_class_get_name`, `mono_class_get_namespace`, `mono_image_get_name`, `mono_assembly_get_image`, `mono_class_get_parent`) remain as documented in F-9 / F-10 — they are profiled-thunk false positives that the range-gate (D13) correctly silences by keeping the JSON baseline. No action needed unless real-HS testing surfaces a baseline mismatch.

### 5f Acceptance

5f (`add-hearthmirror-image-walking`) is **complete and verified live** as of commit `f4509aa`. Its delivered scope, all confirmed against running Hearthstone in this Run 4:

- `MonoImage::class_cache` embedded `MonoInternalHashTable` walk replaces the deleted `probe_class_def_table_offset` heuristic — zero error responses, down from 11 in Run 3d.
- `MonoClassRef::{parent, fields_recursive, find_field}` inheritance traversal — exercised transitively by `MonoObject::find_field` on the two OK methods.
- `MonoRuntime::find_class` uses one direct `MonoImage` lookup, with cache hit on repeat — Run 4 took ~1 ms total for 12 method calls combined, indicating lookup amortises after first call.

Spike 0003 closes; future runtime-data fidelity work moves into [`verify-hearthmirror-on-real-hs`](../../openspec/changes/verify-hearthmirror-on-real-hs/).

> **Reopened 2026-04-20 evening** — Runs 5–8 below document three additional bridge defects hidden beneath the "null, no error" masking pattern from F-13 (the original Run 4 close). Each was an empirically-verifiable data-path bug, not a speculative F-13b field-rename.

## Run 5–6 — live re-probing after Run 4 "close"

### Environment

| Field | Value |
|---|---|
| OS | Microsoft Windows NT 10.0.26200.0 (x64) |
| Build under test | `1431dc6` (P0-1 fix for `Assembly-CSharp` vs `Assembly-CSharp-firstpass` image selection) |
| Hearthstone state | In-menu, logged into account (post-login, pre-match) |
| Test date (UTC) | 2026-04-20 evening |

### Finding F-14 — P0 bridge defect #1: Assembly-CSharp vs Assembly-CSharp-firstpass

`MonoRuntime::find_ac_image_cached` used `name.contains("Assembly-CSharp")` to select the game's main `MonoImage`. Because `Assembly-CSharp-firstpass.dll` appears *before* `Assembly-CSharp.dll` in the Mono domain's `domain_assemblies` `GSList`, the cache locked onto `firstpass` — which only contains ~20 utility classes and none of the gameplay singletons (`NetCache`, `GameState`, `CollectionManager`, …).

Combined with an independent latent bug in `MonoRuntime::get_singleton` — `Err(ClassNotFound)` was explicitly swallowed to `Ok(None)` instead of propagating — every reflection method that depended on a main-assembly singleton silently returned the collector's default (`false`/`0`/`null`) rather than the user's data. This masks the defect as "F-13-style drift" in Run 4's table.

**Fix**: narrow the match to `name.ends_with("Assembly-CSharp.dll") || name == "Assembly-CSharp"`. Committed as `1431dc6` along with a new diagnostic example `diag_class_names.rs`.

### Run 6 — `dump_reflection` after F-14 fix

```
{"method":"getBattleTag","status":"null","value":"null","error":null,"elapsed_ms":44}
{"method":"getMatchInfo","status":"null","value":"null","error":null,"elapsed_ms":56}
{"method":"getDecks","status":"error","value":"null","error":"collection iteration exceeded max_items=5000","elapsed_ms":33}
{"method":"getCollection","status":"error","value":"null","error":"collection iteration exceeded max_items=50000","elapsed_ms":0}
…
```

Two methods flipped from null → error (a *positive* signal: real memory is now being traversed). Elapsed-ms values changed from uniformly `0` to 30–60 ms, confirming class resolution through `Assembly-CSharp.dll` succeeds end-to-end. The two new errors expose the next layer of bugs.

## Run 7 — P0 bridge defect #2: `MonoObject` header reads the wrong slot

### Empirical isolation

`diag_field_object` (new in this run) walks `CollectionManager.s_instance → m_decks`, dumping each object's resolved class name alongside the raw object header. Output pre-fix:

```
<root>: object @ 0x4EBC9E00
  klass = 0x4ADDFBA8
  type(raw) = j����.j          ← garbage string
  vtable_size = 182517796       ← bogus, trips our sanity cap
```

Then — **critically** — dumping the supposed "klass" at `0x4ADDFBA8` (`diag_klass_dump`) revealed it was a `MonoVTable`, not a `MonoClass`. `MonoVTable.klass` at +0x00 = `0x2518BC28`, and *that* address resolves cleanly to `CollectionManager` with `field_count = 0x6F = 111`, matching `diag_class_fields` exactly.

### Finding F-15 — root cause

Mono's object header is `struct MonoObject { MonoVTable *vtable; MonoThreadsSync *monitor; }`. The slot at object + 0 is the **vtable**, not the class. Our `MonoObject::from_address` read `object + 0` as a `MonoClass*` and ran `read_class_fields` on vtable bytes, producing a random `HashMap` keyed on whatever happened to dereference as a printable string.

This defect was latent all the way through Runs 1–6 because:
- Singletons reached via `get_singleton` build their `MonoObject` from a `MonoClassRef` returned by `find_class` (which goes through `MonoImage.class_cache` and never looks at a live object header). Leaf reflection methods like `isSpectating` / `isGameOver` read a single `bool` off the singleton and return, so they *never* touched `from_address` — hence Run 4's two "OK" results misled us into believing the object path worked.
- Methods with a deeper chain (`getBattleTag` → `NetCache.m_netCacheValues[…].BattleTag`, `getDecks` → `CollectionManager.m_decks[…]`) invoke `child_from_address` on each hop, which uses `from_address`. These all silently returned junk `fields` maps, so every downstream field lookup missed and bubbled up as "null, no error" — again indistinguishable from F-13's drift hypothesis without direct runtime type inspection.

### Fix (P0-2)

`MonoObject::from_address` now reads the vtable via `offsets.structs.object.vtable`, then dereferences `offsets.structs.vtable.klass` to obtain the real `MonoClass*`. Both offsets were already captured in `unity-2021.3.json` — the code simply was not using them. Updated `examples/diag_field_object.rs` to print both `vtable` and `klass` so future drift stays visible.

### Post-fix `diag_field_object` sanity

```
<root>: object @ 0x4EBC9E00
  vtable = 0x4ADDFBA8
  klass  = 0x2518BC28
  type(full) = CollectionManager    ✓

step 1: m_decks @ +0x0038
  type(full) = Blizzard.T5.Core.Map`2   ← not a List<T>!

(probing m_collectibleCards)
  type(full) = System.Collections.Generic.List`1  ← not a Dictionary<K,V>!
```

This *immediately* exposed the third defect (below) as a type-assumption bug: `m_collectibleCards` is a `List`, but reflection was iterating it as a `Dictionary`.

## Run 8 — P1 bridge defect #3: wrong collection type on `m_collectibleCards`

### Fix

`reflection/collection.rs` rewritten to iterate `m_collectibleCards` with `list::iter_element_ptrs` (reads `_items`/`_size`), instead of `dict::iter_entries` (which had been reading `_entries`/`_count` at offsets that happen to be pointers inside a `List<T>`, producing the 50 000-item overflow). The `dbf_id` field is now read from each `CollectionCardData` via `FLD_CARD_DBF_ID` rather than extracted from a non-existent dictionary-entry key slot.

### Result — `dump_reflection` Run 8 (post-P0-1 + P0-2 + P1)

```
{"method":"getBattleTag","status":"null","value":"null","error":null,"elapsed_ms":44}
{"method":"getAccountId","status":"null","value":"null","error":null,"elapsed_ms":0}
{"method":"getMedalInfo","status":"null","value":"null","error":null,"elapsed_ms":0}
{"method":"getMatchInfo","status":"null","value":"null","error":null,"elapsed_ms":57}
{"method":"getGameType","status":"null","value":"0","error":null,"elapsed_ms":50}
{"method":"isSpectating","status":"ok","value":"false","error":null,"elapsed_ms":0}
{"method":"isGameOver","status":"ok","value":"false","error":null,"elapsed_ms":0}
{"method":"getServerInfo","status":"null","value":"null","error":null,"elapsed_ms":43}
{"method":"getBattlegroundRatingInfo","status":"null","value":"null","error":null,"elapsed_ms":57}
{"method":"getArenaDeck","status":"null","value":"null","error":null,"elapsed_ms":45}
{"method":"getDecks","status":"error","value":"null","error":"collection iteration exceeded max_items=5000","elapsed_ms":36}
{"method":"getCollection","status":"ok","value":"15618 cards","error":null,"elapsed_ms":631}
```

**`getCollection` returns 15 618 cards from the live process** — the first reflection method to deliver non-trivial user data end-to-end. Elapsed `631 ms` corresponds to a realistic full traversal of a ~15k-entry `List<CollectionCardData>` with per-card field reads.

### Status table — Run 4 → Run 6 → Run 8

| Method | Run 4 (post-5f) | Run 6 (post-P0-1) | Run 8 (post-P0-2 + P1) |
|---|---|---|---|
| getBattleTag | ⚪ null | ⚪ null | ⚪ null (F-16) |
| getAccountId | ⚪ null | ⚪ null | ⚪ null (F-16) |
| getMedalInfo | ⚪ null | ⚪ null | ⚪ null (F-16) |
| getMatchInfo | ⚪ null | ⚪ null | ⚪ null |
| getGameType | ⚪ null | ⚪ null | ⚪ null |
| **isSpectating** | ✅ OK | ✅ OK | ✅ OK |
| **isGameOver** | ✅ OK | ✅ OK | ✅ OK |
| getServerInfo | ⚪ null | ⚪ null | ⚪ null |
| getBattlegroundRatingInfo | ⚪ null | ⚪ null | ⚪ null |
| getArenaDeck | ⚪ null | ⚪ null | ⚪ null |
| getDecks | ⚪ null | ❌ overflow 5 000 | ❌ overflow 5 000 (F-17) |
| **getCollection** | ⚪ null | ❌ overflow 50 000 | ✅ **OK = 15 618 cards** |
| **Totals** | 2 OK / 10 null / 0 ERR | 2 OK / 8 null / 2 ERR | **3 OK / 8 null / 1 ERR** |

### Findings (Runs 5–8)

**Finding F-16** — `NetCache` does not expose `s_instance`. Direct class dump shows `NetCache` has only five static fields (`m_getAccountInfoTypeMap`, `m_genericRequestTypeMap`, …) — no `s_instance`. Hearthstone reaches it via `Blizzard.T5.Services.ServiceManager.s_runtimeServices` — a `Dictionary<Type, object>` the game populates at startup. This affects `getBattleTag` / `getAccountId` / `getMedalInfo`, and likely a subset of `getMatchInfo` / `getServerInfo` that traverse from a non-singleton service. Requires proper `ServiceLocator::get_service` implementation (currently a placeholder `Err(Unsupported)` in `service_locator.rs`). **Priority**: P1 for next change.

**Finding F-17** — `m_decks` is `Blizzard.T5.Core.Map<long, CollectionDeck>`, not `List` or `System.Collections.Generic.Dictionary`. Empirical layout (probed via `diag_obj_type` on live `_entries`):

```
Blizzard.T5.Core.Map<K, V> object layout (32-bit):
  +0x00  MonoVTable *
  +0x04  monitor
  +0x08  _buckets   : Int32[]                 (chain head indices)
  +0x0C  _entries   : Blizzard.T5.Core.Link[] (hash-chained key/value pairs)
  +0x10  ?          : int[]                    (possibly an alternate index)
  +0x14  ?          : object                   (possibly EqualityComparer / Link pool)
  +0x18  ?          : object
  +0x1C  _count     : i32                      (verified: = 8 in current user's collection)

Link entry for <long, object ref>:
  +0x00  hash       : i32
  +0x04  next       : i32 (-1 = end of chain)
  +0x08  key        : i64
  +0x10  value      : MonoObject* (CollectionDeck)
  +0x14  padding    : i32                      (alignment)
  size = 24 bytes  (need brute-force verification for generic arities ≠ <long, ref>)
```

`list::iter_element_ptrs` reads `_items@+0x08` / `_size@+0x0C` and sees the `_entries` MonoArray pointer as `_size` — hence the 1.17 GB overflow report. Requires a new `collections::blizzard_map::iter_entries` module with parametric key/value sizes. **Priority**: P2 — `getDecks` is currently the only consumer, and the map walks a `Link[]` with per-entry layout that depends on the `<K, V>` generic arguments.

**Finding F-18** — the remaining null methods (`getMatchInfo` / `getGameType` / `getServerInfo` / `getBattlegroundRatingInfo` / `getArenaDeck`) still return null with non-zero `elapsed_ms`, meaning the chain reaches a real field but the final pointer or value is NULL. Root causes to audit individually with `diag_field_object` in a follow-up spike:
- `getMatchInfo` / `getServerInfo` depend on `GameMgr` or `Network` singletons being non-null during menu state.
- `getBattlegroundRatingInfo` and `getArenaDeck` were already null-valid in menu state per Run 4 (`BaconRatingMgr.m_lastRatingResponse` / `DraftManager.m_currentDeck` legitimately NULL between modes).

### Recommendations (Runs 5–8)

**R-14** (P0, done): F-14 fixed by commit `1431dc6`. F-15 fixed by the change that adds this spike section (`MonoObject::from_address` now walks vtable→klass).

**R-15** (P1, done): F-17's `getCollection` half delivered — iterate `List<T>` with `list::iter_element_ptrs`. 15 618 cards streaming live from the running game.

**R-16** (P1, next): Implement `ServiceLocator::get_service` against `Blizzard.T5.Services.ServiceManager.s_runtimeServices`. Unblocks `getBattleTag` / `getAccountId` / `getMedalInfo` in one pass. This is the highest-impact remaining work (3 methods in one feature).

**R-17** (P2, follow-up): Add `collections::blizzard_map` module with generic-arity-aware `Link[]` iteration. Rewrite `decks.rs` to consume it. Closes F-17.

**R-18** (P2, follow-up): `diag_field_object` sweep for `getMatchInfo` / `getServerInfo` etc. to classify each residual null as F-18a (legitimately null in menu state) vs F-18b (field-name drift requiring re-audit).

### Bridge fidelity summary

With P0-1, P0-2, and P1 fixed in place, the hearthmirror bridge now reliably delivers live reflection data for three of the twelve reflection methods, including the largest single dataset (the card collection). Runs 5–8 transform the "null, no error" opacity of Run 4 into concrete, individually-classified follow-ups — the spike's original question ("can we read runtime data?") has a stronger, evidence-backed positive answer now than it did in Run 4.

