## ADDED Requirements

### Requirement: ServiceLocator chain resolution helper

`packages/hearthmirror/native/src/reflection/service_locator.rs` SHALL
provide a public function `get_service_by_name(rt: &MonoRuntime, name:
&str) -> Result<Option<MonoObject>, ScryError>` that resolves a
Hearthstone IService instance by walking
`Blizzard.T5.Services.ServiceManager.s_runtimeServices.m_services`
(`Dictionary<Type, ServiceInfo>`) and returning the
`ServiceInfo.<Service>k__BackingField` whose
`ServiceInfo.<ServiceTypeName>k__BackingField` equals `name`.

The function SHALL return `Ok(None)` when:
- `Blizzard.T5.Services.ServiceManager` cannot be resolved in
  `Blizzard.T5.ServiceLocator.dll` (e.g. game state pre-init).
- `s_runtimeServices` static field reads NULL.
- `m_services` Dictionary is empty.
- No service entry's `ServiceTypeName` matches `name`.
- The matching `<Service>k__BackingField` reads NULL.

The function SHALL return `Err(ScryError::CollectionOverflow { max })`
if the Dictionary's `_count` exceeds an internal safety cap (1024
services). The cap is documented as 10x the live observed value to
catch corrupted reads early.

The function SHALL be safe to call before the user has logged in —
returning `Ok(None)` rather than `Err` for transient absence.

#### Scenario: Live NetCache resolution

- **GIVEN** Hearthstone is running and the user is logged in
- **WHEN** `service_locator::get_service_by_name(&rt, "NetCache")` is
  called
- **THEN** result is `Ok(Some(net_cache_object))` and
  `net_cache_object.fields` contains `m_accountId` and `BattleTag`
  field offsets

#### Scenario: Unknown service name

- **GIVEN** Hearthstone is running with the standard service set
- **WHEN** `service_locator::get_service_by_name(&rt,
  "DefinitelyNotARealService")` is called
- **THEN** result is `Ok(None)`

#### Scenario: Service not yet registered

- **GIVEN** the ServiceManager class is loaded but
  `s_runtimeServices` is NULL (game still initialising)
- **WHEN** `get_service_by_name` is called for any name
- **THEN** result is `Ok(None)`

#### Scenario: Corrupted Dictionary

- **GIVEN** `m_services._count` reads as 50000 (memory corruption or
  layout drift)
- **WHEN** `get_service_by_name` is called
- **THEN** result is `Err(ScryError::CollectionOverflow { max: 1024 })`

### Requirement: MonoRuntime get_service convenience API

`MonoRuntime` SHALL provide
`pub fn get_service(&self, name: &str) -> Result<Option<MonoObject>,
ScryError>` that delegates to
`reflection::service_locator::get_service_by_name(self, name)` and
caches the resolved IService **address** keyed by name on the runtime.

The cache SHALL validate hits by attempting a lightweight
`vtable.klass` read on the cached address. If validation fails (NULL
read or address-out-of-range error), the cache entry SHALL be evicted
and the lookup re-run.

The cache SHALL be located alongside the existing `classes` cache on
`RuntimeCache` to share its `Mutex` discipline.

`get_service` SHALL preserve `get_singleton`'s `Ok(None)` discipline:
all "service not present right now" outcomes return `Ok(None)`; only
genuine memory-read failures return `Err`.

#### Scenario: Cache hit fast path

- **GIVEN** `runtime.get_service("NetCache")` returned
  `Ok(Some(addr_a))` previously
- **WHEN** `runtime.get_service("NetCache")` is called again in the
  same process lifetime
- **THEN** result is `Ok(Some(addr_a))` and the services Dictionary
  is NOT walked

#### Scenario: Stale cached pointer evicted

- **GIVEN** the cache holds `"NetCache" → 0xDEADBEEF` and
  `0xDEADBEEF + offsets.object.vtable` reads as NULL
- **WHEN** `runtime.get_service("NetCache")` is called
- **THEN** the cache entry is evicted and the Dictionary is re-walked;
  result reflects the freshly-resolved address

### Requirement: NetCache-backed reflection methods use service locator

`reflection/medal_info.rs::get_medal_info_internal` SHALL retrieve the
`NetCache` instance via `runtime.get_service("NetCache")` instead of
`runtime.get_singleton("", "NetCache")`. (Originally Phase 1 also
covered `battle_tag.rs` and `account_id.rs`; Phase 2 — see the
"BnetPresenceMgr chain" requirement below — re-routes those two through
a different singleton entirely because the underlying values migrated
out of `NetCache` between Hearthstone builds.)

`reflection/battle_tag.rs::get_battle_tag_internal` and
`reflection/account_id.rs::get_account_id_internal` SHALL use the
`BnetPresenceMgr.s_instance` chain (see the dedicated requirement
below) instead of any `NetCache` access.

Public napi function signatures (`getBattleTag`, `getAccountId`)
SHALL remain identical (`{name, fullBattleTag}` and `{hi, lo}`).
`getMedalInfo` SHALL change shape to
`{wild, standard, classic, twist}` of `Option<MedalInfoData>` — see the
"getMedalInfo schema" requirement below.

`field_paths.rs` SHALL gain three new constants:
- `pub const SVC_NET_CACHE: &str = "NetCache";`
- `pub const CLS_SERVICE_MANAGER: (&str, &str) = ("Blizzard.T5.Services", "ServiceManager");`
- `pub const SVC_LOCATOR_DLL: &str = "Blizzard.T5.ServiceLocator.dll";`

`CLS_NET_CACHE` SHALL remain in place for compatibility but its
documentation comment SHALL be updated to note that it is no longer
used by the three NetCache reflectors and is retained only as a
reference for the underlying class identity.

#### Scenario: getBattleTag returns live data

- **GIVEN** Hearthstone is running and user is logged in
- **WHEN** napi `getBattleTag()` is called
- **THEN** result is non-null with `name` and `fullBattleTag` matching
  the in-game profile

#### Scenario: getAccountId returns live data

- **GIVEN** Hearthstone is running and user is logged in
- **WHEN** napi `getAccountId()` is called
- **THEN** result is non-null with `hi != 0` and `lo != 0`

#### Scenario: getMedalInfo returns live data

- **GIVEN** Hearthstone is running, user is logged in, and has played
  at least one ranked game in the current season
- **WHEN** napi `getMedalInfo()` is called
- **THEN** result is non-null and at least one of `standard`, `wild`,
  `classic`, `twist` is non-null with `seasonId > 0`

#### Scenario: Pre-login graceful degradation

- **GIVEN** Hearthstone has just launched and login splash is
  showing
- **WHEN** any of `getBattleTag`, `getAccountId`, `getMedalInfo` is
  called
- **THEN** result is `null` (not error)

### Requirement: Dictionary entry-array layout uses verified offsets

The `iter_entries` helper in `packages/hearthmirror/native/src/collections/dict.rs` SHALL read Dictionary internals at the following verified offsets, replacing the prior incorrect `_entries: +0x14, _count: +0x18` assumption:

- `_buckets`: `dict + 0x08` (object pointer to `int[]`, unused by this
  helper but reserved offset slot for future use)
- `_entries`: `dict + 0x0C` (object pointer to `Entry[]`)
- `_count`: `dict + 0x20` (i32, number of valid entries including
  free-listed slots)

These offsets SHALL be expressed as `const` declarations inside the
function module (or as a small private struct) with a comment naming
the verification source — namely
`Blizzard.T5.Services.ServiceLocator.m_services` dumped during the
add-hearthmirror-service-locator change implementation, plus the date
of verification. The previous values (`_entries: +0x14, _count: +0x18`)
SHALL be removed entirely; no compatibility shim is needed because no
shipping reflector currently iterates a Dictionary.

Each Entry occupies `entry_size` bytes (caller-supplied) starting at
`entries_array + 0x10` (after the MonoArray header). Entry layout
SHALL be assumed to be `hash:i32 next:i32 key:object* value:object*`
(16 bytes for reference-typed K and V); the helper SHALL emit
`(entry_addr, hash)` pairs and let callers compute `key`/`value` field
offsets relative to `entry_addr` as `entry_addr + 0x08` and
`entry_addr + 0x0C` respectively.

`hash < 0` (high-bit set, two's-complement negative) SHALL continue to
mean "free-list slot" and be skipped — this is the standard .NET
Dictionary convention preserved across the layout fix.

#### Scenario: Live ServiceManager dictionary iteration

- **GIVEN** `runtime.get_service("NetCache")` is called for the first
  time after Hearthstone reaches main menu
- **WHEN** the helper enumerates `m_services`
- **THEN** the returned `DictEntry` count equals
  `m_services._count` as observed by `diag_static_chain` at the same
  instant (currently 0x5E = 94 in the verification dump), and at
  least one entry's value resolves to a `ServiceInfo` whose
  `ServiceTypeName` field equals `"NetCache"`

#### Scenario: Free-list slots skipped

- **GIVEN** a fixture-backed Dictionary with 5 declared entries where
  entries[1] and entries[3] have `hash < 0`
- **WHEN** `iter_entries(&mem, dict, 16, 100)` is called
- **THEN** the returned `Vec<DictEntry>` has length 3 and contains
  `entries[0]`, `entries[2]`, `entries[4]`

#### Scenario: CollectionOverflow on absurd count

- **GIVEN** a fixture-backed Dictionary with `_count` set to 1_000_000
- **WHEN** `iter_entries(&mem, dict, 16, 100)` is called
- **THEN** result is `Err(ScryError::CollectionOverflow { max: 100 })`

#### Scenario: Empty dictionary returns empty vec

- **GIVEN** a fixture-backed Dictionary with `_count = 0` and
  `_entries` non-NULL
- **WHEN** `iter_entries(&mem, dict, 16, 100)` is called
- **THEN** result is `Ok(vec![])`

### Requirement: Diagnostic example tools committed alongside

The following diagnostic example binaries SHALL exist under
`packages/hearthmirror/native/examples/` and compile under the
default features:

- `diag_images.rs` — list every loaded `MonoImage` in the target
  domain; with one optional argument `<Namespace.Name>`, search every
  image's `class_cache` for a matching class and report the hosting
  image plus class address.
- `diag_klass_fields.rs` — given a raw `MonoClass*` address, dump all
  declared field defs (instance + static) sorted by offset, with
  `[STATIC]` annotation. Used when `diag_class_fields` cannot be used
  because the class is outside `Assembly-CSharp.dll`.
- `diag_static_chain.rs` — given `<klass_hex> <staticField>
  [<field>...]`, walk the static-field chain starting from the
  supplied class, dumping the runtime klass and raw header bytes at
  every hop. Used to validate ServiceManager → ServiceLocator →
  m_services layouts.

Each example SHALL include a module-level doc comment naming its
purpose and a usage example.

#### Scenario: diag_images locates ServiceManager

- **WHEN** `cargo run --release --example diag_images --
  Blizzard.T5.Services.ServiceManager` is executed against a running
  Hearthstone process
- **THEN** the output contains a line of the form
  `★ Blizzard.T5.ServiceLocator.dll ... — HITS:` followed by
  `Blizzard.T5.Services.ServiceManager  @ 0x<addr>`

#### Scenario: diag_static_chain reaches m_services

- **WHEN** `cargo run --release --example diag_static_chain -- 0x<sm
  klass> s_runtimeServices m_services` is executed against a running
  Hearthstone process
- **THEN** the final step output contains a line `type   =
  System.Collections.Generic.Dictionary\`2`

### Requirement: Runtime validation captured in spike addendum

`docs/spikes/0003-hearthmirror-reflection-runtime-validation.md` SHALL
gain a `## Run 9` section recording, after this change ships:

- `dump_reflection` exit-status counts (expected `>= 6 OK / 5 null /
  1 ERR`).
- The three previously-null methods (`getBattleTag`, `getAccountId`,
  `getMedalInfo`) flipped to `OK` with a sample of the returned shape
  (battle tag string, account id pair, medal info present-or-null
  per format).
- An R-16 closure note indicating the recommendation is fully
  satisfied by this change.
- A handoff list of the still-null methods (R-17 / R-18 scope) with
  current counts.

#### Scenario: Spike addendum present

- **WHEN** the change is archived
- **THEN** `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`
  contains a `## Run 9` heading with the four listed bullet points

### Requirement: Blizzard.T5.Core.Map iterator (Phase 2)

`packages/hearthmirror/native/src/collections/custom_map.rs` SHALL
provide a public function `iter_entries(memory: &ProcessMemory, map:
RemotePtr, max_items: usize) -> Result<Vec<(RemotePtr, RemotePtr)>,
ScryError>` that iterates a `Blizzard.T5.Core.Map<K, V>` (Hearthstone's
internal hash-map type, distinct from
`System.Collections.Generic.Dictionary`).

The iterator SHALL read the map's parallel slot arrays at the verified
offsets (live-validated against `NetCache.m_netCache` and
`NetCacheMedalInfo.MedalData`):

- `linkSlots`: `map + 0x0C` (object pointer to `Link[]`, where
  `Link = { HashCode: i32, Next: i32 }`)
- `keySlots`: `map + 0x10` (object pointer to `K[]`)
- `valueSlots`: `map + 0x14` (object pointer to `V[]`)
- `touchedSlots`: `map + 0x1C` (i32 high water-mark of slot indices ever used)
- `count`: `map + 0x24` (i32 populated-entry count, currently informational)

For each `i` in `0..touchedSlots`, the iterator SHALL skip the slot when
`linkSlots[i].HashCode == 0` (Blizzard's "empty slot" convention — live
hashes have the high `HASH_FLAG = 0x80000000` bit ORed in, so populated
slots always read as non-zero negative i32).

`Map<int, V>` (and other value-type-keyed maps) SHALL be supported
transparently: `keySlots[i]` is read as a 4-byte word and exposed as a
`RemotePtr` whose `.raw()` IS the inline integer value (Mono stores
unboxed primitives in the slot array directly).

The iterator SHALL return `Err(ScryError::CollectionOverflow { max })`
when `touchedSlots > max_items`.

#### Scenario: NetCache.m_netCache iteration

- **GIVEN** Hearthstone is running with the standard service set
- **WHEN** `custom_map::iter_entries(&mem, net_cache.m_netCache, 4096)`
  is called
- **THEN** result is `Ok(entries)` where each entry's value resolves
  to a `NetCacheXxx` subclass (e.g. `NetCacheMedalInfo`,
  `NetCacheCardBacks`, etc.)

#### Scenario: NetCacheMedalInfo.MedalData inner-map iteration

- **GIVEN** the `NetCacheMedalInfo` entry from
  `NetCache.m_netCache` is resolved
- **WHEN** `custom_map::iter_entries` is called on its `MedalData`
  pointer
- **THEN** each entry's `key.raw()` is one of the
  `FORMAT_TYPE_{WILD, STANDARD, CLASSIC, TWIST}` integer constants
  and each value resolves to a `PegasusUtil.MedalInfoData` instance

#### Scenario: Empty / corrupted map handling

- **GIVEN** a `Map` whose `touchedSlots` reads as 1_000_000
- **WHEN** `iter_entries` is called with `max_items = 4096`
- **THEN** result is `Err(ScryError::CollectionOverflow { max: 4096 })`

### Requirement: BnetPresenceMgr chain for getBattleTag and getAccountId (Phase 2)

`reflection/account_id.rs::get_account_id_internal` SHALL resolve the
current player's BattleNet account id by walking, via standard
`MonoObject` chain helpers:

```text
BnetPresenceMgr.s_instance (Assembly-CSharp.dll)
  → m_myBattleNetAccountId  (BnetAccountId)
  → <EntityId>k__BackingField  (Blizzard.GameService.Protocol.EntityId)
       → high_  : ulong @ +0x10  → AccountIdResult.hi
       → low_   : ulong @ +0x18  → AccountIdResult.lo
```

`reflection/battle_tag.rs::get_battle_tag_internal` SHALL resolve the
current player's BattleTag by walking:

```text
BnetPresenceMgr.s_instance
  → m_myPlayer    (BnetPlayer)
  → m_account     (BnetAccount)
  → m_battleTag   (BnetBattleTag)
       → m_name    : string @ +0x08  → BattleTagResult.name
       → m_number  : string @ +0x0C  → numeric discriminator (string-typed)
```

`BattleTagResult.fullBattleTag` SHALL be computed as
`format!("{name}#{number}")` when both fields are non-empty; when
`number` is empty, `fullBattleTag` SHALL be the bare `name` string
(no trailing `#`).

Both reflectors SHALL return `Ok(None)` when:

- `BnetPresenceMgr.s_instance` is NULL (game is pre-login or shutting down)
- any object on the chain reads as NULL (logged-out account, partial
  initialisation, etc.)

#### Scenario: getBattleTag returns live BNet handle

- **GIVEN** Hearthstone is running and user is logged in
- **WHEN** napi `getBattleTag()` is called
- **THEN** result is `{ name: <profile-name>, fullBattleTag:
  <name#discriminator> }` matching the in-game profile

#### Scenario: getAccountId returns non-zero BNet id

- **GIVEN** Hearthstone is running and user is logged in
- **WHEN** napi `getAccountId()` is called
- **THEN** result is `{ hi: <non-zero>, lo: <non-zero> }`

#### Scenario: Pre-login graceful degradation

- **GIVEN** Hearthstone has just launched and is at the login splash
- **WHEN** `getBattleTag()` or `getAccountId()` is called
- **THEN** result is `null` (not error)

### Requirement: getMedalInfo schema (Phase 2)

`reflection/medal_info.rs::MedalInfoResult` SHALL expose four
`Option<MedalInfoData>` fields keyed by `FormatType` enum:

- `wild`     ← `FORMAT_TYPE_WILD     = 1`
- `standard` ← `FORMAT_TYPE_STANDARD = 2`
- `classic`  ← `FORMAT_TYPE_CLASSIC  = 3`
- `twist`    ← `FORMAT_TYPE_TWIST    = 4`

`MedalInfoData` SHALL contain at minimum the eight i32 fields:
`league_id`, `star_level`, `stars`, `streak`, `legend_rank`,
`season_id`, `season_wins`, `best_star_level`.

The reflector SHALL:

1. Resolve `NetCache` via `runtime.get_service("NetCache")`.
2. Iterate `NetCache.m_netCache` (a `Blizzard.T5.Core.Map`) via
   `collections::custom_map::iter_entries` and locate the entry whose
   value's runtime type-name is `"NetCacheMedalInfo"`.
3. Read `NetCacheMedalInfo.MedalData` (also a `Blizzard.T5.Core.Map`,
   keyed by `FormatType` integer) and iterate it.
4. For each entry, demultiplex by `key.raw()` into the matching
   `MedalInfoResult` slot; entries with unknown FormatType (e.g. the
   sentinel `FORMAT_TYPE_UNKNOWN = 0`) SHALL be silently dropped.
5. For each value object, populate `MedalInfoData` by reading the
   protobuf-style backing fields:
   - `<LeagueId>k__BackingField`
   - `<StarLevel>k__BackingField`
   - `<Stars>k__BackingField`
   - `<Streak>k__BackingField`
   - `<SeasonWins>k__BackingField`
   - `_LegendRank`
   - `_SeasonId`
   - `_BestStarLevel`

   Missing fields SHALL be tolerated as `0` (per the `unwrap_or(0)`
   pattern of every other reflector).

#### Scenario: getMedalInfo returns live ladder data

- **GIVEN** Hearthstone is running, user is logged in, and has played
  ranked Standard this season
- **WHEN** napi `getMedalInfo()` is called
- **THEN** `result.standard` is non-null with `seasonWins > 0` and
  `seasonId` matches the current Hearthstone season number

#### Scenario: getMedalInfo handles partial ladder participation

- **GIVEN** the player has ranked data for Standard only (Wild /
  Classic / Twist left at default)
- **WHEN** `getMedalInfo()` is called
- **THEN** `result.standard` is `Some(...)` with non-zero fields and
  the other three slots are `Some(...)` with the placeholder data
  Hearthstone seeds (typically `lvl=1, stars=0, season=<current>`)

### Requirement: MonoObject accessors walk inherited fields (Phase 2)

`MonoObject` accessor methods SHALL resolve field names across the
class hierarchy, not only the leaf class.

The methods covered by this requirement are: `read_string_field`,
`read_int32_field`, `read_int64_field`, `read_uint32_field`,
`read_uint64_field`, `read_bool_field`, `read_object_field`, and
`read_pointer_field`.

Resolution order MUST be:

1. Look up `self.fields` (own-class declarations, O(1) hit).
2. On miss, call `MonoClassRef::find_field` (or equivalent
   parent-walk helper) and use the returned offset.

The walk MUST traverse up to `MAX_PARENT_CHAIN_DEPTH` ancestors
before returning `Ok(None)` (or `Err(ClassHierarchyTooDeep)` if
exceeded).

This requirement exists so reflection chains can read fields declared
on a parent class without the call site needing to know the exact
class on which the field was declared. The motivating case is
`BnetAccountId.<EntityId>k__BackingField` — `BnetAccountId` declares
zero own fields; `<EntityId>k__BackingField` lives on its parent
`BnetEntityId`. Without this fallback, `read_object_field` on
`BnetAccountId` would always return `Ok(None)` for that name.

#### Scenario: Inherited field resolves transparently

- **GIVEN** a `MonoObject` whose runtime class declares no fields but
  whose parent declares field `parent_only` at offset `0x10`
- **WHEN** `obj.read_int32_field(&mem, "parent_only")` is called
- **THEN** result is `Ok(Some(<value at +0x10>))`

#### Scenario: Truly missing field returns None

- **GIVEN** a `MonoObject` whose class hierarchy contains no field
  named `definitely_not_there`
- **WHEN** `obj.read_int32_field(&mem, "definitely_not_there")` is
  called
- **THEN** result is `Ok(None)`

### Requirement: Phase 2 runtime validation captured (Spike Run 10)

`docs/spikes/0003-hearthmirror-reflection-runtime-validation.md` SHALL
gain a `## Run 10` section recording the post-Phase-2 state:

- `dump_reflection` exit status (expected `>= 6 OK`).
- The three previously-empty NetCache reflectors (`getBattleTag`,
  `getAccountId`, `getMedalInfo`) flipped to `OK` with non-empty
  player data.
- Discovery notes for the three Spike-Run-10 findings:
  1. `Blizzard.T5.Core.Map<K,V>` is the `NetCache.m_netCache` runtime
     type (not `Dictionary`).
  2. `BattleTag` / `BnetAccountInfo` migrated from `NetCache` to
     `BnetPresenceMgr` between game builds.
  3. `NetCacheMedalInfo.MedalData` is itself a `Map<FormatType,
     PegasusUtil.MedalInfoData>` rather than a single struct.
- An R-16 closure note ("R-16 fully closed via Phase 2 in-place
  scope expansion").

#### Scenario: Spike Run 10 addendum present

- **WHEN** the change is archived
- **THEN** the spike file contains a `## Run 10` heading with all
  four listed bullets and a clear "R-16 fully closed" sign-off
