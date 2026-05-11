## Why

A real user (you, just now) confirmed via the manual sync button that
`HearthMirror.getCollection()` returns **near-empty data on a live HS
instance**, despite the mirror being reachable:

```
decks    fulfilled {ok: true, source: 'live', synced: 1, ...}     ← decks path works
progress fulfilled {source: 'live', mirrorAlive: true, totalOwned: 0}
mirror.getCollection fulfilled 1 dbf-ids
elapsed  29004 ms
```

The 29-second elapsed time + the "1 dbf-id" aggregate (which trivially
collapses any number of zero-dbfId `CardResult`s into a single Map
entry under key 0) strongly suggest **the list iteration succeeds with
thousands of entries, but every per-element field read returns `None`
and falls through to `.unwrap_or(0)`**. The native `eprintln!`s today
emit nothing on the happy path — we have no way to confirm which step
failed without rebuilding the crate with ad-hoc logs.

This change adds the minimum observability needed to identify the
broken step without changing any behavior.

## What Changes

- Extend `get_collection_internal` (`packages/hearthmirror/native/src/reflection/collection.rs`)
  to emit a single structured `eprintln!` line per call at INFO level:
  `[hearthmirror:collection] list_size=N parsed=P non_zero_dbfid=Z null_ptrs=U field_misses=F sample_class=<name> elapsed=Tms`.
  - `list_size`: result of `iter_element_ptrs(...).len()`
  - `parsed`: number of elements where `child_from_address` returned `Some`
  - `non_zero_dbfid`: number of `CardResult`s where `dbf_id != 0`
  - `null_ptrs`: number of elements where `read_remote_ptr` returned NULL
  - `field_misses`: number of element-reads where any of `DbfId`/`m_count`/`m_premium` returned `None` (i.e. `.unwrap_or(0)` kicked in)
  - `sample_class`: runtime class name of the first non-null element, via `child_obj.klass.name`
  - `elapsed`: wall time of the function
- Add a new napi fn `get_collection_diagnostic() -> CollectionDiagnostic`
  that returns the same six counters as a structured object. This
  enables on-demand querying from the main process / renderer / tests
  without parsing stderr.
- Plumb the diagnostic through to the renderer:
  - `HearthMirror.getCollectionDiagnostic()` TS wrapper method
  - `hearthmirror:get-collection-diagnostic` IPC handler
  - `window.hdt.hearthmirror.getCollectionDiagnostic()` preload bridge
- Have `Collection.tsx`'s `handleSyncClick` (which already runs the
  manual sync) **also** call `getCollectionDiagnostic()` and append a
  `[hearthmirror:collection]` line to the console after the existing
  `[collection-sync]` lines, so the user can read the result without
  needing to look at the main-process stderr separately.

## Non-goals

- Do not change the behavior of `get_collection_internal` — same
  inputs still produce the same `Vec<CardResult>`.
- Do not fix the underlying bug. Once the diagnostic counters identify
  which step is failing, a separate change will land the fix.
- Do not add a timeout, a UX warning for "live but empty" results,
  or a "diagnostic dump" button. Those decisions depend on what the
  counters reveal.
- Do not add diagnostic logging to other HearthMirror endpoints
  (`getDecks`, `getCollection*Diagnostic`, etc.). Keep scope tight to
  `getCollection`.

## Capabilities

### Modified Capabilities

- `hearthmirror-native`: extends the existing `get_collection_internal`
  contract with an observability requirement — every call emits one
  structured log line **and** exposes the same counters via a new
  `get_collection_diagnostic` napi function.

## Impact

- Native crate (must be rebuilt + the resulting
  `hearthmirror-native.win32-x64-msvc.node` re-shipped into the dev
  install):
  - `packages/hearthmirror/native/src/reflection/collection.rs`
  - `packages/hearthmirror/native/src/lib.rs` (new exported fn)
  - `packages/hearthmirror/native/index.d.ts` (regenerated)
- TS wrapper:
  - `packages/hearthmirror/src/hearthmirror.ts` (new method)
  - `packages/hearthmirror/src/types.ts` (new `CollectionDiagnostic` type)
- Main process / preload / renderer:
  - `apps/desktop/src/main/ipc.ts` (new IPC handler)
  - `apps/desktop/src/preload/index.ts` (new preload binding)
  - `apps/desktop/src/renderer/src/components/Collection.tsx`
    (call diagnostic alongside the manual sync, console.log result)
- Tests:
  - `packages/hearthmirror/src/hearthmirror.test.ts` (new test for
    `getCollectionDiagnostic()` calling through to native)
- Rebuild requirement: a fresh native `.node` file must be produced.
  The Electron dev session keeps the previous `.node` loaded, so the
  rebuild requires either stopping `pnpm dev` first or building from
  a separate terminal where Electron isn't holding the file lock.
