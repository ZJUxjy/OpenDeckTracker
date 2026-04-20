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
    let Some(instance) = runtime.get_singleton(CLS_NET_CACHE.0, CLS_NET_CACHE.1)? else {
        return Ok(None);
    };
    let mem = &runtime.memory;

    // NetCache.s_instance → .m_accountId → .m_hi / .m_lo
    let Some(acct_obj) = instance.read_object_field(mem, FLD_ACCOUNT_ID)? else {
        return Ok(None);
    };
    let hi = acct_obj.read_int64_field(mem, FLD_ACCOUNT_HI)?.unwrap_or(0);
    let lo = acct_obj.read_int64_field(mem, FLD_ACCOUNT_LO)?.unwrap_or(0);

    Ok(Some(AccountIdResult { hi, lo }))
}
