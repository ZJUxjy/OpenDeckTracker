#![deny(unsafe_op_in_unsafe_fn)]

use std::time::Instant;

use napi_derive::napi;
use windows::Win32::Foundation::{CloseHandle, HANDLE, HMODULE};
use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
    TH32CS_SNAPPROCESS,
};
use windows::Win32::System::ProcessStatus::{EnumProcessModulesEx, LIST_MODULES_32BIT};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
};

const TARGET_EXE: &str = "Hearthstone.exe";

#[napi(object)]
pub struct SpikeResult {
    pub pid: u32,
    pub base_address: String,
    pub header_hex: String,
    pub elapsed_micros: u32,
}

fn map_err(e: windows::core::Error) -> napi::Error {
    napi::Error::from_reason(format!(
        "Windows API failed: {} (HRESULT 0x{:08X})",
        e.message(),
        e.code().0
    ))
}

fn pwstr_to_string(slice: &[u16]) -> String {
    let end = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
    String::from_utf16_lossy(&slice[..end])
}

struct HandleGuard(HANDLE);
impl Drop for HandleGuard {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            let _ = unsafe { CloseHandle(self.0) };
        }
    }
}

fn find_pid(target: &str) -> napi::Result<Option<u32>> {
    let snapshot =
        unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }.map_err(map_err)?;
    let _guard = HandleGuard(snapshot);

    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };

    let res = unsafe { Process32FirstW(snapshot, &mut entry) };
    if res.is_err() {
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

fn read_mz(pid: u32) -> napi::Result<SpikeResult> {
    let started = Instant::now();

    let h_process =
        unsafe { OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid) }
            .map_err(map_err)?;
    let _guard = HandleGuard(h_process);

    let mut modules = [HMODULE::default(); 1024];
    let mut needed: u32 = 0;
    unsafe {
        EnumProcessModulesEx(
            h_process,
            modules.as_mut_ptr(),
            (modules.len() * std::mem::size_of::<HMODULE>()) as u32,
            &mut needed,
            LIST_MODULES_32BIT,
        )
    }
    .map_err(map_err)?;

    let count = needed as usize / std::mem::size_of::<HMODULE>();
    if count == 0 {
        return Err(napi::Error::from_reason(
            "EnumProcessModulesEx returned 0 modules (LIST_MODULES_32BIT may not be supported on this system)"
                .to_string(),
        ));
    }

    let base = modules[0];
    let mut buf = [0u8; 16];
    let mut read: usize = 0;
    unsafe {
        ReadProcessMemory(
            h_process,
            base.0 as *const _,
            buf.as_mut_ptr() as *mut _,
            16,
            Some(&mut read),
        )
    }
    .map_err(map_err)?;

    if read != 16 {
        return Err(napi::Error::from_reason(format!(
            "ReadProcessMemory short read: got {} bytes, expected 16",
            read
        )));
    }

    let elapsed = started.elapsed();
    Ok(SpikeResult {
        pid,
        base_address: format!("0x{:08X}", base.0 as usize),
        header_hex: buf
            .iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(" "),
        elapsed_micros: elapsed.as_micros().min(u32::MAX as u128) as u32,
    })
}

#[napi]
pub async fn spike_read_mz() -> napi::Result<SpikeResult> {
    let pid = find_pid(TARGET_EXE)?.ok_or_else(|| {
        napi::Error::from_reason(
            "process not found: Hearthstone.exe is not running".to_string(),
        )
    })?;
    read_mz(pid)
}
