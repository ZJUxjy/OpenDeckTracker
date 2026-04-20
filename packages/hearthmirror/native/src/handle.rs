use crate::error::ScryError;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, PROCESS_ACCESS_RIGHTS, PROCESS_QUERY_INFORMATION,
    PROCESS_VM_READ,
};

/// RAII wrapper for a Win32 process HANDLE.
///
/// Guarantees `CloseHandle` is called exactly once when the value is dropped.
/// Constructed via `OwnedProcessHandle::open(pid)`. Cannot be cloned.
pub struct OwnedProcessHandle {
    handle: HANDLE,
}

impl OwnedProcessHandle {
    const ACCESS: PROCESS_ACCESS_RIGHTS =
        PROCESS_ACCESS_RIGHTS(PROCESS_QUERY_INFORMATION.0 | PROCESS_VM_READ.0);

    /// Open a target process by PID with read + query rights.
    pub fn open(pid: u32) -> Result<Self, ScryError> {
        let handle = unsafe { OpenProcess(Self::ACCESS, false, pid) }.map_err(ScryError::from)?;
        if handle.is_invalid() {
            return Err(ScryError::ProcessNotFound(format!("pid={}", pid)));
        }
        Ok(Self { handle })
    }

    /// Open the *current* process (used by unit tests that read their own memory).
    pub fn current() -> Self {
        let handle = unsafe { GetCurrentProcess() };
        Self { handle }
    }

    pub fn raw(&self) -> HANDLE {
        self.handle
    }
}

// SAFETY: Win32 process HANDLEs are kernel-object references that the Win32 API
// allows to be used from any thread (see Microsoft docs on handle inheritance and
// thread affinity — process handles have no thread affinity). `OwnedProcessHandle`
// owns its handle exclusively (`!Clone`), and `Drop` calls `CloseHandle` exactly
// once. All concurrent `read_*` access is serialised through `&self`-borrows in
// `ProcessMemory`, so there is no aliasing of mutable state across threads.
unsafe impl Send for OwnedProcessHandle {}

impl Drop for OwnedProcessHandle {
    fn drop(&mut self) {
        if !self.handle.is_invalid() {
            // GetCurrentProcess returns a pseudo-handle that doesn't need closing,
            // but CloseHandle on it is a documented no-op (returns success).
            let _ = unsafe { CloseHandle(self.handle) };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_process_handle_is_valid() {
        let h = OwnedProcessHandle::current();
        // GetCurrentProcess() returns a pseudo-handle (INVALID_HANDLE_VALUE = -1).
        // Windows accepts it for all process operations; it is non-null (0).
        assert!(!h.raw().0.is_null());
    }

    #[test]
    fn open_invalid_pid_errors() {
        // PID 0 is the System Idle Process; OpenProcess on it always fails for normal users.
        let result = OwnedProcessHandle::open(0);
        assert!(result.is_err());
    }

    #[test]
    fn drop_does_not_panic_on_current() {
        // Ensures the GetCurrentProcess pseudo-handle path of Drop is safe.
        let _h = OwnedProcessHandle::current();
        // Drop happens at end of scope.
    }
}
