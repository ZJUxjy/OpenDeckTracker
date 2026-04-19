use crate::error::ScryError;
use crate::mono::MonoRuntime;
use napi_derive::napi;

use super::decks::DeckResult;

#[napi(object)]
pub struct ArenaInfoResult {
    pub deck: DeckResult,
    pub wins: i32,
    pub losses: i32,
}

pub async fn get_arena_deck_internal(runtime: &MonoRuntime) -> Result<Option<ArenaInfoResult>, ScryError> {
    let _ = runtime;
    Ok(None)
}
