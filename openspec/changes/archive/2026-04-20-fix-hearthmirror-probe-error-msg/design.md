## Context

`probe_field_offset` (introduced in `add-hearthmirror-bridge` Phase F) is a slot-scan helper used during `MonoRuntime::init()` to discover field offsets when the in-memory layout drift from the baseline. When all 64 candidate slots fail validation, it returns a `ScryError::FieldNotFound` with **hard-coded placeholder strings**:

```rust
// packages/hearthmirror/native/src/mono/probe.rs:34-37
Err(ScryError::FieldNotFound {
    class: "<probe>".into(),
    field: "<probed>".into(),
})
```

[Spike 0003 Run 2](../../../docs/spikes/0003-hearthmirror-reflection-runtime-validation.md) discovered that the resulting `mono field not found: <probe>.<probed>` string was emitted 12 times by 12 reflection methods, masking the fact that all 12 failures shared a *single* root cause (`MonoDomain.loaded_images` probe failure). Three grep rounds were needed to recover the actual probe site.

## Decisions

### D1: Signature change — accept caller identifiers

```rust
// Before
pub fn probe_field_offset<F>(
    memory: &ProcessMemory,
    base: RemotePtr,
    validator: F,
) -> Result<u32, ScryError>

// After
pub fn probe_field_offset<F>(
    memory: &ProcessMemory,
    base: RemotePtr,
    owner_class: &str,
    owner_field: &str,
    validator: F,
) -> Result<u32, ScryError>
```

**Rejected**: Builder-pattern (`ProbeRequest::new(...).owner("Foo").field("bar").run()`). Two extra `&str` params is the minimum-ceremony solution; builder is overkill for a 1-caller helper.

**Rejected**: Module-level constant `pub const PROBE_OWNER: &str = "..."` set by caller. Implicit state, harder to grep, encourages stale identifiers.

### D2: Error variant shape unchanged

`ScryError::FieldNotFound { class, field }` keeps its existing two-string shape. The Display impl `mono field not found: {class}.{field}` already produces the right output once real values are passed in. **No `ScryError` variant change.**

This preserves all existing error consumers (napi serializer, integration test assertions, error logs).

### D3: Caller migration — single site

`grep -rn "probe_field_offset(" packages/hearthmirror/native/src/` returns exactly one match (`runtime.rs:159`). Migration is mechanical:

```rust
// Before
let domain_loaded_images = probe_field_offset(memory, domain, |slot| { ... })?;

// After
let domain_loaded_images = probe_field_offset(
    memory, domain, "MonoDomain", "loaded_images", |slot| { ... }
)?;
```

5e (`add-hearthmirror-offset-probing`) will add new callers if its `OffsetProber` needs fallback heuristic probes. Those new callers will be expected to pass meaningful identifiers from day one — this change establishes the convention.

### D4: No new tests

The existing `probe.rs` test module is empty (with a comment explaining "tested in integration"). Adding mock-process unit tests for the error-string change is disproportionate. **Verification path**: spike 0003 Run 3 (post-5e) will inspect actual error strings; if they read `MonoDomain.loaded_images` instead of `<probe>.<probed>`, this change is validated end-to-end.

The existing `error.rs::tests::napi_error_conversion_preserves_message` already exercises `FieldNotFound` Display formatting and continues to pass unchanged.

### D5: No deprecation cycle

`probe_field_offset` is a `pub` function but has no external consumers (lib-internal helper, `hearthmirror-native` crate is consumed only via napi-rs from `@hdt/hearthmirror`). Direct breaking signature change is safe. Bump-and-patch in a single commit.

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|---|---|---|
| Forgot a caller | Very low | Grep proves N=1; CI compile catches missing arguments |
| Identifier strings drift from reality (e.g. typo `loaded_imags`) | Low | Reviewer + spike 0003 Run 3 validation |
| Breaks downstream consumers of `probe_field_offset` | None | No downstream consumers exist |

## Migration

None — no API consumers outside the crate.
