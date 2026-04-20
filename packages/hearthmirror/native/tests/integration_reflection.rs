//! Integration tests for 12 IReflection methods.
//!
//! These require a running Hearthstone process. When HS is not running, all
//! tests print a SKIP message and pass (exit 0).
//!
//! Run with: `cargo test --test integration_reflection --features integration`

use hearthmirror_native::mono::MonoRuntime;

/// Returns `true` if Hearthstone.exe is running (32-bit process).
fn hearthstone_is_running() -> bool {
    hearthmirror_native::process::find_pid("Hearthstone.exe")
        .ok()
        .flatten()
        .is_some()
}

macro_rules! skip_if_no_hs {
    () => {
        if !hearthstone_is_running() {
            eprintln!("SKIP: no Hearthstone process found");
            return;
        }
    };
}

fn runtime() -> MonoRuntime {
    MonoRuntime::init().expect("Hearthstone must be running on main menu")
}

#[test]
fn get_battle_tag() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::battle_tag::get_battle_tag_internal(&rt),
    );
    assert!(result.is_ok(), "getBattleTag should not error");
    eprintln!("getBattleTag: is_some={}", result.ok().flatten().is_some());
}

#[test]
fn get_account_id() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::account_id::get_account_id_internal(&rt),
    );
    assert!(result.is_ok(), "getAccountId should not error");
    eprintln!("getAccountId: is_some={}", result.ok().flatten().is_some());
}

#[test]
fn get_medal_info() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::medal_info::get_medal_info_internal(&rt),
    );
    assert!(result.is_ok(), "getMedalInfo should not error");
    eprintln!("getMedalInfo: is_some={}", result.ok().flatten().is_some());
}

#[test]
fn get_game_type() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::game_state::get_game_type_internal(&rt),
    );
    assert!(result.is_ok(), "getGameType should not error");
    eprintln!("getGameType: {}", result.ok().unwrap_or(0));
}

#[test]
fn is_spectating() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::game_state::is_spectating_internal(&rt),
    );
    assert!(result.is_ok(), "isSpectating should not error");
    eprintln!("isSpectating: {}", result.ok().unwrap_or(false));
}

#[test]
fn is_game_over() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::game_state::is_game_over_internal(&rt),
    );
    assert!(result.is_ok(), "isGameOver should not error");
    eprintln!("isGameOver: {}", result.ok().unwrap_or(false));
}

#[test]
fn get_match_info() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::match_info::get_match_info_internal(&rt),
    );
    assert!(result.is_ok(), "getMatchInfo should not error");
    eprintln!("getMatchInfo: is_some={}", result.ok().flatten().is_some());
}

#[test]
fn get_server_info() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::server::get_server_info_internal(&rt),
    );
    assert!(result.is_ok(), "getServerInfo should not error");
    eprintln!("getServerInfo: is_some={}", result.ok().flatten().is_some());
}

#[test]
fn get_battleground_rating_info() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::battlegrounds::get_battleground_rating_info_internal(&rt),
    );
    assert!(result.is_ok(), "getBattlegroundRatingInfo should not error");
    eprintln!("getBattlegroundRatingInfo: is_some={}", result.ok().flatten().is_some());
}

#[test]
fn get_arena_deck() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::arena::get_arena_deck_internal(&rt),
    );
    assert!(result.is_ok(), "getArenaDeck should not error");
    eprintln!("getArenaDeck: is_some={}", result.ok().flatten().is_some());
}

#[test]
fn get_decks() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::decks::get_decks_internal(&rt),
    );
    assert!(result.is_ok(), "getDecks should not error");
    eprintln!("getDecks: is_some={}", result.ok().flatten().is_some());
}

#[test]
fn get_collection() {
    skip_if_no_hs!();
    let rt = runtime();
    let result = futures::executor::block_on(
        hearthmirror_native::reflection::collection::get_collection_internal(&rt),
    );
    assert!(result.is_ok(), "getCollection should not error");
    eprintln!("getCollection: is_some={}", result.ok().flatten().is_some());
}
