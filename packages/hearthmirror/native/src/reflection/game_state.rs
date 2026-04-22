//! `getGameType`, `isSpectating`, `isGameOver` — three single-bool /
//! single-int reflectors that share the `GameState`/`GameMgr` chain
//! patterns.
//!
//! The Phase-1 implementations all called
//! `get_singleton("", "GameState")` and read instance fields. After
//! Spike Run 10 this works for `is_game_over` (`GameState` exposes
//! `s_instance`) but `m_gameType` actually lives on `GameMgr` (a
//! ServiceLocator-managed service, not a self-managed singleton),
//! which is why `getGameType` was returning 0 instead of the live
//! game-type enum value.

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct GameTypeResult {
    /// Numeric value of the `PegasusShared.GameType` enum, or `null`
    /// when the GameMgr service is not registered (very early startup).
    pub game_type: Option<i32>,
    /// `PegasusShared.FormatType` enum value (1=Wild, 2=Standard,
    /// 3=Classic, 4=Twist).
    pub format_type: Option<i32>,
    /// Mission/scenario id, `null` when not in a mission.
    pub mission_id: Option<i32>,
}

pub async fn get_game_type_internal(
    runtime: &MonoRuntime,
) -> Result<GameTypeResult, ScryError> {
    let Some(game_mgr) = runtime.get_service(SVC_GAME_MGR)? else {
        return Ok(GameTypeResult {
            game_type: None,
            format_type: None,
            mission_id: None,
        });
    };
    let mem = &runtime.memory;
    Ok(GameTypeResult {
        game_type: game_mgr.read_int32_field(mem, FLD_GAMEMGR_M_GAME_TYPE)?,
        format_type: game_mgr.read_int32_field(mem, FLD_GAMEMGR_M_FORMAT_TYPE)?,
        mission_id: game_mgr.read_int32_field(mem, FLD_GAMEMGR_M_MISSION_ID)?,
    })
}

pub async fn is_spectating_internal(runtime: &MonoRuntime) -> Result<bool, ScryError> {
    // Per upstream `D:\code\hearthmirror-rs/hm-rpc/src/handler.rs`
    // `handle_is_spectating`, the spectator flag lives on
    // `GameMgr.m_spectator`, not on GameState. Phase-1 read
    // `GameState.m_isSpectator` which is unrelated.
    let Some(game_mgr) = runtime.get_service(SVC_GAME_MGR)? else {
        return Ok(false);
    };
    Ok(game_mgr
        .read_bool_field(&runtime.memory, "m_spectator")?
        .unwrap_or(false))
}

pub async fn is_game_over_internal(runtime: &MonoRuntime) -> Result<bool, ScryError> {
    // GameState exposes a real `s_instance` static, so this path stays
    // singleton-based.
    let Some(instance) = runtime.get_singleton(CLS_GAME_STATE.0, CLS_GAME_STATE.1)? else {
        return Ok(false);
    };
    Ok(instance
        .read_bool_field(&runtime.memory, FLD_GAME_OVER)?
        .unwrap_or(false))
}
