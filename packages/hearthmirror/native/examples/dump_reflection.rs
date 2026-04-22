//! Diagnostic tool: connect to a running Hearthstone process and call all
//! 12 reflection methods, printing results as JSON Lines to stdout.
//!
//! Usage: `cargo run --example dump_reflection`
//!
//! When Hearthstone is not running, prints a single error line and exits 0.

use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::reflection::{
    account_id, arena, battle_tag, battlegrounds, collection, decks, game_state, match_info,
    medal_info, server,
};
use std::time::Instant;

fn escape_json(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn print_result(method: &str, status: &str, value: &str, error: &str, elapsed_ms: u128) {
    println!(
        r#"{{"method":"{}","status":"{}","value":"{}","error":{},"elapsed_ms":{}}}"#,
        method,
        status,
        escape_json(value),
        if error.is_empty() {
            "null".to_string()
        } else {
            format!("\"{}\"", escape_json(error))
        },
        elapsed_ms,
    );
}

fn main() {
    let rt = match MonoRuntime::init() {
        Ok(r) => r,
        Err(e) => {
            print_result(
                "MonoRuntime::init",
                "error",
                "null",
                &format!("{}", e),
                0,
            );
            return; // exit 0
        }
    };

    // getBattleTag
    {
        let t = Instant::now();
        match futures::executor::block_on(battle_tag::get_battle_tag_internal(&rt)) {
            Ok(Some(v)) => print_result(
                "getBattleTag",
                "ok",
                &format!("name={}, full={}", v.name, v.full_battle_tag),
                "",
                t.elapsed().as_millis(),
            ),
            Ok(None) => print_result("getBattleTag", "null", "null", "", t.elapsed().as_millis()),
            Err(e) => print_result(
                "getBattleTag",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }

    // getAccountId
    {
        let t = Instant::now();
        match futures::executor::block_on(account_id::get_account_id_internal(&rt)) {
            Ok(Some(v)) => print_result(
                "getAccountId",
                "ok",
                &format!("hi={}, lo={}", v.hi, v.lo),
                "",
                t.elapsed().as_millis(),
            ),
            Ok(None) => print_result("getAccountId", "null", "null", "", t.elapsed().as_millis()),
            Err(e) => print_result(
                "getAccountId",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }

    // getMedalInfo
    {
        let t = Instant::now();
        match futures::executor::block_on(medal_info::get_medal_info_internal(&rt)) {
            Ok(Some(v)) => {
                let fmt = |bucket: &str, m: Option<&medal_info::MedalInfoData>| match m {
                    Some(d) => format!(
                        "{}{{league={}, lvl={}, stars={}, streak={}, legend={}, season={}, wins={}, best={}}}",
                        bucket,
                        d.league_id,
                        d.star_level,
                        d.stars,
                        d.streak,
                        d.legend_rank,
                        d.season_id,
                        d.season_wins,
                        d.best_star_level
                    ),
                    None => format!("{}=None", bucket),
                };
                let summary = format!(
                    "{}, {}, {}, {}",
                    fmt("standard", v.standard.as_ref()),
                    fmt("wild", v.wild.as_ref()),
                    fmt("classic", v.classic.as_ref()),
                    fmt("twist", v.twist.as_ref())
                );
                print_result("getMedalInfo", "ok", &summary, "", t.elapsed().as_millis());
            }
            Ok(None) => print_result("getMedalInfo", "null", "null", "", t.elapsed().as_millis()),
            Err(e) => print_result(
                "getMedalInfo",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }

    // getMatchInfo
    {
        let t = Instant::now();
        match futures::executor::block_on(match_info::get_match_info_internal(&rt)) {
            Ok(Some(_v)) => print_result(
                "getMatchInfo",
                "ok",
                "MatchInfoResult{...}",
                "",
                t.elapsed().as_millis(),
            ),
            Ok(None) => print_result("getMatchInfo", "null", "null", "", t.elapsed().as_millis()),
            Err(e) => print_result(
                "getMatchInfo",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }

    // getGameType
    {
        let t = Instant::now();
        match futures::executor::block_on(game_state::get_game_type_internal(&rt)) {
            Ok(v) => print_result(
                "getGameType",
                if v == 0 { "null" } else { "ok" },
                &format!("{}", v),
                "",
                t.elapsed().as_millis(),
            ),
            Err(e) => print_result(
                "getGameType",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }

    // isSpectating
    {
        let t = Instant::now();
        match futures::executor::block_on(game_state::is_spectating_internal(&rt)) {
            Ok(v) => print_result(
                "isSpectating",
                "ok",
                &format!("{}", v),
                "",
                t.elapsed().as_millis(),
            ),
            Err(e) => print_result(
                "isSpectating",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }

    // isGameOver
    {
        let t = Instant::now();
        match futures::executor::block_on(game_state::is_game_over_internal(&rt)) {
            Ok(v) => print_result(
                "isGameOver",
                "ok",
                &format!("{}", v),
                "",
                t.elapsed().as_millis(),
            ),
            Err(e) => print_result(
                "isGameOver",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }

    // getServerInfo
    {
        let t = Instant::now();
        match futures::executor::block_on(server::get_server_info_internal(&rt)) {
            Ok(Some(v)) => print_result(
                "getServerInfo",
                "ok",
                &format!("addr={}, port={}, game_handle={}", v.address, v.port, v.game_handle),
                "",
                t.elapsed().as_millis(),
            ),
            Ok(None) => {
                print_result("getServerInfo", "null", "null", "", t.elapsed().as_millis())
            }
            Err(e) => print_result(
                "getServerInfo",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }

    // getBattlegroundRatingInfo
    {
        let t = Instant::now();
        match futures::executor::block_on(
            battlegrounds::get_battleground_rating_info_internal(&rt),
        ) {
            Ok(Some(v)) => print_result(
                "getBattlegroundRatingInfo",
                "ok",
                &format!("rating={}", v.rating),
                "",
                t.elapsed().as_millis(),
            ),
            Ok(None) => print_result(
                "getBattlegroundRatingInfo",
                "null",
                "null",
                "",
                t.elapsed().as_millis(),
            ),
            Err(e) => print_result(
                "getBattlegroundRatingInfo",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }

    // getArenaDeck
    {
        let t = Instant::now();
        match futures::executor::block_on(arena::get_arena_deck_internal(&rt)) {
            Ok(Some(_v)) => print_result(
                "getArenaDeck",
                "ok",
                "ArenaInfoResult{...}",
                "",
                t.elapsed().as_millis(),
            ),
            Ok(None) => print_result("getArenaDeck", "null", "null", "", t.elapsed().as_millis()),
            Err(e) => print_result(
                "getArenaDeck",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }

    // getDecks
    {
        let t = Instant::now();
        match futures::executor::block_on(decks::get_decks_internal(&rt)) {
            Ok(Some(v)) => print_result(
                "getDecks",
                "ok",
                &format!("{} decks", v.len()),
                "",
                t.elapsed().as_millis(),
            ),
            Ok(None) => print_result("getDecks", "null", "null", "", t.elapsed().as_millis()),
            Err(e) => print_result(
                "getDecks",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }

    // getCollection
    {
        let t = Instant::now();
        match futures::executor::block_on(collection::get_collection_internal(&rt)) {
            Ok(Some(v)) => print_result(
                "getCollection",
                "ok",
                &format!("{} cards", v.len()),
                "",
                t.elapsed().as_millis(),
            ),
            Ok(None) => {
                print_result("getCollection", "null", "null", "", t.elapsed().as_millis())
            }
            Err(e) => print_result(
                "getCollection",
                "error",
                "null",
                &format!("{}", e),
                t.elapsed().as_millis(),
            ),
        }
    }
}
