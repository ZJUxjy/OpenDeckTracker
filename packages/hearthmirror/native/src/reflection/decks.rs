use crate::error::ScryError;
use crate::mono::MonoRuntime;
use napi_derive::napi;

#[napi(object)]
pub struct DeckCardResult {
    pub dbf_id: i32,
    pub count: i32,
    pub premium: i32,
}

#[napi(object)]
pub struct DeckResult {
    pub id: i64,
    pub name: String,
    pub hero: String,
    pub format_type: i32,
    pub deck_type: i32,
    pub cards: Vec<DeckCardResult>,
}

pub async fn get_decks_internal(runtime: &MonoRuntime) -> Result<Option<Vec<DeckResult>>, ScryError> {
    let _ = runtime;
    Ok(None)
}
