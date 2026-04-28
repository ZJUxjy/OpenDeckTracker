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
pub mod runtime_slot;

use error::ScryError;
use napi_derive::napi;
use runtime_slot::{back_off_duration, RuntimeSlot};
use std::sync::Mutex;
use std::time::Instant;

static MIRROR: Mutex<RuntimeSlot<mono::MonoRuntime>> = Mutex::new(RuntimeSlot::new());

fn try_init() -> Option<mono::MonoRuntime> {
    mono::MonoRuntime::init().ok()
}

/// Drop the cached runtime if the staleness probe says it's bound to a
/// dead-or-replaced process. Logs a single line per invalidation event.
fn drop_if_stale(slot: &mut RuntimeSlot<mono::MonoRuntime>) {
    let Some(runtime) = slot.runtime.as_ref() else {
        return;
    };
    if runtime.is_process_alive_and_same() {
        return;
    }
    let prev_pid = runtime.pid();
    let curr_pid = process::find_pid("Hearthstone.exe").ok().flatten();
    eprintln!(
        "[hearthmirror] MonoRuntime: invalidated (reason=process-changed pid_was={} pid_now={})",
        prev_pid,
        curr_pid.map_or(String::from("-"), |p| p.to_string())
    );
    slot.invalidate();
}

/// Returns true if `err` is a `ModuleNotFound("Assembly-CSharp.dll")` —
/// the canary that gates the single-retry path. Other `ModuleNotFound`
/// errors (e.g. `blizzard.bgsclient.dll`) fall through normally.
fn is_assembly_csharp_not_found(err: &ScryError) -> bool {
    matches!(
        err,
        ScryError::ModuleNotFound(name) if name == "Assembly-CSharp.dll"
    )
}

/// Run an operation against the cached MonoRuntime; returns Ok(None) if mono
/// can't be initialized (i.e., Hearthstone not running or starting up).
///
/// Recovery: invalidates the cached runtime if the bound process has gone
/// away, and retries once if the closure returns
/// `ModuleNotFound("Assembly-CSharp.dll")` (the canary signal that the
/// runtime captured an early-boot Hearthstone state).
fn with_runtime<T>(
    f: impl Fn(&mono::MonoRuntime) -> Result<Option<T>, ScryError>,
) -> napi::Result<Option<T>> {
    let mut guard = MIRROR
        .lock()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    drop_if_stale(&mut guard);
    guard.ensure_runtime_with(Instant::now(), back_off_duration(), try_init);

    let Some(runtime) = guard.runtime.as_ref() else {
        return Ok(None);
    };

    match f(runtime) {
        Ok(v) => Ok(v),
        Err(e) if is_assembly_csharp_not_found(&e) => {
            // Single retry: the cached runtime captured Hearthstone before
            // Assembly-CSharp loaded. Re-init and replay once.
            let prev_pid = runtime.pid();
            eprintln!(
                "[hearthmirror] MonoRuntime: invalidated (reason=assembly-csharp-not-found pid_was={} pid_now=-)",
                prev_pid
            );
            guard.invalidate();
            guard.ensure_runtime_with(Instant::now(), back_off_duration(), try_init);
            let Some(runtime) = guard.runtime.as_ref() else {
                return Ok(None);
            };
            f(runtime).map_err(napi::Error::from)
        }
        Err(e) => Err(napi::Error::from(e)),
    }
}

/// Like with_runtime but for methods that return a plain T (not Option<T>),
/// falling back to `default()` when the runtime is unavailable. `default` is
/// a closure (not a value) so we can call it twice without requiring
/// `T: Clone` — many reflector result types intentionally do not impl Clone.
fn with_runtime_or<T>(
    default: impl Fn() -> T,
    f: impl Fn(&mono::MonoRuntime) -> Result<T, ScryError>,
) -> napi::Result<T> {
    let mut guard = MIRROR
        .lock()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    drop_if_stale(&mut guard);
    guard.ensure_runtime_with(Instant::now(), back_off_duration(), try_init);

    let Some(runtime) = guard.runtime.as_ref() else {
        return Ok(default());
    };

    match f(runtime) {
        Ok(v) => Ok(v),
        Err(e) if is_assembly_csharp_not_found(&e) => {
            let prev_pid = runtime.pid();
            eprintln!(
                "[hearthmirror] MonoRuntime: invalidated (reason=assembly-csharp-not-found pid_was={} pid_now=-)",
                prev_pid
            );
            guard.invalidate();
            guard.ensure_runtime_with(Instant::now(), back_off_duration(), try_init);
            let Some(runtime) = guard.runtime.as_ref() else {
                return Ok(default());
            };
            f(runtime).map_err(napi::Error::from)
        }
        Err(e) => Err(napi::Error::from(e)),
    }
}

#[napi]
pub async fn is_alive() -> napi::Result<bool> {
    let mut guard = MIRROR
        .lock()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    drop_if_stale(&mut guard);
    guard.ensure_runtime_with(Instant::now(), back_off_duration(), try_init);
    Ok(guard.runtime.is_some())
}

/// Diagnostic: number of times the slot has populated a fresh runtime.
/// Resets to 0 on Electron process restart. Surfaced via napi for the
/// `dump_reflection` example and any future debug overlay.
#[napi]
pub async fn get_reinit_count() -> napi::Result<u32> {
    let guard = MIRROR
        .lock()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(guard.reinit_count.min(u32::MAX as u64) as u32)
}

/// Diagnostic: PID the current cached runtime is bound to, or `0` if none.
#[napi]
pub async fn get_bound_pid() -> napi::Result<u32> {
    let guard = MIRROR
        .lock()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(guard.runtime.as_ref().map_or(0, |r| r.pid()))
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
    with_runtime_or(|| false, |rt| futures::executor::block_on(
        reflection::game_state::is_spectating_internal(rt)))
}

#[napi]
pub async fn is_game_over() -> napi::Result<bool> {
    with_runtime_or(|| false, |rt| futures::executor::block_on(
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
    with_runtime_or(
        || reflection::mulligan::IsMulliganResult { mulligan: None },
        |rt| futures::executor::block_on(reflection::mulligan::is_mulligan_internal(rt)),
    )
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

#[cfg(test)]
mod wrapper_tests {
    use super::*;
    use error::ScryError;

    /// Stub "runtime" — just an i32 tag so we can verify which one a closure ran against.
    type StubRuntime = i32;

    fn run_with_runtime_logic<T: Clone>(
        slot: &mut RuntimeSlot<StubRuntime>,
        try_init: impl Fn() -> Option<StubRuntime>,
        f: impl Fn(&StubRuntime) -> Result<Option<T>, ScryError>,
    ) -> Result<Option<T>, ScryError> {
        // Mirrors the real wrapper but generic + sync, no stale check (probe
        // not testable on stub runtimes — covered by liveness_probe_tests).
        slot.ensure_runtime_with(
            Instant::now(),
            std::time::Duration::from_millis(2000),
            &try_init,
        );
        let Some(rt) = slot.runtime.as_ref() else {
            return Ok(None);
        };
        match f(rt) {
            Ok(v) => Ok(v),
            Err(e) if is_assembly_csharp_not_found(&e) => {
                slot.invalidate();
                slot.ensure_runtime_with(
                    Instant::now(),
                    std::time::Duration::from_millis(2000),
                    &try_init,
                );
                let Some(rt) = slot.runtime.as_ref() else {
                    return Ok(None);
                };
                f(rt)
            }
            Err(e) => Err(e),
        }
    }

    #[test]
    fn with_runtime_retries_once_on_assembly_csharp_not_found() {
        let mut slot: RuntimeSlot<StubRuntime> = RuntimeSlot::new();
        let init_calls = std::cell::Cell::new(0);
        let f_calls = std::cell::Cell::new(0);
        let try_init = || {
            init_calls.set(init_calls.get() + 1);
            Some(init_calls.get() as i32)
        };
        let f = |_rt: &StubRuntime| {
            f_calls.set(f_calls.get() + 1);
            if f_calls.get() == 1 {
                Err(ScryError::ModuleNotFound("Assembly-CSharp.dll".into()))
            } else {
                Ok(Some(()))
            }
        };

        let result = run_with_runtime_logic(&mut slot, try_init, f);
        assert!(matches!(result, Ok(Some(()))));
        assert_eq!(init_calls.get(), 2, "try_init should run on first miss + retry re-init");
        assert_eq!(f_calls.get(), 2, "closure should run twice (initial + retry)");
        assert_eq!(slot.reinit_count, 2);
    }

    #[test]
    fn with_runtime_does_not_retry_on_other_module_not_found() {
        let mut slot: RuntimeSlot<StubRuntime> = RuntimeSlot::new();
        let init_calls = std::cell::Cell::new(0);
        let f_calls = std::cell::Cell::new(0);
        let try_init = || {
            init_calls.set(init_calls.get() + 1);
            Some(7)
        };
        let f = |_rt: &StubRuntime| -> Result<Option<()>, ScryError> {
            f_calls.set(f_calls.get() + 1);
            Err(ScryError::ModuleNotFound("blizzard.bgsclient.dll".into()))
        };

        let result = run_with_runtime_logic(&mut slot, try_init, f);
        assert!(matches!(result, Err(ScryError::ModuleNotFound(_))));
        assert_eq!(init_calls.get(), 1, "no retry init on non-AC ModuleNotFound");
        assert_eq!(f_calls.get(), 1, "no retry of f on non-AC ModuleNotFound");
        assert_eq!(slot.reinit_count, 1);
    }

    #[test]
    fn retry_increments_reinit_count() {
        let mut slot: RuntimeSlot<StubRuntime> = RuntimeSlot::new();
        let try_init = || Some(1);
        let f = |_rt: &StubRuntime| -> Result<Option<()>, ScryError> {
            Err(ScryError::ModuleNotFound("Assembly-CSharp.dll".into()))
        };

        let _ = run_with_runtime_logic(&mut slot, try_init, f);
        // Initial init + one retry → 2.
        assert_eq!(slot.reinit_count, 2);
    }

    #[test]
    fn assembly_csharp_canary_predicate() {
        assert!(is_assembly_csharp_not_found(
            &ScryError::ModuleNotFound("Assembly-CSharp.dll".into())
        ));
        assert!(!is_assembly_csharp_not_found(
            &ScryError::ModuleNotFound("blizzard.bgsclient.dll".into())
        ));
        assert!(!is_assembly_csharp_not_found(&ScryError::MonoNotInitialized));
    }
}
