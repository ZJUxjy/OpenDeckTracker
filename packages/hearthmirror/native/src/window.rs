//! Hearthstone window-bounds reader. Pure Rust; the napi-rs binding lives
//! in `lib.rs` so this module stays unit-testable in isolation.
//!
//! Locates the Hearthstone window by class name `UnityWndClass` + window
//! title `Hearthstone`, then reads its bounds via `GetWindowRect` and
//! visibility via `IsIconic` / `IsWindowVisible`.

use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetWindowRect, IsIconic, IsWindowVisible,
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

fn to_wide_z(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Locate the Hearthstone window and read its bounds + visibility flags.
/// Returns `None` if no matching window exists (Hearthstone not running,
/// or running pre-window).
pub fn get_hearthstone_window() -> Option<HearthstoneWindow> {
    let class_name = to_wide_z("UnityWndClass");
    let window_name = to_wide_z("Hearthstone");
    // SAFETY: FindWindowW takes nul-terminated UTF-16 strings, which we just
    // built. The returned HWND is either null or a valid window handle that we
    // do not retain past this function.
    let hwnd: HWND = unsafe {
        FindWindowW(
            PCWSTR::from_raw(class_name.as_ptr()),
            PCWSTR::from_raw(window_name.as_ptr()),
        )
        .ok()?
    };
    if hwnd.0.is_null() {
        return None;
    }

    let mut rect = RECT::default();
    // SAFETY: hwnd is a valid window handle from FindWindowW above.
    let rect_result = unsafe { GetWindowRect(hwnd, &mut rect) };
    if rect_result.is_err() {
        return None;
    }

    // SAFETY: hwnd is valid; both functions are read-only.
    let minimized = unsafe { IsIconic(hwnd) }.as_bool();
    let visible = unsafe { IsWindowVisible(hwnd) }.as_bool();

    Some(HearthstoneWindow {
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
        minimized,
        visible,
    })
}
