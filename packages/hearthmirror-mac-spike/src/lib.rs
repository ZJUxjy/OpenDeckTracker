//! Throw-away spike crate. See `../README.md` and ADR 0002.
//!
//! Validates three claims on real Apple Silicon hardware:
//!   1. ad-hoc signed napi-rs `darwin-arm64` addon can call
//!      `task_for_pid` + `mach_vm_read_overwrite` against Hearthstone.
//!   2. The resulting `.node` is loadable by Electron 37 / Node 22.
//!   3. `CGWindowListCopyWindowInfo` can read the Hearthstone window
//!      frame from inside the addon, plus a heuristic fullscreen
//!      check (frame ≈ main-display bounds). Real AX-based fullscreen
//!      detection is Phase 1 work (see ADR 0002).
//!
//! All non-mac targets get inert stubs that return Err — the napi
//! surface stays the same so Windows builds (which never load this
//! addon thanks to the darwin-only main-process guard) don't choke
//! during type-checking of `index.d.ts`.

#![deny(unsafe_op_in_unsafe_fn)]
#![allow(clippy::needless_return)]

use napi_derive::napi;

#[napi(object)]
pub struct MachoSpikeResult {
    pub pid: u32,
    pub base_address: String,
    pub header_hex: String,
}

#[napi(object)]
pub struct WindowSpikeResult {
    pub pid: u32,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub fullscreen: bool,
}

// ─── napi entry points ─────────────────────────────────────────────────────

#[napi]
pub async fn spike_read_macho() -> napi::Result<MachoSpikeResult> {
    #[cfg(target_os = "macos")]
    {
        return mac::spike_read_macho_impl();
    }
    #[cfg(not(target_os = "macos"))]
    {
        return Err(napi::Error::from_reason(
            "spike_read_macho is only supported on macOS",
        ));
    }
}

#[napi]
pub async fn spike_read_hearthstone_window() -> napi::Result<WindowSpikeResult> {
    #[cfg(target_os = "macos")]
    {
        return mac::spike_read_window_impl();
    }
    #[cfg(not(target_os = "macos"))]
    {
        return Err(napi::Error::from_reason(
            "spike_read_hearthstone_window is only supported on macOS",
        ));
    }
}

// ─── macOS implementation ──────────────────────────────────────────────────

#[cfg(target_os = "macos")]
mod mac {
    use super::{MachoSpikeResult, WindowSpikeResult};

    use libproc::libproc::proc_pid::{listpids, pidpath, ProcType};
    use mach2::kern_return::{KERN_NO_ACCESS, KERN_SUCCESS};
    use mach2::message::mach_msg_type_number_t;
    use mach2::port::mach_port_t;
    use mach2::task::task_info;
    use mach2::task_info::{task_dyld_info, TASK_DYLD_INFO, TASK_DYLD_INFO_COUNT};
    use mach2::traps::{mach_task_self, task_for_pid};
    use mach2::vm::mach_vm_read_overwrite;
    use mach2::vm_types::{mach_vm_address_t, mach_vm_size_t};

    /// Bytes laid out for `struct dyld_all_image_infos` (apple-oss
    /// `dyld/include/mach-o/dyld_images.h`). Only the first three
    /// fields are needed for spike scope:
    ///   uint32_t version;
    ///   uint32_t infoArrayCount;
    ///   const struct dyld_image_info* infoArray;  // remote ptr (8B)
    /// We deliberately don't deserialize anything past `infoArray`.
    const DYLD_IMAGE_INFOS_INFO_ARRAY_OFFSET: u64 = 8; // 4B version + 4B count
    const DYLD_IMAGE_INFOS_HEADER_SIZE: u64 = 16; // version + count + ptr

    /// `struct dyld_image_info` (the array element):
    ///   const struct mach_header* imageLoadAddress;  // 8B remote ptr
    ///   const char*               imageFilePath;     // 8B remote ptr
    ///   uintptr_t                 imageFileModDate;  // 8B
    const DYLD_IMAGE_INFO_SIZE: u64 = 24;
    const DYLD_IMAGE_INFO_LOAD_ADDR_OFFSET: u64 = 0;
    const DYLD_IMAGE_INFO_PATH_OFFSET: u64 = 8;

    /// PID lookup target. Spike accepts any process whose binary path
    /// has `/MacOS/Hearthstone` in it (covers
    /// `Hearthstone.app/Contents/MacOS/Hearthstone` for both the global
    /// and the CN client).
    const TARGET_BIN_NEEDLE: &str = "/MacOS/Hearthstone";

    use std::ptr;

    pub fn spike_read_macho_impl() -> napi::Result<MachoSpikeResult> {
        let pid = find_hearthstone_pid()?;
        let task = open_task(pid)?;

        let (base_addr, _path) = read_main_image_base(task)?;

        let mut buf = [0u8; 16];
        let mut out_size: mach_vm_size_t = 0;
        // SAFETY: `task` is a live mach port we just acquired; `buf`
        // points to a 16-byte stack buffer; we pass its size correctly.
        let kr = unsafe {
            mach_vm_read_overwrite(
                task,
                base_addr,
                16,
                buf.as_mut_ptr() as mach_vm_address_t,
                &mut out_size,
            )
        };
        if kr != KERN_SUCCESS {
            return Err(napi::Error::from_reason(format!(
                "mach_vm_read_overwrite failed at base 0x{base_addr:016X}: kern_return = {kr}"
            )));
        }
        if out_size != 16 {
            return Err(napi::Error::from_reason(format!(
                "short read at base 0x{base_addr:016X}: got {out_size} bytes, expected 16"
            )));
        }

        Ok(MachoSpikeResult {
            pid,
            base_address: format!("0x{base_addr:016X}"),
            header_hex: buf
                .iter()
                .map(|b| format!("{b:02X}"))
                .collect::<Vec<_>>()
                .join(" "),
        })
    }

    pub fn spike_read_window_impl() -> napi::Result<WindowSpikeResult> {
        let pid = find_hearthstone_pid()?;
        let frame = window::find_hearthstone_window_frame(pid)?;
        let fullscreen = window::looks_fullscreen(&frame);
        Ok(WindowSpikeResult {
            pid,
            x: frame.x,
            y: frame.y,
            width: frame.w,
            height: frame.h,
            fullscreen,
        })
    }

    // ─── PID lookup ────────────────────────────────────────────────

    fn find_hearthstone_pid() -> napi::Result<u32> {
        let pids = listpids(ProcType::ProcAllPIDS)
            .map_err(|e| napi::Error::from_reason(format!("listpids failed: {e}")))?;
        for pid in pids {
            let pid_i32 = pid as i32;
            let Ok(path) = pidpath(pid_i32) else { continue };
            if path.contains(TARGET_BIN_NEEDLE) {
                return Ok(pid);
            }
        }
        Err(napi::Error::from_reason(
            "process not found: Hearthstone is not running".to_string(),
        ))
    }

    // ─── task_for_pid ──────────────────────────────────────────────

    fn open_task(pid: u32) -> napi::Result<mach_port_t> {
        let mut task: mach_port_t = 0;
        // SAFETY: `mach_task_self()` is a stable host primitive and
        // `&mut task` is a valid out-pointer.
        let kr = unsafe { task_for_pid(mach_task_self(), pid as i32, &mut task) };
        if kr != KERN_SUCCESS {
            // KERN_NO_ACCESS (8) is the typical failure when this
            // process is missing `com.apple.security.cs.debugger`
            // (or is unsigned). Surface the kernel return verbatim
            // so the spike report can quote the real symptom.
            let label = if kr == KERN_NO_ACCESS {
                "KERN_NO_ACCESS"
            } else {
                "kern_return"
            };
            return Err(napi::Error::from_reason(format!(
                "task_for_pid failed: {label} = {kr} (signing + com.apple.security.cs.debugger entitlement required)"
            )));
        }
        Ok(task)
    }

    // ─── main image base via TASK_DYLD_INFO ────────────────────────

    fn read_main_image_base(task: mach_port_t) -> napi::Result<(u64, String)> {
        // Step 1: ask the kernel where dyld_all_image_infos lives in
        // the target process address space.
        let mut info = task_dyld_info::default();
        let mut count: mach_msg_type_number_t = TASK_DYLD_INFO_COUNT;
        // SAFETY: `task` is a live mach port; `&mut info`/`&mut count`
        // are valid out-pointers; we declared the matching count.
        let kr = unsafe {
            task_info(
                task,
                TASK_DYLD_INFO,
                &mut info as *mut task_dyld_info as *mut i32,
                &mut count,
            )
        };
        if kr != KERN_SUCCESS {
            return Err(napi::Error::from_reason(format!(
                "task_info(TASK_DYLD_INFO) failed: kern_return = {kr}"
            )));
        }

        // mach2's `task_dyld_info` is `#[repr(C, packed(4))]`; reading
        // a u64 field directly out of a packed struct is a recent
        // rustc lint (`unaligned_references`). Use `read_unaligned`
        // to stay clear of that on rustc 1.85+.
        // SAFETY: `info` is a fully-initialised value of the right
        // type sitting on our own stack; a misaligned u64 read on
        // arm64 is allowed (no SIGBUS) and read_unaligned is the
        // documented escape hatch for packed-struct field access.
        let all_image_infos_addr: u64 =
            unsafe { ptr::read_unaligned(ptr::addr_of!(info.all_image_info_addr)) };
        if all_image_infos_addr == 0 {
            return Err(napi::Error::from_reason(
                "dyld_all_image_infos address is 0 — process may still be very early in startup",
            ));
        }

        // Step 2: read first 16 bytes (version u32, count u32, ptr u64)
        // of dyld_all_image_infos out of the target.
        let mut header = [0u8; DYLD_IMAGE_INFOS_HEADER_SIZE as usize];
        read_remote(task, all_image_infos_addr, &mut header)
            .map_err(|e| napi::Error::from_reason(format!("read dyld_all_image_infos header: {e}")))?;

        let count_u32 = u32::from_le_bytes([header[4], header[5], header[6], header[7]]);
        if count_u32 == 0 {
            return Err(napi::Error::from_reason(
                "dyld_all_image_infos.infoArrayCount == 0 — no images mapped yet",
            ));
        }
        let info_array_ptr = u64::from_le_bytes([
            header[8], header[9], header[10], header[11], header[12], header[13], header[14],
            header[15],
        ]);
        if info_array_ptr == 0 {
            return Err(napi::Error::from_reason(
                "dyld_all_image_infos.infoArray is null",
            ));
        }

        // Step 3: walk infoArray entries until we find the one whose
        // imageFilePath contains TARGET_BIN_NEEDLE. Cap the walk at
        // 4096 entries — Hearthstone realistically has <500 dylibs.
        let cap = std::cmp::min(count_u32 as u64, 4096);
        for i in 0..cap {
            let entry_addr = info_array_ptr + i * DYLD_IMAGE_INFO_SIZE;
            let mut entry = [0u8; DYLD_IMAGE_INFO_SIZE as usize];
            read_remote(task, entry_addr, &mut entry).map_err(|e| {
                napi::Error::from_reason(format!("read dyld_image_info[{i}]: {e}"))
            })?;

            let load_addr = u64::from_le_bytes(
                entry[DYLD_IMAGE_INFO_LOAD_ADDR_OFFSET as usize
                    ..DYLD_IMAGE_INFO_LOAD_ADDR_OFFSET as usize + 8]
                    .try_into()
                    .expect("8-byte slice from 24-byte buf"),
            );
            let path_ptr = u64::from_le_bytes(
                entry[DYLD_IMAGE_INFO_PATH_OFFSET as usize
                    ..DYLD_IMAGE_INFO_PATH_OFFSET as usize + 8]
                    .try_into()
                    .expect("8-byte slice from 24-byte buf"),
            );
            if load_addr == 0 || path_ptr == 0 {
                continue;
            }

            let Ok(path) = read_remote_cstring(task, path_ptr, 1024) else {
                continue;
            };
            if path.contains(TARGET_BIN_NEEDLE) {
                return Ok((load_addr, path));
            }
        }

        Err(napi::Error::from_reason(
            "scanned all dyld images but found no entry matching /MacOS/Hearthstone",
        ))
    }

    // ─── remote memory helpers ─────────────────────────────────────

    fn read_remote(task: mach_port_t, addr: u64, out: &mut [u8]) -> Result<(), String> {
        let mut got: mach_vm_size_t = 0;
        // SAFETY: caller-owned slice + valid mach port; bounded len.
        let kr = unsafe {
            mach_vm_read_overwrite(
                task,
                addr as mach_vm_address_t,
                out.len() as mach_vm_size_t,
                out.as_mut_ptr() as mach_vm_address_t,
                &mut got,
            )
        };
        if kr != KERN_SUCCESS {
            return Err(format!(
                "mach_vm_read_overwrite at 0x{addr:016X} (len={}): kr={kr}",
                out.len()
            ));
        }
        if (got as usize) != out.len() {
            return Err(format!(
                "short read at 0x{addr:016X}: got {got} of {} bytes",
                out.len()
            ));
        }
        Ok(())
    }

    fn read_remote_cstring(task: mach_port_t, addr: u64, max: usize) -> Result<String, String> {
        let mut buf = vec![0u8; max];
        read_remote(task, addr, &mut buf)?;
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Ok(String::from_utf8_lossy(&buf[..end]).into_owned())
    }

    // ─── window probe (Core Graphics — frame + heuristic fullscreen) ──

    pub mod window {
        use core_foundation::array::{CFArray, CFArrayRef};
        use core_foundation::base::{CFType, CFTypeRef, TCFType, ToVoid};
        use core_foundation::dictionary::CFDictionary;
        use core_foundation::number::CFNumber;
        use core_foundation::string::CFString;
        use core_graphics::display::{
            CGDisplayBounds, CGMainDisplayID, CGWindowListCopyWindowInfo,
        };
        use core_graphics::window::{
            kCGNullWindowID, kCGWindowListExcludeDesktopElements,
            kCGWindowListOptionOnScreenOnly,
        };

        pub struct Frame {
            pub x: i32,
            pub y: i32,
            pub w: i32,
            pub h: i32,
        }

        pub fn find_hearthstone_window_frame(pid: u32) -> napi::Result<Frame> {
            let opts = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
            // SAFETY: CG returns a +1 retained CFArray; wrap_under_create_rule
            // adopts that retain count.
            let array_ref: CFArrayRef =
                unsafe { CGWindowListCopyWindowInfo(opts, kCGNullWindowID) };
            if array_ref.is_null() {
                return Err(napi::Error::from_reason(
                    "CGWindowListCopyWindowInfo returned null",
                ));
            }
            // Untyped CFDictionary (K=V=*const c_void). The typed
            // `CFDictionary<CFString, CFType>` form fails
            // `CFType::downcast` because it does not implement
            // `ConcreteCFType` — see B2 in the spike review.
            let array: CFArray<CFDictionary> =
                unsafe { CFArray::wrap_under_create_rule(array_ref) };

            let key_owner_pid = CFString::from_static_string("kCGWindowOwnerPID");
            let key_layer = CFString::from_static_string("kCGWindowLayer");
            let key_bounds = CFString::from_static_string("kCGWindowBounds");

            let mut best: Option<Frame> = None;
            for dict_ref in array.iter() {
                let dict: &CFDictionary = &dict_ref;

                let Some(owner_pid_i64) = dict_get_i64(dict, &key_owner_pid) else { continue };
                if owner_pid_i64 as u32 != pid {
                    continue;
                }

                // Layer 0 is the normal app window layer; the screen-saver
                // / dock / spotlight live on other layers.
                if let Some(layer) = dict_get_i64(dict, &key_layer) {
                    if layer != 0 {
                        continue;
                    }
                }

                let Some(bounds_dict) = dict_get_dict(dict, &key_bounds) else { continue };
                let Some(frame) = read_bounds(&bounds_dict) else { continue };

                // Pick the largest matching window — HS occasionally has
                // tiny helper windows on the same pid (1×1 IME hosts etc).
                if best
                    .as_ref()
                    .map(|f| (frame.w as i64) * (frame.h as i64) > (f.w as i64) * (f.h as i64))
                    .unwrap_or(true)
                {
                    best = Some(frame);
                }
            }

            best.ok_or_else(|| {
                napi::Error::from_reason(format!(
                    "no on-screen window found for pid {pid} (Hearthstone may be minimized)"
                ))
            })
        }

        fn dict_get_i64(d: &CFDictionary, key: &CFString) -> Option<i64> {
            // `CFDictionary::find<T: ToVoid<K>>` requires the key type
            // to satisfy ToVoid<K>. K is *const c_void here, and only
            // `*const c_void: ToVoid<*const c_void>` exists, so we
            // first lower the CFString to a void ptr.
            let raw = d.find(key.to_void())?;
            let cf_ref: CFTypeRef = *raw;
            if cf_ref.is_null() {
                return None;
            }
            // SAFETY: cf_ref came out of a CFDictionary returned by CG;
            // values inside are +0 retained CF objects, so we re-wrap
            // them with `wrap_under_get_rule` (which retains).
            let cf: CFType = unsafe { CFType::wrap_under_get_rule(cf_ref) };
            cf.downcast::<CFNumber>()?.to_i64()
        }

        fn dict_get_dict(d: &CFDictionary, key: &CFString) -> Option<CFDictionary> {
            let raw = d.find(key.to_void())?;
            let cf_ref: CFTypeRef = *raw;
            if cf_ref.is_null() {
                return None;
            }
            // SAFETY: same as dict_get_i64.
            let cf: CFType = unsafe { CFType::wrap_under_get_rule(cf_ref) };
            cf.downcast::<CFDictionary>()
        }

        fn read_bounds(d: &CFDictionary) -> Option<Frame> {
            let kx = CFString::from_static_string("X");
            let ky = CFString::from_static_string("Y");
            let kw = CFString::from_static_string("Width");
            let kh = CFString::from_static_string("Height");
            Some(Frame {
                x: dict_get_i64(d, &kx)? as i32,
                y: dict_get_i64(d, &ky)? as i32,
                w: dict_get_i64(d, &kw)? as i32,
                h: dict_get_i64(d, &kh)? as i32,
            })
        }

        /// Spike-grade fullscreen heuristic: if the window frame
        /// matches the main display's resolution within a small
        /// tolerance (covers titlebar/notch padding), call it
        /// fullscreen. A proper AX-based check
        /// (`kAXFullScreenAttribute`) is Phase 1 work in the
        /// production crate — see ADR 0002 and spec §Scenario D.
        pub fn looks_fullscreen(frame: &Frame) -> bool {
            // SAFETY: CGMainDisplayID + CGDisplayBounds are pure
            // read-only Core Graphics calls on the running display.
            let bounds = unsafe {
                let id = CGMainDisplayID();
                CGDisplayBounds(id)
            };
            let display_w = bounds.size.width.round() as i32;
            let display_h = bounds.size.height.round() as i32;
            // Tolerance: 4px around each edge absorbs display scale
            // rounding and titlebar swallow.
            (frame.w - display_w).abs() <= 4 && (frame.h - display_h).abs() <= 4
        }
    }

    // Dropping a mach port name is technically `mach_port_deallocate`,
    // but for spike scope (process ends with the addon) we leak. The
    // production implementation in Phase 1 will own the task port via
    // an RAII wrapper.
}
