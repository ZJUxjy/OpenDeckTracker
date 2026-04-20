use crate::error::ScryError;
use crate::mono::{MonoObject, MonoRuntime};
use crate::remote_ptr::RemotePtr;
use crate::service_locator::ServiceLocator;

const MULLIGAN_MANAGER_SERVICE: &str = "MulliganManager";

pub async fn is_mulligan_internal(runtime: &MonoRuntime) -> Result<Option<bool>, ScryError> {
    let Some(manager) = ServiceLocator::new(runtime).get_service(MULLIGAN_MANAGER_SERVICE)? else {
        return Ok(None);
    };
    if manager.is_null() {
        return Ok(None);
    }

    let object = MonoObject::from_addr(runtime, manager)?;
    match object.read_field_ptr("mulliganChooseBanner") {
        Ok(value) => Ok(Some(nonzero_ptr_is_true(value))),
        Err(ScryError::FieldNotFound { .. }) => Ok(None),
        Err(err) => Err(err),
    }
}

fn nonzero_ptr_is_true(value: RemotePtr) -> bool {
    !value.is_null()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOURCE: &str = include_str!("mulligan.rs");

    fn is_mulligan_internal_source() -> &'static str {
        let start = SOURCE
            .find("pub async fn is_mulligan_internal")
            .expect("is_mulligan_internal should exist");
        let end = SOURCE[start..]
            .find("\nfn nonzero_ptr_is_true")
            .map(|offset| start + offset)
            .expect("nonzero_ptr_is_true should follow is_mulligan_internal");
        &SOURCE[start..end]
    }

    #[test]
    fn nonzero_ptr_is_true_for_non_null_pointer() {
        assert!(nonzero_ptr_is_true(RemotePtr::new(0x1000)));
    }

    #[test]
    fn nonzero_ptr_is_true_for_null_pointer_is_false() {
        assert!(!nonzero_ptr_is_true(RemotePtr::NULL));
    }

    #[test]
    fn mulligan_lookup_uses_service_locator_path() {
        assert!(is_mulligan_internal_source().contains("ServiceLocator::new(runtime).get_service"));
    }

    #[test]
    fn mulligan_lookup_does_not_use_singleton_shortcut() {
        assert!(!is_mulligan_internal_source().contains("\"s_instance\""));
    }

    #[test]
    fn mulligan_lookup_treats_null_service_instance_as_unavailable() {
        assert!(is_mulligan_internal_source().contains("if manager.is_null()"));
    }

    #[test]
    fn mulligan_lookup_treats_missing_banner_field_as_unavailable() {
        assert!(is_mulligan_internal_source().contains("Err(ScryError::FieldNotFound { .. }) => Ok(None)"));
    }
}

#[cfg(all(test, feature = "integration"))]
mod integration_tests {
    use super::*;

    #[test]
    #[ignore = "requires a live Hearthstone runtime during mulligan"]
    fn is_mulligan_can_return_true_live() -> Result<(), ScryError> {
        let runtime = match MonoRuntime::init() {
            Ok(runtime) => runtime,
            Err(ScryError::ProcessNotFound(_)) => return Ok(()),
            Err(err) => return Err(err),
        };

        assert_eq!(futures::executor::block_on(is_mulligan_internal(&runtime))?, Some(true));
        Ok(())
    }
}
