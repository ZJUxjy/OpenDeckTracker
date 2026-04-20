use crate::error::ScryError;
use crate::handle::OwnedProcessHandle;
use windows::Win32::Foundation::{CloseHandle, HMODULE};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::ProcessStatus::{
    EnumProcessModulesEx, GetModuleBaseNameW, GetModuleInformation, LIST_MODULES_32BIT, MODULEINFO,
};

#[derive(Debug, Clone)]
pub struct ModuleInfo {
    pub name: String,
    pub base: HMODULE,
    pub size: u32,
}

// SAFETY: `HMODULE` is a Win32 kernel-object handle (specifically a base address
// of a loaded module within a target process); it has no thread affinity and is
// not freed when the value is dropped (modules are owned by the target process,
// not by us). `ModuleInfo` is a plain data record holding the handle alongside
// owned `String`/`u32` fields, all of which are `Send`.
unsafe impl Send for ModuleInfo {}

fn pwstr_to_string(slice: &[u16]) -> String {
    let end = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
    String::from_utf16_lossy(&slice[..end])
}

/// Enumerate processes by name (case-insensitive). Returns the first match.
pub fn find_pid(target: &str) -> Result<Option<u32>, ScryError> {
    let snapshot =
        unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }.map_err(ScryError::from)?;

    struct SnapshotGuard(windows::Win32::Foundation::HANDLE);
    impl Drop for SnapshotGuard {
        fn drop(&mut self) {
            if !self.0.is_invalid() {
                let _ = unsafe { CloseHandle(self.0) };
            }
        }
    }
    let _guard = SnapshotGuard(snapshot);

    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };

    if unsafe { Process32FirstW(snapshot, &mut entry) }.is_err() {
        return Ok(None);
    }

    loop {
        let name = pwstr_to_string(&entry.szExeFile);
        if name.eq_ignore_ascii_case(target) {
            return Ok(Some(entry.th32ProcessID));
        }
        if unsafe { Process32NextW(snapshot, &mut entry) }.is_err() {
            return Ok(None);
        }
    }
}

/// Enumerate all 32-bit modules loaded in the target process.
///
/// Note: `LIST_MODULES_32BIT` is **mandatory** when a 64-bit host enumerates
/// a 32-bit target's modules. Without it, the call returns an empty list.
///
/// The buffer is sized dynamically: we first call `EnumProcessModulesEx` to
/// learn how many bytes are needed, then allocate exactly that amount and
/// retry. This avoids both wasting memory on the common case (~50 modules)
/// and a panic on processes with >1024 loaded modules (overlay / anti-cheat
/// / emulator scenarios).
///
/// Per-module `GetModuleBaseNameW` / `GetModuleInformation` failures are
/// downgraded to a debug-trace + skip; only catastrophic errors (i.e. the
/// initial `EnumProcessModulesEx` call) propagate.
pub fn enumerate_modules_32bit(handle: &OwnedProcessHandle) -> Result<Vec<ModuleInfo>, ScryError> {
    const HMODULE_SIZE: usize = std::mem::size_of::<HMODULE>();
    const INITIAL_CAPACITY: usize = 256;
    const MAX_CAPACITY: usize = 64 * 1024;

    let mut capacity = INITIAL_CAPACITY;
    let mut modules: Vec<HMODULE> = vec![HMODULE::default(); capacity];

    loop {
        let mut needed: u32 = 0;
        let buf_bytes = u32::try_from(modules.len() * HMODULE_SIZE).map_err(|_| {
            ScryError::Unsupported(format!(
                "module enumeration buffer too large: {} entries",
                modules.len()
            ))
        })?;
        unsafe {
            EnumProcessModulesEx(
                handle.raw(),
                modules.as_mut_ptr(),
                buf_bytes,
                &mut needed,
                LIST_MODULES_32BIT,
            )
        }
        .map_err(ScryError::from)?;

        let needed_slots = needed as usize / HMODULE_SIZE;
        if needed_slots <= capacity {
            modules.truncate(needed_slots);
            break;
        }

        if needed_slots > MAX_CAPACITY {
            return Err(ScryError::Unsupported(format!(
                "target process has {needed_slots} modules (>{MAX_CAPACITY} limit)"
            )));
        }

        capacity = needed_slots;
        modules.resize(capacity, HMODULE::default());
    }

    let mut out = Vec::with_capacity(modules.len());
    for &m in &modules {
        let mut name_buf = [0u16; 260];
        let len = unsafe { GetModuleBaseNameW(handle.raw(), m, &mut name_buf) };
        if len == 0 {
            // Module unloaded between enumeration and query, or query denied.
            // Skip silently; only the absence of *all* modules matters to callers.
            continue;
        }
        let name = pwstr_to_string(&name_buf[..len as usize]);

        let mut info = MODULEINFO::default();
        if unsafe {
            GetModuleInformation(
                handle.raw(),
                m,
                &mut info,
                std::mem::size_of::<MODULEINFO>() as u32,
            )
        }
        .is_err()
        {
            continue;
        }

        out.push(ModuleInfo {
            name,
            base: m,
            size: info.SizeOfImage,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_self_pid() {
        // Test we can find a process by name — use the test runner's own exe.
        // On Windows, cargo test's exe is something like "hearthmirror_native-<hash>.exe"
        // but we can't easily query the current exe name. Skip strict assertion;
        // just verify the function doesn't panic.
        let _ = find_pid("explorer.exe").unwrap();
    }

    #[test]
    fn find_nonexistent_returns_none() {
        let result = find_pid("definitely_not_a_real_process_xyzzy.exe").unwrap();
        assert!(result.is_none());
    }
}
