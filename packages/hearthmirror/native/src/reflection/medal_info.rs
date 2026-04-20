use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::object::MonoObject;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct MedalInfoData {
    pub league_id: i32,
    pub star_level: i32,
    pub stars: i32,
    pub legend_rank: i32,
    pub season_id: i32,
    pub season_wins: i32,
}

#[napi(object)]
pub struct MedalInfoResult {
    pub standard: Option<MedalInfoData>,
    pub wild: Option<MedalInfoData>,
    pub classic: Option<MedalInfoData>,
    pub twist: Option<MedalInfoData>,
}

fn read_medal_data(
    mem: &ProcessMemory,
    parent: &MonoObject,
    field: &str,
) -> Result<Option<MedalInfoData>, ScryError> {
    let Some(obj) = parent.read_object_field(mem, field)? else {
        return Ok(None);
    };
    Ok(Some(MedalInfoData {
        league_id: obj.read_int32_field(mem, FLD_LEAGUE_ID)?.unwrap_or(0),
        star_level: obj.read_int32_field(mem, FLD_STAR_LEVEL)?.unwrap_or(0),
        stars: obj.read_int32_field(mem, FLD_STARS)?.unwrap_or(0),
        legend_rank: obj.read_int32_field(mem, FLD_LEGEND_RANK)?.unwrap_or(0),
        season_id: obj.read_int32_field(mem, FLD_SEASON_ID)?.unwrap_or(0),
        season_wins: obj.read_int32_field(mem, FLD_SEASON_WINS)?.unwrap_or(0),
    }))
}

pub async fn get_medal_info_internal(
    runtime: &MonoRuntime,
) -> Result<Option<MedalInfoResult>, ScryError> {
    let Some(instance) = runtime.get_singleton(CLS_NET_CACHE.0, CLS_NET_CACHE.1)? else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    Ok(Some(MedalInfoResult {
        standard: read_medal_data(mem, &instance, FLD_STANDARD)?,
        wild: read_medal_data(mem, &instance, FLD_WILD)?,
        classic: read_medal_data(mem, &instance, FLD_CLASSIC)?,
        twist: read_medal_data(mem, &instance, FLD_TWIST)?,
    }))
}
