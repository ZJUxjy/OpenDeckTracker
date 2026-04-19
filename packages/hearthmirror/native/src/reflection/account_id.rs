use crate::error::ScryError;
use crate::mono::MonoRuntime;
use napi_derive::napi;

#[napi(object)]
pub struct AccountIdResult {
    pub hi: i64,
    pub lo: i64,
}

pub async fn get_account_id_internal(
    runtime: &MonoRuntime,
) -> Result<Option<AccountIdResult>, ScryError> {
    let _ = runtime;
    Ok(None)
}
