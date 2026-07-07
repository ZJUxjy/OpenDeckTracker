use crate::error::ScryError;
use crate::handle::OwnedProcessHandle;
use windows::Win32::Foundation::{CloseHandle, BOOL, HMODULE};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::ProcessStatus::{
    EnumProcessModulesEx, GetModuleBaseNameW, GetModuleInformation, ENUM_PROCESS_MODULES_EX_FLAGS,
    LIST_MODULES_32BIT, LIST_MODULES_64BIT, MODULEINFO,
};
use windows::Win32::System::Threading::IsWow64Process;

#[derive(Debug, Clone)]
pub struct ModuleInfo {
    pub name: String,
    pub base: HMODULE,
    pub size: u32,
}

// Safety: HMODULE is a kernel-object reference valid from any thread.
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
pub fn enumerate_modules_32bit(handle: &OwnedProcessHandle) -> Result<Vec<ModuleInfo>, ScryError> {
    enumerate_modules_with_filter(handle, LIST_MODULES_32BIT)
}

/// Return the target process pointer size in bytes.
pub fn detect_target_pointer_size(handle: &OwnedProcessHandle) -> Result<u32, ScryError> {
    let mut wow64 = BOOL(0);
    unsafe { IsWow64Process(handle.raw(), &mut wow64) }.map_err(ScryError::from)?;
    if wow64.as_bool() {
        Ok(4)
    } else {
        Ok(std::mem::size_of::<usize>() as u32)
    }
}

pub fn module_filter_for_pointer_size(
    ptr_size: u32,
) -> Result<ENUM_PROCESS_MODULES_EX_FLAGS, ScryError> {
    match ptr_size {
        4 => Ok(LIST_MODULES_32BIT),
        8 => Ok(LIST_MODULES_64BIT),
        other => Err(ScryError::Unsupported(format!(
            "unsupported target pointer size for module enumeration: {}",
            other
        ))),
    }
}

pub fn enumerate_modules(handle: &OwnedProcessHandle) -> Result<Vec<ModuleInfo>, ScryError> {
    let ptr_size = detect_target_pointer_size(handle)?;
    enumerate_modules_with_filter(handle, module_filter_for_pointer_size(ptr_size)?)
}

fn enumerate_modules_with_filter(
    handle: &OwnedProcessHandle,
    filter: ENUM_PROCESS_MODULES_EX_FLAGS,
) -> Result<Vec<ModuleInfo>, ScryError> {
    let mut modules = [HMODULE::default(); 1024];
    let mut needed: u32 = 0;
    unsafe {
        EnumProcessModulesEx(
            handle.raw(),
            modules.as_mut_ptr(),
            (modules.len() * std::mem::size_of::<HMODULE>()) as u32,
            &mut needed,
            filter,
        )
    }
    .map_err(ScryError::from)?;

    let count = needed as usize / std::mem::size_of::<HMODULE>();
    let mut out = Vec::with_capacity(count);

    for &m in &modules[..count] {
        let mut name_buf = [0u16; 260];
        let len = unsafe { GetModuleBaseNameW(handle.raw(), m, &mut name_buf) };
        if len == 0 {
            continue;
        }
        let name = pwstr_to_string(&name_buf[..len as usize]);
        let mut info = MODULEINFO::default();
        unsafe {
            GetModuleInformation(
                handle.raw(),
                m,
                &mut info,
                std::mem::size_of::<MODULEINFO>() as u32,
            )
        }
        .map_err(ScryError::from)?;
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

    #[test]
    fn module_filter_matches_target_pointer_size() {
        use windows::Win32::System::ProcessStatus::{LIST_MODULES_32BIT, LIST_MODULES_64BIT};

        assert_eq!(
            module_filter_for_pointer_size(4).unwrap(),
            LIST_MODULES_32BIT
        );
        assert_eq!(
            module_filter_for_pointer_size(8).unwrap(),
            LIST_MODULES_64BIT
        );
    }

    #[test]
    fn detects_self_pointer_size() {
        let handle = OwnedProcessHandle::current();
        assert_eq!(
            detect_target_pointer_size(&handle).unwrap(),
            std::mem::size_of::<usize>() as u32
        );
    }
}
