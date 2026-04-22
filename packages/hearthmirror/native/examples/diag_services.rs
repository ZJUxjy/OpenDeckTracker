//! List every registered IService in
//! `Blizzard.T5.Services.ServiceManager.s_runtimeServices.m_services`,
//! printing the `<ServiceTypeName>` plus the runtime type of the
//! `<Service>` instance so we can map "what service holds X data" without
//! grepping the Hearthstone DLLs.
//!
//! Usage:
//!   cargo run --release --example diag_services

use hearthmirror_native::collections::dict::{iter_entries, read_entry_value_ptr};
use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::object::MonoObject;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::reflection::field_paths::*;

const MAX_SERVICES: usize = 1024;

fn main() -> Result<(), ScryError> {
    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;
    let class_off = &rt.offsets.structs.class;
    let object_off = &rt.offsets.structs.object;
    let vtable_off = &rt.offsets.structs.vtable;

    let sm = rt.find_class_in_image(SVC_LOCATOR_DLL, CLS_SERVICE_MANAGER.0, CLS_SERVICE_MANAGER.1)?;
    let Some(&sr_off) = sm.fields.get(FLD_S_RUNTIME_SERVICES) else {
        eprintln!("ServiceManager.s_runtimeServices field missing");
        std::process::exit(2);
    };
    let locator_ptr = mem.read_remote_ptr(sm.static_field_data + sr_off)?;
    let Some(locator) = MonoObject::from_address(mem, locator_ptr, rt.offsets.clone())? else {
        eprintln!("s_runtimeServices NULL");
        std::process::exit(2);
    };
    let Some(dict_ptr) = locator.read_pointer_field(mem, FLD_M_SERVICES)? else {
        eprintln!("ServiceLocator.m_services NULL");
        std::process::exit(2);
    };

    let entries = iter_entries(mem, dict_ptr, 16, MAX_SERVICES)?;
    println!("Registered services: {}", entries.len());

    for entry in entries {
        let info_ptr = read_entry_value_ptr(mem, entry)?;
        let Some(info) = MonoObject::from_address(mem, info_ptr, rt.offsets.clone())? else {
            continue;
        };
        let svc_name = info
            .read_string_field(mem, FLD_SERVICE_TYPE_NAME)?
            .unwrap_or_else(|| "<no name>".into());
        let svc_inst = info.read_object_field(mem, FLD_SERVICE)?;
        let inst_type = match svc_inst {
            None => "<null>".to_string(),
            Some(o) => {
                let vt = mem.read_remote_ptr(o.addr + object_off.vtable)?;
                let kl = mem.read_remote_ptr(vt + vtable_off.klass)?;
                let np = mem.read_remote_ptr(kl + class_off.name)?;
                let nsp = mem.read_remote_ptr(kl + class_off.name_space)?;
                let n = if np.is_null() {
                    String::new()
                } else {
                    mem.read_cstring(np, 256)?
                };
                let ns = if nsp.is_null() {
                    String::new()
                } else {
                    mem.read_cstring(nsp, 256)?
                };
                if ns.is_empty() {
                    n
                } else {
                    format!("{}.{}", ns, n)
                }
            }
        };
        println!("  {:50}  →  {}", svc_name, inst_type);
    }

    Ok(())
}
