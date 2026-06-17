# macOS Overlay Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the in-game overlay panels appear pinned over the Hearthstone window on macOS (Apple Silicon) during a match, via `pnpm dev`.

**Architecture:** A new tiny Rust+napi crate `@hdt/hs-window-mac` exposes a single `getHearthstoneWindow()` (CGWindowList for bounds, NSWorkspace for frontmost — zero OS permissions). The `@hdt/hearthmirror` facade delegates the window lookup to it on darwin; z-order is handled JS-side via Electron `setAlwaysOnTop`, gated on Hearthstone being frontmost. The Windows crate is untouched; deck data keeps flowing from the existing log pipeline.

**Tech Stack:** Rust + napi-rs (N-API 9), `core-graphics` / `core-foundation` / `objc2-app-kit`, TypeScript, Electron, vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-macos-overlay-design.md`

**Branch:** `feat/macos-overlay` (already created).

---

## File Structure

**New — `packages/hs-window-mac/` (the macOS window addon):**
- `Cargo.toml` — standalone crate, cdylib, napi + macOS-gated deps
- `build.rs` — `napi_build::setup()`
- `package.json` — `@hdt/hs-window-mac`, napi config, build scripts
- `.gitignore` — ignore generated `*.node`, `index.js`, `index.d.ts`
- `src/lib.rs` — napi exports + `HearthstoneWindow`/`WindowInfo` types + platform dispatch
- `src/selection.rs` — pure window-selection logic (unit-tested)
- `src/mac.rs` — CGWindowList + NSWorkspace FFI adapter (macOS only)
- `examples/dump.rs` — manual smoke binary printing the located window

**Modified — `packages/hearthmirror/` (facade seam):**
- `src/mac-window.ts` (new) — optional, platform-guarded provider loader
- `src/mac-window.test.ts` (new) — provider loader tests
- `src/hearthmirror.ts` — darwin branch in the 3 window methods (injectable platform/provider)
- `src/hearthmirror.test.ts` — add darwin-branch tests
- `package.json` — add `@hdt/hs-window-mac` workspace dep

**Modified — `apps/desktop/` (overlay + coords + build wiring):**
- `src/main/overlay-window.ts` — platform-gated `shouldBeShown` + `setVisibleOnAllWorkspaces`
- `src/main/overlay-window.test.ts` — add darwin-gate tests
- `src/main/overlay-coords.ts` (new) — pure `toDipBounds` helper
- `src/main/overlay-coords.test.ts` (new) — helper tests
- `src/main/index.ts` — use `toDipBounds` in the tracker bounds handler
- `scripts/build-mac-window.mjs` (new) — darwin-only crate build
- `package.json` — `predev` runs the crate build first

---

## Task 1: Scaffold `@hdt/hs-window-mac` (compiles, loads, returns null)

**Files:**
- Create: `packages/hs-window-mac/Cargo.toml`
- Create: `packages/hs-window-mac/build.rs`
- Create: `packages/hs-window-mac/package.json`
- Create: `packages/hs-window-mac/.gitignore`
- Create: `packages/hs-window-mac/src/lib.rs`

- [ ] **Step 1: Create `Cargo.toml`**

```toml
[package]
name = "hs-window-mac"
version = "0.6.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
napi = { version = "3", default-features = false, features = ["napi9"] }
napi-derive = "3"

[target.'cfg(target_os = "macos")'.dependencies]
core-graphics = "0.24"
core-foundation = "0.10"
objc2 = "0.6"
objc2-app-kit = { version = "0.3", features = ["NSWorkspace", "NSRunningApplication"] }

[build-dependencies]
napi-build = "2"

[profile.release]
lto = true
```

> If `cargo build` later reports a version that does not exist for any of the
> macOS crates, pick the latest published `0.x` and keep the same symbol usage;
> the build error names the crate to bump.

- [ ] **Step 2: Create `build.rs`**

```rust
fn main() {
    napi_build::setup();
}
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "@hdt/hs-window-mac",
  "version": "0.6.0",
  "private": true,
  "license": "MIT",
  "main": "index.js",
  "types": "index.d.ts",
  "scripts": {
    "build": "napi build --platform --release",
    "build:debug": "napi build --platform"
  },
  "napi": {
    "name": "hs-window-mac",
    "triples": {
      "defaults": false,
      "additional": [
        "aarch64-apple-darwin"
      ]
    }
  },
  "devDependencies": {
    "@napi-rs/cli": "^3.6.2"
  }
}
```

- [ ] **Step 4: Create `.gitignore`** (generated artifacts are built locally by `predev`)

```gitignore
*.node
index.js
index.d.ts
target/
```

- [ ] **Step 5: Create `src/lib.rs`** (types + platform dispatch; macOS path returns null until Task 3)

```rust
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
```

- [ ] **Step 6: Create a placeholder `src/selection.rs`** (real logic in Task 2; this just lets the crate compile now)

```rust
use crate::{HearthstoneWindow, WindowInfo};

pub fn choose(_windows: &[WindowInfo], _frontmost_pid: Option<i32>) -> Option<HearthstoneWindow> {
    None
}
```

- [ ] **Step 7: Build the crate**

Run: `pnpm --filter @hdt/hs-window-mac install && pnpm --filter @hdt/hs-window-mac build:debug`
Expected: compiles; produces `packages/hs-window-mac/hs-window-mac.darwin-arm64.node` and a generated `index.js`.

- [ ] **Step 8: Verify it loads from Node and exports the function**

Run: `node -e "const m=require('./packages/hs-window-mac'); console.log(typeof m.getHearthstoneWindow, m.getHearthstoneWindow())"`
Expected: `function null` (the macOS path is wired but selection returns null until Task 2–3).

- [ ] **Step 9: Commit**

```bash
git add packages/hs-window-mac/Cargo.toml packages/hs-window-mac/build.rs packages/hs-window-mac/package.json packages/hs-window-mac/.gitignore packages/hs-window-mac/src/lib.rs packages/hs-window-mac/src/selection.rs pnpm-lock.yaml
git commit -m "feat(hs-window-mac): scaffold macOS window addon crate"
```

---

## Task 2: Pure window-selection logic (TDD)

**Files:**
- Modify: `packages/hs-window-mac/src/selection.rs`

- [ ] **Step 1: Write the failing tests** (replace the whole file)

```rust
use crate::{HearthstoneWindow, WindowInfo};

/// Choose the Hearthstone game window from a list of on-screen windows.
/// Game window = owner "Hearthstone", layer 0, largest area. Foreground is
/// true when the frontmost app's pid matches the chosen window's owner pid.
pub fn choose(windows: &[WindowInfo], frontmost_pid: Option<i32>) -> Option<HearthstoneWindow> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win(owner: &str, layer: i64, pid: i32, w: f64, h: f64) -> WindowInfo {
        WindowInfo {
            owner_name: owner.to_string(),
            layer,
            owner_pid: pid,
            x: 100.0,
            y: 200.0,
            width: w,
            height: h,
        }
    }

    #[test]
    fn returns_none_when_no_hearthstone_window() {
        let windows = vec![win("Finder", 0, 1, 800.0, 600.0)];
        assert_eq!(choose(&windows, Some(1)), None);
    }

    #[test]
    fn skips_non_zero_layer() {
        let windows = vec![win("Hearthstone", 25, 7, 800.0, 600.0)];
        assert_eq!(choose(&windows, Some(7)), None);
    }

    #[test]
    fn picks_largest_area_hearthstone_window() {
        let windows = vec![
            win("Hearthstone", 0, 7, 200.0, 100.0),
            win("Hearthstone", 0, 7, 1600.0, 900.0),
            win("Finder", 0, 1, 4000.0, 4000.0),
        ];
        let chosen = choose(&windows, Some(7)).expect("a window");
        assert_eq!((chosen.width, chosen.height), (1600.0, 900.0));
    }

    #[test]
    fn foreground_true_when_frontmost_pid_matches_owner() {
        let windows = vec![win("Hearthstone", 0, 7, 1600.0, 900.0)];
        assert!(choose(&windows, Some(7)).expect("win").foreground);
    }

    #[test]
    fn foreground_false_when_frontmost_pid_differs() {
        let windows = vec![win("Hearthstone", 0, 7, 1600.0, 900.0)];
        assert!(!choose(&windows, Some(99)).expect("win").foreground);
    }

    #[test]
    fn foreground_false_when_frontmost_unknown() {
        let windows = vec![win("Hearthstone", 0, 7, 1600.0, 900.0)];
        assert!(!choose(&windows, None).expect("win").foreground);
    }

    #[test]
    fn maps_bounds_and_sets_visible_not_minimized() {
        let windows = vec![win("Hearthstone", 0, 7, 1600.0, 900.0)];
        let c = choose(&windows, Some(7)).expect("win");
        assert_eq!((c.x, c.y, c.width, c.height), (100.0, 200.0, 1600.0, 900.0));
        assert!(c.visible);
        assert!(!c.minimized);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/hs-window-mac && cargo test`
Expected: FAIL — `not yet implemented` (the `todo!()`).

- [ ] **Step 3: Implement `choose`** (replace the `todo!()` body)

```rust
pub fn choose(windows: &[WindowInfo], frontmost_pid: Option<i32>) -> Option<HearthstoneWindow> {
    let chosen = windows
        .iter()
        .filter(|w| w.owner_name == "Hearthstone" && w.layer == 0)
        .max_by(|a, b| {
            (a.width * a.height)
                .partial_cmp(&(b.width * b.height))
                .unwrap_or(std::cmp::Ordering::Equal)
        })?;
    Some(HearthstoneWindow {
        x: chosen.x,
        y: chosen.y,
        width: chosen.width,
        height: chosen.height,
        minimized: false,
        visible: true,
        foreground: frontmost_pid == Some(chosen.owner_pid),
    })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/hs-window-mac && cargo test`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/hs-window-mac/src/selection.rs
git commit -m "feat(hs-window-mac): pure Hearthstone window selection logic"
```

---

## Task 3: CGWindowList + NSWorkspace FFI adapter (macOS)

This is the one inherently system-specific piece: it cannot be unit-tested (needs a
live window server), so it is verified by `cargo build` + a smoke binary run against
a live Hearthstone. The code below is the intended implementation; if a symbol name
or signature differs in the pinned crate versions, the compiler error names the exact
fix — keep the logic identical.

**Files:**
- Create: `packages/hs-window-mac/src/mac.rs`
- Create: `packages/hs-window-mac/examples/dump.rs`
- Modify: `packages/hs-window-mac/src/lib.rs`

- [ ] **Step 1: Create `src/mac.rs`**

```rust
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

pub fn get_hearthstone_window() -> Option<HearthstoneWindow> {
    let windows = list_windows();
    let frontmost = frontmost_pid();
    selection::choose(&windows, frontmost)
}

fn frontmost_pid() -> Option<i32> {
    // SAFETY: sharedWorkspace is a process-wide singleton; called on the
    // Electron main thread (the AppKit main thread). Reading frontmost app
    // and its pid mutates nothing.
    unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let app = workspace.frontmostApplication()?;
        Some(app.processIdentifier())
    }
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
    let array: CFArray<CFDictionary<CFString, CFType>> =
        unsafe { CFArray::wrap_under_create_rule(array_ref) };

    let mut out = Vec::with_capacity(array.len() as usize);
    for dict in array.iter() {
        if let Some(info) = window_info(&dict) {
            out.push(info);
        }
    }
    out
}

fn window_info(dict: &CFDictionary<CFString, CFType>) -> Option<WindowInfo> {
    let owner_name = dict_string(dict, "kCGWindowOwnerName")?;
    let layer = dict_i64(dict, "kCGWindowLayer").unwrap_or(0);
    let owner_pid = dict_i64(dict, "kCGWindowOwnerPID")? as i32;
    let bounds = dict.find(&CFString::from_static_string("kCGWindowBounds"))?;
    let bounds = bounds.downcast::<CFDictionary<CFString, CFType>>()?;
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

fn dict_string(dict: &CFDictionary<CFString, CFType>, key: &str) -> Option<String> {
    let value = dict.find(&CFString::new(key))?;
    let s = value.downcast::<CFString>()?;
    Some(s.to_string())
}

fn dict_i64(dict: &CFDictionary<CFString, CFType>, key: &str) -> Option<i64> {
    let value = dict.find(&CFString::new(key))?;
    value.downcast::<CFNumber>()?.to_i64()
}

fn dict_f64(dict: &CFDictionary<CFString, CFType>, key: &str) -> Option<f64> {
    let value = dict.find(&CFString::new(key))?;
    let num = value.downcast::<CFNumber>()?;
    num.to_f64().or_else(|| num.to_i64().map(|n| n as f64))
}
```

> Notes for the implementer: `CFDictionary::find` returns an `ItemRef`/`CFType`;
> `downcast` is the `TCFType` helper for narrowing. If the pinned `core-foundation`
> exposes these under slightly different names (e.g. `find` returning a raw pointer),
> adapt the three `dict_*` helpers only — the public surface and `window_info` stay
> the same. The CGWindow bounds dict keys are the literal strings `"X" "Y" "Width"
> "Height"`.

- [ ] **Step 2: Wire `mac` into `src/lib.rs`**

Add the module declaration under `mod selection;`:

```rust
mod selection;
#[cfg(target_os = "macos")]
mod mac;
```

Replace the placeholder `get_hearthstone_window` body with the platform dispatch:

```rust
#[napi]
pub fn get_hearthstone_window() -> Option<HearthstoneWindow> {
    #[cfg(target_os = "macos")]
    {
        mac::get_hearthstone_window()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}
```

- [ ] **Step 3: Create `examples/dump.rs`** (smoke binary — runs without napi/Electron)

```rust
fn main() {
    match hs_window_mac::get_hearthstone_window() {
        Some(w) => println!("FOUND: {w:?}"),
        None => println!("NONE (Hearthstone window not located)"),
    }
}
```

- [ ] **Step 4: Build to verify it compiles**

Run: `cd packages/hs-window-mac && cargo build`
Expected: compiles cleanly. Fix any crate-version symbol mismatches per the notes
above until it builds.

- [ ] **Step 5: Smoke-test against live Hearthstone**

With Hearthstone running and on a menu/match in the foreground, run:
`cd packages/hs-window-mac && cargo run --example dump`
Expected: `FOUND: HearthstoneWindow { x: …, y: …, width: …, height: …, minimized: false, visible: true, foreground: true }` with bounds that match the HS window. Click another app and re-run → `foreground: false`. Quit HS and re-run → `NONE`.

- [ ] **Step 6: Rebuild the napi artifact**

Run: `pnpm --filter @hdt/hs-window-mac build:debug`
Then: `node -e "console.log(require('./packages/hs-window-mac').getHearthstoneWindow())"` (with HS open)
Expected: a `{ x, y, width, height, minimized:false, visible:true, foreground:… }` object.

- [ ] **Step 7: Commit**

```bash
git add packages/hs-window-mac/src/lib.rs packages/hs-window-mac/src/mac.rs packages/hs-window-mac/examples/dump.rs
git commit -m "feat(hs-window-mac): CGWindowList + NSWorkspace window adapter"
```

---

## Task 4: Facade provider loader `mac-window.ts` (TDD)

**Files:**
- Create: `packages/hearthmirror/src/mac-window.ts`
- Create: `packages/hearthmirror/src/mac-window.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { loadMacWindowProvider } from './mac-window';

describe('loadMacWindowProvider', () => {
  it('returns null on non-darwin platforms', () => {
    expect(loadMacWindowProvider('win32', () => ({}))).toBeNull();
  });

  it('returns null on darwin when the addon require throws', () => {
    const req = vi.fn(() => {
      throw new Error('not built');
    });
    expect(loadMacWindowProvider('darwin', req)).toBeNull();
  });

  it('returns the addon as the provider on darwin when require succeeds', () => {
    const addon = { getHearthstoneWindow: () => null };
    expect(loadMacWindowProvider('darwin', () => addon)).toBe(addon);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hdt/hearthmirror test -- mac-window`
Expected: FAIL — cannot find `./mac-window`.

- [ ] **Step 3: Implement `mac-window.ts`**

```ts
import { createRequire } from 'node:module';
import type { HearthstoneWindow } from './types';

/** Minimal surface of the macOS window addon (`@hdt/hs-window-mac`). */
export interface MacWindowProvider {
  getHearthstoneWindow(): HearthstoneWindow | null;
}

const defaultRequire = createRequire(import.meta.url) as (id: string) => unknown;

/**
 * Load the macOS window addon, or return `null` when unavailable.
 * `platform`/`requireFn` are injectable for tests. On non-darwin, or when the
 * addon isn't built (require throws), returns null so the facade falls back to
 * "no window" — exactly today's behavior on platforms without the addon.
 */
export function loadMacWindowProvider(
  platform: NodeJS.Platform = process.platform,
  requireFn: (id: string) => unknown = defaultRequire,
): MacWindowProvider | null {
  if (platform !== 'darwin') return null;
  try {
    const addon = requireFn('@hdt/hs-window-mac') as MacWindowProvider;
    return typeof addon.getHearthstoneWindow === 'function' ? addon : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @hdt/hearthmirror test -- mac-window`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/hearthmirror/src/mac-window.ts packages/hearthmirror/src/mac-window.test.ts
git commit -m "feat(hearthmirror): optional macOS window provider loader"
```

---

## Task 5: Facade darwin branch in `HearthMirror` (TDD)

**Files:**
- Modify: `packages/hearthmirror/src/hearthmirror.ts:71-137`
- Modify: `packages/hearthmirror/src/hearthmirror.test.ts`
- Modify: `packages/hearthmirror/package.json`

- [ ] **Step 1: Add the workspace dependency**

In `packages/hearthmirror/package.json`, add to `"dependencies"`:

```json
    "@hdt/hs-window-mac": "workspace:*"
```

Then run: `pnpm install`
Expected: pnpm links the workspace package; no error.

- [ ] **Step 2: Write the failing tests** (append to `packages/hearthmirror/src/hearthmirror.test.ts`)

```ts
import { HearthMirror } from './hearthmirror';

describe('HearthMirror macOS window delegation', () => {
  it('delegates getHearthstoneWindow to the mac provider on darwin', async () => {
    const win = {
      x: 1, y: 2, width: 3, height: 4,
      minimized: false, visible: true, foreground: true,
    };
    const mirror = new HearthMirror({
      platform: 'darwin',
      macWindow: { getHearthstoneWindow: () => win },
    });
    await expect(mirror.getHearthstoneWindow()).resolves.toEqual(win);
  });

  it('returns null subscription on darwin so the tracker fast-polls', () => {
    const mirror = new HearthMirror({
      platform: 'darwin',
      macWindow: { getHearthstoneWindow: () => null },
    });
    expect(mirror.subscribeToHearthstoneWindowEvents(() => {})).toBeNull();
  });

  it('reports placeWindowAboveHearthstone=false on darwin', () => {
    const mirror = new HearthMirror({
      platform: 'darwin',
      macWindow: { getHearthstoneWindow: () => null },
    });
    expect(mirror.placeWindowAboveHearthstone(new Uint8Array())).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @hdt/hearthmirror test -- hearthmirror`
Expected: FAIL — `HearthMirror` constructor takes no args / no `platform` branch.

- [ ] **Step 4: Add the constructor + imports** (top of the class, `hearthmirror.ts:71`)

Add near the existing imports (after line 3):

```ts
import { loadMacWindowProvider, type MacWindowProvider } from './mac-window';
```

Replace the class header / `private _connected = false;` region so the class gains injectable deps:

```ts
export interface HearthMirrorDeps {
  platform?: NodeJS.Platform;
  macWindow?: MacWindowProvider | null;
}

export class HearthMirror {
  private _connected = false;
  private readonly platform: NodeJS.Platform;
  private readonly macWindow: MacWindowProvider | null;

  constructor(deps: HearthMirrorDeps = {}) {
    this.platform = deps.platform ?? process.platform;
    this.macWindow =
      deps.macWindow !== undefined ? deps.macWindow : loadMacWindowProvider(this.platform);
  }
```

- [ ] **Step 5: Branch the three window methods** (`hearthmirror.ts:98-137`)

Replace `getHearthstoneWindow`:

```ts
  async getHearthstoneWindow(): Promise<HearthstoneWindow | null> {
    if (this.platform === 'darwin') {
      try {
        return this.macWindow?.getHearthstoneWindow() ?? null;
      } catch {
        return null;
      }
    }
    try {
      const r = await native.getHearthstoneWindow();
      if (!r) return null;
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        minimized: r.minimized,
        visible: r.visible,
        foreground: r.foreground,
      };
    } catch {
      return null;
    }
  }
```

Replace `placeWindowAboveHearthstone`:

```ts
  placeWindowAboveHearthstone(nativeWindowHandle: Uint8Array): boolean {
    if (this.platform === 'darwin') return false;
    try {
      return native.placeWindowAboveHearthstone(nativeWindowHandle);
    } catch {
      return false;
    }
  }
```

Replace `subscribeToHearthstoneWindowEvents`:

```ts
  subscribeToHearthstoneWindowEvents(onWindowChanged: () => void): (() => void) | null {
    if (this.platform === 'darwin') return null;
    try {
      const subscriptionId = native.subscribeHearthstoneWindowEvents(onWindowChanged);
      return () => {
        try {
          native.unsubscribeHearthstoneWindowEvents(subscriptionId);
        } catch {
          // The hook may already be gone during app shutdown or native unload.
        }
      };
    } catch {
      return null;
    }
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @hdt/hearthmirror test`
Expected: PASS — new darwin tests plus the existing suite.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @hdt/hearthmirror typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/hearthmirror/src/hearthmirror.ts packages/hearthmirror/src/hearthmirror.test.ts packages/hearthmirror/package.json pnpm-lock.yaml
git commit -m "feat(hearthmirror): delegate window lookup to macOS addon on darwin"
```

---

## Task 6: Overlay platform gate + fullscreen visibility (TDD)

**Files:**
- Modify: `apps/desktop/src/main/overlay-window.ts:3-9,52-96,199-225,267-269`
- Modify: `apps/desktop/src/main/overlay-window.test.ts`

- [ ] **Step 1: Write the failing test** (append to `apps/desktop/src/main/overlay-window.test.ts`)

```ts
describe('OverlayManager darwin foreground gate', () => {
  it('on darwin stays hidden until Hearthstone is frontmost', () => {
    const mgr = new OverlayManager({
      rendererUrl: 'r',
      preloadPath: 'p',
      platform: 'darwin',
    });
    mgr.enable();
    mgr.setVisibleOnScreen(true);
    mgr.setInActiveMatch(true);
    // foreground still false → must be hidden
    const win = mocks.windows.at(-1)!;
    expect(win.isVisible()).toBe(false);

    mgr.setTargetForeground(true);
    expect(win.isVisible()).toBe(true);

    mgr.setTargetForeground(false);
    expect(win.isVisible()).toBe(false);
  });

  it('on win32 ignores foreground for visibility', () => {
    const mgr = new OverlayManager({
      rendererUrl: 'r',
      preloadPath: 'p',
      platform: 'win32',
    });
    mgr.enable();
    mgr.setVisibleOnScreen(true);
    mgr.setInActiveMatch(true);
    const win = mocks.windows.at(-1)!;
    expect(win.isVisible()).toBe(true); // shown without foreground
  });
});
```

> If `mocks.windows` isn't already exported by the test's `vi.hoisted` block,
> expose the `windows` array there (the existing block already tracks created
> windows — return it from `vi.hoisted` and reference via `mocks.windows`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hdt/desktop test -- overlay-window`
Expected: FAIL — `OverlayManagerOptions` has no `platform`; darwin gate not applied.

- [ ] **Step 3: Add `platform` to options + field** (`overlay-window.ts:3-9` and `52-96`)

In `OverlayManagerOptions` add:

```ts
  platform?: NodeJS.Platform;
```

In the class, add a field and set it in the constructor (the constructor is at
`overlay-window.ts:93`):

```ts
  private readonly platform: NodeJS.Platform;
```

```ts
  constructor(opts: OverlayManagerOptions) {
    this.opts = opts;
    this.routeHash = opts.routeHash ?? '/overlay';
    this.platform = opts.platform ?? process.platform;
  }
```

- [ ] **Step 4: Gate `shouldBeShown` on foreground for darwin** (`overlay-window.ts:267-269`)

```ts
  private shouldBeShown(): boolean {
    const base = this.userEnabled && this.visibleOnScreen && this.inActiveMatch;
    return this.platform === 'darwin' ? base && this.targetForeground : base;
  }
```

- [ ] **Step 5: Make the overlay visible over fullscreen HS on darwin** (`overlay-window.ts`, in `createWindow()` after `this.win.setAlwaysOnTop(false);` ~line 227)

```ts
    if (this.platform === 'darwin') {
      this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenScreen: true });
    }
```

> Add `setVisibleOnAllWorkspaces: vi.fn()` to the `MockWindow` class in the test
> file if it isn't already a stubbed method, so `createWindow()` doesn't throw
> under test.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @hdt/desktop test -- overlay-window`
Expected: PASS — new darwin/win32 gate tests plus the existing suite.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/main/overlay-window.ts apps/desktop/src/main/overlay-window.test.ts
git commit -m "feat(overlay): gate visibility on HS-frontmost on macOS"
```

---

## Task 7: Coordinate helper `toDipBounds` (TDD)

**Files:**
- Create: `apps/desktop/src/main/overlay-coords.ts`
- Create: `apps/desktop/src/main/overlay-coords.test.ts`
- Modify: `apps/desktop/src/main/index.ts:105-117`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { toDipBounds } from './overlay-coords';

describe('toDipBounds', () => {
  const px = { x: 100, y: 200, width: 1600, height: 900 };

  it('returns bounds unchanged on darwin (already DIP)', () => {
    const screenToDipRect = vi.fn();
    expect(toDipBounds('darwin', px, screenToDipRect)).toEqual(px);
    expect(screenToDipRect).not.toHaveBeenCalled();
  });

  it('converts via screenToDipRect on win32 (physical px → DIP)', () => {
    const dip = { x: 50, y: 100, width: 800, height: 450 };
    const screenToDipRect = vi.fn(() => dip);
    expect(toDipBounds('win32', px, screenToDipRect)).toEqual(dip);
    expect(screenToDipRect).toHaveBeenCalledWith(px);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hdt/desktop test -- overlay-coords`
Expected: FAIL — cannot find `./overlay-coords`.

- [ ] **Step 3: Implement `overlay-coords.ts`**

```ts
export interface BoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convert tracker-reported window bounds to Electron DIP.
 * - Windows: GetWindowRect returns physical pixels → convert via screenToDipRect.
 * - macOS: CGWindow bounds are already points (== DIP) → identity.
 */
export function toDipBounds(
  platform: NodeJS.Platform,
  bounds: BoundsRect,
  screenToDipRect: (rect: BoundsRect) => BoundsRect,
): BoundsRect {
  if (platform === 'darwin') {
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }
  return screenToDipRect(bounds);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @hdt/desktop test -- overlay-coords`
Expected: PASS — both tests.

- [ ] **Step 5: Wire it into `index.ts`** (`index.ts:105-117`, the `event.kind === 'bounds'` branch)

Add the import near the other `./` imports:

```ts
import { toDipBounds } from './overlay-coords';
```

Replace the bounds branch body:

```ts
      if (event.kind === 'bounds') {
        // Windows: GetWindowRect returns PHYSICAL pixels; convert to DIP.
        // macOS: CGWindow bounds are already points (== DIP); identity.
        const hs = event.bounds;
        const hsDip = toDipBounds(process.platform, hs, (r) =>
          screen.screenToDipRect(null, { x: r.x, y: r.y, width: r.width, height: r.height }),
        );
        const bounds = computeOverlayPanelBounds(hsDip);
        opponentOverlay.setBounds(bounds.opponent);
        playerOverlay.setBounds(bounds.player);
      } else {
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @hdt/desktop typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/main/overlay-coords.ts apps/desktop/src/main/overlay-coords.test.ts apps/desktop/src/main/index.ts
git commit -m "feat(overlay): per-platform window-bounds to DIP conversion"
```

---

## Task 8: Build wiring (`predev` builds the addon on darwin)

**Files:**
- Create: `apps/desktop/scripts/build-mac-window.mjs`
- Modify: `apps/desktop/package.json:11`

- [ ] **Step 1: Create `scripts/build-mac-window.mjs`**

```js
// Build the macOS window addon before `pnpm dev`, but only on darwin.
// No-op on Windows/Linux so the cross-platform dev flow is unaffected.
import { spawnSync } from 'node:child_process';

if (process.platform !== 'darwin') {
  process.exit(0);
}

const result = spawnSync(
  'pnpm',
  ['--filter', '@hdt/hs-window-mac', 'build:debug'],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
```

- [ ] **Step 2: Update `predev`** in `apps/desktop/package.json`

Change:

```json
    "predev": "pnpm run rebuild:native",
```

to:

```json
    "predev": "node scripts/build-mac-window.mjs && pnpm run rebuild:native",
```

- [ ] **Step 3: Verify the dev predev chain runs the addon build**

Run: `pnpm --filter @hdt/desktop run predev`
Expected (on macOS): the `@hdt/hs-window-mac build:debug` output appears, then the
`better-sqlite3` electron-rebuild output; exit code 0.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/scripts/build-mac-window.mjs apps/desktop/package.json
git commit -m "build(desktop): build macOS window addon in predev on darwin"
```

---

## Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated suite**

Run: `pnpm test`
Expected: all packages green (includes the new facade/overlay/coords tests).

Run: `cd packages/hs-window-mac && cargo test`
Expected: selection tests green.

- [ ] **Step 2: Typecheck the workspace**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Launch and confirm the native lookup works**

Run: `pnpm dev` (with `~/Library/Preferences/Blizzard/Hearthstone/log.config` present
and Hearthstone launched after it). In the dev log, confirm:
`[overlay-tracker] poll #N: result={<x>,<y> <w>×<h> vis=true min=false fg=true}`
(no longer `result=null`).

- [ ] **Step 4: Manual overlay checklist** (the real proof; perform with the overlay enabled in settings)

- Enter a match → `[deck-tracker] state phase=…` leaves IDLE; overlay panels appear anchored to the HS left/right edges, correctly sized → screenshot.
- Alt-tab away from HS → overlay hides; switch back → overlay reappears.
- Drag the HS window → overlay follows within ~200 ms.
- Mixed-DPI multi-monitor: move HS to the external display → panels still align (the known coordinate risk from the spec).
- HS fullscreen → overlay still visible over it.
- Quit HS → overlay hides; relaunch → reappears.

- [ ] **Step 5: Confirm no Windows regression (static checks)**

Run: `pnpm -r build` (or at minimum `pnpm --filter @hdt/hearthmirror typecheck && pnpm --filter @hdt/desktop typecheck`)
Expected: green — the facade contract is unchanged for win32; the darwin branches are
guarded by `platform === 'darwin'`.

- [ ] **Step 6: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "test(macos-overlay): verification fixups"
```

---

## Notes

- **N-API ABI:** the addon is N-API 9 → ABI-stable across Node/Electron, so no
  `electron-rebuild` step is needed for it (unlike `better-sqlite3`).
- **Externalization:** electron-vite externalizes package dependencies; `@hdt/hs-window-mac`
  is pulled in transitively via `@hdt/hearthmirror` and loaded with `createRequire`, so
  it must not be bundled. If `pnpm dev` reports a bundling error for it, add it to the
  main-process externals in the electron-vite config.
- **Out of scope (future milestone):** packaging (`electron-builder` macOS target),
  universal arm64+x64 binary, CI build + committed artifact, code-signing/notarization,
  Intel support, native NSWorkspace event subscription (vs 200 ms polling).
