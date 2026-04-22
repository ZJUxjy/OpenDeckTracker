//! `getMedalInfo` — current player's ranked medal data per format type.
//!
//! ## Chain (R-16 Phase 2, verified live 2026-04-20)
//!
//! ```text
//! NetCache (ServiceLocator → "NetCache")
//!   └─ m_netCache : Blizzard.T5.Core.Map<System.Type, NetCacheValue>
//!        └─ entry whose value runtime-type is "NetCacheMedalInfo"
//!             └─ MedalData : Blizzard.T5.Core.Map<FormatType (i32), PegasusUtil.MedalInfoData>
//!                  └─ entry  key = FormatType enum (1=Wild, 2=Standard, 3=Classic, 4=Twist)
//!                            value = PegasusUtil.MedalInfoData (protobuf-generated)
//!                              ├─ <SeasonWins>k__BackingField  : i32 @ +0x08
//!                              ├─ <Stars>k__BackingField       : i32 @ +0x0C
//!                              ├─ <Streak>k__BackingField      : i32 @ +0x10
//!                              ├─ <StarLevel>k__BackingField   : i32 @ +0x14
//!                              ├─ _LegendRank                  : i32 @ +0x2C
//!                              ├─ <LeagueId>k__BackingField    : i32 @ +0x40
//!                              └─ _SeasonId                    : i32 @ +0x58
//! ```
//!
//! ### What changed vs the legacy chain
//!
//! Both layers were a `System.Collections.Generic.Dictionary` in the
//! historical hearthmirror reference; both are now `Blizzard.T5.Core.Map`
//! (different memory layout — see `crate::collections::custom_map`).
//!
//! The legacy reflectors also expected `NetCacheMedalInfo` to expose four
//! ladder-specific top-level fields (`Standard` / `Wild` / `Classic` /
//! `Twist`); modern Hearthstone instead stores all four behind the inner
//! `MedalData` map keyed by `FormatType`.
//!
//! ### Inner-map key encoding
//!
//! Keys come back from `custom_map::iter_entries` as `RemotePtr` values, but
//! `Map<int, V>` stores the int **inline in the `keySlots` array**, so each
//! key's `RemotePtr.raw()` IS the FormatType integer (NOT an object pointer
//! to a boxed Int32). We treat it as a `u32` and demultiplex into the
//! `wild` / `standard` / `classic` / `twist` slots of `MedalInfoResult`.
//!
//! Returns `Ok(None)` when the `NetCache` service is missing, the
//! `m_netCache` map is null, or no `NetCacheMedalInfo` entry is registered
//! (pre-login). When the entry exists but `MedalData` is null/empty all
//! ladder slots come back as `None`.

use crate::collections::custom_map;
use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::object::MonoObject;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use crate::remote_ptr::RemotePtr;
use napi_derive::napi;

/// Soft cap for `m_netCache` iteration. Live observation: ~30 entries on
/// post-login. Triggers `CollectionOverflow` if exceeded (signals layout
/// drift, not "bigger map than usual").
const MAX_NET_CACHE_ENTRIES: usize = 4096;

/// Soft cap for the inner `MedalData` map iteration. Bounded above by the
/// FormatType enum cardinality (~5 in Hearthstone today); upper bound here
/// is generous against future expansions of the enum.
const MAX_MEDAL_BUCKETS: usize = 64;

#[napi(object)]
pub struct MedalInfoData {
    pub league_id: i32,
    pub star_level: i32,
    pub stars: i32,
    pub streak: i32,
    pub legend_rank: i32,
    pub season_id: i32,
    pub season_wins: i32,
    pub best_star_level: i32,
}

#[napi(object)]
pub struct MedalInfoResult {
    pub wild: Option<MedalInfoData>,
    pub standard: Option<MedalInfoData>,
    pub classic: Option<MedalInfoData>,
    pub twist: Option<MedalInfoData>,
}

fn read_medal_data_object(
    mem: &ProcessMemory,
    obj: &MonoObject,
) -> Result<MedalInfoData, ScryError> {
    Ok(MedalInfoData {
        league_id: obj.read_int32_field(mem, FLD_LEAGUE_ID)?.unwrap_or(0),
        star_level: obj.read_int32_field(mem, FLD_STAR_LEVEL)?.unwrap_or(0),
        stars: obj.read_int32_field(mem, FLD_STARS)?.unwrap_or(0),
        streak: obj.read_int32_field(mem, FLD_STREAK)?.unwrap_or(0),
        legend_rank: obj.read_int32_field(mem, FLD_LEGEND_RANK)?.unwrap_or(0),
        season_id: obj.read_int32_field(mem, FLD_SEASON_ID)?.unwrap_or(0),
        season_wins: obj.read_int32_field(mem, FLD_SEASON_WINS)?.unwrap_or(0),
        best_star_level: obj.read_int32_field(mem, FLD_BEST_STAR_LEVEL)?.unwrap_or(0),
    })
}

/// Resolve the runtime class name (just the unqualified `Type.Name`) of a
/// Mono object — matched against `"NetCacheMedalInfo"` to find the right
/// entry in the outer NetCache map.
fn runtime_class_name(
    mem: &ProcessMemory,
    runtime: &MonoRuntime,
    obj: RemotePtr,
) -> Result<Option<String>, ScryError> {
    if obj.is_null() {
        return Ok(None);
    }
    let object_off = &runtime.offsets.structs.object;
    let vtable_off = &runtime.offsets.structs.vtable;
    let class_off = &runtime.offsets.structs.class;

    let vtable = mem.read_remote_ptr(obj + object_off.vtable)?;
    if vtable.is_null() {
        return Ok(None);
    }
    let klass = mem.read_remote_ptr(vtable + vtable_off.klass)?;
    if klass.is_null() {
        return Ok(None);
    }
    let name_ptr = mem.read_remote_ptr(klass + class_off.name)?;
    if name_ptr.is_null() {
        return Ok(None);
    }
    Ok(Some(mem.read_cstring(name_ptr, 256)?))
}

pub async fn get_medal_info_internal(
    runtime: &MonoRuntime,
) -> Result<Option<MedalInfoResult>, ScryError> {
    let Some(net_cache) = runtime.get_service(SVC_NET_CACHE)? else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    let Some(map_ptr) = net_cache.read_pointer_field(mem, FLD_NET_CACHE_MAP)? else {
        return Ok(None);
    };

    let outer = custom_map::iter_entries(mem, map_ptr, MAX_NET_CACHE_ENTRIES)?;

    let mut medal_info: Option<MonoObject> = None;
    for (_key, value) in outer {
        if let Some(name) = runtime_class_name(mem, runtime, value)? {
            if name == CLS_NET_CACHE_MEDAL_INFO {
                medal_info = MonoObject::from_address(mem, value, runtime.offsets.clone())?;
                break;
            }
        }
    }
    let Some(medal_info) = medal_info else {
        return Ok(None);
    };

    let mut result = MedalInfoResult {
        wild: None,
        standard: None,
        classic: None,
        twist: None,
    };

    // MedalData is the inner Map<FormatType (i32), PegasusUtil.MedalInfoData>.
    let Some(inner_map) = medal_info.read_pointer_field(mem, FLD_NET_CACHE_MEDAL_DATA)? else {
        return Ok(Some(result));
    };

    for (key_ptr, value_ptr) in custom_map::iter_entries(mem, inner_map, MAX_MEDAL_BUCKETS)? {
        // `Map<int, V>` stores keys inline; `key_ptr.raw()` IS the FormatType
        // integer rather than a boxed object pointer.
        let format_type = key_ptr.raw();
        let Some(obj) = MonoObject::from_address(mem, value_ptr, runtime.offsets.clone())? else {
            continue;
        };
        let data = read_medal_data_object(mem, &obj)?;
        match format_type {
            FORMAT_TYPE_WILD => result.wild = Some(data),
            FORMAT_TYPE_STANDARD => result.standard = Some(data),
            FORMAT_TYPE_CLASSIC => result.classic = Some(data),
            FORMAT_TYPE_TWIST => result.twist = Some(data),
            // FORMAT_TYPE_UNKNOWN (0) and any future enum variants are
            // dropped silently — the schema only exposes the four ladders
            // we know how to label.
            _ => {}
        }
    }

    Ok(Some(result))
}
