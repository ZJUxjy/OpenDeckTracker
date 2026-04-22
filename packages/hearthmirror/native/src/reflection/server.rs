//! `getServerInfo` — current game-server connection info, walked
//! through the inlined `Network.m_state` (a value-type `NetworkState`
//! struct, not an object pointer).
//!
//! ## Chain
//!
//! ```text
//! ServiceLocator.get_service("Network")     (Network instance)
//!   └─ m_state                               (NetworkState VALUE-TYPE struct, inlined)
//!        └─ <LastGameServerInfo>k__BackingField   (GameServerInfo* — reference type)
//!             ├─ <Address>k__BackingField        : string
//!             ├─ <Port>k__BackingField           : i32
//!             ├─ <GameHandle>k__BackingField     : i32
//!             ├─ <ClientHandle>k__BackingField   : i64
//!             ├─ <Version>k__BackingField        : string
//!             ├─ <SpectatorMode>k__BackingField  : bool
//!             ├─ <Mission>k__BackingField        : i32
//!             ├─ <SpectatorPassword>k__BackingField : string
//!             └─ <AuroraPassword>k__BackingField : string
//! ```
//!
//! ### Why the inline struct walker
//!
//! `NetworkState` is a C# `struct`, not a `class`. Its bytes live
//! INSIDE `Network` at `Network + offsetof(m_state)`. Reading
//! `<LastGameServerInfo>k__BackingField` requires:
//!
//! 1. Finding `Network.m_state`'s offset within `Network` (gives the
//!    struct's start address inside the parent).
//! 2. Finding `<LastGameServerInfo>k__BackingField`'s offset within
//!    `NetworkState` (gives the field's offset inside the struct).
//! 3. Reading a pointer at `network.addr + m_state_off + backing_off`.
//!
//! The `struct_field_addr` private helper below encapsulates that.
//!
//! ### Nested-class name resolution
//!
//! Mono spells nested classes as `OuterClass+InnerStruct`. The
//! implementation tries the qualified name first, falls back to bare
//! `NetworkState` (covers both Hearthstone build styles).

use crate::error::ScryError;
use crate::mono::class::read_mono_class;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use crate::remote_ptr::RemotePtr;
use napi_derive::napi;

#[napi(object)]
pub struct GameServerInfoResult {
    pub address: String,
    pub port: i32,
    pub game_handle: i32,
    pub client_handle: i64,
    pub version: String,
    pub spectator_mode: bool,
    pub mission: i32,
    pub spectator_password: String,
    pub aurora_password: String,
}

pub async fn get_server_info_internal(
    runtime: &MonoRuntime,
) -> Result<Option<GameServerInfoResult>, ScryError> {
    let mem = &runtime.memory;

    let Some(network) = runtime.get_service(SVC_NETWORK)? else {
        return Ok(None);
    };

    // Step 1: m_state offset on Network (the inlined struct's start).
    let Some(&m_state_off) = network.fields.get(FLD_NETWORK_M_STATE) else {
        return Ok(None);
    };

    // Step 2: NetworkState class — try nested spelling first, then bare.
    let state_class = match runtime.find_class("", CLS_NETWORK_STATE_NESTED) {
        Ok(c) => c,
        Err(ScryError::ClassNotFound { .. }) => {
            match runtime.find_class("", CLS_NETWORK_STATE_BARE) {
                Ok(c) => c,
                Err(ScryError::ClassNotFound { .. }) => return Ok(None),
                Err(e) => return Err(e),
            }
        }
        Err(e) => return Err(e),
    };

    // Step 3: <LastGameServerInfo>k__BackingField offset within NetworkState.
    let Some(&info_field_off) = state_class.fields.get(FLD_LAST_GAME_SERVER_INFO) else {
        return Ok(None);
    };

    // Step 4: read the GameServerInfo pointer at the absolute address.
    let info_ptr_addr = network.addr + m_state_off + info_field_off;
    let info_ptr = mem.read_remote_ptr(info_ptr_addr)?;
    if info_ptr.is_null() {
        return Ok(None);
    }

    let Some(info) = crate::mono::object::MonoObject::from_address(
        mem,
        info_ptr,
        runtime.offsets.clone(),
    )?
    else {
        return Ok(None);
    };

    // Resolve <ClientHandle>k__BackingField offset on GameServerInfo
    // for the i64 read (no read_int64_field path through fields map
    // gives us the offset directly, but we already have it cached on
    // the object).
    let client_handle = info
        .read_int64_field(mem, FLD_GS_CLIENT_HANDLE)?
        .unwrap_or(0);

    Ok(Some(GameServerInfoResult {
        address: info
            .read_string_field(mem, FLD_GS_ADDRESS)?
            .unwrap_or_default(),
        port: info.read_int32_field(mem, FLD_GS_PORT)?.unwrap_or(0),
        game_handle: info
            .read_int32_field(mem, FLD_GS_GAME_HANDLE)?
            .unwrap_or(0),
        client_handle,
        version: info
            .read_string_field(mem, FLD_GS_VERSION)?
            .unwrap_or_default(),
        spectator_mode: info
            .read_bool_field(mem, FLD_GS_SPECTATOR_MODE)?
            .unwrap_or(false),
        mission: info.read_int32_field(mem, FLD_GS_MISSION)?.unwrap_or(0),
        spectator_password: info
            .read_string_field(mem, FLD_GS_SPECTATOR_PASSWORD)?
            .unwrap_or_default(),
        aurora_password: info
            .read_string_field(mem, FLD_GS_AURORA_PASSWORD)?
            .unwrap_or_default(),
    }))
}

/// Compute the absolute address of `field_name` on a value-type struct
/// inlined at `host_addr + struct_offset`, by resolving the field's
/// own offset within `struct_class`.
///
/// Currently unused — `get_server_info_internal` inlines the equivalent
/// arithmetic because it needs both the offset AND the class to read
/// the i64 client_handle. Kept for future struct-walking reflectors;
/// promote to `MonoObject::read_inline_struct_field` once a third
/// caller appears (per design D4).
#[allow(dead_code)]
fn struct_field_addr(
    runtime: &MonoRuntime,
    host_addr: RemotePtr,
    struct_offset: u32,
    struct_class_addr: RemotePtr,
    field_name: &str,
) -> Result<RemotePtr, ScryError> {
    let class = read_mono_class(&runtime.memory, struct_class_addr, runtime.offsets.clone())?;
    let f = class.find_field(&runtime.memory, field_name)?.ok_or_else(|| {
        ScryError::FieldNotFound {
            class: class.full_name.clone(),
            field: field_name.into(),
        }
    })?;
    Ok(host_addr + struct_offset + f.offset)
}
