use crate::error::ScryError;
use crate::mono::MonoRuntime;
use napi_derive::napi;

#[napi(object)]
pub struct BattleTagResult {
    pub name: String,
    pub full_battle_tag: String,
}

pub async fn get_battle_tag_internal(
    runtime: &MonoRuntime,
) -> Result<Option<BattleTagResult>, ScryError> {
    // STUB — see plan G.1 in docs/superpowers/plans/2026-04-19-add-hearthmirror-bridge.md
    let _ = runtime;
    Ok(None)
}
