use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
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
    let Some(instance) = runtime.get_singleton(CLS_NETWORK.0, CLS_NETWORK.1)? else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    // Network.s_instance → .m_currentServerInfo
    let Some(info) = instance.read_object_field(mem, FLD_CURRENT_SERVER_INFO)? else {
        return Ok(None);
    };

    Ok(Some(GameServerInfoResult {
        address: info
            .read_string_field(mem, FLD_SERVER_ADDRESS)?
            .unwrap_or_default(),
        port: info.read_int32_field(mem, FLD_SERVER_PORT)?.unwrap_or(0),
        mission: info
            .read_int32_field(mem, FLD_SERVER_MISSION)?
            .unwrap_or(0),
        game_handle: info
            .read_int32_field(mem, FLD_SERVER_GAME_HANDLE)?
            .unwrap_or(0),
        version: info
            .read_string_field(mem, FLD_SERVER_VERSION)?
            .unwrap_or_default(),
        resumable: info
            .read_bool_field(mem, FLD_SERVER_RESUMABLE)?
            .unwrap_or(false),
    }))
}
