//! @hdt/hearthmirror-native — see ../README.md

#![deny(unsafe_op_in_unsafe_fn)]
#![warn(clippy::unwrap_used)]
#![warn(clippy::expect_used)]
#![warn(clippy::panic)]

pub mod collections;
pub mod disasm;
pub mod error;
pub mod handle;
pub mod memory;
pub mod metadata;
pub mod mono;
pub mod process;
pub mod reflection;
pub mod remote_ptr;
pub mod service_locator;

use napi_derive::napi;
use std::sync::{Mutex, MutexGuard};

static MIRROR: Mutex<Option<mono::MonoRuntime>> = Mutex::new(None);

/// Acquire the global runtime mutex, lazily attempting to attach to
/// Hearthstone the first time we observe `None`.
///
/// `MonoRuntime::init` errors (e.g. process not running, mono module not
/// loaded yet) are intentionally swallowed here — callers should treat
/// "not attached" the same as "Hearthstone not running" for graceful
/// degradation. If you need to inspect the underlying error, call
/// `MonoRuntime::init()` directly and bypass the cache.
fn lock_runtime() -> napi::Result<MutexGuard<'static, Option<mono::MonoRuntime>>> {
    let mut guard = MIRROR
        .lock()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    if guard.is_none() {
        *guard = mono::MonoRuntime::init().ok();
    }
    Ok(guard)
}

/// Run an operation against the cached MonoRuntime; returns Ok(None) if mono
/// can't be initialized (i.e., Hearthstone not running).
fn with_runtime<T>(
    f: impl FnOnce(&mono::MonoRuntime) -> Result<Option<T>, error::ScryError>,
) -> napi::Result<Option<T>> {
    let guard = lock_runtime()?;
    let Some(runtime) = guard.as_ref() else {
        return Ok(None);
    };
    f(runtime).map_err(napi::Error::from)
}

/// Like with_runtime but for methods that return a plain T (not Option<T>),
/// falling back to `default` when the runtime is unavailable.
fn with_runtime_or<T>(
    default: T,
    f: impl FnOnce(&mono::MonoRuntime) -> Result<T, error::ScryError>,
) -> napi::Result<T> {
    let guard = lock_runtime()?;
    let Some(runtime) = guard.as_ref() else {
        return Ok(default);
    };
    f(runtime).map_err(napi::Error::from)
}

#[napi]
pub async fn is_alive() -> napi::Result<bool> {
    Ok(lock_runtime()?.is_some())
}

#[napi]
pub async fn get_battle_tag() -> napi::Result<Option<reflection::battle_tag::BattleTagResult>> {
    with_runtime(|rt| {
        futures::executor::block_on(reflection::battle_tag::get_battle_tag_internal(rt))
    })
}

#[napi]
pub async fn get_account_id() -> napi::Result<Option<reflection::account_id::AccountIdResult>> {
    with_runtime(|rt| {
        futures::executor::block_on(reflection::account_id::get_account_id_internal(rt))
    })
}

#[napi]
pub async fn get_game_type() -> napi::Result<i32> {
    with_runtime_or(0, |rt| {
        futures::executor::block_on(reflection::game_state::get_game_type_internal(rt))
    })
}

#[napi]
pub async fn is_spectating() -> napi::Result<bool> {
    with_runtime_or(false, |rt| {
        futures::executor::block_on(reflection::game_state::is_spectating_internal(rt))
    })
}

#[napi]
pub async fn is_game_over() -> napi::Result<bool> {
    with_runtime_or(false, |rt| {
        futures::executor::block_on(reflection::game_state::is_game_over_internal(rt))
    })
}

#[napi]
pub async fn is_mulligan() -> napi::Result<Option<bool>> {
    with_runtime(|rt| futures::executor::block_on(reflection::mulligan::is_mulligan_internal(rt)))
}

#[napi]
pub async fn get_match_info() -> napi::Result<Option<reflection::match_info::MatchInfoResult>> {
    with_runtime(|rt| {
        futures::executor::block_on(reflection::match_info::get_match_info_internal(rt))
    })
}

#[napi]
pub async fn get_medal_info() -> napi::Result<Option<reflection::medal_info::MedalInfoResult>> {
    with_runtime(|rt| {
        futures::executor::block_on(reflection::medal_info::get_medal_info_internal(rt))
    })
}

#[napi]
pub async fn get_decks() -> napi::Result<Option<Vec<reflection::decks::DeckResult>>> {
    with_runtime(|rt| futures::executor::block_on(reflection::decks::get_decks_internal(rt)))
}

#[napi]
pub async fn get_collection() -> napi::Result<Option<Vec<reflection::collection::CardResult>>> {
    with_runtime(|rt| {
        futures::executor::block_on(reflection::collection::get_collection_internal(rt))
    })
}

#[napi]
pub async fn get_arena_deck() -> napi::Result<Option<reflection::arena::ArenaInfoResult>> {
    with_runtime(|rt| futures::executor::block_on(reflection::arena::get_arena_deck_internal(rt)))
}

#[napi]
pub async fn get_battleground_rating_info(
) -> napi::Result<Option<reflection::battlegrounds::BattlegroundRatingInfoResult>> {
    with_runtime(|rt| {
        futures::executor::block_on(
            reflection::battlegrounds::get_battleground_rating_info_internal(rt),
        )
    })
}

#[napi]
pub async fn get_server_info() -> napi::Result<Option<reflection::server::GameServerInfoResult>> {
    with_runtime(|rt| futures::executor::block_on(reflection::server::get_server_info_internal(rt)))
}

#[napi]
pub async fn dump_class(
    class_name: String,
    limit: Option<u32>,
) -> napi::Result<Vec<reflection::debug::FieldDumpEntry>> {
    with_runtime_or(Vec::new(), |rt| {
        futures::executor::block_on(reflection::debug::dump_class_internal(
            rt, class_name, limit,
        ))
    })
}

#[napi]
pub async fn list_services() -> napi::Result<Vec<reflection::debug::ServiceEntry>> {
    with_runtime_or(Vec::new(), |rt| {
        futures::executor::block_on(reflection::debug::list_services_internal(rt))
    })
}
