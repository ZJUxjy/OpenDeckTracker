## Context

`get_collection_internal` today is a black box on the production
happy path: there is no log, no metric, no probe. We rely on Result-level
errors to surface problems — but the failure mode we just observed
returns `Ok(Some(vec![CardResult { 0, 0, 0 }; N]))` which is not an
error and not detectable by counting `.is_some()`.

The fundamental question this change has to answer:

> Of the N elements `iter_element_ptrs` returns, how many have valid
> `dbfId`, `count`, and `premium` field reads — and what is the class
> name of the first element actually being parsed?

Once we have those counters from a live HS instance, the bug is
visible:

- **`list_size = N` but `parsed = 0`** → `child_from_address` fails on
  every pointer → the element type signature or the pointer-dereference
  layout changed.
- **`parsed = N` but `field_misses = N`** → the element class is reachable
  but the field paths (`DbfId` / `m_count` / `m_premium`) no longer
  match. We need to inspect `sample_class` for the new class layout.
- **`parsed = N`, `field_misses = 0`, `non_zero_dbfid = 0`** → fields
  read but contain zeros → real game state has zero cards (unlikely)
  or the element pointers are dereferencing to a different object
  than CollectionCardData.
- **`parsed = N`, `non_zero_dbfid = N`** → bridge is healthy; the
  earlier symptom was due to something else (e.g. main-process IPC
  serialization, snapshot store stale write).

## Goals / Non-Goals

**Goals:**

- Make `get_collection_internal` self-reporting: every call drops a
  one-line summary into stderr.
- Provide a structured equivalent (`get_collection_diagnostic`) that
  callers can query without parsing stderr.
- Surface the structured diagnostic in the renderer console alongside
  the existing `[collection-sync]` lines so the user can capture
  everything from one DevTools view.

**Non-Goals:**

- No fix. No timeout. No UX change.
- No behavior change to the production happy path. The new logging is
  best-effort; if any counter cannot be computed it MUST default to 0
  rather than abort the function.
- No diagnostic gate / env var. The single eprintln line is cheap and
  safe to leave on in release builds. (Compare: native crate already
  emits `[hearthmirror] MonoRuntime: invalidated …` etc. We are
  matching that bar.)

## Decisions

### Decision 1: Counter implementation strategy

**Options:**

- Side-effect counters inside the existing for-loop (mutate locals,
  emit at the end).
- A second pass over `Vec<CardResult>` after construction.

**Choice:** Side-effect counters in the loop.

**Rationale:** Only one allocation, one walk through the elements,
and the second-pass approach can't distinguish "field read returned
`None`" from "field read returned `Some(0)`" because the
`.unwrap_or(0)` flattens them. We need to count `Option::is_none`
*before* unwrapping.

### Decision 2: Where the diagnostic struct lives

`CollectionDiagnostic` is a sibling of `CardResult` in
`reflection/collection.rs`, exported through the same napi surface:

```rust
#[napi(object)]
pub struct CollectionDiagnostic {
    pub list_size: i32,
    pub parsed: i32,
    pub non_zero_dbfid: i32,
    pub null_ptrs: i32,
    pub field_misses: i32,
    pub sample_class: Option<String>,
    pub elapsed_ms: i32,
}
```

All counters are `i32` (matches existing napi-rs conventions in this
crate) even though they fit in `u32` — keeps the generated d.ts
consistent with other reflection fields.

### Decision 3: `sample_class` source

We capture the first non-null element's class name via
`child_obj.klass_name()` (or equivalent — the runtime API exposes
something like this via existing `mono::class::read_mono_class`).
This is the cheapest signal that tells us whether the bridge is
parsing the *right type* at all.

If no element passes `child_from_address`, `sample_class` stays
`None` and we emit `sample_class=<unset>` in the log line.

### Decision 4: Logging format

Single line, kv pairs separated by spaces, prefix
`[hearthmirror:collection]`, target stderr. Matches the existing
runtime-invalidation log format. Example:

```
[hearthmirror:collection] list_size=15247 parsed=15247 non_zero_dbfid=0 null_ptrs=0 field_misses=15247 sample_class=CollectibleCard elapsed=14302ms
```

### Decision 5: Diagnostic fn returns the *current* state, not a side-channel mirror

`get_collection_diagnostic` re-runs `get_collection_internal` and
returns the counters. It does **not** read from a global cache. This
keeps the diagnostic honest (the answer reflects what `getCollection()`
would return *right now*) at the cost of one extra Mono walk if the
caller wants both the cards AND the counters.

The renderer's `handleSyncClick` already calls `getCollection()`
once via the existing path; the diagnostic call is a separate trip.
Two walks of ~15k entries × ~10ms apiece is acceptable for an
investigation-only knob.

### Decision 6: Renderer integration

`Collection.tsx`'s `handleSyncClick` adds the diagnostic as a fourth
`Promise.allSettled` item. Its result is logged with prefix
`[hearthmirror:collection]` so the user can grep one log stream.

The button's terminal state (`success` / `error`) remains driven by
`progress.getProgress()` only — the diagnostic call's outcome is
purely observability and never affects UX.

## Risks / Trade-offs

- **Risk:** Doubling the Mono walk doubles the 29s symptom to ~60s
  the first time the user clicks. **Mitigation:** they were already
  expecting it to be slow; one round of investigation is worth the
  delay. If this becomes painful, we can guard the diagnostic call
  behind a "Diagnose" sub-button in a follow-up.
- **Trade-off:** Leaving the eprintln always-on adds a few bytes to
  the main-process stderr per sync. Trivial cost; consistent with
  existing log lines.

## Migration Plan

Additive only. No schema, no IPC contract change beyond a new channel
(`hearthmirror:get-collection-diagnostic`) which renderer code only
calls when the user clicks Sync. Existing consumers of
`HearthMirror.getCollection()` are unaffected.

Native crate must be rebuilt: `pnpm --filter @hdt/hearthmirror-native build`
(or `napi build --platform --release` inside that package). The
resulting `hearthmirror-native.win32-x64-msvc.node` ships in the
package dir. If `pnpm dev` is running, the Electron process holds the
old `.node` open — stop dev, rebuild, restart.
