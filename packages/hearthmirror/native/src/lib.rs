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
pub mod window;

use error::ScryError;
use napi::bindgen_prelude::Buffer;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use runtime_slot::{back_off_duration, RuntimeSlot};
use std::collections::HashMap;
use std::ffi::c_void;
use std::mem::size_of;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use windows::Win32::Foundation::{HMODULE, HWND};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    EVENT_OBJECT_LOCATIONCHANGE, EVENT_SYSTEM_FOREGROUND, WINEVENT_OUTOFCONTEXT,
    WINEVENT_SKIPOWNPROCESS,
};

static MIRROR: Mutex<RuntimeSlot<mono::MonoRuntime>> = Mutex::new(RuntimeSlot::new());
static WINDOW_EVENT_SUBSCRIPTIONS: OnceLock<Mutex<HashMap<u32, WindowEventSubscription>>> =
    OnceLock::new();
static NEXT_WINDOW_EVENT_SUBSCRIPTION_ID: AtomicU32 = AtomicU32::new(1);

type WindowEventCallback = Arc<ThreadsafeFunction<(), (), (), napi::Status, false>>;

struct WindowEventSubscription {
    location_hook: isize,
    foreground_hook: isize,
    callback: WindowEventCallback,
}

fn window_event_subscriptions() -> &'static Mutex<HashMap<u32, WindowEventSubscription>> {
    WINDOW_EVENT_SUBSCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

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

/// Returns true if `err` looks like a transient Win32 read failure —
/// most commonly `ERROR_PARTIAL_COPY (0x8007012B)` raised when the
/// target process moves an object during GC, or when our cached
/// pointer offsets fall behind a Hearthstone patch. Both conditions
/// recover after re-attaching the Mono runtime fresh.
fn is_recoverable_memory_error(err: &ScryError) -> bool {
    matches!(err, ScryError::MemoryAccess { .. })
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
        Err(e) if is_recoverable_memory_error(&e) => {
            // Single retry: a memory read straddled an unmapped page (most
            // commonly during a GC move, or because cached offsets fell
            // behind an HS patch). Drop the runtime and replay once with a
            // fresh attach. If the second attempt still fails the caller
            // sees the original error and the next tick will probe again.
            let prev_pid = runtime.pid();
            eprintln!(
                "[hearthmirror] MonoRuntime: invalidated (reason=memory-access-failed pid_was={} err={})",
                prev_pid, e
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
        Err(e) if is_recoverable_memory_error(&e) => {
            let prev_pid = runtime.pid();
            eprintln!(
                "[hearthmirror] MonoRuntime: invalidated (reason=memory-access-failed pid_was={} err={})",
                prev_pid, e
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

#[napi(object)]
pub struct HearthstoneWindowResult {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub minimized: bool,
    pub visible: bool,
    pub foreground: bool,
}

#[napi]
pub async fn get_hearthstone_window() -> napi::Result<Option<HearthstoneWindowResult>> {
    Ok(window::get_hearthstone_window().map(|w| HearthstoneWindowResult {
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
        minimized: w.minimized,
        visible: w.visible,
        foreground: w.foreground,
    }))
}

fn hwnd_from_native_window_handle(handle: &[u8]) -> napi::Result<HWND> {
    let size = size_of::<usize>();
    if handle.len() < size {
        return Err(napi::Error::from_reason(format!(
            "native window handle is too short: got {} bytes, need {}",
            handle.len(),
            size
        )));
    }
    let mut raw = [0u8; size_of::<usize>()];
    raw.copy_from_slice(&handle[..size]);
    let hwnd = usize::from_ne_bytes(raw);
    if hwnd == 0 {
        return Err(napi::Error::from_reason("native window handle is null"));
    }
    Ok(HWND(hwnd as *mut c_void))
}

#[napi]
pub fn place_window_above_hearthstone(native_window_handle: Buffer) -> napi::Result<bool> {
    let hwnd = hwnd_from_native_window_handle(native_window_handle.as_ref())?;
    window::place_window_above_hearthstone(hwnd)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

fn hook_to_raw(hook: HWINEVENTHOOK) -> isize {
    hook.0 as isize
}

fn raw_to_hook(raw: isize) -> HWINEVENTHOOK {
    HWINEVENTHOOK(raw as *mut c_void)
}

fn notify_window_event_subscribers() {
    let callbacks: Vec<WindowEventCallback> = match window_event_subscriptions().lock() {
        Ok(guard) => guard
            .values()
            .map(|subscription| subscription.callback.clone())
            .collect(),
        Err(e) => {
            eprintln!("[hearthmirror] window event hook: lock poisoned ({})", e);
            return;
        }
    };

    for callback in callbacks {
        let _ = callback.call((), ThreadsafeFunctionCallMode::NonBlocking);
    }
}

unsafe extern "system" fn hearthstone_window_event_proc(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    object_id: i32,
    child_id: i32,
    _event_thread: u32,
    _event_time: u32,
) {
    const OBJID_WINDOW: i32 = 0;
    const CHILDID_SELF: i32 = 0;

    if object_id != OBJID_WINDOW || child_id != CHILDID_SELF {
        return;
    }

    let should_notify = match event {
        EVENT_SYSTEM_FOREGROUND => true,
        EVENT_OBJECT_LOCATIONCHANGE => window::is_hearthstone_hwnd(hwnd),
        _ => false,
    };

    if should_notify {
        notify_window_event_subscribers();
    }
}

#[napi]
pub fn subscribe_hearthstone_window_events(
    callback: Arc<ThreadsafeFunction<(), (), (), napi::Status, false>>,
) -> napi::Result<u32> {
    let flags = WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS;
    // SAFETY: The callback has the required extern "system" ABI and is static.
    // OUTOFCONTEXT delivers events on a system thread, so callback work is kept
    // tiny and hands off to a napi ThreadsafeFunction.
    let location_hook = unsafe {
        SetWinEventHook(
            EVENT_OBJECT_LOCATIONCHANGE,
            EVENT_OBJECT_LOCATIONCHANGE,
            HMODULE::default(),
            Some(hearthstone_window_event_proc),
            0,
            0,
            flags,
        )
    };
    if location_hook.is_invalid() {
        return Err(napi::Error::from_reason(
            "SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE) failed",
        ));
    }

    // Foreground changes can hide/show overlays without any movement event, so
    // track them globally and let the JS side read the latest window state.
    let foreground_hook = unsafe {
        SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            HMODULE::default(),
            Some(hearthstone_window_event_proc),
            0,
            0,
            flags,
        )
    };
    if foreground_hook.is_invalid() {
        let _ = unsafe { UnhookWinEvent(location_hook) };
        return Err(napi::Error::from_reason(
            "SetWinEventHook(EVENT_SYSTEM_FOREGROUND) failed",
        ));
    }

    let subscription_id = NEXT_WINDOW_EVENT_SUBSCRIPTION_ID.fetch_add(1, Ordering::Relaxed);
    let subscription = WindowEventSubscription {
        location_hook: hook_to_raw(location_hook),
        foreground_hook: hook_to_raw(foreground_hook),
        callback,
    };

    let mut guard = match window_event_subscriptions().lock() {
        Ok(guard) => guard,
        Err(e) => {
            let _ = unsafe { UnhookWinEvent(location_hook) };
            let _ = unsafe { UnhookWinEvent(foreground_hook) };
            return Err(napi::Error::from_reason(e.to_string()));
        }
    };
    guard.insert(subscription_id, subscription);
    Ok(subscription_id)
}

#[napi]
pub fn unsubscribe_hearthstone_window_events(subscription_id: u32) -> napi::Result<bool> {
    let subscription = window_event_subscriptions()
        .lock()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?
        .remove(&subscription_id);

    let Some(subscription) = subscription else {
        return Ok(false);
    };

    let location_ok = unsafe { UnhookWinEvent(raw_to_hook(subscription.location_hook)) }.as_bool();
    let foreground_ok = unsafe { UnhookWinEvent(raw_to_hook(subscription.foreground_hook)) }
        .as_bool();
    Ok(location_ok && foreground_ok)
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
pub async fn get_collection_diagnostic() -> napi::Result<reflection::collection::CollectionDiagnostic> {
    with_runtime_or(
        reflection::collection::CollectionDiagnostic::zero,
        |rt| futures::executor::block_on(
            reflection::collection::get_collection_diagnostic_internal(rt)),
    )
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
