use crate::error::ScryError;
use crate::mono::MonoRuntime;
use napi_derive::napi;

#[napi(object)]
pub struct BattlegroundRatingInfoResult {
    pub rating: i32,
    pub rank: i32,
}

pub async fn get_battleground_rating_info_internal(
    runtime: &MonoRuntime,
) -> Result<Option<BattlegroundRatingInfoResult>, ScryError> {
    let _ = runtime;
    Ok(None)
}
