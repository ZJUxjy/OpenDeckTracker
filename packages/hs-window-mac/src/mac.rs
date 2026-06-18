//! macOS adapter: read on-screen windows (CGWindowList) and the frontmost
//! app pid (NSWorkspace), then defer to the pure `selection::choose`.
//! All failures degrade to an empty list / unknown pid — never panic.

use core_foundation::array::CFArray;
use core_foundation::base::{CFType, TCFType};
use core_foundation::dictionary::CFDictionary;
use core_foundation::number::CFNumber;
use core_foundation::string::CFString;
use core_graphics::window::{
    kCGNullWindowID, kCGWindowListExcludeDesktopElements, kCGWindowListOptionOnScreenOnly,
    CGWindowListCopyWindowInfo,
};
use objc2_app_kit::NSWorkspace;

use crate::{selection, HearthstoneWindow, WindowInfo};

/// One on-screen window dictionary, keyed/valued as CoreFoundation types.
type WindowDict = CFDictionary<CFString, CFType>;

pub fn get_hearthstone_window() -> Option<HearthstoneWindow> {
    let windows = list_windows();
    let frontmost = frontmost_pid();
    selection::choose(&windows, frontmost)
}

fn frontmost_pid() -> Option<i32> {
    // sharedWorkspace is a process-wide singleton; called on the Electron main
    // thread (the AppKit main thread). Reading the frontmost app and its pid
    // mutates nothing. These objc2 wrappers are safe `fn`s, so no `unsafe`.
    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.frontmostApplication()?;
    Some(app.processIdentifier())
}

fn list_windows() -> Vec<WindowInfo> {
    let options = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
    // SAFETY: option flags are valid; returns a +1 retained CFArray ref or null.
    let array_ref = unsafe { CGWindowListCopyWindowInfo(options, kCGNullWindowID) };
    if array_ref.is_null() {
        return Vec::new();
    }
    // SAFETY: array_ref is a +1 CFArrayRef whose elements are CFDictionaryRef.
    // wrap_under_create_rule takes ownership and releases on drop.
    let array: CFArray<WindowDict> = unsafe { CFArray::wrap_under_create_rule(array_ref) };

    let mut out = Vec::with_capacity(array.len() as usize);
    for dict in array.iter() {
        if let Some(info) = window_info(&dict) {
            out.push(info);
        }
    }
    out
}

fn window_info(dict: &WindowDict) -> Option<WindowInfo> {
    let owner_name = dict_string(dict, "kCGWindowOwnerName")?;
    let layer = dict_i64(dict, "kCGWindowLayer").unwrap_or(0);
    let owner_pid = dict_i64(dict, "kCGWindowOwnerPID")? as i32;
    let bounds = dict_dict(dict, "kCGWindowBounds")?;
    Some(WindowInfo {
        owner_name,
        layer,
        owner_pid,
        x: dict_f64(&bounds, "X")?,
        y: dict_f64(&bounds, "Y")?,
        width: dict_f64(&bounds, "Width")?,
        height: dict_f64(&bounds, "Height")?,
    })
}

fn dict_string(dict: &WindowDict, key: &str) -> Option<String> {
    let value = dict.find(CFString::new(key))?;
    let s = value.downcast::<CFString>()?;
    Some(s.to_string())
}

fn dict_i64(dict: &WindowDict, key: &str) -> Option<i64> {
    let value = dict.find(CFString::new(key))?;
    value.downcast::<CFNumber>()?.to_i64()
}

fn dict_f64(dict: &WindowDict, key: &str) -> Option<f64> {
    let value = dict.find(CFString::new(key))?;
    let num = value.downcast::<CFNumber>()?;
    num.to_f64().or_else(|| num.to_i64().map(|n| n as f64))
}

/// Read a nested CoreFoundation dictionary. `CFType::downcast` only accepts
/// `ConcreteCFType`, which the typed `CFDictionary<CFString, CFType>` is not,
/// so downcast to the untyped dictionary and re-wrap (Get Rule) as typed.
fn dict_dict(dict: &WindowDict, key: &str) -> Option<WindowDict> {
    let value = dict.find(CFString::new(key))?;
    let untyped = value.downcast::<CFDictionary>()?;
    // SAFETY: as_concrete_TypeRef yields the same CFDictionaryRef; re-wrapping
    // under the Get Rule bumps the retain count so both wrappers are balanced.
    Some(unsafe { CFDictionary::wrap_under_get_rule(untyped.as_concrete_TypeRef()) })
}
