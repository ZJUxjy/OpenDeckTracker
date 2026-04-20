use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;

pub async fn get_game_type_internal(runtime: &MonoRuntime) -> Result<i32, ScryError> {
    let Some(instance) = runtime.get_singleton(CLS_GAME_STATE.0, CLS_GAME_STATE.1)? else {
        return Ok(0);
    };
    Ok(instance
        .read_int32_field(&runtime.memory, FLD_GAME_TYPE_FIELD)?
        .unwrap_or(0))
}

pub async fn is_spectating_internal(runtime: &MonoRuntime) -> Result<bool, ScryError> {
    let Some(instance) = runtime.get_singleton(CLS_GAME_STATE.0, CLS_GAME_STATE.1)? else {
        return Ok(false);
    };
    Ok(instance
        .read_bool_field(&runtime.memory, FLD_IS_SPECTATOR)?
        .unwrap_or(false))
}

pub async fn is_game_over_internal(runtime: &MonoRuntime) -> Result<bool, ScryError> {
    let Some(instance) = runtime.get_singleton(CLS_GAME_STATE.0, CLS_GAME_STATE.1)? else {
        return Ok(false);
    };
    Ok(instance
        .read_bool_field(&runtime.memory, FLD_GAME_OVER)?
        .unwrap_or(false))
}
