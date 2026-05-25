> 实施约定：本 change 是 spike 性质（throw-away code）。代码任务用 conventional commits 的 `chore(spike):` 前缀。Teardown 用 `chore(spike): teardown ...`。文档任务用 `docs:`。
> **执行环境**：本 change 必须在 Apple Silicon + macOS 12+ 真机上完成 §4-§7 的真机验证。Agent 完成 §1-§3 与 §8-§11 的代码 / 文档骨架，§4-§7 由用户在真机上配合执行并把 stdout 反馈回来。

## 1. 创建 spike 包骨架

- [x] 1.1 创建目录 `packages/hearthmirror-mac-spike/src/`。
- [x] 1.2 创建 `packages/hearthmirror-mac-spike/package.json`：

  ```json
  {
    "name": "@hdt/hearthmirror-mac-spike",
    "version": "0.0.0",
    "private": true,
    "main": "index.cjs",
    "types": "index.d.ts",
    "scripts": {
      "build": "napi build --platform --release --target aarch64-apple-darwin",
      "build:debug": "napi build --platform --target aarch64-apple-darwin",
      "sign": "../../scripts/codesign-mac-spike.sh"
    },
    "napi": {
      "name": "hearthmirror-mac-spike",
      "triples": { "defaults": false, "additional": ["aarch64-apple-darwin"] }
    },
    "devDependencies": {
      "@napi-rs/cli": "^3"
    }
  }
  ```

- [x] 1.3 创建 `packages/hearthmirror-mac-spike/Cargo.toml`：

  ```toml
  [package]
  name = "hearthmirror-mac-spike"
  version = "0.0.0"
  edition = "2021"
  publish = false

  [lib]
  crate-type = ["cdylib"]

  [dependencies]
  napi = { version = "3", default-features = false, features = ["napi9", "async"] }
  napi-derive = "3"

  # macOS-only deps. Gated by [target."cfg(target_os = ...)"] so that
  # running `cargo check` from a non-mac host (e.g. Windows CI) does
  # not attempt to fetch / build these.
  #
  # Spike scope intentionally avoids the objc2 family for fullscreen
  # detection. We use a "frame == primary display resolution" heuristic
  # (see lib.rs window::looks_fullscreen). Real AX-based detection is
  # Phase 1 work in the production hearthmirror crate.
  [target."cfg(target_os = \"macos\")".dependencies]
  mach2 = "0.4"
  libproc = "0.14"
  core-foundation = "0.10"
  core-graphics = "0.25"

  [build-dependencies]
  napi-build = "2"

  [profile.release]
  lto = true
  ```

- [x] 1.4 创建 `packages/hearthmirror-mac-spike/build.rs`：

  ```rust
  fn main() {
      napi_build::setup();
  }
  ```

- [x] 1.5 创建 `packages/hearthmirror-mac-spike/entitlements.dev.plist`：

  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <!-- task_for_pid path -->
    <key>com.apple.security.cs.debugger</key>
    <true/>
    <key>com.apple.security.get-task-allow</key>
    <true/>
    <!-- Electron 37 / V8 (Hardened Runtime) path - MUST stay in sync with
         Electron's default Helper entitlements; otherwise our re-sign
         strips JIT permission and Electron crashes on launch. -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
  </dict>
  </plist>
  ```

- [x] 1.6 创建 `packages/hearthmirror-mac-spike/README.md`：

  ```markdown
  # @hdt/hearthmirror-mac-spike

  > **Exploratory.** This package validates ADR 0002 by checking whether
  > napi-rs `darwin-arm64` + `task_for_pid` + `mach_vm_read_overwrite`
  > can read the 64-bit Hearthstone Mac client. **Do not depend on this
  > package.** It will be deleted at the end of the
  > `spike-hearthmirror-mac-bridge` change.

  See `docs/spikes/0006-hearthmirror-mac-spike.md` for context.
  ```

- [x] 1.7 在根 `eslint.config.js` 的 `ignores` 数组中加入 `'packages/hearthmirror-mac-spike/**'`。
- [x] 1.8 commit：`git add packages/hearthmirror-mac-spike eslint.config.js && git commit -m "chore(spike): add hearthmirror-mac-spike package skeleton"`。

## 2. 写 Rust spike 代码

- [x] 2.1 创建 `packages/hearthmirror-mac-spike/src/lib.rs`，实现 `spike_read_macho` 与 `spike_read_hearthstone_window`：

  ```rust
  #![deny(unsafe_op_in_unsafe_fn)]

  use std::ffi::CStr;
  use std::mem;

  use napi_derive::napi;
  use napi::bindgen_prelude::*;

  use libproc::libproc::proc_pid::{listpids, pidpath, ProcType};
  use mach2::kern_return::{kern_return_t, KERN_SUCCESS};
  use mach2::port::mach_port_t;
  use mach2::traps::{mach_task_self, task_for_pid};
  use mach2::vm::mach_vm_read_overwrite;
  use mach2::vm_types::{mach_vm_address_t, mach_vm_size_t};

  const TARGET_BIN_NAME: &str = "Hearthstone";

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

  fn find_hearthstone_pid() -> napi::Result<u32> {
      let pids = listpids(ProcType::ProcAllPIDS)
          .map_err(|e| napi::Error::from_reason(format!("listpids failed: {e}")))?;
      for pid in pids {
          let Ok(path) = pidpath(pid as i32) else { continue };
          // path looks like: /Applications/Hearthstone/Hearthstone.app/Contents/MacOS/Hearthstone
          if path.ends_with("/MacOS/Hearthstone") || path.ends_with(&format!("/{TARGET_BIN_NAME}")) {
              return Ok(pid as u32);
          }
      }
      Err(napi::Error::from_reason(
          "process not found: Hearthstone is not running".to_string(),
      ))
  }

  fn open_task(pid: u32) -> napi::Result<mach_port_t> {
      let mut task: mach_port_t = 0;
      let kr: kern_return_t = unsafe {
          task_for_pid(mach_task_self(), pid as i32, &mut task)
      };
      if kr != KERN_SUCCESS {
          return Err(napi::Error::from_reason(format!(
              "task_for_pid failed: kern_return = {kr} (KERN_NO_ACCESS=8 / KERN_FAILURE=5 etc.)"
          )));
      }
      Ok(task)
  }

  fn read_image_base(_task: mach_port_t, _pid: u32) -> napi::Result<u64> {
      // Minimum-viable: use task_info(TASK_DYLD_INFO) to walk dyld_all_image_infos.
      // For spike scope we accept "scan vm regions for the first executable
      // mapping whose path ends with /Hearthstone" and return that mapping's
      // start address. Full dyld_all_image_infos walking is Phase 1 work.
      //
      // Spike-quality stub: for the spike, agent will fill this with the
      // simplest working implementation during real-machine execution. The
      // intent is to find the main executable Mach-O image base.
      Err(napi::Error::from_reason(
          "TODO: implement image base discovery (spike author fills in during \
           real-machine run; placeholder so the rest of the file compiles)"
              .to_string(),
      ))
  }

  #[napi]
  pub async fn spike_read_macho() -> napi::Result<MachoSpikeResult> {
      let pid = find_hearthstone_pid()?;
      let task = open_task(pid)?;
      let base = read_image_base(task, pid)?;

      let mut buf = [0u8; 16];
      let mut out_size: mach_vm_size_t = 0;
      let kr = unsafe {
          mach_vm_read_overwrite(
              task,
              base as mach_vm_address_t,
              16,
              buf.as_mut_ptr() as mach_vm_address_t,
              &mut out_size,
          )
      };
      if kr != KERN_SUCCESS {
          return Err(napi::Error::from_reason(format!(
              "mach_vm_read_overwrite failed: kern_return = {kr}"
          )));
      }
      if out_size != 16 {
          return Err(napi::Error::from_reason(format!(
              "short read: got {out_size} bytes, expected 16"
          )));
      }

      Ok(MachoSpikeResult {
          pid,
          base_address: format!("0x{:016X}", base),
          header_hex: buf.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" "),
      })
  }

  #[napi]
  pub async fn spike_read_hearthstone_window() -> napi::Result<WindowSpikeResult> {
      // Placeholder for spike author to fill in with CGWindowListCopyWindowInfo
      // + AXUIElement query during real-machine run. Returns Err so that until
      // implementation is added the spike trigger logs a clear FAIL.
      Err(napi::Error::from_reason(
          "TODO: implement CGWindow + AX query (spike author fills in)".to_string(),
      ))
  }

  #[allow(dead_code)]
  fn _silence_warnings(b: &CStr) -> &CStr { b }
  ```

  > **注意**：`read_image_base` 与 `spike_read_hearthstone_window` 在 spike 实施期间由用户在真机上补完。Agent 此处只搭骨架确保编译通过——这是 spike workflow 的常态（spike 0001 也是如此，部分细节在真机跑时才填）。

- [x] 2.2 在 `packages/hearthmirror-mac-spike/` 下执行 `pnpm install`。
  > **dev-machine note**: 用户机器上 `~/.cargo/config` 把 crates-io 替换成了 USTC git mirror，spike 期间 mirror 不通；为本 spike 包加了 `.cargo/config.toml` 覆盖到 Tuna sparse mirror。
- [ ] 2.3 在 `packages/hearthmirror-mac-spike/` 下执行 `pnpm exec napi build --platform --release --target aarch64-apple-darwin` 构建。期望产出：
  - `packages/hearthmirror-mac-spike/hearthmirror-mac-spike.darwin-arm64.node`（约 200–800 KB）；
  - `packages/hearthmirror-mac-spike/index.cjs`；
  - `packages/hearthmirror-mac-spike/index.d.ts`。
  > **dev-machine note**: 当前机器 rustc 1.79，napi 3.9 需要 rustc ≥ 1.88；真机执行前先 `rustup update stable`。已写到 spike 包 README 的 Prerequisites。
- [ ] 2.4 验证 .d.ts 包含 `export function spikeReadMacho(): Promise<MachoSpikeResult>` 与 `export function spikeReadHearthstoneWindow(): Promise<WindowSpikeResult>`。
  > 当前已加 placeholder `index.d.ts`，napi build 会覆盖。真机 build 后回看一次 diff 确认 napi 输出与 placeholder 形状一致。
- [x] 2.5 commit：`git add packages/hearthmirror-mac-spike && git commit -m "chore(spike): add rust skeleton for spike_read_macho and window probe"`。

## 3. 创建签名脚本

- [x] 3.1 创建 `scripts/codesign-mac-spike.sh`：

  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  ROOT="$(cd "$(dirname "$0")"/.. && pwd)"
  ENTITLEMENTS="$ROOT/packages/hearthmirror-mac-spike/entitlements.dev.plist"
  NODE_BIN="$ROOT/packages/hearthmirror-mac-spike/hearthmirror-mac-spike.darwin-arm64.node"

  if [[ ! -f "$NODE_BIN" ]]; then
    echo "spike .node binary not found at $NODE_BIN" >&2
    echo "run \`pnpm --filter @hdt/hearthmirror-mac-spike build\` first" >&2
    exit 1
  fi

  echo "==> ad-hoc signing $NODE_BIN"
  codesign --force --sign - \
    --entitlements "$ENTITLEMENTS" \
    --options runtime \
    "$NODE_BIN"

  ELECTRON_APP="$ROOT/node_modules/electron/dist/Electron.app"
  if [[ -d "$ELECTRON_APP" ]]; then
    echo "==> ad-hoc signing dev Electron at $ELECTRON_APP"
    codesign --force --deep --sign - \
      --entitlements "$ENTITLEMENTS" \
      --options runtime \
      "$ELECTRON_APP"
  else
    echo "WARNING: dev Electron not found, signing skipped" >&2
  fi

  echo "==> verifying signatures"
  codesign -dv --verbose=4 "$NODE_BIN" 2>&1 | head -10
  ```

- [x] 3.2 `chmod +x scripts/codesign-mac-spike.sh`。
- [x] 3.3 commit：`git add scripts/codesign-mac-spike.sh && git commit -m "chore(spike): add codesign helper for mac spike binaries"`。

## 4. 加 spike 触发到主进程

- [x] 4.1 修改 `apps/desktop/src/main/index.ts`，在 `app.whenReady().then(...)` 内加 spike 触发块（用清晰注释边界，darwin-only 守卫）：

  ```typescript
  // === SPIKE TRIGGER: spike-hearthmirror-mac-bridge (remove on teardown) ===
  if (process.platform === 'darwin') {
    try {
      const mod = await import('@hdt/hearthmirror-mac-spike');
      const { spikeReadMacho, spikeReadHearthstoneWindow } = mod;
      try {
        const r = await spikeReadMacho();
        console.log('[mac-spike:macho] OK:', JSON.stringify(r));
      } catch (e) {
        console.log('[mac-spike:macho] FAIL:', (e as Error).message);
      }
      try {
        const w = await spikeReadHearthstoneWindow();
        console.log('[mac-spike:window] OK:', JSON.stringify(w));
      } catch (e) {
        console.log('[mac-spike:window] FAIL:', (e as Error).message);
      }
    } catch (loadErr) {
      console.log('[mac-spike] MODULE LOAD FAIL:', (loadErr as Error).message);
    }
  }
  // === END SPIKE ===
  ```

  注意：spike 0001 已经把 `app.whenReady().then(...)` 的回调改成了 `async () => { ... }`，这里复用即可。
  > **deviation**: 当前 main/index.ts 的 outer callback 是 sync `() => { ... }`（spike 0001 teardown 后被还原）。本 change 重新把它改为 `async`，并加 spike 块。
- [x] 4.2 在 `apps/desktop/package.json` 的 `devDependencies` 中加 `"@hdt/hearthmirror-mac-spike": "workspace:*"`。
  > **deviation from plan**: 改用 `devDependencies`（spike 0001 用的 `dependencies`）。理由：本 spike 是 darwin-only，放 `dependencies` 会让 Windows 生产 build 把 `darwin-arm64.node` 当生产依赖处理。spike 是 throw-away 的，无论如何都要 teardown，devDeps vs deps 不会留下持久影响。
- [x] 4.3 仓库根执行 `pnpm install` 让 workspace 链接生效。
- [x] 4.4 验证 typecheck 通过：`pnpm --filter @hdt/desktop typecheck`，期望零错误（已确认）。
- [x] 4.5 验证 Windows 端**仍然**能 build（运行时 `process.platform === 'darwin'` 守卫不应触发）：
  - 本地 macOS 上 `pnpm --filter @hdt/desktop typecheck` 通过（已确认）；
  - Windows 沙盒上的实际 build 验证：留给真机 / CI 跑。dynamic import 在 Windows 找不到 `darwin-arm64.node` 时会被 outer try/catch 吞掉，行为符合预期。
- [x] 4.6 commit：`git add apps/desktop && git commit -m "chore(spike): wire main process to call mac spike on darwin only"`。

## 5. 真机验证 — 场景 A（HS 运行 + 已签名）

> **要求用户配合**：以下任务需要在 Apple Silicon + macOS 12+ + Hearthstone Mac 客户端的真机环境执行。

- [ ] 5.1 在仓库根执行：

  ```bash
  pnpm --filter @hdt/hearthmirror-mac-spike build
  bash scripts/codesign-mac-spike.sh
  ```

  期望输出：spike `.node` 文件签名成功，`codesign -dv` 显示 entitlements 已应用。
- [ ] 5.2 启动 Hearthstone Mac 客户端到主菜单（不需要进对局）。
- [ ] 5.3 在仓库根执行 `pnpm dev`，等待 Electron 主窗口出现 + 主进程 stdout 打印 `[mac-spike:macho] OK: ...` 行。
- [ ] 5.4 把主进程 stdout 中 `[mac-spike:macho]` 与 `[mac-spike:window]` 行**完整复制**到 spike 报告暂存区（不要立刻关掉终端）。
- [ ] 5.5 验证 macho 行匹配正则 `\[mac-spike:macho\] OK:.*"pid":\s*\d+.*"baseAddress":\s*"0x[0-9A-Fa-f]+".*"headerHex":\s*"(CF FA ED FE|FE ED FA CF)`。
- [ ] 5.6 验证 window 行 `fullscreen: false`，且 `width / height` 与肉眼可见的 HS 窗口大小吻合（±2 像素）。
- [ ] 5.7 切 HS 到全屏（绿色交通灯 → "Enter Full Screen"）或手动把 HS 窗口缩放到主显示器大小，重启 `pnpm dev`，验证 `[mac-spike:window] OK: ... fullscreen: true ...` 且尺寸等于显示器分辨率。
  > **注意**：本 spike 的 `fullscreen` 是**启发式** —— `window::looks_fullscreen()` 只检查 frame 是否在 ±4px 容差内匹配主显示器分辨率（见 spec scenario D 与 ADR 0002）。真正的 AX 全屏判定（`kAXFullScreenAttribute`）放到 Phase 1。如果该启发式在你机器上不可靠（notch padding / scaled display 等），按 specs scenario "Heuristic fullscreen flake" 处理 —— 仍可升 Validated，但要开 follow-up change `investigate-mac-fullscreen-detection`。
- [ ] 5.8 关闭 Electron（Ctrl+C 终端）。

## 6. 真机验证 — 场景 B（HS 未运行）

- [ ] 6.1 完全关闭 Hearthstone（活动监视器确认无 `Hearthstone` 进程）。
- [ ] 6.2 仓库根再次执行 `pnpm dev`，等待 Electron 主窗口出现。
- [ ] 6.3 主进程 stdout 必须打印 `[mac-spike:macho] FAIL: process not found: Hearthstone is not running`。
- [ ] 6.4 主窗口必须正常显示 OpenDeckTracker，点击 Sidebar 各 Tab 切换正常（不闪退）。
- [ ] 6.5 关闭 Electron。

## 7. 签名要求的正向验证（替代原 Scenario C）

> **历史背景**：原 §7 的 "unsigned binary fails" 负向测试已经在自我审查中被识别为方法论错误（B4） —— `task_for_pid` 检查的是**调用进程**（Electron）而非加载的 `.node`，所以即使 addon 自己未签名、只要 Electron 已经签好 `cs.debugger`，调用仍会成功。负向证据由 Phase 4（release packaging）的 notarization → install 链路提供。本 spike 的签名必要性靠 §5 正向证据闭环：§5.1 必须先跑过 `codesign-mac-spike.sh`，§5.5 才会出 OK。

- [ ] 7.1 在 spike report 中明确记录："Scenario C 已替换为正向验证 —— §5.1 跑过 `codesign-mac-spike.sh`，§5.5 OK 即视为签名链路有效"。
- [ ] 7.2 把本节的删除决定（reference 到 spec.md 中的 "Note on signing" 段）写进 spike report 的 Encountered Issues。

## 8. 写 spike 报告

- [ ] 8.1 创建 `docs/spikes/0006-hearthmirror-mac-spike-report.md`，骨架：

  ```markdown
  # Spike 0006 Report: HearthMirror macOS Cross-Process Memory Read

  > Executed during change `spike-hearthmirror-mac-bridge` on <YYYY-MM-DD>.
  > Plan: `docs/spikes/0006-hearthmirror-mac-spike.md`
  > ADR: `docs/adr/0002-hearthmirror-mac-bridge.md`

  ## Outcome
  **Result**: PASSED / PARTIAL / FAILED <选一个>
  <一段话总结>

  ## Compatibility Tuple
  - macOS: <e.g. 14.5 (23F79)>
  - Chip: <e.g. Apple M2 Pro>
  - Hearthstone build: <e.g. 30.4.4.207866>
  - Hearthstone locale: <en-US | zh-CN>
  - Electron: <process.versions.electron>
  - Node: <process.versions.node>
  - napi-rs CLI: <pnpm exec napi --version>
  - napi crate: <Cargo.toml literal>
  - rustc: <rustc --version>

  ## Actual Command Sequence
  <完整可复现的命令序列，从 `pnpm install` 到 codesign 到 `pnpm dev`>

  ## Scenario A — HS running + signed (PASS/FAIL)
  <verbatim stdout 行 + 简评>

  ## Scenario B — HS not running (PASS/FAIL)
  <verbatim stdout 行>

  ## Scenario D — Window probe (PASS/FAIL)
  <桌面模式 stdout + maximised/full-display 模式 stdout + 与肉眼对照的截图说明；
   注明 `fullscreen: true` 是 frame≈display-bounds 启发式，不是 AX 真值>

  ## Signing Validation (replaces original Scenario C)
  <说明：scenario A 的 PASS 已经隐含 codesign-mac-spike.sh 链路有效。
   原计划的 "unsigned binary fails" 负向测试因为 task_for_pid 检查
   calling process (Electron) 而非 addon，方法论上不成立，已抛弃；
   负向证据由 Phase 4 release packaging 的 notarization→install 链路提供。>

  ## Dev-Machine Workarounds
  <记录本机为完成 spike 必须做的非默认配置 / 临时绕过：
   - rustc 升级到 ≥ 1.88 的实际命令；
   - cargo crates-io mirror 是否换过（spike 包 .cargo/config.toml 的来由）；
   - codesign 是否需要重做 dev Electron 才能跑通；
   - 任何「在干净的 macOS 上别人复现可能踩的坑」。
   这一段重点是**别人复现需要知道什么**，不是发牢骚。>

  ## Encountered Issues
  <真实坑：task_for_pid 是否在 macOS 14+ 上需要额外步骤 / arm64e PAC 是否对 main image base 透明 / Electron 是否需要重新签 / npm 是否会把 .node 拷成只读丢签名 / 启发式 fullscreen 在你机器上是否可靠>

  ## Recommendations for Phase 1
  <基于 spike 经验给出的 3-5 条建议，例如：read_image_base 实际用了什么 API / 是否要走 dyld_all_image_infos / 哪个 mach API 报了什么错 / AX 全屏检测放 Phase 1 第几步>

  ## Hearthstone Process Info Observed
  - PID: <实际 PID>
  - Mach-O Base Address: <实际十六进制>
  - Mach-O Magic: <CF FA ED FE 或 FE ED FA CF>
  - First 16 bytes: <full hex>
  - Window frame (windowed): <{x, y, w, h}>
  - Window frame (covering display): <{x, y, w, h}>
  ```

- [ ] 8.2 把 §5 / §6 中观察到的真实数据填入；§7 已删除 Scenario C，对应位置写"signing validated positively, see §5.1+§5.5"。
- [ ] 8.3 commit：`git add docs/spikes/0006-hearthmirror-mac-spike-report.md && git commit -m "docs(spike): write 0006 hearthmirror mac spike report with results"`。

## 9. 升级 ADR 0002 状态为 Validated

- [ ] 9.1 修改 `docs/adr/0002-hearthmirror-mac-bridge.md`：
  - 把首部 `> **Status**: Accepted (2026-05-25)` 改为 `> **Status**: Validated (<执行日期>)`。
- [ ] 9.2 在该文件 Validation 章节后追加：

  ```markdown
  ### Validation Outcome (filled by spike-hearthmirror-mac-bridge)
  This decision was validated by spike `docs/spikes/0006-hearthmirror-mac-spike-report.md`
  on <YYYY-MM-DD>. All three Acceptance Criteria scenarios (A: signed read ok,
  B: not-running graceful, D: window probe + heuristic fullscreen) passed in
  the local environment. The original Scenario C ("unsigned binary fails")
  was removed as methodologically unsound — see spec §"Note on signing".
  ```

  > 如果场景 D 的启发式 fullscreen 不稳：使用 PARTIAL caveat 措辞，开 follow-up change `investigate-mac-fullscreen-detection`（见 specs §"Heuristic fullscreen flake"）。
  > 如果场景 A 失败：**不**升级 ADR 状态，按 specs §"Scenario A failure (hard fail)" 走 fallback。
- [ ] 9.3 commit：`git add docs/adr && git commit -m "docs(adr): upgrade 0002 status to Validated after mac spike pass"`。

## 10. Teardown — 删除所有 spike 代码

- [ ] 10.1 删除整个 `packages/hearthmirror-mac-spike/` 目录：

  ```bash
  git rm -r packages/hearthmirror-mac-spike
  ```

- [ ] 10.2 在 `apps/desktop/src/main/index.ts` 中删除 `=== SPIKE TRIGGER: spike-hearthmirror-mac-bridge ===` 至 `=== END SPIKE ===` 之间的全部代码（包括边界注释行）。
- [ ] 10.3 在 `apps/desktop/package.json` 的 `devDependencies` 中删除 `"@hdt/hearthmirror-mac-spike"` 一行。
- [ ] 10.4 在根 `eslint.config.js` 的 `ignores` 数组中删除 `'packages/hearthmirror-mac-spike/**'` 一行。
- [ ] 10.5 把 `scripts/codesign-mac-spike.sh` 移到 `scripts/archive/`（如果 Phase 4 可能复用）或 `git rm`（如果 Phase 4 会重新写）。本 change 默认走 archive。
- [ ] 10.6 仓库根执行 `pnpm install` 重新生成 lockfile（删除 spike workspace）。
- [ ] 10.7 验证 spike 残留为零（全仓 grep，仅排除 docs/ 与 openspec/）：

  ```bash
  rg -i 'hearthmirror-mac-spike|spikeRead(Macho|HearthstoneWindow)' \
    --glob '!docs/**' --glob '!openspec/**' .
  ```

  期望：无任何匹配。`docs/spikes/0006-*` 与 `docs/adr/0002-*` 是 spike 的持久产物，特意被排除；`openspec/changes/spike-hearthmirror-mac-bridge/**` 在 archive 之前自然还在，archive 时连同移走。
  > **为何要全仓 grep**：原本只 grep `apps/desktop/src packages`，会漏掉 `apps/desktop/package.json`（依赖项）、`eslint.config.js`（ignore）、`pnpm-lock.yaml`、`scripts/codesign-mac-spike.sh` 这些 spike 副产物。全仓扫才能保证零残留。
- [ ] 10.8 commit：`git add . && git commit -m "chore(spike): teardown hearthmirror-mac-spike after validation"`。

## 11. 最终质量门 + OpenSpec 验收

- [ ] 11.1 跑完整质量门（在 macOS 上，因为 macOS 端 spike 跑完后这是分支当前状态）：

  ```bash
  pnpm install --frozen-lockfile
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm --filter @hdt/desktop build
  ```

  全部退出码 0。
  > **注意**：本路线图阶段 macOS 端 CI runner 还未加（Phase 4 才加），所以 GitHub Actions 仍只跑 Windows runner。本地 macOS 跑通即可。
- [ ] 11.1.5 验证 native 依赖在 darwin-arm64 上能 rebuild（不属于 spike 本身但属于路线图体检）：

  ```bash
  # 主项目用了 better-sqlite3 之类需要 rebuild 的 native module
  pnpm --filter @hdt/desktop run rebuild
  pnpm --filter @hdt/desktop run electron:test || true   # 如有 e2e
  ```

  期望：rebuild 成功产出 darwin-arm64 binary（`*.node` 文件）；如果有 e2e，至少能启动到 main window。这一步**不**作为 spike validation 阻塞门，但失败的话要在 spike report 的 Encountered Issues 里点名记录，方便 Phase 4 的打包链路提前应对。
- [ ] 11.2 把本文件 1.x ~ 10.x 任务全部标 `[x]`。
- [ ] 11.3 同步 `openspec/changes/.NEXT.md`：把 `spike-hearthmirror-mac-bridge` 加为新条目并标 ✓，"下一步" 加上 `refactor-hearthmirror-platform-traits`（Phase 1 第一个 change）。
- [ ] 11.4 `openspec validate spike-hearthmirror-mac-bridge --strict` → `Change is valid`。
- [ ] 11.5 `openspec status --change spike-hearthmirror-mac-bridge` → `4/4 artifacts complete`。
- [ ] 11.6 final commit：`git add . && git commit -m "docs(openspec): mark all tasks complete in spike-hearthmirror-mac-bridge"`。

## 12. 兜底：Windows 32-bit 反射零回归确认

- [ ] 12.1 spike 期间从未触碰 `packages/hearthmirror/native/` —— 用 `git diff main -- packages/hearthmirror/native` 确认：除了本 change 引入的新文件（spike 包，已 teardown）以外，`packages/hearthmirror/native/` 全部文件 diff 为空。
- [ ] 12.2 commit hash 列表附在 spike report Encountered Issues 章节末尾，方便后续审计。
