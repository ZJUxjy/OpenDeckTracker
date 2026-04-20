use crate::error::ScryError;
use crate::mono::{vtable, MonoClass, MonoImage, MonoObject, MonoRuntime};
use crate::remote_ptr::RemotePtr;

const ASSEMBLY_CSHARP_IMAGE: &str = "Assembly-CSharp";

pub async fn is_mulligan_internal(runtime: &MonoRuntime) -> Result<Option<bool>, ScryError> {
    read_singleton_bool_field(
        runtime,
        "MulliganManager",
        "s_instance",
        "mulliganChooseBanner",
        BoolFromPtr::Nonzero,
    )
}

enum BoolFromPtr {
    Nonzero,
}

fn read_singleton_bool_field(
    runtime: &MonoRuntime,
    class_name: &str,
    static_field_name: &str,
    instance_field_name: &str,
    bool_from_ptr: BoolFromPtr,
) -> Result<Option<bool>, ScryError> {
    let image_addr = match runtime.find_image(ASSEMBLY_CSHARP_IMAGE) {
        Ok(addr) => addr,
        Err(ScryError::ImageNotFound { .. }) => return Ok(None),
        Err(err) => return Err(err),
    };
    let image = MonoImage::new(runtime, image_addr);
    let class_addr = match image.find_class(class_name) {
        Ok(addr) => addr,
        Err(ScryError::ClassNotFound { .. }) => return Ok(None),
        Err(err) => return Err(err),
    };
    let Some(static_data) = vtable::try_static_field_data(runtime, class_addr)? else {
        return Ok(None);
    };

    let class = MonoClass::new(runtime, class_addr);
    let static_field = match class.find_field(static_field_name) {
        Ok(field) => field,
        Err(ScryError::FieldNotFound { .. }) => return Ok(None),
        Err(err) => return Err(err),
    };
    let instance = runtime.memory.read_remote_ptr(static_data + static_field.offset)?;
    if instance.is_null() {
        return Ok(None);
    }

    let object = MonoObject::from_addr(runtime, instance)?;
    Ok(Some(match bool_from_ptr {
        BoolFromPtr::Nonzero => nonzero_ptr_is_true(object.read_field_ptr(instance_field_name)?),
    }))
}

fn nonzero_ptr_is_true(value: RemotePtr) -> bool {
    !value.is_null()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nonzero_ptr_is_true_for_non_null_pointer() {
        assert!(nonzero_ptr_is_true(RemotePtr::new(0x1000)));
    }

    #[test]
    fn nonzero_ptr_is_true_for_null_pointer_is_false() {
        assert!(!nonzero_ptr_is_true(RemotePtr::NULL));
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
