//! Hearthstone window-bounds reader. Pure Rust; the napi-rs binding lives
//! in `lib.rs` so this module stays unit-testable in isolation.
//!
//! Locates the Hearthstone window by enumerating top-level Unity windows
//! and matching by owning process (`Hearthstone.exe`). Class-name match
//! alone (`UnityWndClass`) is necessary but not sufficient — other Unity
//! apps may be running. Title-name match is locale-dependent (the
//! Chinese client uses 炉石传说), so we cannot key on it.
//!
//! Once the window is located, reads its bounds via `GetWindowRect` and
//! visibility via `IsIconic` / `IsWindowVisible`.

use std::cell::Cell;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{BOOL, CloseHandle, HWND, LPARAM, MAX_PATH, RECT};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowRect, GetWindowThreadProcessId, IsIconic,
    IsWindowVisible,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HearthstoneWindow {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub minimized: bool,
    pub visible: bool,
}

const TARGET_CLASS: &str = "UnityWndClass";
const TARGET_PROCESS: &str = "Hearthstone.exe";

thread_local! {
    static FOUND_HWND: Cell<isize> = const { Cell::new(0) };
}

fn class_name(hwnd: HWND) -> Option<String> {
    let mut buf = [0u16; 256];
    // SAFETY: hwnd from EnumWindows is valid for this callback's duration.
    let len = unsafe { GetClassNameW(hwnd, &mut buf) };
    if len <= 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buf[..len as usize]))
}

fn process_name(hwnd: HWND) -> Option<String> {
    let mut pid: u32 = 0;
    // SAFETY: hwnd is valid; `&mut pid` is non-null.
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if pid == 0 {
        return None;
    }
    // SAFETY: PROCESS_QUERY_LIMITED_INFORMATION grants access for cross-bitness
    // process queries. We close the handle before returning. We use
    // QueryFullProcessImageNameW (not GetModuleBaseNameW) because the latter
    // fails when a 64-bit caller queries a 32-bit target — and Hearthstone
    // is shipped as a 32-bit process.
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut buf = [0u16; MAX_PATH as usize];
    let mut size = buf.len() as u32;
    // SAFETY: handle is owned for this scope; buffer + size pointers are valid.
    let result = unsafe {
        QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), windows::core::PWSTR(buf.as_mut_ptr()), &mut size)
    };
    let _ = unsafe { CloseHandle(handle) };
    if result.is_err() || size == 0 {
        return None;
    }
    let full_path = String::from_utf16_lossy(&buf[..size as usize]);
    // QueryFullProcessImageNameW returns the FULL path (e.g.
    // "C:\\Program Files\\Hearthstone\\Hearthstone.exe"). Take the basename.
    let basename = full_path
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(&full_path)
        .to_owned();
    Some(basename)
}

extern "system" fn enum_proc(hwnd: HWND, _lparam: LPARAM) -> BOOL {
    let class_ok = class_name(hwnd)
        .map(|c| c == TARGET_CLASS)
        .unwrap_or(false);
    if !class_ok {
        return BOOL(1);
    }
    let process_ok = process_name(hwnd)
        .map(|p| p.eq_ignore_ascii_case(TARGET_PROCESS))
        .unwrap_or(false);
    if process_ok {
        FOUND_HWND.with(|cell| cell.set(hwnd.0 as isize));
        return BOOL(0); // stop enumeration
    }
    BOOL(1)
}

fn find_hearthstone_hwnd() -> Option<HWND> {
    FOUND_HWND.with(|cell| cell.set(0));
    // SAFETY: enum_proc has the correct extern "system" signature and uses
    // a thread-local for the result. EnumWindows is safe to call from any
    // thread; the lparam is unused.
    let _ = unsafe { EnumWindows(Some(enum_proc), LPARAM(0)) };
    let raw = FOUND_HWND.with(Cell::get);
    if raw == 0 {
        None
    } else {
        Some(HWND(raw as *mut _))
    }
}

/// Locate the Hearthstone window and read its bounds + visibility flags.
/// Returns `None` if no matching window exists (Hearthstone not running,
/// or running pre-window).
pub fn get_hearthstone_window() -> Option<HearthstoneWindow> {
    let hwnd = find_hearthstone_hwnd()?;

    let mut rect = RECT::default();
    // SAFETY: hwnd was just located; valid for the duration of these reads.
    let rect_result = unsafe { GetWindowRect(hwnd, &mut rect) };
    if rect_result.is_err() {
        return None;
    }

    // SAFETY: hwnd is valid; both functions are read-only.
    let minimized = unsafe { IsIconic(hwnd) }.as_bool();
    let visible = unsafe { IsWindowVisible(hwnd) }.as_bool();

    // Suppress `PCWSTR` "unused" warning from older edits — the import was
    // dropped above. Keep the function pure / no-op here.
    let _ = PCWSTR::null();

    Some(HearthstoneWindow {
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
        minimized,
        visible,
    })
}
