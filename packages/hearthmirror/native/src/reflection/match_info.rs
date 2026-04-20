use crate::error::ScryError;
use crate::memory::ProcessMemory;
use crate::mono::object::MonoObject;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct MatchPlayerResult {
    pub id: i32,
    pub name: String,
    pub account_id_hi: i64,
    pub account_id_lo: i64,
    pub battle_tag_name: String,
    pub battle_tag_full: String,
    pub standard_rank: i32,
    pub wild_rank: i32,
    pub classic_rank: i32,
    pub twist_rank: i32,
}

#[napi(object)]
pub struct MatchInfoResult {
    pub local_player: MatchPlayerResult,
    pub opposing_player: MatchPlayerResult,
    pub mission_id: i32,
    pub game_type: i32,
    pub format_type: i32,
}

fn read_player(
    mem: &ProcessMemory,
    parent: &MonoObject,
    field: &str,
) -> Result<Option<MatchPlayerResult>, ScryError> {
    let Some(player) = parent.read_object_field(mem, field)? else {
        return Ok(None);
    };

    let id = player.read_int32_field(mem, FLD_PLAYER_ID)?.unwrap_or(0);
    let name = player
        .read_string_field(mem, FLD_PLAYER_NAME)?
        .unwrap_or_default();

    // BattleTag sub-object
    let (battle_tag_name, battle_tag_full) =
        if let Some(tag) = player.read_object_field(mem, FLD_PLAYER_BATTLE_TAG)? {
            (
                tag.read_string_field(mem, FLD_BATTLE_TAG_NAME)?
                    .unwrap_or_default(),
                tag.read_string_field(mem, FLD_BATTLE_TAG_STRING)?
                    .unwrap_or_default(),
            )
        } else {
            (String::new(), String::new())
        };

    // AccountId sub-object
    let (account_id_hi, account_id_lo) =
        if let Some(acct) = player.read_object_field(mem, FLD_PLAYER_ACCOUNT_ID)? {
            (
                acct.read_int64_field(mem, FLD_ACCOUNT_HI)?.unwrap_or(0),
                acct.read_int64_field(mem, FLD_ACCOUNT_LO)?.unwrap_or(0),
            )
        } else {
            (0, 0)
        };

    Ok(Some(MatchPlayerResult {
        id,
        name,
        account_id_hi,
        account_id_lo,
        battle_tag_name,
        battle_tag_full,
        standard_rank: player
            .read_int32_field(mem, FLD_PLAYER_STANDARD_RANK)?
            .unwrap_or(0),
        wild_rank: player
            .read_int32_field(mem, FLD_PLAYER_WILD_RANK)?
            .unwrap_or(0),
        classic_rank: player
            .read_int32_field(mem, FLD_PLAYER_CLASSIC_RANK)?
            .unwrap_or(0),
        twist_rank: player
            .read_int32_field(mem, FLD_PLAYER_TWIST_RANK)?
            .unwrap_or(0),
    }))
}

fn default_player() -> MatchPlayerResult {
    MatchPlayerResult {
        id: 0,
        name: String::new(),
        account_id_hi: 0,
        account_id_lo: 0,
        battle_tag_name: String::new(),
        battle_tag_full: String::new(),
        standard_rank: 0,
        wild_rank: 0,
        classic_rank: 0,
        twist_rank: 0,
    }
}

pub async fn get_match_info_internal(
    runtime: &MonoRuntime,
) -> Result<Option<MatchInfoResult>, ScryError> {
    let Some(instance) = runtime.get_singleton(CLS_GAME_MGR.0, CLS_GAME_MGR.1)? else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    // GameMgr.s_instance → .m_lastMatchInfo
    let Some(info) = instance.read_object_field(mem, FLD_LAST_MATCH_INFO)? else {
        return Ok(None);
    };

    let local_player = read_player(mem, &info, FLD_LOCAL_PLAYER)?.unwrap_or_else(default_player);
    let opposing_player =
        read_player(mem, &info, FLD_OPPOSING_PLAYER)?.unwrap_or_else(default_player);
    let mission_id = info.read_int32_field(mem, FLD_MISSION_ID)?.unwrap_or(0);
    let game_type = info.read_int32_field(mem, FLD_GAME_TYPE)?.unwrap_or(0);
    let format_type = info
        .read_int32_field(mem, FLD_FORMAT_TYPE)?
        .unwrap_or(0);

    Ok(Some(MatchInfoResult {
        local_player,
        opposing_player,
        mission_id,
        game_type,
        format_type,
    }))
}
