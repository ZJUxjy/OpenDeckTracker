## Context

Hearthstone's runtime singletons come in two flavours:

1. **Self-managed** — class declares `static T s_instance` and sets it in
   its own `Awake()`. Examples: `GameState`, `CollectionManager`,
   `GameMgr`, `Network`. Today's `MonoRuntime::get_singleton(ns, name)`
   handles this by reading `class.static_field_data + offset_of(s_instance)`.
2. **ServiceLocator-managed** — class is an `IService` registered into
   `Blizzard.T5.Services.ServiceManager.s_runtimeServices` at startup;
   the class itself has **no `s_instance` field**. Examples: `NetCache`,
   `BnetPresenceMgr`, `BnetWhisperMgr`, the entire networking and
   account-side surface area.

`getBattleTag`, `getAccountId`, and `getMedalInfo` all depend on
`NetCache`, which is flavour 2. Because `get_singleton` cannot find an
`s_instance` field, they unconditionally hit the `Ok(None)` early-return
and surface as `null` from napi. Spike 0003 Run 5–8 confirmed this is
the *only* reason the three methods are dark; the field-chain code
inside each is correct and field offsets match the live class layout
(verified with `diag_class_fields NetCache` after Run 7).

Live diagnostics on `ServiceLocator.m_services` (the inner `Dictionary
<Type, ServiceInfo>` reached via the chain) also revealed our
`collections::dict` offsets are wrong. The current module assumes
`_entries @ +0x14, _count @ +0x18`. The dump shows
`_buckets @ +0x08, _entries @ +0x0C, _count @ +0x20`. The reason this
hasn't bitten harder yet is that no shipping reflector currently
iterates a Dictionary — `m_collectibleCards` was assumed to be one but
turned out to be a `List` (Finding F-17 part 1, fixed in commit
b626ef5). ServiceLocator is the first real consumer of `dict`, so
shipping a fix is now mandatory rather than nice-to-have.

`ServiceManager` lives in `Blizzard.T5.ServiceLocator.dll`, not
`Assembly-CSharp.dll`. `MonoRuntime::find_class` only searches the
cached AC image, so the service-locator chain needs a new image-aware
class lookup.

## Goals / Non-Goals

**Goals:**

- Three reflection methods (`getBattleTag`, `getAccountId`, `getMedalInfo`)
  return live, non-null data when Hearthstone is running and the user
  is logged in.
- Add a reusable cross-image class lookup so future "lives in some
  other DLL" types (`Map<K,V>`, `JobQueue`, etc.) don't need
  one-off plumbing.
- Lock the actual Dictionary entry-array layout into a fixture-driven
  unit test so the next consumer doesn't re-discover it.
- Cache resolved services on `MonoRuntime` to avoid re-walking the
  Dictionary on every reflection call (94 entries, expensive on
  cross-process reads).

**Non-Goals:**

- Service lookup by `System.Type` instance (matching on the
  `Dictionary` *key* rather than `ServiceInfo.ServiceTypeName`). String
  matching on `<ServiceTypeName>k__BackingField` is reliable enough for
  the three target methods and avoids decoding `MonoReflectionType`
  internals in this change.
- Generic "iterate all services" enumeration API.
- Map/BlizzardMap iteration (recommendation R-17, separate change
  `add-hearthmirror-blizzard-map`).
- Triaging the *other* still-null reflectors (R-18).

## Decisions

### D1 — Cross-image class lookup as `find_class_in_image(image_name, ns, name)`, not as a global "search all images" helper

**Context.** ServiceManager lives in
`Blizzard.T5.ServiceLocator.dll`. We need to reach it without
breaking `find_class`'s AC-only contract that 12 reflection methods
already rely on.

**Options:**

- (a) Make `find_class` walk every loaded image when the AC image
  doesn't have it.
- (b) Add a sibling `find_class_in_image(image_name, ns, name)` that
  the caller picks deliberately.
- (c) Expose `MonoImage::new(rt, find_image_by_name("…").addr)` as a
  one-liner pattern at every call site.

**Choice: (b).**

**Rationale.** (a) is dangerous — same class name can legitimately
exist in multiple assemblies (e.g. `Logger`), and silent first-match
wins would make singleton resolution non-deterministic. (c) leaks the
image cache to every caller. (b) keeps the AC-only fast path for the
existing 12 reflectors, makes ServiceManager's "deliberate cross-DLL"
nature visible at the call site, and slots cleanly into the
`MonoImage` capability we already have.

The runtime cache field changes from `ac_image: Option<RemotePtr>` to
`images: HashMap<String, RemotePtr>`. `find_ac_image_cached` becomes a
thin wrapper over `find_image_cached("Assembly-CSharp.dll")` that
preserves the existing exact-match `ends_with(...) || == "Assembly-CSharp"`
semantics from commit 1431dc6 (the "firstpass" defence).

### D2 — Match services by `<ServiceTypeName>k__BackingField` string, not by `RuntimeType` key

**Context.** Each Dictionary entry is a `ServiceInfo` with both a
`<ServiceType>k__BackingField` (`System.RuntimeType`) and a
`<ServiceTypeName>k__BackingField` (string set to the runtime
`Type.Name`, e.g. `"NetCache"`).

**Options:**

- (a) Resolve the target's `MonoClass*`, walk RuntimeType keys,
  compare key.MonoType*.klass to target klass.
- (b) Read the string field on each ServiceInfo and string-match.

**Choice: (b).**

**Rationale.** (a) requires decoding `MonoReflectionType` (private,
unstable layout — Mono internal struct with union types) and is
overkill for one consumer. (b) is one `read_string_field` per entry,
runs once per service per cache-miss, and naturally extends to more
service names without adding new offset assumptions. The downside —
"two services with the same simple Name in different namespaces would
collide" — does not apply: Hearthstone never registers two services
with the same `Type.Name`.

### D3 — Cache resolved services on `MonoRuntime` keyed by name, lazy-on-first-call

**Context.** A single `dump_reflection` run that needs all three
NetCache-backed methods would walk the 94-entry services Dictionary
three times if uncached. Each walk is ~5 cross-process reads per entry
(entry header, hash check, value pointer, ServiceInfo class resolve,
ServiceInfo string read). That's ~1400 reads per dump.

**Options:**

- (a) Cache the resolved `MonoObject` value pointer per service name.
- (b) Cache the entire services list once, then string-search in
  memory.
- (c) Cache the `ServiceInfo` *address*, materialise `MonoObject` on
  every call.

**Choice: (a).**

**Rationale.** A `HashMap<String, RemotePtr>` of "service name →
service object addr" gives O(1) hits after the first miss and avoids
the per-call `MonoObject::from_address` cost. (b) is more memory and
needs invalidation logic (services list mutates as Hearthstone loads
modules). (c) skips the materialisation but doubles the reads vs (a)
on hot path. (a) does need a "service might have been re-registered"
escape hatch — addressed by `try_get_service` returning `Ok(None)`
when the cached pointer reads back as a stale address (vtable read
fails); see Risk R1.

### D4 — Fix `collections::dict` Dictionary entry-array layout in this change, lock with fixture test

**Context.** Live dump confirms layout differs from
`.NET Framework 4.x` reference source. The actual layout matches
modern Mono 2.0 BDWGC's reordered field declarations:

```text
+0x00 vtable
+0x04 monitor
+0x08 _buckets   (int[])
+0x0C _entries   (Entry[])
+0x10 ?          (typically 0)
+0x14 ?          (typically 0)
+0x18 _comparer  (object*)
+0x1C ?
+0x20 _count     (int)
+0x24 _freeList  (int, -1 when empty)
+0x28 _freeCount (int)
+0x2C _version   (int)
```

Each Entry is 16 bytes: `hash:i32 next:i32 key:object* value:object*`.

**Options:**

- (a) Patch offsets inline in `iter_entries` constants.
- (b) Promote dict layout to `MonoOffsets::structs::dictionary` so
  it's discoverable / overridable via the JSON baseline pattern.

**Choice: (a) for this change, (b) deferred.**

**Rationale.** Promoting to `MonoOffsets` requires JSON schema
extension, prober-or-fallback logic, and migration of any future
collection layouts. That's its own change (consistent with the F-18
backlog item already noted in spike 0003). Inline constants with a
clear `// VERIFIED <date> against ServiceLocator.m_services` comment
keep this change focused; we only need to do one such fix today.

The fixture test reads a hand-crafted Dictionary memory snapshot from
a `Vec<u8>` backing a `ProcessMemory::from_bytes` test helper (already
exists per `test_utils.rs` in `metadata` tests), and asserts
`iter_entries` returns the expected 3 entries with correct addresses.
This guards against future layout-drift regressions.

### D5 — Battle-tag / account-id / medal-info call sites switch to a new helper, not direct ServiceLocator API

**Context.** Today the three methods do `runtime.get_singleton("",
"NetCache")?`. The cleanest swap is "rename + re-route".

**Options:**

- (a) Each call site directly calls
  `service_locator::get_service_by_name(rt, "NetCache")`.
- (b) Add `MonoRuntime::get_service(name)` mirroring
  `MonoRuntime::get_singleton(ns, name)` API shape.

**Choice: (b).**

**Rationale.** `MonoRuntime` is the established home for "give me a
singleton object by some discovery strategy", and the field
declarations in the three consumer files barely change (one identifier
swap, no namespace argument). It also leaves room for a future
`get_singleton_or_service` convenience wrapper if more reflectors
turn out to be ServiceLocator-managed (likely, based on Hearthstone
naming conventions).

`get_service` returns `Ok(None)` for any of: ServiceManager class
unreachable, services Dictionary empty, name not found, or the cached
address has gone stale — same `Ok(None)` discipline `get_singleton`
already uses. Errors surface only for genuine memory-read failures.

## Risks / Trade-offs

- **R1 — Stale cached service pointers** → service address can
  theoretically change if Hearthstone re-registers a service mid-run
  (haven't observed this; nothing in HDT-original suggests it
  happens, but defensive code is cheap). Mitigation:
  `get_service` validates `vtable.klass` reads ≠ NULL on cache hit;
  on validation failure, evict and re-resolve. One extra read per
  hot-path call, negligible.
- **R2 — `<ServiceTypeName>` string drift** → if Hearthstone
  internalises (`string.Intern`) and shares the same backing storage
  across services, false-positive matches become possible only if
  values collide character-by-character. They don't (Hearthstone
  service names are unique by C# Type identity). No mitigation needed.
- **R3 — Other Dictionaries with different layouts** → The "Mono
  reorders Dictionary fields" reality means we may discover other
  layouts elsewhere (e.g. `Hashtable`, `SortedDictionary`). Mitigation:
  the inline constants in `dict.rs` are commented with the live-dumped
  source ("VERIFIED 2026-04-20 against
  Blizzard.T5.Services.ServiceLocator.m_services"), so a future
  contributor knows what's been validated and what hasn't.
- **R4 — Cross-image class cache eviction** → No eviction today
  (matches `find_ac_image_cached` behaviour). Hearthstone's image set
  is fixed after startup; if it ever isn't, runtime restart is the
  cheapest fix. Out-of-scope here.
- **R5 — Performance regression in `find_class`** → Switching from
  `Option<RemotePtr>` to `HashMap<String, RemotePtr>` adds one hash
  lookup per `find_class` call. `find_class` is called O(once-per-
  reflector-per-process) due to `classes` cache; impact below
  measurement noise.

## Migration Plan

No migration needed — additions only. Net-zero behaviour change for
callers that don't invoke `get_service`. The three modified reflection
methods (`battle_tag`, `account_id`, `medal_info`) gain non-null
returns where they were null; this is the desired behaviour and
documented in `docs/spikes/0003`.

Rollback: revert the change. Reverts to the pre-fix state where the
three methods return null — the same state today's `main` is in for
those three methods. No data loss, no schema change.

## Open Questions

- None. All design decisions verified against live diagnostics
  (`diag_images`, `diag_klass_fields`, `diag_static_chain`,
  `diag_obj_type` runs from the implementation session preceding this
  proposal).

## Phase 2 Decisions (Spike Run 10 follow-up)

After Phase 1 (D1–D5) shipped, the live `dump_reflection` proved that the
target values had moved further out from where the legacy hearthmirror
reference put them. The follow-up decisions kept the change scoped instead
of opening a sibling change.

### D6 — Inherited-field access via `MonoObject::field_offset` slow-path

**Context.** `BnetAccountId` declares **0** instance fields; the
`<EntityId>k__BackingField` we need lives on its parent `BnetEntityId`.
`MonoObject.fields` was populated by `read_class_fields` (own-class only),
so `read_object_field("<EntityId>k__BackingField")` always returned `None`.

**Options:**

- (a) Eagerly populate `MonoObject.fields` from `fields_recursive` so all
  parents' fields are included up front.
- (b) Add a one-shot fallback: if `self.fields.get(name)` misses, call
  `MonoClassRef::find_field` (which walks parents) and use its offset.

**Choice: (b).**

**Rationale.** (a) costs an extra parent-chain walk on every
`MonoObject::from_address` regardless of whether the caller will ever ask
for an inherited field — most field reads hit the leaf class, so the
recursive build is wasted work. (b) keeps the fast path identical to
before (one HashMap hit) and only pays the parent-walk cost when the
caller actually needs an inherited field. The walk is shallow in
practice (≤4 parents for the chains we care about) and `MonoClassRef`
already has the cached `Arc<MonoOffsets>` it needs.

The accessors in `MonoObject` (`read_string_field` / `read_int32_field` /
`read_int64_field` / `read_bool_field` / `read_object_field` /
`read_pointer_field` plus new `read_uint32_field` / `read_uint64_field`)
all funnel through a single private `field_offset(memory, name) -> Option<u32>`
helper that implements (b).

### D7 — `Blizzard.T5.Core.Map<K,V>` iterator lives in `collections::custom_map`, not as a re-cast of `dict`

**Context.** `NetCache.m_netCache` and `NetCacheMedalInfo.MedalData` are
both `Blizzard.T5.Core.Map<K,V>` (a Blizzard-internal hash map). Its
memory layout has nothing in common with
`System.Collections.Generic.Dictionary<TKey,TValue>` — slots are stored
in three parallel arrays (`linkSlots`, `keySlots`, `valueSlots`) keyed by
high-water-mark `touchedSlots`, with populated entries marked by a non-zero
`HashCode` (the high bit `HASH_FLAG = 0x80000000` is OR-ed into live
hashes by Blizzard's hasher).

**Options:**

- (a) Add a `dict::iter_entries_blizzard_map` parallel function on the
  same module.
- (b) New `collections::custom_map` module with its own constants and
  fixture tests.

**Choice: (b).**

**Rationale.** The two map types share zero offset constants; co-locating
them in `dict.rs` would force every reader to play "which map am I
looking at?" The clean separation also lets `dict.rs` stay tightly
focused on `_count` / `_entries` and lets `custom_map.rs` carry the
verbose layout doc-comment that captures all 14 declared field offsets.

This decision **supersedes** the Phase 1 proposal's "R-17 deferral" note
for `add-hearthmirror-blizzard-map` — the iterator is now first-class in
this change because `getMedalInfo` couldn't ship without it.

### D8 — `getMedalInfo` schema becomes `{wild, standard, classic, twist}` keyed by `FormatType` enum

**Context.** Modern Hearthstone collapses the four ladders into a single
inner `Map<int, PegasusUtil.MedalInfoData>` keyed by the `FormatType`
enum (1=Wild, 2=Standard, 3=Classic, 4=Twist). The legacy reference
exposed four flat fields (`Standard` / `Wild` / `Classic` / `Twist`) at
`NetCacheMedalInfo` directly.

**Options:**

- (a) Hide the new shape behind the legacy 4-field schema.
- (b) Surface a `{wild, standard, classic, twist}` `Option<MedalInfoData>`
  schema that mirrors the inner Map's actual cardinality.

**Choice: (b).**

**Rationale.** (a) lies about the source-of-truth shape and would make
adding future ladders (e.g. a fifth FormatType) require schema surgery.
(b) makes "ladder X has no data this season" a first-class `None`
rather than a struct of zeros, which the JS layer can render
appropriately. The legacy schema was empty in every shipping build
anyway (the call always returned `MedalInfoResult{...}` placeholder), so
this is the first build where consumers see real data — there's no
deployed code path that depended on the old shape.

`MedalInfoData` also gains `streak` (currently visible at
`<Streak>k__BackingField`) and `best_star_level` (`_BestStarLevel`)
because they were trivially available next to the existing fields and
the JS layer was previously discarding them.

### D9 — `BnetBattleTag.m_number` is decoded as `string`, not `i32`

**Context.** `BnetBattleTag` has two declared fields (`m_name`,
`m_number`). Initial implementation read `m_number` as `i32`, producing
nonsense like `Player#1072036432`. Live probe confirmed `m_number` is a
managed `System.String` (e.g. `"5630"`), and the i32 read was just
returning the raw string-pointer bits cast as int.

**Choice.** `m_number` decoded via `read_string_field`. `full_battle_tag`
is built as `format!("{}#{}", name, number)` when both are non-empty, or
just `name` when `number` is empty.

**Rationale.** BNet discriminators can have leading zeros (`"0042"`) and
historically have exceeded 32-bit range — Mono representing them as
strings is internally consistent. The `Player#0` placeholder behaviour
when the discriminator is empty is preserved by stripping the `#0`
suffix outright (return name only).
