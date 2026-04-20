use crate::collections::dict;
use crate::error::ScryError;
use crate::mono::{vtable, MonoClass, MonoImage, MonoObject, MonoRuntime};
use crate::remote_ptr::RemotePtr;

const SERVICE_LOCATOR_IMAGE: &str = "Blizzard.T5.ServiceLocator";
const SERVICE_MANAGER_CLASS: &str = "Blizzard.T5.Services.ServiceManager";
const MAX_SERVICE_ENTRIES: usize = 4096;

pub struct ServiceLocator<'rt> {
    runtime: &'rt MonoRuntime,
}

impl<'rt> ServiceLocator<'rt> {
    pub fn new(runtime: &'rt MonoRuntime) -> Self {
        Self { runtime }
    }

    fn service_manager_class(&self) -> Result<Option<RemotePtr>, ScryError> {
        let image_addr = match self.runtime.find_image(SERVICE_LOCATOR_IMAGE) {
            Ok(addr) => addr,
            Err(ScryError::ImageNotFound { .. }) => return Ok(None),
            Err(err) => return Err(err),
        };
        let image = MonoImage::new(self.runtime, image_addr);
        Ok(image.find_class(SERVICE_MANAGER_CLASS).ok())
    }

    pub fn locator_addr(&self) -> Result<Option<RemotePtr>, ScryError> {
        let Some(service_manager_class) = self.service_manager_class()? else {
            return Ok(None);
        };

        let static_data = vtable::static_field_data(self.runtime, service_manager_class)?;
        if static_data.is_null() {
            return Ok(None);
        }

        let class = MonoClass::new(self.runtime, service_manager_class);
        let runtime_services = match class.find_field("s_runtimeServices") {
            Ok(field) => self
                .runtime
                .memory
                .read_remote_ptr(static_data + field.offset)?,
            Err(ScryError::FieldNotFound { .. }) => RemotePtr::NULL,
            Err(err) => return Err(err),
        };
        if !runtime_services.is_null() {
            return Ok(Some(runtime_services));
        }

        let dynamic_service_locator = match class.find_field("s_dynamicServices") {
            Ok(field) => {
                let dynamic_services = self
                    .runtime
                    .memory
                    .read_remote_ptr(static_data + field.offset)?;
                if dynamic_services.is_null() {
                    RemotePtr::NULL
                } else {
                    MonoObject::from_addr(self.runtime, dynamic_services)?
                        .read_field_ptr("m_serviceLocator")?
                }
            }
            Err(ScryError::FieldNotFound { .. }) => RemotePtr::NULL,
            Err(err) => return Err(err),
        };

        Ok(resolve_locator_addr(
            runtime_services,
            dynamic_service_locator,
        ))
    }

    pub fn get_service(&self, name: &str) -> Result<Option<RemotePtr>, ScryError> {
        let Some(locator) = self.locator_addr()? else {
            return Ok(None);
        };
        let locator = MonoObject::from_addr(self.runtime, locator)?;
        let services_dict = locator.read_field_ptr("m_services")?;
        if services_dict.is_null() {
            return Ok(None);
        }

        let entry_layout = dict::reference_pair_layout(self.runtime.offsets.ptr_size)?;
        for entry in dict::iter_entries(
            &self.runtime.memory,
            &self.runtime.offsets,
            services_dict,
            entry_layout.entry_size,
            MAX_SERVICE_ENTRIES,
        )? {
            let service_info = self
                .runtime
                .memory
                .read_remote_ptr(entry.addr + entry_layout.value_offset)?;
            if service_info.is_null() {
                continue;
            }

            let info = MonoObject::from_addr(self.runtime, service_info)?;
            let type_name = read_service_type_name(&info).unwrap_or_default();
            if type_name == name {
                return Ok(Some(read_service(&info)?));
            }
        }
        Ok(None)
    }

    pub fn list_services(&self) -> Result<Vec<(String, RemotePtr)>, ScryError> {
        let Some(locator) = self.locator_addr()? else {
            return Ok(Vec::new());
        };
        let locator = MonoObject::from_addr(self.runtime, locator)?;
        let services_dict = locator.read_field_ptr("m_services")?;
        if services_dict.is_null() {
            return Ok(Vec::new());
        }

        let entry_layout = dict::reference_pair_layout(self.runtime.offsets.ptr_size)?;
        let mut services = Vec::new();
        for entry in dict::iter_entries(
            &self.runtime.memory,
            &self.runtime.offsets,
            services_dict,
            entry_layout.entry_size,
            MAX_SERVICE_ENTRIES,
        )? {
            let service_info = self
                .runtime
                .memory
                .read_remote_ptr(entry.addr + entry_layout.value_offset)?;
            if service_info.is_null() {
                continue;
            }

            let info = MonoObject::from_addr(self.runtime, service_info)?;
            let type_name = read_service_type_name(&info).unwrap_or_default();
            let service = read_service(&info).unwrap_or(RemotePtr::NULL);
            if !type_name.is_empty() {
                services.push((type_name, service));
            }
        }
        Ok(services)
    }
}

/// Look up a named service in `Blizzard.T5.Services.ServiceManager.s_runtimeServices`.
///
/// Returns Ok(Some(service_object)) if found, Ok(None) if service not registered
/// (NOT an error per ADR 0001 binding constraint).
pub fn get_service(runtime: &MonoRuntime, name: &str) -> Result<Option<RemotePtr>, ScryError> {
    ServiceLocator::new(runtime).get_service(name)
}

pub(crate) fn resolve_locator_addr(
    runtime_services: RemotePtr,
    dynamic_service_locator: RemotePtr,
) -> Option<RemotePtr> {
    (!runtime_services.is_null())
        .then_some(runtime_services)
        .or_else(|| (!dynamic_service_locator.is_null()).then_some(dynamic_service_locator))
}

pub(crate) fn candidate_field_names(field: &'static str) -> [&'static str; 2] {
    match field {
        "Service" => ["Service", "<Service>k__BackingField"],
        "ServiceTypeName" => ["ServiceTypeName", "<ServiceTypeName>k__BackingField"],
        _ => [field, field],
    }
}

fn read_service_type_name(info: &MonoObject<'_>) -> Result<String, ScryError> {
    let [direct, backing] = candidate_field_names("ServiceTypeName");
    info.read_field_string(direct)
        .or_else(|_| info.read_field_string(backing))
}

fn read_service(info: &MonoObject<'_>) -> Result<RemotePtr, ScryError> {
    let [direct, backing] = candidate_field_names("Service");
    info.read_field_ptr(direct)
        .or_else(|_| info.read_field_ptr(backing))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_locator_prefers_runtime_services_when_available() {
        let runtime = RemotePtr::new(0x1000);
        let dynamic = RemotePtr::new(0x2000);
        assert_eq!(resolve_locator_addr(runtime, dynamic), Some(runtime));
    }

    #[test]
    fn candidate_field_names_try_direct_then_backing_field() {
        assert_eq!(
            candidate_field_names("Service"),
            ["Service", "<Service>k__BackingField"]
        );
        assert_eq!(
            candidate_field_names("ServiceTypeName"),
            ["ServiceTypeName", "<ServiceTypeName>k__BackingField"]
        );
    }
}

#[cfg(all(test, feature = "integration"))]
mod integration_tests {
    use super::*;

    #[test]
    #[ignore = "requires a live Hearthstone runtime"]
    fn can_query_well_known_services() -> Result<(), ScryError> {
        let runtime = match MonoRuntime::init() {
            Ok(runtime) => runtime,
            Err(ScryError::ProcessNotFound(_)) => return Ok(()),
            Err(err) => return Err(err),
        };
        let locator = ServiceLocator::new(&runtime);

        for name in ["CollectionManager", "NetCache", "GameMgr"] {
            let resolved = locator.get_service(name)?;
            assert!(
                matches!(resolved, Some(addr) if !addr.is_null()),
                "{name} should resolve via get_service()"
            );
        }

        Ok(())
    }
}
