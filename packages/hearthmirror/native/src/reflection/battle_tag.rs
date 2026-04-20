use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct BattleTagResult {
    pub name: String,
    pub full_battle_tag: String,
}

pub async fn get_battle_tag_internal(
    runtime: &MonoRuntime,
) -> Result<Option<BattleTagResult>, ScryError> {
    let Some(instance) = runtime.get_singleton(CLS_NET_CACHE.0, CLS_NET_CACHE.1)? else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    // NetCache.s_instance → .BattleTag → .m_string (full tag) / .m_name (name part)
    let Some(tag_obj) = instance.read_object_field(mem, FLD_BATTLE_TAG)? else {
        return Ok(None);
    };
    let name = tag_obj
        .read_string_field(mem, FLD_BATTLE_TAG_NAME)?
        .unwrap_or_default();
    let full_battle_tag = tag_obj
        .read_string_field(mem, FLD_BATTLE_TAG_STRING)?
        .unwrap_or_default();

    Ok(Some(BattleTagResult {
        name,
        full_battle_tag,
    }))
}
