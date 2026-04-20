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
        resolve_service_manager_class(|| image.find_class(SERVICE_MANAGER_CLASS))
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
            if let Some(service) = matching_service_for_name(
                name,
                resolve_service_type_name(|| read_service_type_name(&info)),
                || resolve_service_instance(|| read_service(&info)),
            )? {
                return Ok(Some(service));
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
            if let Some(service) = service_entry_for_listing(
                resolve_service_type_name(|| read_service_type_name(&info)),
                || resolve_service_instance(|| read_service(&info)),
            )? {
                services.push(service);
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
    read_with_backing_fallback(direct, backing, |field| info.read_field_string(field))
}

fn read_service(info: &MonoObject<'_>) -> Result<RemotePtr, ScryError> {
    let [direct, backing] = candidate_field_names("Service");
    read_with_backing_fallback(direct, backing, |field| info.read_field_ptr(field))
}

fn read_with_backing_fallback<T>(
    direct: &str,
    backing: &str,
    mut read_field: impl FnMut(&str) -> Result<T, ScryError>,
) -> Result<T, ScryError> {
    match read_field(direct) {
        Ok(value) => Ok(value),
        Err(ScryError::FieldNotFound { .. }) if backing != direct => read_field(backing),
        Err(err) => Err(err),
    }
}

fn resolve_service_manager_class(
    mut find_class: impl FnMut() -> Result<RemotePtr, ScryError>,
) -> Result<Option<RemotePtr>, ScryError> {
    match find_class() {
        Ok(value) => Ok(Some(value)),
        Err(ScryError::ClassNotFound { .. }) => Ok(None),
        Err(err) => Err(err),
    }
}

fn resolve_service_type_name(
    mut read_type_name: impl FnMut() -> Result<String, ScryError>,
) -> Result<Option<String>, ScryError> {
    match read_type_name() {
        Ok(value) => Ok(Some(value)),
        Err(ScryError::FieldNotFound { .. }) => Ok(None),
        Err(err) => Err(err),
    }
}

fn resolve_service_instance(
    mut read_service: impl FnMut() -> Result<RemotePtr, ScryError>,
) -> Result<Option<RemotePtr>, ScryError> {
    match read_service() {
        Ok(value) => Ok(Some(value)),
        Err(ScryError::FieldNotFound { .. }) => Ok(None),
        Err(err) => Err(err),
    }
}

fn matching_service_for_name(
    requested_name: &str,
    service_type_name: Result<Option<String>, ScryError>,
    mut read_service: impl FnMut() -> Result<Option<RemotePtr>, ScryError>,
) -> Result<Option<RemotePtr>, ScryError> {
    let Some(type_name) = service_type_name? else {
        return Ok(None);
    };
    if type_name != requested_name {
        return Ok(None);
    }
    read_service()
}

fn service_entry_for_listing(
    service_type_name: Result<Option<String>, ScryError>,
    mut read_service: impl FnMut() -> Result<Option<RemotePtr>, ScryError>,
) -> Result<Option<(String, RemotePtr)>, ScryError> {
    let Some(type_name) = service_type_name? else {
        return Ok(None);
    };
    if type_name.is_empty() {
        return Ok(None);
    }
    Ok(Some((
        type_name,
        read_service()?.unwrap_or(RemotePtr::NULL),
    )))
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

    #[test]
    fn backing_field_fallback_reads_backing_field_when_direct_field_is_missing() {
        let value =
            read_with_backing_fallback(
                "Service",
                "<Service>k__BackingField",
                |field| match field {
                    "Service" => Err(ScryError::FieldNotFound {
                        class: "ServiceInfo".into(),
                        field: field.into(),
                    }),
                    "<Service>k__BackingField" => Ok(RemotePtr::new(0x2000)),
                    _ => unreachable!(),
                },
            )
            .unwrap();

        assert_eq!(value, RemotePtr::new(0x2000));
    }

    #[test]
    fn backing_field_fallback_propagates_non_field_not_found_errors() {
        let err = read_with_backing_fallback(
            "ServiceTypeName",
            "<ServiceTypeName>k__BackingField",
            |field| match field {
                "ServiceTypeName" => Err(ScryError::MemoryAccess {
                    addr: 0x1234,
                    reason: format!("failed to read {field}"),
                }),
                _ => Ok(String::new()),
            },
        )
        .expect_err("unexpected read failures should not use the backing-field fallback");

        assert!(matches!(err, ScryError::MemoryAccess { addr: 0x1234, .. }));
    }

    #[test]
    fn missing_service_manager_class_is_treated_as_absent() {
        let class = resolve_service_manager_class(|| {
            Err(ScryError::ClassNotFound {
                name: SERVICE_MANAGER_CLASS.into(),
            })
        })
        .unwrap();

        assert_eq!(class, None);
    }

    #[test]
    fn service_manager_class_propagates_non_class_lookup_errors() {
        let err = resolve_service_manager_class(|| {
            Err(ScryError::MemoryAccess {
                addr: 0x1234,
                reason: "service manager class lookup failed".into(),
            })
        })
        .expect_err("unexpected lookup failures should not be suppressed");

        assert!(matches!(err, ScryError::MemoryAccess { addr: 0x1234, .. }));
    }

    #[test]
    fn get_service_skips_entries_without_service_type_name() {
        let type_name = matching_service_for_name(
            "NetCache",
            resolve_service_type_name(|| {
                Err(ScryError::FieldNotFound {
                    class: "ServiceInfo".into(),
                    field: "ServiceTypeName".into(),
                })
            }),
            || unreachable!("skipped entries should not read the service pointer"),
        )
        .unwrap();

        assert_eq!(type_name, None);
    }

    #[test]
    fn get_service_propagates_non_field_service_type_errors() {
        let err = matching_service_for_name(
            "NetCache",
            resolve_service_type_name(|| {
                Err(ScryError::MemoryAccess {
                    addr: 0x5678,
                    reason: "service info read failed".into(),
                })
            }),
            || Ok(Some(RemotePtr::new(0x2222))),
        )
        .expect_err("runtime or layout errors should not be suppressed");

        assert!(matches!(err, ScryError::MemoryAccess { addr: 0x5678, .. }));
    }

    #[test]
    fn get_service_returns_none_when_matching_entry_has_no_service_field() {
        let service = matching_service_for_name("NetCache", Ok(Some("NetCache".into())), || {
            resolve_service_instance(|| {
                Err(ScryError::FieldNotFound {
                    class: "ServiceInfo".into(),
                    field: "Service".into(),
                })
            })
        })
        .unwrap();

        assert_eq!(service, None);
    }

    #[test]
    fn get_service_propagates_non_field_service_errors() {
        let err = matching_service_for_name("NetCache", Ok(Some("NetCache".into())), || {
            resolve_service_instance(|| {
                Err(ScryError::MemoryAccess {
                    addr: 0x9ABC,
                    reason: "service pointer read failed".into(),
                })
            })
        })
        .expect_err("matched service reads should propagate non-not-found errors");

        assert!(matches!(err, ScryError::MemoryAccess { addr: 0x9ABC, .. }));
    }

    #[test]
    fn list_services_propagates_non_field_service_errors() {
        let err = service_entry_for_listing(Ok(Some("GameMgr".into())), || {
            resolve_service_instance(|| {
                Err(ScryError::MemoryAccess {
                    addr: 0xABCD,
                    reason: "service pointer read failed".into(),
                })
            })
        })
        .expect_err("runtime or layout errors should not be suppressed");

        assert!(matches!(err, ScryError::MemoryAccess { addr: 0xABCD, .. }));
    }

    #[test]
    fn list_services_skips_empty_service_type_names() {
        let service = service_entry_for_listing(Ok(Some(String::new())), || {
            unreachable!("empty names should be skipped before reading the service")
        })
        .unwrap();

        assert_eq!(service, None);
    }

    #[test]
    fn list_services_keeps_missing_service_fields_as_null_entries() {
        let service = service_entry_for_listing(Ok(Some("GameMgr".into())), || Ok(None)).unwrap();

        assert_eq!(service, Some(("GameMgr".into(), RemotePtr::NULL)));
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
