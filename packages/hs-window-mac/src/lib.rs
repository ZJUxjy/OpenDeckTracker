//! @hdt/hs-window-mac — locate the Hearthstone game window on macOS.
//! Windows-equivalent of the window subset of @hdt/hearthmirror-native.

#![warn(clippy::unwrap_used)]
#![warn(clippy::expect_used)]

mod selection;

use napi_derive::napi;

/// Hearthstone game-window bounds + flags. Shape matches the TS
/// `HearthstoneWindow` consumed by the window tracker. Coordinates are in
/// points (== Electron DIP on macOS); see the design spec.
#[napi(object)]
#[derive(Debug, Clone, PartialEq)]
pub struct HearthstoneWindow {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub minimized: bool,
    pub visible: bool,
    pub foreground: bool,
}

/// One on-screen window as read from the OS, before selection.
#[derive(Debug, Clone, PartialEq)]
pub struct WindowInfo {
    pub owner_name: String,
    pub layer: i64,
    pub owner_pid: i32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

// Body is filled in Task 3 once src/mac.rs exists. Returns None for now so
// the crate compiles and loads on every platform.
#[napi]
pub fn get_hearthstone_window() -> Option<HearthstoneWindow> {
    None
}
