//! `getAccountId` — current player's BattleNet AccountId (high/low ulong pair).
//!
//! ## Chain (R-16 Phase 2, verified live 2026-04-20)
//!
//! ```text
//! BnetPresenceMgr.s_instance       (Assembly-CSharp.dll)
//!   └─ m_myBattleNetAccountId      (BnetAccountId, blizzard.bgsclient.dll)
//!        └─ <EntityId>k__BackingField   (Blizzard.GameService.Protocol.EntityId,
//!                                       blizzard.bgssdk.dll — protobuf-generated)
//!             ├─ high_ : ulong @ +0x10
//!             └─ low_  : ulong @ +0x18
//! ```
//!
//! ### Why this is **not** in `NetCache` anymore
//!
//! The original hearthmirror reference (PHP/Java HDT) read `m_accountId` from
//! a `NetCacheBnetAccountInfo` value held in `NetCache.m_netCacheValues`. Modern
//! Hearthstone builds (probed Spike Run 9) no longer carry that value type in
//! the NetCache map. The authoritative source is now `BnetPresenceMgr.s_instance`,
//! a singleton on `Assembly-CSharp.dll`. See `R-16 Spike Run 10` for the full
//! object-graph walk.
//!
//! ### Why `<EntityId>k__BackingField` is reached via inherited-field walk
//!
//! `BnetAccountId` itself declares **0** instance fields — the backing field
//! lives on its parent `BnetEntityId` (`<EntityId>k__BackingField` @ +0x08).
//! `MonoObject.read_object_field` now falls back to a parent-chain walk via
//! `MonoObject::field_offset → find_field` when the leaf class doesn't carry
//! the field, so this chain Just Works without an explicit cast helper.
//!
//! Returns `Ok(None)` when:
//! * `BnetPresenceMgr` is not yet initialised (no `s_instance` allocated — pre
//!   login or shutdown);
//! * the player has no current BattleNet account (e.g. logged out — both
//!   `m_myBattleNetAccountId` and the inner `EntityId` will read NULL/zero).
//!
//! On success, returns `(hi, lo)` as `i64` (Mono `ulong` raw bits — JS layer
//! must treat them as unsigned when stringifying for display).

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct AccountIdResult {
    pub hi: i64,
    pub lo: i64,
}

pub async fn get_account_id_internal(
    runtime: &MonoRuntime,
) -> Result<Option<AccountIdResult>, ScryError> {
    let Some(presence) = runtime.get_singleton(CLS_BNET_PRESENCE_MGR.0, CLS_BNET_PRESENCE_MGR.1)?
    else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    let Some(account_id) = presence.read_object_field(mem, FLD_MY_BATTLENET_ACCOUNT_ID)? else {
        return Ok(None);
    };

    // <EntityId>k__BackingField is declared on BnetEntityId (parent of
    // BnetAccountId). The MonoObject field-resolver now walks the class
    // hierarchy automatically, so this read picks it up from the parent.
    let Some(entity) = account_id.read_object_field(mem, FLD_ENTITY_ID_BACKING)? else {
        return Ok(None);
    };

    // EntityId is a protobuf-generated class with `high_` and `low_` ulong
    // fields. We read them as i64 (raw bits — JS layer interprets unsigned).
    let hi = entity.read_int64_field(mem, FLD_ENTITY_HIGH)?.unwrap_or(0);
    let lo = entity.read_int64_field(mem, FLD_ENTITY_LOW)?.unwrap_or(0);

    Ok(Some(AccountIdResult { hi, lo }))
}
