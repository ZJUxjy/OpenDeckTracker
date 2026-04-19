use crate::error::ScryError;
use crate::mono::MonoRuntime;
use crate::remote_ptr::RemotePtr;

/// Look up a named service in `Blizzard.T5.Services.ServiceManager.s_runtimeServices`.
///
/// Returns Ok(Some(service_object)) if found, Ok(None) if service not registered
/// (NOT an error per ADR 0001 binding constraint).
pub fn get_service(
    runtime: &MonoRuntime,
    name: &str,
) -> Result<Option<RemotePtr>, ScryError> {
    // ServiceManager.s_runtimeServices is a Dictionary<string, Service>.
    // For Phase F we return Unsupported until we have the full mono::class
    // infrastructure (Phase G needs to look up the class by token, then
    // read the static field, then iterate the dictionary).
    //
    // This is a placeholder that documents the algorithm and lets Phase G
    // proceed with the methods that don't need ServiceLocator (like
    // getBattleTag, getMedalInfo which use the singleton pattern via
    // class.s_instance directly).

    let _ = (runtime, name);
    Err(ScryError::Unsupported(
        "ServiceLocator not yet implemented; needed for some Phase G methods".into(),
    ))
}

#[cfg(test)]
mod tests {
    // Real testing is deferred to Phase G integration when an actual method needs it.
}
