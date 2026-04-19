use crate::error::ScryError;
use crate::mono::MonoRuntime;
use napi_derive::napi;

#[napi(object)]
pub struct CardResult {
    pub dbf_id: i32,
    pub count: i32,
    pub premium: i32,
}

pub async fn get_collection_internal(runtime: &MonoRuntime) -> Result<Option<Vec<CardResult>>, ScryError> {
    let _ = runtime;
    Ok(None)
}
