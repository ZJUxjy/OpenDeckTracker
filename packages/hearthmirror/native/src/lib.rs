//! @hdt/hearthmirror-native — see ../README.md

#![deny(unsafe_op_in_unsafe_fn)]
#![warn(clippy::unwrap_used)]
#![warn(clippy::expect_used)]
#![warn(clippy::panic)]

pub mod error;
pub mod remote_ptr;
pub mod handle;
pub mod process;
pub mod memory;
pub mod mono;
pub mod metadata;
pub mod collections;
pub mod service_locator;
pub mod reflection;
pub mod disasm;

use napi_derive::napi;
use std::sync::Mutex;

static MIRROR: Mutex<Option<mono::MonoRuntime>> = Mutex::new(None);

fn try_init() -> Option<mono::MonoRuntime> {
    mono::MonoRuntime::init().ok()
}

/// Run an operation against the cached MonoRuntime; returns Ok(None) if mono
/// can't be initialized (i.e., Hearthstone not running).
fn with_runtime<T>(f: impl FnOnce(&mono::MonoRuntime) -> Result<Option<T>, error::ScryError>)
    -> napi::Result<Option<T>>
{
    let mut guard = MIRROR.lock().map_err(|e| napi::Error::from_reason(e.to_string()))?;
    if guard.is_none() {
        *guard = try_init();
    }
    let Some(runtime) = guard.as_ref() else {
        return Ok(None);
    };
    f(runtime).map_err(napi::Error::from)
}

/// Like with_runtime but for methods that return a plain T (not Option<T>),
/// falling back to `default` when the runtime is unavailable.
fn with_runtime_or<T>(default: T, f: impl FnOnce(&mono::MonoRuntime) -> Result<T, error::ScryError>)
    -> napi::Result<T>
{
    let mut guard = MIRROR.lock().map_err(|e| napi::Error::from_reason(e.to_string()))?;
    if guard.is_none() {
        *guard = try_init();
    }
    let Some(runtime) = guard.as_ref() else {
        return Ok(default);
    };
    f(runtime).map_err(napi::Error::from)
}

#[napi]
pub async fn is_alive() -> napi::Result<bool> {
    let mut guard = MIRROR.lock().map_err(|e| napi::Error::from_reason(e.to_string()))?;
    if guard.is_none() {
        *guard = try_init();
    }
    Ok(guard.is_some())
}

#[napi]
pub async fn get_battle_tag() -> napi::Result<Option<reflection::battle_tag::BattleTagResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::battle_tag::get_battle_tag_internal(rt)))
}

#[napi]
pub async fn get_account_id() -> napi::Result<Option<reflection::account_id::AccountIdResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::account_id::get_account_id_internal(rt)))
}

#[napi]
pub async fn get_game_type() -> napi::Result<Option<reflection::game_state::GameTypeResult>> {
    with_runtime(|rt| {
        let r = futures::executor::block_on(reflection::game_state::get_game_type_internal(rt))?;
        Ok(Some(r))
    })
}

#[napi]
pub async fn is_spectating() -> napi::Result<bool> {
    with_runtime_or(false, |rt| futures::executor::block_on(
        reflection::game_state::is_spectating_internal(rt)))
}

#[napi]
pub async fn is_game_over() -> napi::Result<bool> {
    with_runtime_or(false, |rt| futures::executor::block_on(
        reflection::game_state::is_game_over_internal(rt)))
}

#[napi]
pub async fn get_match_info() -> napi::Result<Option<reflection::match_info::MatchInfoResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::match_info::get_match_info_internal(rt)))
}

#[napi]
pub async fn get_medal_info() -> napi::Result<Option<reflection::medal_info::MedalInfoResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::medal_info::get_medal_info_internal(rt)))
}

#[napi]
pub async fn get_decks() -> napi::Result<Option<Vec<reflection::decks::DeckResult>>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::decks::get_decks_internal(rt)))
}

#[napi]
pub async fn get_collection() -> napi::Result<Option<Vec<reflection::collection::CardResult>>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::collection::get_collection_internal(rt)))
}

#[napi]
pub async fn get_arena_deck() -> napi::Result<Option<reflection::arena::ArenaInfoResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::arena::get_arena_deck_internal(rt)))
}

#[napi]
pub async fn get_battleground_rating_info() -> napi::Result<Option<reflection::battlegrounds::BattlegroundRatingInfoResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::battlegrounds::get_battleground_rating_info_internal(rt)))
}

#[napi]
pub async fn get_server_info() -> napi::Result<Option<reflection::server::GameServerInfoResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::server::get_server_info_internal(rt)))
}

// ── add-hearthmirror-decks-and-in-match-readers (R-17 + Phase-7) ────────────

#[napi]
pub async fn get_edited_deck() -> napi::Result<Option<reflection::decks::DeckResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::edited_deck::get_edited_deck_internal(rt)))
}

#[napi]
pub async fn is_mulligan() -> napi::Result<reflection::mulligan::IsMulliganResult> {
    with_runtime_or(reflection::mulligan::IsMulliganResult { mulligan: None }, |rt| {
        futures::executor::block_on(reflection::mulligan::is_mulligan_internal(rt))
    })
}

#[napi]
pub async fn get_board_state() -> napi::Result<Option<reflection::board_state::BoardStateResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::board_state::get_board_state_internal(rt)))
}

#[napi]
pub async fn get_hand_state() -> napi::Result<Option<reflection::hand_state::HandStateResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::hand_state::get_hand_state_internal(rt)))
}

#[napi]
pub async fn get_deck_state() -> napi::Result<Option<reflection::deck_state::DeckStateResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::deck_state::get_deck_state_internal(rt)))
}

#[napi]
pub async fn get_opponent_secrets() -> napi::Result<Option<reflection::opponent_secrets::OpponentSecretsResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::opponent_secrets::get_opponent_secrets_internal(rt)))
}

#[napi]
pub async fn get_choices() -> napi::Result<Option<reflection::choices::ChoicesResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::choices::get_choices_internal(rt)))
}

#[napi]
pub async fn get_selected_deck_id() -> napi::Result<Option<reflection::selected_deck::SelectedDeckResult>> {
    with_runtime(|rt| futures::executor::block_on(
        reflection::selected_deck::get_selected_deck_id_internal(rt)))
}

