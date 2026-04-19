use crate::error::ScryError;
use crate::mono::MonoRuntime;

pub async fn get_game_type_internal(runtime: &MonoRuntime) -> Result<i32, ScryError> {
    let _ = runtime;
    Ok(0) // GameType.Unknown
}

pub async fn is_spectating_internal(runtime: &MonoRuntime) -> Result<bool, ScryError> {
    let _ = runtime;
    Ok(false)
}

pub async fn is_game_over_internal(runtime: &MonoRuntime) -> Result<bool, ScryError> {
    let _ = runtime;
    Ok(false)
}
