//! ServiceLocator chain helper for resolving Hearthstone IService instances
//! that live in `Blizzard.T5.Services.ServiceManager.s_runtimeServices`.
//!
//! Many Hearthstone runtime singletons (`NetCache`, `BnetPresenceMgr`,
//! networking/account-side surface area) are registered into a global
//! `ServiceManager` rather than exposing a `static T s_instance` field of
//! their own. `MonoRuntime::get_singleton` cannot reach them; this module
//! walks the alternative chain.
//!
//! Chain (verified live during change `add-hearthmirror-service-locator`):
//!
//! ```text
//!   Blizzard.T5.ServiceLocator.dll
//!     → Blizzard.T5.Services.ServiceManager (static class)
//!         → s_runtimeServices  (Blizzard.T5.Services.ServiceLocator)
//!             → m_services     (Dictionary<Type, ServiceInfo>)
//!                 → ServiceInfo.<ServiceTypeName>k__BackingField (string == "NetCache")
//!                 → ServiceInfo.<Service>k__BackingField        (NetCache instance)
//! ```
//!
//! See the change's `design.md` D2 for why we match by string name rather
//! than by `RuntimeType` key.

use crate::collections::dict::{iter_entries, read_entry_value_ptr};
use crate::error::ScryError;
use crate::mono::object::MonoObject;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;

/// Cap on the number of services we'll iterate before suspecting memory
/// corruption. The live observed value is 94; 1024 gives ~10× headroom
/// and is small enough that a runaway count immediately surfaces as
/// `CollectionOverflow` rather than reading megabytes of garbage.
const MAX_SERVICES: usize = 1024;

/// Resolve a Hearthstone IService instance by its `Type.Name`.
///
/// Returns `Ok(None)` for any "service not present right now" outcome
/// (ServiceManager class unreachable, `s_runtimeServices` NULL, name
/// not registered, matching `<Service>` field NULL). Returns
/// `Err(ScryError::CollectionOverflow { max })` only when the services
/// Dictionary's `_count` exceeds [`MAX_SERVICES`] — this indicates
/// either memory corruption or an unanticipated layout change rather
/// than a transient state.
pub fn get_service_by_name(
    rt: &MonoRuntime,
    name: &str,
) -> Result<Option<MonoObject>, ScryError> {
    let mem = &rt.memory;

    // Step 1: locate the static ServiceManager class in the
    // ServiceLocator DLL. This is a cross-image lookup; AC-only
    // `find_class` would miss it.
    let sm_class = match rt.find_class_in_image(
        SVC_LOCATOR_DLL,
        CLS_SERVICE_MANAGER.0,
        CLS_SERVICE_MANAGER.1,
    ) {
        Ok(c) => c,
        Err(ScryError::ClassNotFound { .. }) => return Ok(None),
        Err(ScryError::ModuleNotFound(_)) => return Ok(None),
        Err(e) => return Err(e),
    };

    // Step 2: read the ServiceManager.s_runtimeServices static field →
    // ServiceLocator instance.
    let Some(&sr_offset) = sm_class.fields.get(FLD_S_RUNTIME_SERVICES) else {
        // Hearthstone shipped without the field we expect — caller will
        // see this as "service not present"; spike 0003 R-18 catches
        // this kind of drift in follow-up triage.
        return Ok(None);
    };
    if sm_class.static_field_data.is_null() {
        return Ok(None);
    }
    let locator_ptr = mem.read_remote_ptr(sm_class.static_field_data + sr_offset)?;
    let Some(locator) = MonoObject::from_address(mem, locator_ptr, rt.offsets.clone())? else {
        return Ok(None);
    };

    // Step 3: ServiceLocator.m_services → Dictionary<Type, ServiceInfo>.
    let Some(dict_ptr) = locator.read_pointer_field(mem, FLD_M_SERVICES)? else {
        return Ok(None);
    };

    // Step 4: walk the dictionary entries. `entry_size = 16` because for
    // reference-typed K and V the layout is `i32 hash + i32 next +
    // 4-byte key + 4-byte value`.
    let entries = iter_entries(mem, dict_ptr, 16, MAX_SERVICES)?;

    for entry in entries {
        // value pointer = ServiceInfo*.
        let info_ptr = read_entry_value_ptr(mem, entry)?;
        let Some(info) = MonoObject::from_address(mem, info_ptr, rt.offsets.clone())? else {
            continue;
        };
        let svc_name = info
            .read_string_field(mem, FLD_SERVICE_TYPE_NAME)?
            .unwrap_or_default();
        if svc_name != name {
            continue;
        }
        // Match: extract the live IService instance.
        return info.read_object_field(mem, FLD_SERVICE);
    }

    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Sanity-check the field-path constants against the spec — guards
    /// against a typo in `field_paths.rs` reaching shipping code.
    #[test]
    fn field_constants_match_spec() {
        assert_eq!(SVC_LOCATOR_DLL, "Blizzard.T5.ServiceLocator.dll");
        assert_eq!(
            CLS_SERVICE_MANAGER,
            ("Blizzard.T5.Services", "ServiceManager")
        );
        assert_eq!(FLD_S_RUNTIME_SERVICES, "s_runtimeServices");
        assert_eq!(FLD_M_SERVICES, "m_services");
        assert_eq!(
            FLD_SERVICE_TYPE_NAME,
            "<ServiceTypeName>k__BackingField"
        );
        assert_eq!(FLD_SERVICE, "<Service>k__BackingField");
        assert_eq!(SVC_NET_CACHE, "NetCache");
    }
}
