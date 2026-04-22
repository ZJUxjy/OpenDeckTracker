//! `getMatchInfo` — current-match summary aggregating `GameMgr`
//! (game/format/mission) + `GameState.m_playerMap` (per-player records).
//!
//! Phase-1 stub returned `null` because it walked
//! `GameMgr.s_instance.m_lastMatchInfo` and the field-name set there
//! drifted between game versions. After Spike Run 10 we use the same
//! data path as upstream `D:\code\hearthmirror-rs/hm-rpc/src/handler.rs::
//! read_match_info`:
//!
//! 1. GameMgr (ServiceLocator service): `m_gameType` / `m_formatType` /
//!    `m_missionId`.
//! 2. GameState (`s_instance` singleton): walk `m_playerMap`
//!    (`Blizzard.T5.Core.Map<int, Player>`) and split by `m_local: bool`
//!    into local + opposing.
//!
//! Returns `null` only when neither GameMgr nor GameState is reachable
//! (very early startup before the first service registers). When
//! GameMgr exists but GameState doesn't (post-login, in main menu),
//! returns a result with the GameMgr-side fields populated and
//! local/opposing player slots `null`.

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::entity::{iter_player_map, read_game_state_singleton};
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct MatchPlayerResult {
    /// In-match player id (== TAG_CONTROLLER value).
    pub id: i32,
    /// Display name (BattleTag for human, AI name for vs-AI).
    pub name: String,
    /// `Player.m_side` enum value (1=friendly, 2=opposing per
    /// Hearthstone protocol).
    pub side: i32,
    /// Per-format ranks reserved for follow-up MedalInfo wiring.
    pub standard_rank: i32,
    pub standard_legend_rank: i32,
    pub wild_rank: i32,
    pub wild_legend_rank: i32,
    pub classic_rank: i32,
    pub classic_legend_rank: i32,
    pub twist_rank: i32,
    pub twist_legend_rank: i32,
    /// Cardback id (PegasusUtil.NetCacheCardBacks).
    pub cardback_id: i32,
}

#[napi(object)]
pub struct MatchInfoResult {
    pub local_player: Option<MatchPlayerResult>,
    pub opposing_player: Option<MatchPlayerResult>,
    pub mission_id: i32,
    pub game_type: i32,
    pub format_type: i32,
    /// Reserved season-id slots — populated by a follow-up MedalInfo
    /// translator wiring (currently 0).
    pub ranked_season_id: i32,
    pub arena_season_id: i32,
    pub brawl_season_id: i32,
}

pub async fn get_match_info_internal(
    runtime: &MonoRuntime,
) -> Result<Option<MatchInfoResult>, ScryError> {
    let mem = &runtime.memory;

    // GameMgr — ServiceLocator-managed.
    let game_mgr = runtime.get_service(SVC_GAME_MGR)?;
    let (game_type, format_type, mission_id) = match game_mgr.as_ref() {
        Some(obj) => (
            obj.read_int32_field(mem, FLD_GAMEMGR_M_GAME_TYPE)?
                .unwrap_or(0),
            obj.read_int32_field(mem, FLD_GAMEMGR_M_FORMAT_TYPE)?
                .unwrap_or(0),
            obj.read_int32_field(mem, FLD_GAMEMGR_M_MISSION_ID)?
                .unwrap_or(0),
        ),
        None => (0, 0, 0),
    };

    // GameState — singleton.
    let gs = read_game_state_singleton(runtime)?;
    let players = match gs.as_ref() {
        Some(gs) => read_players(runtime, gs)?,
        None => Vec::new(),
    };
    let (local_player, opposing_player) = split_local_opposing(players);

    // If we have neither service nor singleton AND no players, surface
    // as `null` to match the spec contract.
    if game_mgr.is_none() && local_player.is_none() && opposing_player.is_none() {
        return Ok(None);
    }

    Ok(Some(MatchInfoResult {
        local_player,
        opposing_player,
        mission_id,
        game_type,
        format_type,
        ranked_season_id: 0,
        arena_season_id: 0,
        brawl_season_id: 0,
    }))
}

fn read_players(
    runtime: &MonoRuntime,
    gs: &crate::mono::object::MonoObject,
) -> Result<Vec<MatchPlayerResult>, ScryError> {
    let mem = &runtime.memory;
    let mut out = Vec::new();
    for (_player_id, player) in iter_player_map(runtime, gs)? {
        let id = player.read_int32_field(mem, FLD_PLAYER_M_ID)?.unwrap_or(0);
        let side = player.read_int32_field(mem, FLD_PLAYER_M_SIDE)?.unwrap_or(0);
        let name = player
            .read_string_field(mem, FLD_PLAYER_M_NAME)?
            .unwrap_or_default();
        let cardback_id = player
            .read_int32_field(mem, FLD_PLAYER_M_CARDBACK)?
            .unwrap_or(0);
        out.push(MatchPlayerResult {
            id,
            name,
            side,
            standard_rank: 0,
            standard_legend_rank: 0,
            wild_rank: 0,
            wild_legend_rank: 0,
            classic_rank: 0,
            classic_legend_rank: 0,
            twist_rank: 0,
            twist_legend_rank: 0,
            cardback_id,
        });
    }
    Ok(out)
}

/// Per Hearthstone protocol: `m_side == 1` is friendly, `m_side == 2`
/// is opposing. Spectator mode breaks this convention (both 254/255 in
/// some builds) — see design D6 R2 for the deferred fix.
fn split_local_opposing(
    players: Vec<MatchPlayerResult>,
) -> (Option<MatchPlayerResult>, Option<MatchPlayerResult>) {
    let mut local = None;
    let mut opposing = None;
    for p in players {
        if p.side == 1 {
            local = Some(p);
        } else if p.side == 2 {
            opposing = Some(p);
        }
    }
    (local, opposing)
}
