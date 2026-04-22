//! Diagnostic tool: connect to a running Hearthstone process and call all
//! reflection methods, printing JSON Lines to stdout + a final tally.
//!
//! Usage: `cargo run --example dump_reflection`
//!
//! When Hearthstone is not running, prints a single error line and exits 0.

use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::reflection::{
    account_id, arena, battle_tag, battlegrounds, board_state, choices, collection, deck_state,
    decks, edited_deck, game_state, hand_state, match_info, medal_info, mulligan,
    opponent_secrets, server,
};
use std::time::Instant;

fn escape_json(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

#[derive(Default)]
struct Tally {
    ok: u32,
    null: u32,
    err: u32,
}

impl Tally {
    fn record(&mut self, status: &str) {
        match status {
            "ok" => self.ok += 1,
            "null" => self.null += 1,
            "error" => self.err += 1,
            _ => {}
        }
    }
}

fn print_result(
    tally: &mut Tally,
    method: &str,
    status: &str,
    value: &str,
    error: &str,
    elapsed_ms: u128,
) {
    tally.record(status);
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

/// Helper: run an `Result<Option<T>, _>` reflector + format the value.
fn run_opt<T, F: FnMut(&T) -> String>(
    tally: &mut Tally,
    method: &str,
    fut: Result<Option<T>, hearthmirror_native::error::ScryError>,
    mut fmt: F,
    elapsed_ms: u128,
) {
    match fut {
        Ok(Some(v)) => print_result(tally, method, "ok", &fmt(&v), "", elapsed_ms),
        Ok(None) => print_result(tally, method, "null", "null", "", elapsed_ms),
        Err(e) => print_result(tally, method, "error", "null", &format!("{}", e), elapsed_ms),
    }
}

fn main() {
    let mut tally = Tally::default();

    let rt = match MonoRuntime::init() {
        Ok(r) => r,
        Err(e) => {
            print_result(
                &mut tally,
                "MonoRuntime::init",
                "error",
                "null",
                &format!("{}", e),
                0,
            );
            return;
        }
    };

    // ── Identity ───────────────────────────────────────────────────────────
    let t = Instant::now();
    run_opt(
        &mut tally,
        "getBattleTag",
        futures::executor::block_on(battle_tag::get_battle_tag_internal(&rt)),
        |v| format!("name={}, full={}", v.name, v.full_battle_tag),
        t.elapsed().as_millis(),
    );

    let t = Instant::now();
    run_opt(
        &mut tally,
        "getAccountId",
        futures::executor::block_on(account_id::get_account_id_internal(&rt)),
        |v| format!("hi={}, lo={}", v.hi, v.lo),
        t.elapsed().as_millis(),
    );

    // ── Medal ──────────────────────────────────────────────────────────────
    let t = Instant::now();
    run_opt(
        &mut tally,
        "getMedalInfo",
        futures::executor::block_on(medal_info::get_medal_info_internal(&rt)),
        |v| {
            let fmt = |bucket: &str, m: Option<&medal_info::MedalInfoData>| match m {
                Some(d) => format!(
                    "{}{{lvl={}, stars={}, streak={}, season={}, wins={}, best={}}}",
                    bucket, d.star_level, d.stars, d.streak, d.season_id, d.season_wins, d.best_star_level
                ),
                None => format!("{}=None", bucket),
            };
            format!(
                "{}, {}, {}, {}",
                fmt("standard", v.standard.as_ref()),
                fmt("wild", v.wild.as_ref()),
                fmt("classic", v.classic.as_ref()),
                fmt("twist", v.twist.as_ref()),
            )
        },
        t.elapsed().as_millis(),
    );

    // ── Match meta ─────────────────────────────────────────────────────────
    let t = Instant::now();
    run_opt(
        &mut tally,
        "getMatchInfo",
        futures::executor::block_on(match_info::get_match_info_internal(&rt)),
        |v| {
            let p = |label: &str, m: Option<&match_info::MatchPlayerResult>| match m {
                Some(p) => format!("{}{{id={}, side={}, name={:?}, cb={}}}", label, p.id, p.side, p.name, p.cardback_id),
                None => format!("{}=None", label),
            };
            format!(
                "game={}, fmt={}, mission={}, {}, {}",
                v.game_type,
                v.format_type,
                v.mission_id,
                p("local", v.local_player.as_ref()),
                p("opp", v.opposing_player.as_ref()),
            )
        },
        t.elapsed().as_millis(),
    );

    let t = Instant::now();
    match futures::executor::block_on(game_state::get_game_type_internal(&rt)) {
        Ok(v) => {
            let any_set = v.game_type.is_some() || v.format_type.is_some() || v.mission_id.is_some();
            print_result(
                &mut tally,
                "getGameType",
                if any_set { "ok" } else { "null" },
                &format!(
                    "game={:?}, fmt={:?}, mission={:?}",
                    v.game_type, v.format_type, v.mission_id
                ),
                "",
                t.elapsed().as_millis(),
            );
        }
        Err(e) => print_result(&mut tally, "getGameType", "error", "null", &format!("{}", e), t.elapsed().as_millis()),
    }

    // ── Booleans ───────────────────────────────────────────────────────────
    let t = Instant::now();
    match futures::executor::block_on(game_state::is_spectating_internal(&rt)) {
        Ok(v) => print_result(&mut tally, "isSpectating", "ok", &format!("{}", v), "", t.elapsed().as_millis()),
        Err(e) => print_result(&mut tally, "isSpectating", "error", "null", &format!("{}", e), t.elapsed().as_millis()),
    }

    let t = Instant::now();
    match futures::executor::block_on(game_state::is_game_over_internal(&rt)) {
        Ok(v) => print_result(&mut tally, "isGameOver", "ok", &format!("{}", v), "", t.elapsed().as_millis()),
        Err(e) => print_result(&mut tally, "isGameOver", "error", "null", &format!("{}", e), t.elapsed().as_millis()),
    }

    let t = Instant::now();
    match futures::executor::block_on(mulligan::is_mulligan_internal(&rt)) {
        Ok(v) => {
            let s = match v.mulligan {
                None => "null",
                Some(true) => "ok",
                Some(false) => "ok",
            };
            print_result(&mut tally, "isMulligan", s, &format!("{:?}", v.mulligan), "", t.elapsed().as_millis());
        }
        Err(e) => print_result(&mut tally, "isMulligan", "error", "null", &format!("{}", e), t.elapsed().as_millis()),
    }

    // ── Server / lobby ─────────────────────────────────────────────────────
    let t = Instant::now();
    run_opt(
        &mut tally,
        "getServerInfo",
        futures::executor::block_on(server::get_server_info_internal(&rt)),
        |v| format!("addr={}, port={}, gh={}, ver={}, mission={}", v.address, v.port, v.game_handle, v.version, v.mission),
        t.elapsed().as_millis(),
    );

    // ── Battlegrounds ──────────────────────────────────────────────────────
    let t = Instant::now();
    run_opt(
        &mut tally,
        "getBattlegroundRatingInfo",
        futures::executor::block_on(battlegrounds::get_battleground_rating_info_internal(&rt)),
        |v| format!("rating={}", v.rating),
        t.elapsed().as_millis(),
    );

    // ── Decks (R-17) ───────────────────────────────────────────────────────
    let t = Instant::now();
    run_opt(
        &mut tally,
        "getDecks",
        futures::executor::block_on(decks::get_decks_internal(&rt)),
        |v| {
            let names: Vec<String> = v.iter().take(3).map(|d| format!("{:?} ({} cards)", d.name, d.cards.len())).collect();
            format!("{} decks: [{}{}]", v.len(), names.join(", "), if v.len() > 3 { ", ..." } else { "" })
        },
        t.elapsed().as_millis(),
    );

    let t = Instant::now();
    run_opt(
        &mut tally,
        "getEditedDeck",
        futures::executor::block_on(edited_deck::get_edited_deck_internal(&rt)),
        |v| format!("name={:?}, hero={}, fmt={}, type={}, {} cards", v.name, v.hero, v.format_type, v.deck_type, v.cards.len()),
        t.elapsed().as_millis(),
    );

    let t = Instant::now();
    run_opt(
        &mut tally,
        "getArenaDeck",
        futures::executor::block_on(arena::get_arena_deck_internal(&rt)),
        |v| format!("wins={}, losses={}, deck={:?}, {} cards", v.wins, v.losses, v.deck.name, v.deck.cards.len()),
        t.elapsed().as_millis(),
    );

    // ── Collection ─────────────────────────────────────────────────────────
    let t = Instant::now();
    run_opt(
        &mut tally,
        "getCollection",
        futures::executor::block_on(collection::get_collection_internal(&rt)),
        |v| format!("{} cards", v.len()),
        t.elapsed().as_millis(),
    );

    // ── Phase 7: in-match observability ────────────────────────────────────
    let t = Instant::now();
    run_opt(
        &mut tally,
        "getBoardState",
        futures::executor::block_on(board_state::get_board_state_internal(&rt)),
        |v| format!("friendly={} ({:?}), opposing={} ({:?})",
            v.friendly.len(),
            v.friendly.iter().map(|e| e.card_id.as_str()).collect::<Vec<_>>(),
            v.opposing.len(),
            v.opposing.iter().map(|e| e.card_id.as_str()).collect::<Vec<_>>(),
        ),
        t.elapsed().as_millis(),
    );

    let t = Instant::now();
    run_opt(
        &mut tally,
        "getHandState",
        futures::executor::block_on(hand_state::get_hand_state_internal(&rt)),
        |v| format!("friendly={} ({:?}), opp_count={}",
            v.friendly_hand.len(),
            v.friendly_hand.iter().map(|c| c.card_id.as_str()).collect::<Vec<_>>(),
            v.opposing_hand_count,
        ),
        t.elapsed().as_millis(),
    );

    let t = Instant::now();
    run_opt(
        &mut tally,
        "getDeckState",
        futures::executor::block_on(deck_state::get_deck_state_internal(&rt)),
        |v| format!("friendly_deck={}, opp_deck_count={}", v.friendly_deck.len(), v.opposing_deck_count),
        t.elapsed().as_millis(),
    );

    let t = Instant::now();
    run_opt(
        &mut tally,
        "getOpponentSecrets",
        futures::executor::block_on(opponent_secrets::get_opponent_secrets_internal(&rt)),
        |v| format!("count={}, secrets={:?}", v.count, v.secrets.iter().map(|s| s.card_id.as_str()).collect::<Vec<_>>()),
        t.elapsed().as_millis(),
    );

    let t = Instant::now();
    run_opt(
        &mut tally,
        "getChoices",
        futures::executor::block_on(choices::get_choices_internal(&rt)),
        |v| {
            let g = |label: &str, c: Option<&choices::ChoiceGroup>| match c {
                Some(g) => format!(
                    "{}{{src={}, range={}-{}, cards={:?}}}",
                    label, g.source_entity_id, g.count_min, g.count_max,
                    g.cards.iter().map(|c| c.card_id.as_str()).collect::<Vec<_>>()
                ),
                None => format!("{}=None", label),
            };
            format!("{}, {}", g("mulligan", v.mulligan.as_ref()), g("general", v.general.as_ref()))
        },
        t.elapsed().as_millis(),
    );

    // ── Tally ──────────────────────────────────────────────────────────────
    eprintln!(
        "\n=== summary === {} OK / {} null / {} ERR (total {})",
        tally.ok,
        tally.null,
        tally.err,
        tally.ok + tally.null + tally.err
    );
}
