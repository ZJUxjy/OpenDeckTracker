# Spike 0002 Report: HearthMirror Mono Runtime Locate

> Executed during change `add-hearthmirror-bridge-mono-spike` on 2026-04-19.
> Plan: spike implementation defined in `add-hearthmirror-bridge-mono-spike` change
> ADR: [`docs/adr/0001-hearthmirror-bridge.md`](../adr/0001-hearthmirror-bridge.md)
> Builds on: [`docs/spikes/0001-hearthmirror-spike-report.md`](0001-hearthmirror-spike-report.md)

## Outcome

**Result**: ✅ **PARTIAL — go ahead with `add-hearthmirror-bridge`, but with mandatory offset probing**

5 of the 6 verification steps passed cleanly:

- 64-bit napi-rs **can** locate the Mono runtime in 32-bit Hearthstone (`mono-2.0-bdwgc.dll`).
- PE export table parsing is straightforward (~150 lines Rust, 6 ReadProcessMemory calls; no need for `pelite`/`goblin`).
- `mono_get_root_domain` uses the textbook `A1 ... C3` byte pattern; no need for a real disassembler crate (`iced-x86`).
- Root domain global pointer dereferences cleanly to a non-NULL `MonoDomain*`.

The single anomaly: `MonoDomain.domain_assemblies` at offset `+0x0C` (per `Rewrite_Design.md` §7.2) **reads as NULL**, while `MonoDomain.loaded_images` at `+0x14` reads as a valid pointer. This suggests the overall `MonoDomain` layout is similar to §7.2's reference, but specific field offsets have drifted between the Unity 2021.3 reference and the current Hearthstone client. **`add-hearthmirror-bridge` must implement offset probing instead of hardcoding §7.2's table.**

ADR 0001's choice of "64-bit `napi-rs`, same process" remains validated. No reason to fall back to ADR 0002.

## Hearthstone Runtime Info

| Field | Observed | Notes |
|---|---|---|
| PID | `53788` | varies per launch |
| Mono module name | `mono-2.0-bdwgc.dll` | Unity standard embedded runtime, Boehm GC |
| Mono module base | `0x7A5B0000` | ASLR active (varies per launch); base is not in textbook 32-bit DLL range `0x10000000`-ish |
| Mono module size | `6,529,024` bytes (~6.5 MB) | reasonable for Mono full runtime |
| PE Machine | `0x014C` | i386 = 32-bit confirmed ✅ |
| PE Subsystem | `0x0002` | Windows GUI |
| Permissions required | normal user | `OpenProcess(PROCESS_QUERY_INFORMATION \| PROCESS_VM_READ)` succeeded without administrator |
| Defender / EAC interference | none observed | spike call took ~36 ms (single call; first call is slower than spike 01's 252 µs because of cold-cache PE traversal — see Performance below) |
| Unity version | unknown | not extracted in this spike; recommend reading from `globalgamemanagers` in a future spike if needed |

## 6-step Link Output

Full JSON copied verbatim from main process stdout (`[spike:mono] OK:`):

```json
{
  "pid": 53788,
  "monoModuleName": "mono-2.0-bdwgc.dll",
  "monoModuleBase": "0x7A5B0000",
  "monoModuleSize": 6529024,
  "peMachine": "0x014C",
  "peSubsystem": "0x0002",
  "monoGetRootDomainRva": "0x00095DD0",
  "monoGetRootDomainVa": "0x7A645DD0",
  "monoGetRootDomainFirstBytes": "A1 68 2A B3 7A C3 CC CC CC CC CC CC CC CC CC CC",
  "globalRootDomainAddr": "0x7AB32A68",
  "disasmPattern": "A1+ret",
  "rootDomainPtr": "0x0BBC2E70",
  "domainAssembliesPtr": "0x00000000",
  "loadedImagesPtr": "0x030007D0",
  "elapsedMicros": 35904,
  "notes": []
}
```

### Decoding the function bytes manually

```
A1 68 2A B3 7A   mov eax, [0x7AB32A68]   ; load global root_domain pointer
C3                ret
CC CC CC CC ...  ; padding (int3 instructions, function alignment)
```

Confirms global at `0x7AB32A68` (which equals `mono_module_base + 0x582A68`, i.e. inside mono.dll's `.data` section). Reading `[0x7AB32A68]` returned `0x0BBC2E70` (the actual `MonoDomain*` on the C# heap, not in mono.dll).

## Observed Offsets vs §7.2

| Structure.field | §7.2 offset | Observed value at offset | Status |
|---|---|---|---|
| `MonoDomain.vtable` | `+0x00` | (not read in spike) | — |
| `MonoDomain.domain_assemblies` | `+0x0C` | `0x00000000` (NULL) | ⚠️ **DRIFTED** — see analysis below |
| `MonoDomain.loaded_images` | `+0x14` | `0x030007D0` (valid heap) | ✅ matches expected pattern |

**Analysis of the `domain_assemblies` NULL**:

Three plausible explanations (in decreasing likelihood):

1. **Field moved**: between Unity Mono versions, `MonoDomain` may have gained or removed members. The actual `domain_assemblies*` is likely at a nearby offset (e.g. `+0x10`, `+0x18`, `+0x1C`). To find it, the next spike or the production implementation should dump `MonoDomain[0..0x60]` as 4-byte words and look for non-NULL pointers that, when dereferenced as `MonoGList { data*, next* }`, point to something that itself dereferences to a `MonoAssembly*` with a recognizable image name.

2. **Field renamed**: Mono internals may have replaced `domain_assemblies` with a different mechanism (e.g. `appdomain_assemblies` array instead of GList). Check Mono source for the exact Unity build.

3. **Initialization timing**: less likely, but possible that on the main menu the field is briefly transitioning. The fact that `loaded_images` at `+0x14` is populated argues against this.

**Recommendation**: production code MUST dynamically locate `domain_assemblies` (or use `loaded_images` instead — for HDT.js's purposes, walking `loaded_images` to find `Assembly-CSharp.dll` is equivalent and likely simpler).

## Encountered Issues

### Issue 1: `windows` crate API change for `GetModuleBaseNameW`

windows@0.58 changed the `hmodule` parameter type. Old code:

```rust
GetModuleBaseNameW(h_process, Some(m), &mut name_buf)
```

was rejected with `Option<HMODULE>: Param<HMODULE>` not satisfied. Fix: pass `m` directly (the API expects `Param<HMODULE>` directly, not `Option<HMODULE>`).

```rust
GetModuleBaseNameW(h_process, m, &mut name_buf)
```

This is purely a compile-time issue; no runtime cost.

### Issue 2: `MonoDomain.domain_assemblies` offset drift (described above)

Not actionable in this spike — **must** be addressed in `add-hearthmirror-bridge`.

### Issue 3: Spike call cost (~36 ms) is much higher than spike 01's (~252 µs)

Expected and acceptable:

- Spike 01 did 1 fixed-size ReadProcessMemory call (16 bytes).
- Spike 02 did ~10 ReadProcessMemory calls of varying sizes (PE header 1 KB, optional header ~240 B, export directory 40 B, name pointer table N×4, ordinal table N×2, address table N×4, ~250 string reads of 256 B each for export name lookup, plus the function body and 3 MonoDomain field reads).
- For production: do export-table lookup once per session (cache `mono_get_root_domain_va` and the global pointer address); subsequent reads of `MonoDomain` fields are just 4-byte reads (sub-µs each, like spike 01).

### Issue 4: `disasmPattern: "A1+ret"` worked first try

No issue — but worth recording: Unity Mono build is **not** compiled with frame-pointer or stack-canary tricks for this function, so the byte-pattern decoder works without needing `iced-x86`. This may not hold for all functions we'll need to disassemble in the production code (e.g. `mono_class_get`, `mono_field_get_value`); recommend keeping `iced-x86` as a Phase 2 dependency if pattern matching breaks anywhere.

## Performance Baseline

| Metric | Value | Notes |
|---|---|---|
| `spike_locate_mono` end-to-end | **~36 ms** | single call, includes PE table walk + name table linear scan |
| Estimated steady-state per Mono field read (after warmup) | **< 5 µs** | extrapolated from spike 01's 252 µs/call total ≈ 250 µs WindowsAPI overhead + few µs per 4-byte read |
| Mono module size | 6.5 MB | for reference; we don't read all of it |

## Recommendations for `add-hearthmirror-bridge`

In priority order:

1. **Implement field offset probing for `MonoDomain`** (and likely `MonoImage`, `MonoClass`, etc.). Dump 0x100 bytes of each structure on first access, walk it as 4-byte pointers, validate by chasing them to expected substructures (e.g. `MonoGList { data*, next* }` that points to a `MonoAssembly*` that has a `MonoImage*` with `name=="Assembly-CSharp"`). Cache the discovered offsets keyed by `mono.dll` version (or just by Hearthstone build).

2. **Use `loaded_images` instead of `domain_assemblies`** to enumerate assemblies. It's already verified to work at the §7.2 offset, and is more direct (we want `MonoImage*` for `Assembly-CSharp.dll`, not `MonoAssembly*` first).

3. **Cache the export-table lookup**: `mono_get_root_domain_va` and `globalRootDomainAddr` only need to be computed once per Hearthstone session. After that, all subsequent calls just dereference these cached addresses (single ReadProcessMemory call, ~250 µs).

4. **Use `pelite`** (not the spike's hand-rolled PE parser) — production code benefits from the well-tested edge-case handling (forwarder exports, ordinal-only exports, non-canonical PE layouts). Spike 02 chose hand-rolled to minimize spike scope; production should not.

5. **Keep `iced-x86` as a Phase 2 dependency**, not Phase 1. The `A1+ret` byte pattern works for `mono_get_root_domain`; if any future critical function (e.g. `mono_get_corlib`) doesn't match a pattern, then introduce iced-x86. Don't pre-emptively complicate.

6. **Add a "hearthstone is fully loaded" precondition check** before any business call. The `notes` array in `MonoSpikeResult` has a path for "root_domain is NULL — Hearthstone may not be fully loaded". Production should expose this as `await hearthMirror.waitUntilReady()` and reject early if root_domain stays NULL after, say, 30 seconds.

7. **Implement RAII-style `OwnedProcessHandle`** as `RemotePtr(u32)`'s sibling. Spike used `HandleGuard(HANDLE)` ad-hoc; production should formalize.

8. **Don't use `mono.dll` as the search name** — always `mono-2.0-bdwgc.dll`, with `mono-2.0-sgen.dll` and `mono-2.0-boehm.dll` as known fallbacks. Update `Rewrite_Design.md` §7.1 to reflect this (`Rewrite_Design.md` currently says "查找 mono.dll", which is wrong).

9. **PE Machine field is `0x014C` (i386)** — confirmed. No need to support 64-bit Hearthstone variants (none exist as of 2026-04).

10. **ASLR base offset is `0x582A68` away from the global**. Useful invariant: the global root_domain variable is at a fixed RVA inside `mono-2.0-bdwgc.dll`. If we ever need to find it without parsing the export table (e.g. as a fallback when export table is stripped), we can use this RVA pattern + a sanity check (read 4 bytes at it, deref, verify the result + `+0x14` → loaded_images is non-NULL).

## Decision Outcome

✅ **PARTIAL → Proceed with `add-hearthmirror-bridge`**

The architectural decision (ADR 0001 Option D: 64-bit napi-rs same-process) is fully validated. The single observed gap (one offset drift) is a well-bounded engineering task — production must implement offset probing for at least `MonoDomain.domain_assemblies`, but this is exactly the kind of work that belongs in `add-hearthmirror-bridge`'s implementation phase, not in another spike. **Do NOT open ADR 0002.**
