## Context

`get_collection_internal` walks
`CollectionManager.m_collectibleCards` (a `List<T>`) and parses each
element into a `CardResult`. The walk itself is correct — pointers
deref, `MonoObject::from_address` resolves the vtable and class — but
the three `read_int32_field` calls use field names from the previous
element-class generation (`CollectionCardData`). The class was
re-architected at some Hearthstone build between the last update and
now, with `CollectibleCard` exposing different names.

The diagnostic-counters change established that:

- `parsed == list_size` (15,695) → vtable / klass resolution works
- `field_misses == 3 × parsed` → every individual field read returns
  `Ok(None)` → `field_offset(...)` does not find the name in the
  class's field map
- `sampleClass = CollectibleCard` → the class is named exactly that

The fix is therefore the smallest possible: update three string
constants.

## Goals / Non-Goals

**Goals:**

- Bring `get_collection` back to reporting accurate dbfId / count /
  premium triples from a live Hearthstone collection.
- Keep the surrounding reflection chain untouched (singleton lookup,
  list iteration, child object construction).
- Use the diagnostic counters as the cheap, observable post-condition.

**Non-Goals:**

- No element-class probe (we don't add a fallback that walks both old
  and new names). If Blizzard re-renames again, the diagnostic counters
  will catch it loudly.
- No new tests at the Rust layer. The native crate's clippy gate stays
  the only static check; runtime verification is via the existing
  `[hearthmirror:collection]` console line.
- No changes to `CardResult`'s shape or `getCollection`'s return type.

## Decisions

### Decision 1: Use the exact `<OwnedCount>k__BackingField` form

C# auto-properties (`int OwnedCount { get; set; }`) compile to a
private backing field literally named
`<OwnedCount>k__BackingField`. The angle brackets and `k__BackingField`
suffix are part of the field name as Mono sees it, and the existing
`read_int32_field` lookup is case-and-character exact (it's a
`HashMap<String, u32>` keyed by the raw field name).

We use the backing-field name rather than the property name because
Mono reflection on object fields only exposes fields, not property
getters. The existing `field_paths.rs` already uses this form for
`FLD_CARD_ID_BACKING = "<CardID>k__BackingField"` (line 214), so the
pattern is precedented.

### Decision 2: `m_PremiumType` is read as `i32` even though it's an enum

`Premium` is a C# enum with the default `i32` underlying type
(values: `Normal=0, Gold=1, Diamond=2, Signature=3`). Mono stores
enum-typed fields as raw bytes of the underlying integer, so
`read_int32_field` returns the correct numeric value without further
unwrapping. `CardResult.premium: i32` already matches that contract.

### Decision 3: Field name choices preserve the existing `FLD_CARD_*` symbols

We rewrite the string contents of `FLD_CARD_DBF_ID`,
`FLD_CARD_COUNT`, `FLD_CARD_PREMIUM` but keep the constant names. No
caller needs to know that the underlying string changed — they look
the symbol up by Rust name. Other reflection paths that use these
same constants (none today — `grep`'d to confirm only `collection.rs`
references them) automatically inherit the fix.

### Decision 4: Update the doc comment in `collection.rs`

The comment currently reads:

> "CollectionManager.m_collectibleCards is a `List<CollectionCardData>`
>  in Hearthstone 32.x (previously assumed Dictionary<int, ...>; see
>  diag_field_object.rs verification 2026-04-20). Each element is a
>  reference (pointer, 4 bytes) to a CollectionCardData object."

That's wrong on two counts after this fix: the element class is
`CollectibleCard`, and the verification timestamp is stale. We
update it to record the field-name change and link the diagnostic
counters as the witness, matching the project's
forensic-doc-commit-history convention.

## Risks / Trade-offs

- **Risk:** Blizzard ships another HS update that renames these fields
  again. **Mitigation:** the diagnostic counters from the previous
  change make the next regression surface in one click — the user
  immediately sees `field_misses > 0` again.
- **Trade-off:** No automated end-to-end test. Acceptable: the only
  way to test against the live game memory is to run HS, which is
  exactly what manual verification does anyway. The unit-level Mono
  mocks would test the Rust reflection plumbing (which already works)
  rather than the field-name correctness.

## Migration Plan

Code-only fix. No schema change. No persisted data is affected; the
snapshot store will silently start receiving correct counts on the
next live read.

Rebuild requirement: `pnpm --filter @hdt/hearthmirror-native build`
must run while `pnpm dev` is stopped, otherwise the previous `.node`
file is held by Electron and napi-rs's artifact copy fails.
