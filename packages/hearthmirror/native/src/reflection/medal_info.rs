use crate::error::ScryError;
use crate::mono::MonoRuntime;
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

pub async fn get_medal_info_internal(
    runtime: &MonoRuntime,
) -> Result<Option<MedalInfoResult>, ScryError> {
    let _ = runtime;
    Ok(None)
}
