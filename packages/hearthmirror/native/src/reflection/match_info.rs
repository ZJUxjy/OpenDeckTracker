use crate::error::ScryError;
use crate::mono::MonoRuntime;
use napi_derive::napi;

#[napi(object)]
pub struct MatchPlayerResult {
    pub id: i32,
    pub name: String,
    pub account_id_hi: i64,
    pub account_id_lo: i64,
    pub battle_tag_name: String,
    pub battle_tag_full: String,
    pub standard_rank: i32,
    pub wild_rank: i32,
    pub classic_rank: i32,
    pub twist_rank: i32,
}

#[napi(object)]
pub struct MatchInfoResult {
    pub local_player: MatchPlayerResult,
    pub opposing_player: MatchPlayerResult,
    pub mission_id: i32,
    pub game_type: i32,
    pub format_type: i32,
}

pub async fn get_match_info_internal(
    runtime: &MonoRuntime,
) -> Result<Option<MatchInfoResult>, ScryError> {
    let _ = runtime;
    Ok(None)
}
