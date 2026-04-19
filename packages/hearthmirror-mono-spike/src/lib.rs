#![deny(unsafe_op_in_unsafe_fn)]

use std::time::Instant;

use napi_derive::napi;
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE, HMODULE};
use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
    TH32CS_SNAPPROCESS,
};
use windows::Win32::System::ProcessStatus::{
    EnumProcessModulesEx, GetModuleBaseNameW, GetModuleInformation, LIST_MODULES_32BIT,
    MODULEINFO,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
};

const TARGET_EXE: &str = "Hearthstone.exe";
const PREFERRED_MONO: &str = "mono-2.0-bdwgc.dll";

#[napi(object)]
pub struct MonoSpikeResult {
    pub pid: u32,
    pub mono_module_name: String,
    pub mono_module_base: String,
    pub mono_module_size: u32,
    pub pe_machine: String,
    pub pe_subsystem: String,
    pub mono_get_root_domain_rva: String,
    pub mono_get_root_domain_va: String,
    pub mono_get_root_domain_first_bytes: String,
    pub global_root_domain_addr: String,
    pub disasm_pattern: String,
    pub root_domain_ptr: String,
    pub domain_assemblies_ptr: String,
    pub loaded_images_ptr: String,
    pub elapsed_micros: u32,
    pub notes: Vec<String>,
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

fn read_bytes(h_process: HANDLE, addr: u32, len: usize) -> napi::Result<Vec<u8>> {
    let mut buf = vec![0u8; len];
    let mut read: usize = 0;
    unsafe {
        ReadProcessMemory(
            h_process,
            addr as *const _,
            buf.as_mut_ptr() as *mut _,
            len,
            Some(&mut read),
        )
    }
    .map_err(map_err)?;
    if read != len {
        return Err(napi::Error::from_reason(format!(
            "ReadProcessMemory short read at 0x{:08X}: got {} of {} bytes",
            addr, read, len
        )));
    }
    Ok(buf)
}

fn read_u32_le(h_process: HANDLE, addr: u32) -> napi::Result<u32> {
    let buf = read_bytes(h_process, addr, 4)?;
    Ok(u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]))
}

fn read_u16_le(h_process: HANDLE, addr: u32) -> napi::Result<u16> {
    let buf = read_bytes(h_process, addr, 2)?;
    Ok(u16::from_le_bytes([buf[0], buf[1]]))
}

fn read_cstring(h_process: HANDLE, addr: u32, max_len: usize) -> napi::Result<String> {
    let buf = read_bytes(h_process, addr, max_len)?;
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    Ok(String::from_utf8_lossy(&buf[..end]).into_owned())
}

/// Step 1: enumerate 32-bit modules and find mono runtime
fn find_mono_module(
    h_process: HANDLE,
    notes: &mut Vec<String>,
) -> napi::Result<(String, HMODULE, MODULEINFO)> {
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
            "EnumProcessModulesEx returned 0 modules".to_string(),
        ));
    }

    let mut exact: Option<(String, HMODULE)> = None;
    let mut candidates: Vec<(String, HMODULE)> = vec![];

    for &m in &modules[..count] {
        let mut name_buf = [0u16; 260];
        let len = unsafe { GetModuleBaseNameW(h_process, m, &mut name_buf) };
        if len == 0 {
            continue;
        }
        let name = pwstr_to_string(&name_buf[..len as usize]);
        let lower = name.to_lowercase();
        if lower == PREFERRED_MONO {
            exact = Some((name, m));
            break;
        }
        if lower.starts_with("mono-") || lower.starts_with("mono.") {
            candidates.push((name, m));
        }
    }

    let chosen = match exact {
        Some(found) => found,
        None => match candidates.len() {
            0 => {
                return Err(napi::Error::from_reason(
                    "mono runtime not found: no module matches 'mono-2.0-bdwgc.dll' or 'mono-*'"
                        .to_string(),
                ));
            }
            1 => {
                let chosen = candidates.remove(0);
                notes.push(format!(
                    "preferred mono-2.0-bdwgc.dll not found; fell back to: {}",
                    chosen.0
                ));
                chosen
            }
            _ => {
                let names: Vec<String> = candidates.iter().map(|(n, _)| n.clone()).collect();
                let chosen = candidates.remove(0);
                notes.push(format!(
                    "multiple mono candidates found ({:?}); chose first: {}",
                    names, chosen.0
                ));
                chosen
            }
        },
    };

    let mut info = MODULEINFO::default();
    unsafe {
        GetModuleInformation(
            h_process,
            chosen.1,
            &mut info,
            std::mem::size_of::<MODULEINFO>() as u32,
        )
    }
    .map_err(map_err)?;

    Ok((chosen.0, chosen.1, info))
}

/// Step 2: read PE Optional Header.
/// Returns (machine, subsystem, export_rva, export_size).
fn read_pe_header(h_process: HANDLE, base: HMODULE) -> napi::Result<(u16, u16, u32, u32)> {
    let base_addr = base.0 as u32;
    let dos = read_bytes(h_process, base_addr, 0x40)?;
    if dos[0] != b'M' || dos[1] != b'Z' {
        return Err(napi::Error::from_reason(format!(
            "PE: bad DOS magic at 0x{:08X}: {:02X} {:02X}",
            base_addr, dos[0], dos[1]
        )));
    }
    let e_lfanew = u32::from_le_bytes([dos[0x3C], dos[0x3D], dos[0x3E], dos[0x3F]]);

    let pe_addr = base_addr + e_lfanew;
    // PE signature (4) + COFF header (20) + Optional header (variable)
    // Read COFF header to learn optional header size first.
    let coff = read_bytes(h_process, pe_addr, 24)?;
    if coff[0..4] != *b"PE\x00\x00" {
        return Err(napi::Error::from_reason("PE: bad NT signature".to_string()));
    }
    let machine = u16::from_le_bytes([coff[4], coff[5]]);
    let opt_size = u16::from_le_bytes([coff[20], coff[21]]);

    let opt_addr = pe_addr + 24;
    let opt = read_bytes(h_process, opt_addr, opt_size as usize)?;
    let magic = u16::from_le_bytes([opt[0], opt[1]]);
    let (subsystem_off, dd_off) = match magic {
        0x010B => (68, 96),  // PE32
        0x020B => (68, 112), // PE32+
        _ => {
            return Err(napi::Error::from_reason(format!(
                "PE: unknown optional magic 0x{:04X}",
                magic
            )))
        }
    };
    if opt.len() < dd_off + 8 {
        return Err(napi::Error::from_reason(
            "PE: optional header too short for data directories".to_string(),
        ));
    }
    let subsystem = u16::from_le_bytes([opt[subsystem_off], opt[subsystem_off + 1]]);
    // Data directory[0] = Export Table
    let export_rva = u32::from_le_bytes([
        opt[dd_off],
        opt[dd_off + 1],
        opt[dd_off + 2],
        opt[dd_off + 3],
    ]);
    let export_size = u32::from_le_bytes([
        opt[dd_off + 4],
        opt[dd_off + 5],
        opt[dd_off + 6],
        opt[dd_off + 7],
    ]);
    Ok((machine, subsystem, export_rva, export_size))
}

/// Step 3: parse the PE export directory and find `name`'s function RVA.
fn find_export_rva(
    h_process: HANDLE,
    base: HMODULE,
    export_rva: u32,
    name: &str,
) -> napi::Result<u32> {
    if export_rva == 0 {
        return Err(napi::Error::from_reason(
            "PE: export directory is missing".to_string(),
        ));
    }
    let base_addr = base.0 as u32;
    let export_dir_addr = base_addr + export_rva;
    // IMAGE_EXPORT_DIRECTORY = 40 bytes
    let dir = read_bytes(h_process, export_dir_addr, 40)?;
    let num_funcs = u32::from_le_bytes([dir[20], dir[21], dir[22], dir[23]]);
    let num_names = u32::from_le_bytes([dir[24], dir[25], dir[26], dir[27]]);
    let address_table_rva = u32::from_le_bytes([dir[28], dir[29], dir[30], dir[31]]);
    let name_pointer_rva = u32::from_le_bytes([dir[32], dir[33], dir[34], dir[35]]);
    let ordinal_table_rva = u32::from_le_bytes([dir[36], dir[37], dir[38], dir[39]]);

    if num_funcs == 0 || num_names == 0 {
        return Err(napi::Error::from_reason(
            "PE: export directory is empty".to_string(),
        ));
    }

    // Read all three tables in bulk
    let name_ptrs = read_bytes(h_process, base_addr + name_pointer_rva, (num_names * 4) as usize)?;
    let ordinals = read_bytes(h_process, base_addr + ordinal_table_rva, (num_names * 2) as usize)?;
    let addresses = read_bytes(h_process, base_addr + address_table_rva, (num_funcs * 4) as usize)?;

    for i in 0..(num_names as usize) {
        let name_rva = u32::from_le_bytes([
            name_ptrs[i * 4],
            name_ptrs[i * 4 + 1],
            name_ptrs[i * 4 + 2],
            name_ptrs[i * 4 + 3],
        ]);
        let s = read_cstring(h_process, base_addr + name_rva, 256)?;
        if s == name {
            let ord = u16::from_le_bytes([ordinals[i * 2], ordinals[i * 2 + 1]]) as usize;
            if ord >= num_funcs as usize {
                return Err(napi::Error::from_reason(format!(
                    "PE: ordinal {} out of range (num_funcs={})",
                    ord, num_funcs
                )));
            }
            let addr = u32::from_le_bytes([
                addresses[ord * 4],
                addresses[ord * 4 + 1],
                addresses[ord * 4 + 2],
                addresses[ord * 4 + 3],
            ]);
            return Ok(addr);
        }
    }
    Err(napi::Error::from_reason(format!(
        "PE: export '{}' not found among {} named exports",
        name, num_names
    )))
}

/// Step 4: byte pattern match to extract global variable address.
fn extract_global_addr(bytes: &[u8]) -> (Option<u32>, &'static str) {
    // Pattern A: A1 [4] C3
    if bytes.len() >= 6 && bytes[0] == 0xA1 && bytes[5] == 0xC3 {
        let addr = u32::from_le_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]);
        return (Some(addr), "A1+ret");
    }
    // Pattern B: 55 89 E5 A1 [4] 5D C3
    if bytes.len() >= 9
        && bytes[0] == 0x55
        && bytes[1] == 0x89
        && bytes[2] == 0xE5
        && bytes[3] == 0xA1
        && bytes[8] == 0xC3
    {
        let addr = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        return (Some(addr), "push ebp/A1/pop ebp/ret");
    }
    (None, "unknown")
}

#[napi]
pub async fn spike_locate_mono() -> napi::Result<MonoSpikeResult> {
    let started = Instant::now();
    let mut notes: Vec<String> = vec![];

    let pid = find_pid(TARGET_EXE)?.ok_or_else(|| {
        napi::Error::from_reason(
            "process not found: Hearthstone.exe is not running".to_string(),
        )
    })?;

    let h_process = unsafe {
        OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid)
    }
    .map_err(map_err)?;
    let _guard = HandleGuard(h_process);

    // Step 1
    let (mono_name, mono_base, mod_info) = find_mono_module(h_process, &mut notes)?;

    // Step 2
    let (machine, subsystem, export_rva, _export_size) = read_pe_header(h_process, mono_base)?;

    // Step 3
    let func_rva = find_export_rva(h_process, mono_base, export_rva, "mono_get_root_domain")?;
    let func_va = mono_base.0 as u32 + func_rva;

    // Read 16 bytes of function code
    let func_bytes = read_bytes(h_process, func_va, 16)?;
    let first_bytes_hex = func_bytes
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ");

    // Step 4-6
    let (global_addr_opt, pattern) = extract_global_addr(&func_bytes);
    let (global_addr_str, root_domain_str, dom_assem_str, loaded_imgs_str) = match global_addr_opt {
        Some(global_addr) => {
            let root_domain = read_u32_le(h_process, global_addr)?;
            if root_domain == 0 {
                notes.push(
                    "root_domain pointer is NULL — Hearthstone may not be fully loaded yet"
                        .to_string(),
                );
                (
                    format!("0x{:08X}", global_addr),
                    "0x00000000".to_string(),
                    "<skipped: root_domain NULL>".to_string(),
                    "<skipped: root_domain NULL>".to_string(),
                )
            } else {
                // §7.2: domain_assemblies @ +0x0C, loaded_images @ +0x14
                let dom_assem = read_u32_le(h_process, root_domain + 0x0C)?;
                let loaded_imgs = read_u32_le(h_process, root_domain + 0x14)?;
                (
                    format!("0x{:08X}", global_addr),
                    format!("0x{:08X}", root_domain),
                    format!("0x{:08X}", dom_assem),
                    format!("0x{:08X}", loaded_imgs),
                )
            }
        }
        None => {
            notes.push(
                "disasm pattern unknown — see firstBytes for offline analysis".to_string(),
            );
            (
                "<skipped: pattern unknown>".to_string(),
                "<skipped: pattern unknown>".to_string(),
                "<skipped: pattern unknown>".to_string(),
                "<skipped: pattern unknown>".to_string(),
            )
        }
    };

    let elapsed = started.elapsed();
    Ok(MonoSpikeResult {
        pid,
        mono_module_name: mono_name,
        mono_module_base: format!("0x{:08X}", mono_base.0 as usize),
        mono_module_size: mod_info.SizeOfImage,
        pe_machine: format!("0x{:04X}", machine),
        pe_subsystem: format!("0x{:04X}", subsystem),
        mono_get_root_domain_rva: format!("0x{:08X}", func_rva),
        mono_get_root_domain_va: format!("0x{:08X}", func_va),
        mono_get_root_domain_first_bytes: first_bytes_hex,
        global_root_domain_addr: global_addr_str,
        disasm_pattern: pattern.to_string(),
        root_domain_ptr: root_domain_str,
        domain_assemblies_ptr: dom_assem_str,
        loaded_images_ptr: loaded_imgs_str,
        elapsed_micros: elapsed.as_micros().min(u32::MAX as u128) as u32,
        notes,
    })
}

// Suppress unused import warning for PWSTR (kept for future use)
#[allow(dead_code)]
fn _pwstr_keepalive() -> Option<PWSTR> {
    None
}
