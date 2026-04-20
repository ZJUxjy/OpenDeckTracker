use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct BattlegroundRatingInfoResult {
    pub rating: i32,
    pub rank: i32,
}

pub async fn get_battleground_rating_info_internal(
    runtime: &MonoRuntime,
) -> Result<Option<BattlegroundRatingInfoResult>, ScryError> {
    let Some(instance) =
        runtime.get_singleton(CLS_BACON_RATING_MGR.0, CLS_BACON_RATING_MGR.1)?
    else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    // BaconRatingMgr.s_instance → .m_lastRatingResponse
    let Some(resp) = instance.read_object_field(mem, FLD_LAST_RATING_RESPONSE)? else {
        return Ok(None);
    };

    Ok(Some(BattlegroundRatingInfoResult {
        rating: resp.read_int32_field(mem, FLD_RATING)?.unwrap_or(0),
        rank: resp
            .read_int32_field(mem, FLD_LEADERBOARD_PLACE)?
            .unwrap_or(0),
    }))
}
