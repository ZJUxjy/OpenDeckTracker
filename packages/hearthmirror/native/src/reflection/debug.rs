use crate::error::ScryError;
use crate::mono::{MonoClass, MonoImage, MonoRuntime};
use crate::remote_ptr::RemotePtr;
use crate::service_locator::ServiceLocator;
use napi_derive::napi;

const ASSEMBLY_CSHARP_IMAGE: &str = "Assembly-CSharp";

#[napi(object)]
pub struct FieldDumpEntry {
    pub name: String,
    pub offset: u32,
}

#[napi(object)]
pub struct ServiceEntry {
    pub name: String,
    pub addr: u32,
}

pub async fn dump_class_internal(
    runtime: &MonoRuntime,
    class_name: String,
) -> Result<Vec<FieldDumpEntry>, ScryError> {
    let image_addr = match runtime.find_image(ASSEMBLY_CSHARP_IMAGE) {
        Ok(addr) => addr,
        Err(ScryError::ImageNotFound { .. }) => return Ok(Vec::new()),
        Err(err) => return Err(err),
    };
    let image = MonoImage::new(runtime, image_addr);
    let class_addr = match image.find_class(&class_name) {
        Ok(addr) => addr,
        Err(ScryError::ClassNotFound { .. }) => return Ok(Vec::new()),
        Err(err) => return Err(err),
    };

    let class = MonoClass::new(runtime, class_addr);
    let mut fields: Vec<_> = class.fields_recursive()?.into_values().collect();
    fields.sort_by_key(|field| field.offset);
    Ok(field_dump_entries(fields))
}

pub async fn list_services_internal(runtime: &MonoRuntime) -> Result<Vec<ServiceEntry>, ScryError> {
    Ok(service_entries(ServiceLocator::new(runtime).list_services()?))
}

fn field_dump_entries(fields: Vec<crate::mono::MonoFieldDef>) -> Vec<FieldDumpEntry> {
    fields
        .into_iter()
        .map(|field| FieldDumpEntry {
            name: field.name,
            offset: field.offset,
        })
        .collect()
}

fn service_entries(services: Vec<(String, RemotePtr)>) -> Vec<ServiceEntry> {
    services
        .into_iter()
        .map(|(name, addr)| ServiceEntry {
            name,
            addr: addr.raw(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mono::MonoFieldDef;

    #[test]
    fn field_dump_entries_keep_field_names_and_offsets() {
        let entries = field_dump_entries(vec![
            MonoFieldDef {
                name: "health".into(),
                offset: 0x20,
                type_ptr: RemotePtr::NULL,
                owner_class: RemotePtr::NULL,
            },
            MonoFieldDef {
                name: "attack".into(),
                offset: 0x24,
                type_ptr: RemotePtr::NULL,
                owner_class: RemotePtr::NULL,
            },
        ]);

        assert_eq!(entries[0].name, "health");
        assert_eq!(entries[0].offset, 0x20);
        assert_eq!(entries[1].name, "attack");
        assert_eq!(entries[1].offset, 0x24);
    }

    #[test]
    fn service_entries_preserve_service_names_and_addresses() {
        let entries = service_entries(vec![
            ("CollectionManager".into(), RemotePtr::new(0x1000)),
            ("GameMgr".into(), RemotePtr::NULL),
        ]);

        assert_eq!(entries[0].name, "CollectionManager");
        assert_eq!(entries[0].addr, 0x1000);
        assert_eq!(entries[1].name, "GameMgr");
        assert_eq!(entries[1].addr, 0);
    }
}

#[cfg(all(test, feature = "integration"))]
mod integration_tests {
    use super::*;

    #[test]
    #[ignore = "requires a live Hearthstone runtime"]
    fn dump_class_finds_collection_manager_fields_live() -> Result<(), ScryError> {
        let runtime = match MonoRuntime::init() {
            Ok(runtime) => runtime,
            Err(ScryError::ProcessNotFound(_)) => return Ok(()),
            Err(err) => return Err(err),
        };

        let fields = futures::executor::block_on(dump_class_internal(
            &runtime,
            "CollectionManager".to_string(),
        ))?;
        assert!(!fields.is_empty());
        Ok(())
    }

    #[test]
    #[ignore = "requires a live Hearthstone runtime"]
    fn list_services_returns_registered_services_live() -> Result<(), ScryError> {
        let runtime = match MonoRuntime::init() {
            Ok(runtime) => runtime,
            Err(ScryError::ProcessNotFound(_)) => return Ok(()),
            Err(err) => return Err(err),
        };

        let services = futures::executor::block_on(list_services_internal(&runtime))?;
        assert!(!services.is_empty());
        Ok(())
    }
}
