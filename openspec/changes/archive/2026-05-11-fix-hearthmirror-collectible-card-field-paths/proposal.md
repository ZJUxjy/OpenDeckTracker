## Why

The just-archived `diagnose-hearthmirror-collection-read` change
surfaced exact instrumentation from a live HS instance:

```
list_size=15695 parsed=15695 non_zero_dbfid=0 null_ptrs=0
  field_misses=47085 sample_class=CollectibleCard elapsed=7735ms
```

The data is unambiguous: every one of the 15,695 elements in
`CollectionManager.m_collectibleCards` is parsed successfully into a
`MonoObject`, but **every** subsequent `read_int32_field` for
`DbfId` / `m_count` / `m_premium` returns `Ok(None)` (47,085 misses ≈
15,695 × 3). The reason is that the element class is `CollectibleCard`,
not the `CollectionCardData` our code assumed, and `CollectibleCard`
declares a different set of field names entirely.

Direct `diag_class_fields CollectibleCard` confirmation:

```
+0x0020  <OwnedCount>k__BackingField     ← was m_count
+0x0028  m_CardDbId                      ← was DbfId
+0x0038  m_PremiumType                   ← was m_premium
```

Net effect for users: every set tile in the Collection page shows
`0 / N owned`, every card cell in Set Detail is shown as unowned with
the dim overlay, and the manual sync button reports `success` because
the IPC chain completes — but the data is universally zero.

## What Changes

- Update the three card-level field-path constants in
  `packages/hearthmirror/native/src/reflection/field_paths.rs` to the
  names actually declared on `CollectibleCard`:
  - `FLD_CARD_DBF_ID`: `"DbfId"` → `"m_CardDbId"`
  - `FLD_CARD_COUNT`: `"m_count"` → `"<OwnedCount>k__BackingField"`
  - `FLD_CARD_PREMIUM`: `"m_premium"` → `"m_PremiumType"`
- Replace the stale comment block in
  `packages/hearthmirror/native/src/reflection/collection.rs` that
  refers to `CollectionCardData`. Document that the element class is
  `CollectibleCard` and link the diagnostic counters as the witness
  for the field-name choice.
- Rebuild the native crate so the live `.node` reflects the new
  field paths. Smoke-test by running the existing manual sync button
  and reading the diagnostic counter line — the success criteria is
  `non_zero_dbfid > 0` and `totalOwned > 0`.

## Non-goals

- Do not redesign the diagnostic logging requirement that the previous
  change shipped — the counters stay as-is. They are the verification
  tool for this fix.
- Do not split the deck slot field paths (`m_cardId`, `m_count` on
  `CollectionDeckSlot`). Those live on a different class and continue
  to work.
- Do not add a `getCollection`-side fallback that retries with old
  names if new names miss. The diagnostic counters surface drift loudly
  enough already; a silent fallback would re-hide the next regression.
- Do not introduce automated end-to-end tests against a live HS
  process. Verification is manual via the diagnostic line in the
  renderer console.

## Capabilities

### Modified Capabilities

- `hearthmirror-native`: tightens the existing `get_collection` element
  contract to pin the element class as `CollectibleCard` and to use
  the three updated field paths.

## Impact

- Native crate (must be rebuilt; resulting
  `hearthmirror-native.win32-x64-msvc.node` re-shipped into the dev
  install):
  - `packages/hearthmirror/native/src/reflection/field_paths.rs`
  - `packages/hearthmirror/native/src/reflection/collection.rs`
    (comment-only update — describing the element class change)
- Tests: no automated test changes. The previous change's diagnostic
  counters are the manual-verification surface.
- Rebuild requirement: same blocker as the previous change — stop
  `pnpm dev` before `pnpm --filter @hdt/hearthmirror-native build` so
  Electron releases the `.node` lock.
