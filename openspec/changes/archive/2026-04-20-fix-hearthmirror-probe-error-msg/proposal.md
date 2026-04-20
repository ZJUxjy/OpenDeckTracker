## Why

[Spike 0003 Run 2 finding F-7](../../../docs/spikes/0003-hearthmirror-reflection-runtime-validation.md) identified that `probe_field_offset` returns a useless error string `mono field not found: <probe>.<probed>` regardless of which probe site failed. When 12/12 reflection methods all surfaced this exact string, it took **three rounds of grep** to confirm the failures all originated from the same `runtime.rs:159` call site discovering `MonoDomain.loaded_images`. A 5-line refactor — accepting caller-supplied identifier strings — eliminates this debugging tax permanently.

This change is *complementary to* (not a substitute for) [`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/) (5e). 5e replaces the slot-scan heuristic itself; this change improves diagnostics for **any future** probe failure (5e's `OffsetProber` will still need fallback paths and best-effort probes that can fail gracefully).

## What Changes

- Refactor `pub fn probe_field_offset` signature to accept `owner_class: &str, owner_field: &str` parameters
- Update the single existing caller (`runtime.rs:159` for `MonoDomain.loaded_images`) to pass identifiers
- No behavior change for the success path; error path now produces actionable strings like `mono field not found: MonoDomain.loaded_images`
- No napi public API change — `probe_field_offset` is lib-internal; the `ScryError::FieldNotFound` variant shape is unchanged

## Impact

- **Affected specs**: new `hearthmirror-mono-probe` capability spec
- **Affected code**:
  - `packages/hearthmirror/native/src/mono/probe.rs` — signature change + error site
  - `packages/hearthmirror/native/src/mono/runtime.rs:159` — single caller update
- **Out of scope**: 5e's `OffsetProber` (independent). This change does not modify probe **behavior** — only diagnostics.
- **Risk**: Zero — pure diagnostic refinement, exhaustive caller coverage trivially verifiable by grep.
- **Estimated effort**: 5-10 minutes implementation + 5 minutes verification.
