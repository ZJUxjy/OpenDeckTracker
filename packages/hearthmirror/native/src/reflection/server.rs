use crate::error::ScryError;
use crate::mono::MonoRuntime;
use napi_derive::napi;

#[napi(object)]
pub struct GameServerInfoResult {
    pub address: String,
    pub port: i32,
    pub mission: i32,
    pub game_handle: i32,
    pub version: String,
    pub resumable: bool,
}

pub async fn get_server_info_internal(
    runtime: &MonoRuntime,
) -> Result<Option<GameServerInfoResult>, ScryError> {
    let _ = runtime;
    Ok(None)
}
