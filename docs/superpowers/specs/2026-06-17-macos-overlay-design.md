# macOS Overlay Support — Design

- **Date:** 2026-06-17
- **Status:** Approved (design); pending implementation plan
- **Scope milestone:** Dev-first on Apple Silicon (arm64) via `pnpm dev`. No packaging / CI / signing.

## Context

On macOS the deck-data pipeline already works: `log.config` → Hearthstone writes
`Power.log` → `@hdt/hearthwatcher` parses it → deck tracker state updates. Verified
live (status `ready`, deck-tracker phase transitions on a real match).

The **in-game overlay** (the transparent panels pinned over the Hearthstone window)
does **not** appear on macOS. Root cause, confirmed by reading the code and the live
dev log:

- The overlay's visibility gate is `shouldBeShown() = userEnabled && visibleOnScreen
  && inActiveMatch` (`apps/desktop/src/main/overlay-window.ts`). In the live log,
  `visibleOnScreen` stays `false` even after a match starts (`inActiveMatch=true`),
  so `syncVisibility` always decides `→ hide`.
- `visibleOnScreen` is driven by the `HearthstoneWindowTracker`, which polls
  `getHearthMirror().getHearthstoneWindow()`. Every poll logs `result=null` (no
  `(threw)` suffix — a clean null, not an exception).
- `getHearthstoneWindow()` resolves to `null` because the native module
  `@hdt/hearthmirror-native` is a **Windows-only** Rust crate (reads HS process
  memory + window geometry via Win32). On macOS there is no native artifact, so
  `packages/hearthmirror/native/index.js` falls back to `stub.js`, whose
  `getHearthstoneWindow` is `() => Promise.resolve(null)`.

So the overlay can never become visible on macOS: the window-position/visibility
detection it depends on is Windows-only. Recent commits added macOS **log** support;
macOS **window/overlay** support is the missing piece.

## Goals

- The overlay panels appear pinned over the Hearthstone window on macOS (Apple
  Silicon) during a match, following HS window moves, via `pnpm dev`.
- Zero special OS permissions (no Screen Recording, no Accessibility).
- The Windows build and behavior are completely unaffected.

## Non-goals (this milestone)

- No macOS port of the memory mirror (`getDecks`/`getCollection`/`getBoardState`/…).
  On macOS the data comes from logs; the memory functions stay no-op stubs.
- No packaging: no `electron-builder` macOS target, no universal (arm64+x64) binary,
  no CI cross-build, no code-signing/notarization. Those are a later milestone.
- No Intel (x64) support yet.
- No attempt to replicate the Windows cross-app z-order insertion (see Decisions).

## Decisions

### D1 — Overlay visibility model: on-top while HS is frontmost

macOS has no public API to insert a window into another application's z-order (the
Windows model: overlay sits just above HS, visible even on a second monitor when HS
isn't frontmost). Chosen behavior on macOS:

- HS is the frontmost app → overlay shown, floating above the game.
- HS goes to the background (alt-tab away) → overlay hidden.
- Matches HSTracker's macOS behavior; needs no special permissions.

### D2 — Native approach: small dedicated macOS addon

A new tiny Rust + napi crate implementing **only** the window lookup, wired in
through the existing darwin stub seam. The Windows crate (`@hdt/hearthmirror-native`)
is left untouched.

Rejected alternatives:
- **Extend the existing crate** with a `cfg(target_os="macos")` backend — requires
  target-gating the `windows` dependency, wrapping all 11 Windows-only modules in
  `#[cfg(windows)]`, and adding `#[cfg(not(windows))]` stubs for ~30 memory napi
  functions. Large, risky diff through the project's core crate, disproportionate to
  a ~one-function need.
- **No native (osascript / Accessibility)** — requires Accessibility permission
  (contradicts D1's zero-permission goal), spawns a process per ~200 ms poll, and is
  locale-fragile.

Given D1, the macOS native surface is a single real function: `getHearthstoneWindow`.
Z-order is handled JS-side (Electron `setAlwaysOnTop`), and window-event subscription
is skipped (the tracker falls back to 200 ms polling).

## Architecture

Three components; everything else keeps its existing contract.

### Component 1 — `@hdt/hs-window-mac` (new Rust + napi crate, macOS-only)

Input: none. Output: the Hearthstone game window's bounds + flags, or `null`.

- `CGWindowListCopyWindowInfo(OnScreenOnly | ExcludeDesktopElements, kCGNullWindowID)`
  → window dictionaries.
- Match `kCGWindowOwnerName == "Hearthstone"` (process name — locale-independent;
  the zh client shows 炉石传说 but the owner name is still `Hearthstone`) and
  `kCGWindowLayer == 0`; among matches pick the **largest area** as the game window.
- Read `kCGWindowBounds` (points), `kCGWindowOwnerPID`.
- `foreground = (NSWorkspace.frontmostApplication.processIdentifier == ownerPID)`.
- Return `{ x, y, width, height, minimized: false, visible: true, foreground }`;
  **no match → `None`** (covers minimized / in-Dock / not running).

napi surface (shape matches the existing `HearthstoneWindow`):

```rust
#[napi(object)]
pub struct HearthstoneWindow {
  pub x: f64, pub y: f64, pub width: f64, pub height: f64,
  pub minimized: bool, pub visible: bool, pub foreground: bool,
}
#[napi]
pub fn get_hearthstone_window() -> Option<HearthstoneWindow> { /* sync */ }
```

Dependencies (all read-only, zero-permission, macOS-gated): `core-graphics`,
`core-foundation`, `objc2`, `objc2-app-kit`, `napi`, `napi-derive`.

**Why zero-permission:** owner name / bounds / pid via CGWindowList need no
permission; only the window **title** (`kCGWindowName`) requires Screen Recording —
and we match on process name, never reading the title. NSWorkspace frontmost needs
no permission.

**Threading:** the napi sync function runs on the Electron main process main thread
(the AppKit main thread), so `NSWorkspace` is safe to call there. CGWindowList is
sub-millisecond; 200 ms polling is comfortable.

**Logic/FFI split (for testability):** a pure `choose(windows: &[WindowInfo],
frontmost_pid: Option<i32>) -> Option<HearthstoneWindow>` holds the selection logic;
the CF/NSWorkspace calls are thin adapters that build `Vec<WindowInfo>` + the
frontmost pid. Mirrors `window.rs`'s existing "logic unit-testable in isolation"
design.

### Component 2 — facade delegation seam (`@hdt/hearthmirror`)

A new `packages/hearthmirror/src/mac-window.ts` does an optional, platform-guarded
`require('@hdt/hs-window-mac')` (returns a `getHearthstoneWindow: () => null`
provider on non-mac or if the addon isn't built). `hearthmirror.ts` uses it on
darwin:

- `getHearthstoneWindow()` → delegate to the mac provider.
- `subscribeToHearthstoneWindowEvents()` → return `null` on darwin. **Important:** the
  current stub returns `0`, which the facade currently treats as a successful
  subscription, making the tracker use its 1 s watchdog instead of the 200 ms poll.
  Returning `null` makes `eventSourceActive=false` → 200 ms polling.
- `placeWindowAboveHearthstone()` → return `false` on darwin (never reached given
  D1's foreground gate; z-order is JS-side).

All memory functions stay as-is (stub → null). The provider/platform must be
**injectable** for unit tests.

### Component 3 — overlay z-order + visibility gate (`overlay-window.ts`)

`syncZOrder` already does the right thing when `targetForeground` is true:
`setAlwaysOnTop(true, 'screen-saver')` + `moveTop()`. Under D1 the overlay only shows
when HS is frontmost, so it always hits that branch — no native z-order needed.

Changes:

1. `shouldBeShown()` adds a darwin-only `&& targetForeground`:

   ```js
   private shouldBeShown(): boolean {
     const base = this.userEnabled && this.visibleOnScreen && this.inActiveMatch;
     return this.platform === 'darwin' ? base && this.targetForeground : base;
   }
   ```

   Required because when you alt-tab away, the HS window is still on-screen (just
   occluded), so `CGWindowList(OnScreenOnly)` still returns it and `visibleOnScreen`
   stays `true`. Only `foreground` flips to `false`, so the gate must include it.

2. In `createWindow()`, on darwin:
   `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenScreen: true })` so the
   overlay appears over HS even when HS is fullscreen (own Space).

3. `platform` is an injectable `OverlayManager` constructor option defaulting to
   `process.platform`, so the darwin branches are unit-testable on any CI OS.

## Data flow

```
HS window ──CGWindowList / NSWorkspace──▶ @hdt/hs-window-mac
          ──▶ HearthMirror.getHearthstoneWindow()        (facade, darwin → addon)
          ──▶ HearthstoneWindowTracker (200 ms poll)
          ──▶ emit bounds / visibility / foreground
          ──▶ OverlayManager: setBounds + syncVisibility / syncZOrder
          ──▶ overlay BrowserWindow floats over HS
```

Deck *contents* continue to flow through the existing log pipeline
(`Power.log → hearthwatcher → deck tracker → overlay renderer`). This work only
supplies the missing "where is the HS window / is it frontmost" facts.

## Coordinate mapping

macOS mapping is **identity** — no scaling math.

| | Windows | macOS |
|---|---|---|
| Source | `GetWindowRect` | `kCGWindowBounds` |
| Unit | physical pixels | points (= Electron DIP) |
| Origin | virtual-screen top-left, y-down | main-display top-left, y-down |
| To DIP | `screen.screenToDipRect` | none (already DIP) |

- CGWindow bounds use a **top-left** origin (not AppKit's bottom-left), matching
  Electron's screen DIP space; macOS primary display == CG main display, so origins
  coincide.
- Retina: CGWindow reports points (logical); Electron DIP is logical — equal, no
  scaling.
- Multi-monitor: both arrange displays by logical offset from the primary; values
  match (including negative offsets).

Change in `index.ts` bounds handler (extract a pure helper
`toDipBounds(platform, bounds, screenToDipRect)` for testability):

```js
const hsDip = platform === 'darwin'
  ? { x: hs.x, y: hs.y, width: hs.width, height: hs.height }   // already DIP
  : screen.screenToDipRect(null, { x: hs.x, y: hs.y, width: hs.width, height: hs.height });
```

`computeOverlayPanelBounds` / `clampToWorkArea` / `setBounds` all already operate in
DIP — unchanged. **Known risk to validate empirically:** mixed-DPI multi-monitor
(e.g., Retina laptop + non-Retina external). Theory says identity holds; verify by
dragging HS across displays (see Verification).

## Build integration

New package `packages/hs-window-mac/` (auto-included by `packages/*` in
`pnpm-workspace.yaml`; standalone Cargo crate — there is no root Cargo workspace):

```
Cargo.toml      crate-type=["cdylib"]; napi9; macOS-gated deps
build.rs        napi_build::setup()
package.json    @hdt/hs-window-mac; napi name "hs-window-mac";
                triples: aarch64-apple-darwin; devDep @napi-rs/cli
index.js        hand-written, import-safe on all platforms (below)
index.d.ts      hand-written: getHearthstoneWindow(): HearthstoneWindow | null
src/lib.rs
```

Import-safe loader (so `require` never throws on Windows/Linux):

```js
if (process.platform === 'darwin' && process.arch === 'arm64') {
  try { module.exports = require('./hs-window-mac.darwin-arm64.node'); }
  catch { module.exports = { getHearthstoneWindow: () => null }; }
} else {
  module.exports = { getHearthstoneWindow: () => null };
}
```

Build only the `.node` (`napi build --no-js`); use the hand-written loader to avoid
napi's single-triple generator throwing "Unsupported OS" on non-darwin.

- `@hdt/hearthmirror` adds `"@hdt/hs-window-mac": "workspace:*"` so pnpm symlinks it
  for `mac-window.ts` to require.
- `apps/desktop/scripts/build-mac-window.mjs`: if `process.platform === 'darwin'`,
  spawn `pnpm --filter @hdt/hs-window-mac build:debug` (debug build — fast, runtime
  perf irrelevant); else no-op. Wire into `predev`:
  `"predev": "node scripts/build-mac-window.mjs && pnpm run rebuild:native"`.
- **No `electron-rebuild`** for this crate: N-API (napi9) is ABI-stable across
  Node/Electron, so a host-built `.node` loads directly in Electron (unlike
  `better-sqlite3`).
- `hs-window-mac.darwin-arm64.node` is **gitignored** for now (built by `predev`).
  Committing the artifact / universal binary is a release-milestone decision.

## Error handling

Degrades gracefully to "today's behavior" (overlay not shown); never introduces a
crash path.

- Native: `get_hearthstone_window` returns `None` on any failure — no panic, no
  throw (honors `clippy::unwrap_used/expect_used/panic` warns; `?` / `unwrap_or`
  only). Null window list, missing fields, no match → `None`.
- Loader: missing `.node` / non-arm64-mac → `{ getHearthstoneWindow: () => null }`.
- Facade: existing `try/catch → null` wraps the provider call.
- Tracker / overlay: `result=null` → treated as "HS not present" → hide. Foreground
  flapping is debounced by `setTargetForeground` (acts only on change) and the
  tracker's `falseStreakThreshold=5`.

## Testing

Automated:
- **Rust unit tests** on the pure `choose(...)` selector: multiple windows → largest
  area; wrong owner skipped; non-zero layer skipped; no match → `None`; foreground
  matched by pid. (FFI adapters not unit-tested — need a live system.)
- **Facade (vitest)** with injected platform/provider: darwin → `getHearthstoneWindow`
  delegates; `subscribeToHearthstoneWindowEvents` returns `null`.
- **Overlay (vitest)** with injected `platform`: darwin + foreground=false → hidden
  even when `visibleOnScreen` + `inActiveMatch`; foreground=true → shown.
- **Coordinate helper** `toDipBounds`: darwin → identity; win32 → calls
  `screenToDipRect`.

Manual verification checklist (the real proof the overlay pins to the game):
1. `pnpm dev` with no Rust/build errors; `hs-window-mac.darwin-arm64.node` produced.
2. Overlay enabled in settings; after launching HS, dev log shows
   `[overlay-tracker] poll #N: result={… fg=true}` (no longer `result=null`).
3. Enter a match → `inActiveMatch=true`; overlay panels appear anchored to the HS
   left/right edges, correctly sized/positioned (screenshot).
4. Alt-tab away → overlay hides; switch back → overlay reappears.
5. Drag the HS window → overlay follows within ~200 ms.
6. Mixed-DPI multi-monitor: move HS to the external display → panels still align
   (the known coordinate risk).
7. HS fullscreen → overlay still visible over it.
8. Quit HS → overlay hides; relaunch → reappears.
9. `pnpm test` + Rust tests green; Windows build/typecheck unaffected (facade
   contract unchanged).

## Risks / open questions

- **Mixed-DPI multi-monitor** coordinate alignment — expected identity, must verify
  (checklist #6).
- **`'screen-saver'` window level** may float above the menu bar / notifications.
  Acceptable for this milestone (only shown while HS is frontmost); tune later if
  needed.
- **`OwnerName == "Hearthstone"`** assumption — if a future client/build changes the
  process name, matching breaks. Low risk; could fall back to matching the HS PID
  from the existing process monitor later.

## Out of scope / future

- Packaging milestone: `electron-builder` macOS target, universal (arm64+x64) binary,
  CI build of the darwin `.node`, code-signing/notarization, committing the artifact.
- Native macOS window-event subscription (NSWorkspace activate/deactivate
  notifications) to drop below 200 ms polling — only if polling proves insufficient.
- Intel (x64) support.
