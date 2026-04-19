use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::remote_ptr::RemotePtr;
use std::collections::HashMap;

/// Resolved class info from probing the running process.
#[derive(Debug, Clone)]
pub struct MonoClassRef {
    /// Full name "Namespace.Name"
    pub full_name: String,
    /// MonoClass* in the target process
    pub addr: RemotePtr,
    /// Static field data area pointer (s_instance and other statics live here)
    pub static_field_data: RemotePtr,
    /// Field name → byte offset within instance (after vtable header)
    pub fields: HashMap<String, u32>,
}

impl MonoRuntime {
    /// Find a class by full name. Returns its MonoClassRef.
    ///
    /// For Phase G, this is implemented as a STUB returning ClassNotFound.
    /// Each reflection method will short-circuit and return None.
    pub fn find_class(&self, namespace: &str, name: &str) -> Result<MonoClassRef, ScryError> {
        let _ = (namespace, name);
        Err(ScryError::ClassNotFound {
            name: format!("{}.{} (Phase G full impl pending)", namespace, name),
        })
    }
}
