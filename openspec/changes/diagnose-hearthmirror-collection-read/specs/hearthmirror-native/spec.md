## ADDED Requirements

### Requirement: get_collection emits diagnostic counters

`get_collection_internal` SHALL emit one structured log line per call
to stderr with the `[hearthmirror:collection]` prefix. The line MUST
contain the key-value pairs `list_size`, `parsed`, `non_zero_dbfid`,
`null_ptrs`, `field_misses`, `sample_class`, and `elapsed`, in that
order. The log line MUST be emitted regardless of whether the function
returns `Ok(None)`, `Ok(Some(vec))`, or `Err(_)`.

The counters carry these semantics:

- `list_size`: the length of `iter_element_ptrs(...)`. For paths that
  exit before iteration (null singleton, null `m_collectibleCards`
  pointer, `Err` from `iter_element_ptrs`), this MUST be `0`.
- `parsed`: number of elements where `child_from_address` returned
  `Some(card_obj)`.
- `non_zero_dbfid`: number of `CardResult`s whose final `dbf_id` value
  is non-zero.
- `null_ptrs`: number of element slots whose `read_remote_ptr` returned
  a null `RemotePtr`.
- `field_misses`: count of `read_int32_field` calls (across `DbfId`,
  `m_count`, `m_premium`) that returned `Ok(None)` — i.e. the
  `.unwrap_or(0)` fallback fired.
- `sample_class`: the runtime class name of the first element where
  `child_from_address` returned `Some`. May be absent (`<unset>`) if
  no element ever parsed.
- `elapsed`: total wall time of the function, measured at the call
  boundary, formatted with a `ms` suffix.

Counter computation MUST NOT alter the function's return value: the
same `Vec<CardResult>` (or `None`) that today's implementation returns
MUST still be returned.

#### Scenario: Healthy collection emits non-zero parsed and dbfid counts

- **GIVEN** Hearthstone is running with a typical player collection
- **WHEN** `get_collection_internal` is invoked
- **THEN** the log line shows `list_size > 0`, `parsed == list_size`,
  `non_zero_dbfid > 0`, `field_misses == 0`, and a populated
  `sample_class`

#### Scenario: Field-read failure mode is distinguishable

- **GIVEN** the per-element `read_int32_field` for `DbfId` always
  returns `Ok(None)` (e.g. the field path is stale)
- **WHEN** `get_collection_internal` is invoked against a non-empty
  `m_collectibleCards` list
- **THEN** the log line shows `field_misses >= list_size`,
  `non_zero_dbfid == 0`, and `parsed == list_size`

#### Scenario: Null singleton emits all-zero log line

- **GIVEN** `CollectionManager` singleton has not yet been initialized
- **WHEN** `get_collection_internal` is invoked
- **THEN** the function returns `Ok(None)` (unchanged behavior)
- **AND** the log line shows `list_size=0 parsed=0 non_zero_dbfid=0
  null_ptrs=0 field_misses=0 sample_class=<unset>`

### Requirement: get_collection_diagnostic napi export

The native crate SHALL expose a new napi function
`getCollectionDiagnostic` (`pub async fn get_collection_diagnostic`)
that returns the six counters described in "get_collection emits
diagnostic counters" as a structured `CollectionDiagnostic` object.

The diagnostic function MUST go through the same `with_runtime`
wrapper as `getCollection` so the cached Mono runtime, retry-on-stale,
and process-validation paths are reused. The function MUST execute a
**fresh** read against the live Hearthstone process — it MUST NOT cache
or memoize counters from a prior `getCollection` call.

`CollectionDiagnostic` is exported with these fields (all required
except `sampleClass`):

```ts
interface CollectionDiagnostic {
  listSize: number;
  parsed: number;
  nonZeroDbfid: number;
  nullPtrs: number;
  fieldMisses: number;
  sampleClass: string | null;
  elapsedMs: number;
}
```

#### Scenario: Diagnostic returns same counters as the log line

- **WHEN** `getCollectionDiagnostic()` and `getCollection()` are
  invoked back-to-back with no game-state change in between
- **THEN** the diagnostic's `parsed` equals the eprintln'd
  `parsed`
- **AND** `nonZeroDbfid` in the diagnostic matches the number of
  unique non-zero dbfIds in the `getCollection()` result

#### Scenario: Diagnostic available even when getCollection would return None

- **GIVEN** Hearthstone is running but `CollectionManager` is not yet
  initialized
- **WHEN** `getCollectionDiagnostic()` is called
- **THEN** it resolves to `{ listSize: 0, parsed: 0, nonZeroDbfid: 0,
  nullPtrs: 0, fieldMisses: 0, sampleClass: null, elapsedMs: <small> }`
- **AND** it does NOT throw or return null

### Requirement: Diagnostic surfaces through HearthMirror wrapper and IPC

`packages/hearthmirror/src/hearthmirror.ts` SHALL expose a
`getCollectionDiagnostic(): Promise<CollectionDiagnostic | null>`
method that thinly wraps the native `getCollectionDiagnostic`,
returning `null` when the native fn returns nullish.

The Electron main process SHALL register an IPC handler
`hearthmirror:get-collection-diagnostic` that resolves to the result
of `HearthMirror.getCollectionDiagnostic()`. The renderer-side preload
bridge SHALL expose this as
`window.hdt.hearthmirror.getCollectionDiagnostic()`.

`Collection.tsx`'s `handleSyncClick` SHALL invoke this method as part
of its parallel `Promise.allSettled` block and `console.log` the
result with prefix `[hearthmirror:collection]`. The diagnostic call's
status MUST NOT affect the sync button's terminal state — only the
existing `collection.getProgress()` result determines `success` vs
`error`.

#### Scenario: Renderer console captures diagnostic on every manual sync

- **WHEN** the user clicks the sync button
- **THEN** a `[hearthmirror:collection]` line appears in the renderer
  console alongside the existing `[collection-sync]` lines
- **AND** the button still reaches `success` if
  `collection.getProgress()` resolves, regardless of the diagnostic
  call's outcome
