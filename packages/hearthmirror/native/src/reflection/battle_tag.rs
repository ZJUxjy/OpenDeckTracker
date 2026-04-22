//! `getBattleTag` — current player's BattleTag (name + numeric discriminator).
//!
//! ## Chain (R-16 Phase 2, verified live 2026-04-20)
//!
//! ```text
//! BnetPresenceMgr.s_instance       (Assembly-CSharp.dll)
//!   └─ m_myPlayer                   (BnetPlayer)
//!        └─ m_account               (BnetAccount)
//!             └─ m_battleTag        (BnetBattleTag)
//!                  ├─ m_name   : string @ +0x08
//!                  └─ m_number : string @ +0x0C   (e.g. "5630" in `Player#5630`)
//!
//! Both fields are managed `System.String` references — `m_number` is **not**
//! an integer despite the name. BNet discriminators can have leading zeros
//! ("0042") and routinely exceed `i32::MAX` for some account vintages, which
//! is why the Mono representation is a string. Validated live (Spike Run 10).
//! ```
//!
//! ### Why this is **not** in `NetCache` anymore
//!
//! The original hearthmirror reference (PHP/Java HDT) read a `BattleTag`
//! object directly from `NetCache.s_instance.BattleTag`. Modern Hearthstone
//! builds (probed Spike Run 9) carry the player's identity in
//! `BnetPresenceMgr` instead — `NetCache` no longer declares a `BattleTag`
//! field, and its `m_netCache` map carries no `NetCacheBattleTag` value.
//!
//! ### `full_battle_tag` vs `name`
//!
//! `BnetBattleTag` stores `m_name` (the readable handle, e.g. `"Player"`)
//! and `m_number` (the disambiguator integer, e.g. `1234`). The full BNet
//! display is conventionally rendered as `"{name}#{number}"`. We compute that
//! string here so the JS layer doesn't have to special-case the format.
//!
//! Returns `Ok(None)` when `BnetPresenceMgr.s_instance` is not yet allocated
//! (pre-login / shutdown), or when the player has no associated account
//! (e.g. logged out — `m_myPlayer` / `m_account` / `m_battleTag` will be
//! NULL).

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct BattleTagResult {
    pub name: String,
    pub full_battle_tag: String,
}

pub async fn get_battle_tag_internal(
    runtime: &MonoRuntime,
) -> Result<Option<BattleTagResult>, ScryError> {
    let Some(presence) = runtime.get_singleton(CLS_BNET_PRESENCE_MGR.0, CLS_BNET_PRESENCE_MGR.1)?
    else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    let Some(player) = presence.read_object_field(mem, FLD_MY_PLAYER)? else {
        return Ok(None);
    };
    let Some(account) = player.read_object_field(mem, FLD_MY_ACCOUNT)? else {
        return Ok(None);
    };
    let Some(tag) = account.read_object_field(mem, FLD_MY_BATTLE_TAG)? else {
        return Ok(None);
    };

    let name = tag
        .read_string_field(mem, FLD_BATTLE_TAG_NAME)?
        .unwrap_or_default();
    let number = tag
        .read_string_field(mem, FLD_BATTLE_TAG_NUMBER)?
        .unwrap_or_default();

    let full_battle_tag = if name.is_empty() {
        String::new()
    } else if number.is_empty() {
        // Unconfirmed / placeholder discriminator — return just the name to
        // avoid showing "Player#" for accounts that haven't completed the
        // BattleTag-finalization flow.
        name.clone()
    } else {
        format!("{}#{}", name, number)
    };

    Ok(Some(BattleTagResult {
        name,
        full_battle_tag,
    }))
}
