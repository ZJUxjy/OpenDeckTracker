//! `isMulligan` — true if the mulligan choose-banner UI is currently
//! active.
//!
//! ## Chain
//!
//! ```text
//! MulliganManager.s_instance (Assembly-CSharp.dll, has real s_instance)
//!   └─ mulliganChooseBanner   (Unity GameObject pointer)
//!        ├─ non-null pointer  → banner instantiated, mulligan UI active
//!        └─ null pointer       → banner not active
//! ```
//!
//! Returns:
//! * `Some(true)` when `mulliganChooseBanner` is non-null;
//! * `Some(false)` when the field reads NULL;
//! * `None` when `MulliganManager.s_instance` is itself NULL (typical
//!   pre-match / main-menu state).

use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;

#[napi(object)]
pub struct IsMulliganResult {
    pub mulligan: Option<bool>,
}

pub async fn is_mulligan_internal(
    runtime: &MonoRuntime,
) -> Result<IsMulliganResult, ScryError> {
    let Some(instance) =
        runtime.get_singleton(CLS_MULLIGAN_MGR.0, CLS_MULLIGAN_MGR.1)?
    else {
        return Ok(IsMulliganResult { mulligan: None });
    };

    let mem = &runtime.memory;
    // Treat any non-null pointer as "banner present"; we don't
    // dereference it, so the reflector survives even if the GameObject
    // changes shape across game versions.
    let active = instance.read_pointer_field(mem, FLD_MULLIGAN_BANNER)?.is_some();
    Ok(IsMulliganResult {
        mulligan: Some(active),
    })
}
