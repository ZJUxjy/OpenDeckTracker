## Why

Spike `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md` Run 8
landed three reflection methods working live (`getDecks`, `getCollection`,
`isGameOver`), but `getBattleTag`, `getAccountId`, and `getMedalInfo` still
return `null` because the `NetCache` class used by all three has no
`s_instance` static field — singletons of this shape are managed by
`Blizzard.T5.Services.ServiceManager.s_runtimeServices` (a `ServiceLocator`
holding a `Dictionary<Type, ServiceInfo>`) rather than the
`s_instance`-on-class pattern that `MonoRuntime::get_singleton` covers. Live
diagnostics also revealed `Dictionary<TKey,TValue>._count` actually lives at
field offset `+0x20`, not the `+0x18` our `collections::dict` module assumes
(see Finding F-17 in spike 0003), so any future Dictionary-backed reflector
will hit the same `CollectionOverflow` we just fixed for `m_collectibleCards`.

Unblocking `NetCache`-backed methods is the single highest-leverage step
left for the live-bridge: with it, `dump_reflection` jumps from `3 OK / 8
null / 1 ERR` to an expected `6 OK / 5 null / 1 ERR`, doubling the data the
TS layer can consume from memory.

## What Changes

- **NEW** `MonoRuntime::find_class_in_image(image_name, namespace, name)`:
  resolves a class inside an arbitrary loaded assembly (e.g.
  `Blizzard.T5.ServiceLocator.dll`), filling the gap left by today's
  Assembly-CSharp-only `find_class`. The Assembly-CSharp `MonoImage` cache
  is generalised to a name-keyed image cache.
- **NEW** `reflection::service_locator` module exposing
  `get_service_by_name(rt, "NetCache")` that walks
  `ServiceManager.s_runtimeServices.m_services` (a `Dictionary<Type,
  ServiceInfo>`), matches on `ServiceInfo.<ServiceTypeName>k__BackingField`,
  and returns the corresponding `<Service>k__BackingField` as a
  `MonoObject`. Result is cached by service name on `MonoRuntime`.
- **FIX** `collections::dict` Dictionary entry layout: `_count` is at
  `+0x20` (was `+0x18`), `_entries` is at `+0x0C` (was `+0x14`). Live
  Dictionary dump (Finding F-17) reproduced and locked into a
  fixture-driven test.
- **MODIFIED** `reflection::battle_tag` / `account_id` / `medal_info`
  switch from `runtime.get_singleton("", "NetCache")` to
  `service_locator::get_service_by_name(rt, "NetCache")`. Public napi
  signatures unchanged.
- **NEW** diagnostic examples (`diag_images`, `diag_klass_fields`,
  `diag_static_chain`) committed alongside as permanent debugging assets
  for future singleton-shape investigations.
- **NEW** spike addendum (Run 9) recording the post-fix `dump_reflection`
  baseline so future regressions are detectable.

Non-goals:

- Other still-null reflectors (`getMatchInfo`, `getServerInfo`,
  `getBattlegroundRatingInfo`, `getArenaDeck`, `getGameType`,
  `isSpectating`) — they fail for unrelated reasons (recommendation R-18,
  to be triaged in a follow-up change).
- `decks.rs` `Blizzard.T5.Core.Map<K,V>` rewrite (recommendation R-17 —
  separate change `add-hearthmirror-blizzard-map`).
- Generic "service by Type" lookup (matching by `RuntimeType` rather than
  `ServiceTypeName` string). The string path is sufficient for the three
  unblocked methods and avoids parsing `MonoType` internals in this
  change.

## Capabilities

### New Capabilities

- `hearthmirror-service-locator`: cross-image class lookup +
  ServiceManager / ServiceLocator chain walking + cached service-by-name
  resolution + Dictionary entry-array iteration with the corrected
  `_count` / `_entries` offsets.

### Modified Capabilities

- `hearthmirror-class-resolution`: extends the existing
  Assembly-CSharp-only `MonoRuntime::find_class` contract with a new
  `find_class_in_image(image_name, namespace, name)` entry point and
  upgrades the single-image cache to a name-keyed multi-image cache.
  `find_class` behaviour unchanged.

## Impact

- **Code**: `packages/hearthmirror/native/src/mono/runtime.rs`,
  `packages/hearthmirror/native/src/reflection/{service_locator.rs,
  battle_tag.rs, account_id.rs, medal_info.rs, mod.rs, field_paths.rs}`,
  `packages/hearthmirror/native/src/collections/dict.rs`,
  `packages/hearthmirror/native/examples/{diag_images.rs,
  diag_klass_fields.rs, diag_static_chain.rs}` (new), and tests under
  `packages/hearthmirror/native/tests/`.
- **APIs**: zero changes to napi-exposed `getBattleTag` / `getAccountId`
  / `getMedalInfo` shapes. Internal Rust-only additions.
- **Dependencies**: none.
- **Docs**: `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`
  gets a Run 9 addendum + R-16 marked closed.
- **Risk**: low — the failing path today is "always null"; the worst
  regression mode is "still null", validated by `dump_reflection` before
  shipping.

## Phase 2 Scope Expansion (Spike Run 10)

Phase 1 (sections 1–7 of `tasks.md`) shipped the ServiceLocator chain and
proved `NetCache` is reachable, but the live `dump_reflection` immediately
revealed the **actual** location of the three target values had drifted
much further from the legacy hearthmirror reference than the original Run 7
spike anticipated. Rather than open a second change for what was effectively
the same R-16 goal, scope was extended in-place.

### Additional what-changed

- **NEW** `collections::custom_map`: `Blizzard.T5.Core.Map<K,V>` iterator
  (separate parallel-array slot layout from `System.Collections.Generic.Dictionary`).
  This replaces the deferred R-17 (`add-hearthmirror-blizzard-map`) item — the
  iterator is fully implemented here because both `NetCache.m_netCache` AND
  the inner `NetCacheMedalInfo.MedalData` are `Map<K,V>` instances; without it
  `getMedalInfo` would have stayed null.
- **NEW** `MonoObject::field_offset` falling back to `MonoClassRef::find_field`
  on miss — read accessors (`read_string_field` / `read_int32_field` / etc.)
  now transparently see fields declared on parent classes. This fixes
  `BnetAccountId.<EntityId>k__BackingField` (declared on `BnetEntityId`
  parent) and a class of latent bugs for any future inherited-field reader.
  Adds `read_uint32_field` / `read_uint64_field` for protobuf `ulong` fields.
- **MODIFIED** `getBattleTag` / `getAccountId` no longer go through
  `NetCache` at all — those values have migrated to
  `BnetPresenceMgr.s_instance` (`Assembly-CSharp.dll` singleton):
  - `getAccountId` chain: `BnetPresenceMgr.s_instance →
    m_myBattleNetAccountId → <EntityId>k__BackingField → {high_, low_}`
    (BnetAccountId inherits from BnetEntityId; high_/low_ live on
    `Blizzard.GameService.Protocol.EntityId` in `blizzard.bgssdk.dll`).
  - `getBattleTag` chain: `BnetPresenceMgr.s_instance → m_myPlayer →
    m_account → m_battleTag → {m_name, m_number}` (`m_number` is a
    `System.String`, **not** `i32`, despite its name — verified live).
- **MODIFIED** `getMedalInfo` returns a `{wild, standard, classic, twist}`
  shape (one `MedalInfoData` per `FormatType`) instead of the legacy
  `{Standard, Wild, Classic, Twist}` flat fields. Internally walks
  `NetCache.m_netCache` (outer Map) → match `NetCacheMedalInfo` value →
  iterate `MedalData` (inner Map keyed by `FormatType` int) → resolve
  each `PegasusUtil.MedalInfoData` (8 protobuf-style fields:
  `<LeagueId>k__BackingField` / `_LegendRank` / `<Streak>k__BackingField` /
  etc.). Fields are tolerated as `Option<MedalInfoData>` per ladder.

### Phase 2 API impact

`getMedalInfo` **does** change shape — the legacy
`{Standard, Wild, Classic, Twist}` `MedalInfoResult` becomes
`{wild, standard, classic, twist}` (lower-case + `Option<MedalInfoData>`),
and `MedalInfoData` adds `streak` and `best_star_level`. The TS layer was
already returning placeholder-empty values in the legacy shape, so no real
consumer is broken; this is the first build where the field is
populated with live data.

`getBattleTag` and `getAccountId` shapes are unchanged.

### Phase 2 verification (live, Hearthstone 31.x)

```
{"method":"getBattleTag","status":"ok","value":"name=纯金的小铁人, full=纯金的小铁人#5630"}
{"method":"getAccountId","status":"ok","value":"hi=72057594037927936, lo=206001158"}
{"method":"getMedalInfo","status":"ok","value":"standard{league=5, lvl=34, stars=3, streak=2, ..., wins=51, season=150, best=34}, wild{...}, classic{...}, twist{...}"}
```

All three methods OK with non-empty player data; total live status is
**6 OK / 4 null / 1 ERR / 1 OK-empty** in `dump_reflection` — meeting the
Phase 1 target of `6 OK`.

The original Phase 1 R-17 deferral note (`add-hearthmirror-blizzard-map`) is
**superseded** — `Blizzard.T5.Core.Map<K,V>` is now first-class in
`collections::custom_map` and ready to be picked up by `getDecks`
(`m_decks` is also a `Map<K,V>`, currently failing with
`CollectionOverflow`).
