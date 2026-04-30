//! Diagnostic: list every top-level window's title, class name, and owning
//! process. Helps debug why `EnumWindows` does/doesn't find Hearthstone.

use windows::Win32::Foundation::{BOOL, CloseHandle, HWND, LPARAM, MAX_PATH};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsWindowVisible,
};

fn read_class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    let len = unsafe { GetClassNameW(hwnd, &mut buf) };
    if len <= 0 { String::new() } else { String::from_utf16_lossy(&buf[..len as usize]) }
}

fn read_window_text(hwnd: HWND) -> String {
    let len = unsafe { GetWindowTextLengthW(hwnd) };
    if len <= 0 { return String::new(); }
    let mut buf = vec![0u16; (len + 1) as usize];
    let written = unsafe { GetWindowTextW(hwnd, &mut buf) };
    if written <= 0 { String::new() } else { String::from_utf16_lossy(&buf[..written as usize]) }
}

fn read_process_name(hwnd: HWND) -> (u32, String) {
    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if pid == 0 { return (0, String::new()); }
    let handle = match unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) } {
        Ok(h) => h,
        Err(_) => return (pid, String::from("<no-access>")),
    };
    let mut buf = [0u16; MAX_PATH as usize];
    let mut size = buf.len() as u32;
    let r = unsafe {
        QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), windows::core::PWSTR(buf.as_mut_ptr()), &mut size)
    };
    let _ = unsafe { CloseHandle(handle) };
    let name = if r.is_err() || size == 0 {
        String::from("<unknown>")
    } else {
        let full = String::from_utf16_lossy(&buf[..size as usize]);
        full.rsplit(['\\', '/']).next().unwrap_or(&full).to_owned()
    };
    (pid, name)
}

extern "system" fn enum_proc(hwnd: HWND, _lparam: LPARAM) -> BOOL {
    let class = read_class_name(hwnd);
    let title = read_window_text(hwnd);
    let (pid, proc_name) = read_process_name(hwnd);
    let visible = unsafe { IsWindowVisible(hwnd) }.as_bool();

    let interesting = class.to_lowercase().contains("unity")
        || proc_name.to_lowercase().contains("hearth")
        || title.contains("炉石")
        || title.to_lowercase().contains("hearth");

    if interesting {
        println!(
            "hwnd={:?} pid={} proc={:?} class={:?} title={:?} visible={}",
            hwnd.0, pid, proc_name, class, title, visible
        );
    }
    BOOL(1)
}

fn main() {
    println!("Top-level windows with Unity-class OR Hearthstone process/title:\n");
    let _ = unsafe { EnumWindows(Some(enum_proc), LPARAM(0)) };
}
