> 实施约定：本 change 是 spike 性质（throw-away code）。代码任务用 conventional commits 的 `chore(spike):` 前缀。Teardown 用 `chore(spike): teardown ...`。文档任务用 `docs:`。

## 1. 创建 spike 包骨架

- [x] 1.1 创建目录 `packages/hearthmirror-spike/src/`。
- [x] 1.2 创建 `packages/hearthmirror-spike/package.json`：

  ```json
  {
    "name": "@hdt/hearthmirror-spike",
    "version": "0.0.0",
    "private": true,
    "main": "index.cjs",
    "types": "index.d.ts",
    "scripts": {
      "build": "napi build --platform --release",
      "build:debug": "napi build --platform"
    },
    "napi": {
      "name": "hearthmirror-spike",
      "triples": { "defaults": false, "additional": ["x86_64-pc-windows-msvc"] }
    },
    "devDependencies": {
      "@napi-rs/cli": "^3"
    }
  }
  ```

- [x] 1.3 创建 `packages/hearthmirror-spike/Cargo.toml`：

  ```toml
  [package]
  name = "hearthmirror-spike"
  version = "0.0.0"
  edition = "2021"
  publish = false

  [lib]
  crate-type = ["cdylib"]

  [dependencies]
  napi = { version = "3", default-features = false, features = ["napi9", "async"] }
  napi-derive = "3"

  [dependencies.windows]
  version = "0.58"
  features = [
    "Win32_Foundation",
    "Win32_System_Threading",
    "Win32_System_Diagnostics_ToolHelp",
    "Win32_System_ProcessStatus",
    "Win32_System_Diagnostics_Debug",
  ]

  [build-dependencies]
  napi-build = "2"

  [profile.release]
  lto = true
  ```

- [x] 1.4 创建 `packages/hearthmirror-spike/build.rs`：

  ```rust
  fn main() {
      napi_build::setup();
  }
  ```

- [x] 1.5 创建 `packages/hearthmirror-spike/README.md`：

  ```markdown
  # @hdt/hearthmirror-spike

  > **Exploratory.** This package validates ADR 0001 by checking whether
  > 64-bit napi-rs + standard `ReadProcessMemory` can read the 32-bit
  > Hearthstone.exe process. **Do not depend on this package.** It will be
  > deleted at the end of the `add-hearthmirror-bridge-spike` change.

  See `docs/spikes/0001-hearthmirror-spike.md` for context.
  ```

- [x] 1.6 在根 `eslint.config.js` 的 `ignores` 数组中加入 `'packages/hearthmirror-spike/**'`。

## 2. 写 Rust spike 代码

- [x] 2.1 创建 `packages/hearthmirror-spike/src/lib.rs`，实现 `spike_read_mz`：

  ```rust
  #![deny(unsafe_op_in_unsafe_fn)]

  use std::time::Instant;

  use napi::bindgen_prelude::*;
  use napi_derive::napi;
  use windows::core::PWSTR;
  use windows::Win32::Foundation::{CloseHandle, HANDLE, HMODULE};
  use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;
  use windows::Win32::System::Diagnostics::ToolHelp::{
      CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
      TH32CS_SNAPPROCESS,
  };
  use windows::Win32::System::ProcessStatus::{EnumProcessModulesEx, LIST_MODULES_32BIT};
  use windows::Win32::System::Threading::{
      OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
  };

  const TARGET_EXE: &str = "Hearthstone.exe";

  #[napi(object)]
  pub struct SpikeResult {
      pub pid: u32,
      pub base_address: String,
      pub header_hex: String,
      pub elapsed_micros: u32,
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

  fn find_pid(target: &str) -> napi::Result<Option<u32>> {
      let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }.map_err(map_err)?;
      let mut entry = PROCESSENTRY32W {
          dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
          ..Default::default()
      };

      let mut found: Option<u32> = None;
      let res = unsafe { Process32FirstW(snapshot, &mut entry) };
      if res.is_ok() {
          loop {
              let name = pwstr_to_string(&entry.szExeFile);
              if name.eq_ignore_ascii_case(target) {
                  found = Some(entry.th32ProcessID);
                  break;
              }
              if unsafe { Process32NextW(snapshot, &mut entry) }.is_err() {
                  break;
              }
          }
      }

      // 关闭 snapshot handle，忽略错误（已经拿到结果）
      let _ = unsafe { CloseHandle(snapshot) };
      Ok(found)
  }

  fn read_mz(pid: u32) -> napi::Result<SpikeResult> {
      let started = Instant::now();

      let h_process = unsafe {
          OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid)
      }
      .map_err(map_err)?;

      // 安全包装：保证 handle 一定关闭
      struct HandleGuard(HANDLE);
      impl Drop for HandleGuard {
          fn drop(&mut self) {
              if !self.0.is_invalid() {
                  let _ = unsafe { CloseHandle(self.0) };
              }
          }
      }
      let _guard = HandleGuard(h_process);

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
              "EnumProcessModulesEx returned 0 modules (LIST_MODULES_32BIT may not be supported on this system)"
                  .to_string(),
          ));
      }

      let base = modules[0];
      let mut buf = [0u8; 16];
      let mut read: usize = 0;
      unsafe {
          ReadProcessMemory(
              h_process,
              base.0 as *const _,
              buf.as_mut_ptr() as *mut _,
              16,
              Some(&mut read),
          )
      }
      .map_err(map_err)?;

      if read != 16 {
          return Err(napi::Error::from_reason(format!(
              "ReadProcessMemory short read: got {} bytes, expected 16",
              read
          )));
      }

      let elapsed = started.elapsed();
      Ok(SpikeResult {
          pid,
          base_address: format!("0x{:08X}", base.0 as usize),
          header_hex: buf
              .iter()
              .map(|b| format!("{:02X}", b))
              .collect::<Vec<_>>()
              .join(" "),
          elapsed_micros: elapsed.as_micros().min(u32::MAX as u128) as u32,
      })
  }

  #[napi]
  pub async fn spike_read_mz() -> napi::Result<SpikeResult> {
      // tokio::task::spawn_blocking 比较合适，但 napi-rs default 已经在 worker thread 跑
      // async fn，所以这里直接同步调用即可（不会阻塞 main event loop）
      let pid = find_pid(TARGET_EXE)?
          .ok_or_else(|| napi::Error::from_reason("process not found: Hearthstone.exe is not running".to_string()))?;
      read_mz(pid)
  }
  ```

- [x] 2.2 在 `packages/hearthmirror-spike/` 下执行 `pnpm install`（仅这个包，需要 `--ignore-scripts=false` 否则不会装 napi 子依赖；如果根 `pnpm.onlyBuiltDependencies` 已包含必要项就行）。
- [x] 2.3 在 `packages/hearthmirror-spike/` 下执行 `pnpm exec napi build --platform --release` 构建。期望产出：
  - `packages/hearthmirror-spike/hearthmirror-spike.win32-x64-msvc.node`（约 100–500 KB）
  - `packages/hearthmirror-spike/index.cjs`（CJS 加载器）
  - `packages/hearthmirror-spike/index.d.ts`（TypeScript 类型）
- [x] 2.4 验证 .d.ts 包含 `export function spikeReadMz(): Promise<SpikeResult>`。
- [x] 2.5 commit：`git add packages/hearthmirror-spike eslint.config.js && git commit -m "chore(spike): add hearthmirror-spike rust crate with napi-rs binding"`。

## 3. 加 spike 触发到主进程

- [x] 3.1 修改 `apps/desktop/src/main/index.ts`，在 `app.whenReady().then(...)` 内加 spike 触发块（用清晰注释边界）：

  ```typescript
  // === SPIKE TRIGGER (remove on teardown of add-hearthmirror-bridge-spike) ===
  try {
    const { spikeReadMz } = await import('@hdt/hearthmirror-spike');
    try {
      const result = await spikeReadMz();
      console.log('[spike:readMz] OK:', JSON.stringify(result));
    } catch (err) {
      console.log('[spike:readMz] FAIL:', (err as Error).message);
    }
  } catch (loadErr) {
    console.log('[spike:readMz] MODULE LOAD FAIL:', (loadErr as Error).message);
  }
  // === END SPIKE ===
  ```

  注意：原 main/index.ts 用 `void app.whenReady().then(() => {...})`，要把回调改为 `async () => {...}` 才能 `await import()`。
- [x] 3.2 在 `apps/desktop/package.json` 的 `dependencies` 中加 `"@hdt/hearthmirror-spike": "workspace:*"`。
- [x] 3.3 仓库根执行 `pnpm install` 让 workspace 链接生效。
- [x] 3.4 验证 typecheck 通过：`pnpm --filter @hdt/desktop typecheck`，期望零错误（通过 `index.d.ts` 解析）。
- [x] 3.5 commit：`git add apps/desktop && git commit -m "chore(spike): wire main process to call spike_read_mz once on startup"`。

## 4. 场景 A 验证（用户手动开炉石）

- [x] 4.1 **要求用户配合**：本任务需要用户在本机启动炉石客户端到主菜单（不需要进对局）。
- [x] 4.2 在仓库根执行 `pnpm dev`，等待 Electron 主窗口出现 + 主进程 stdout 打印 `[spike:readMz] OK: ...` 行。
- [x] 4.3 把主进程 stdout 中 `[spike:readMz]` 行**完整复制**到 spike 报告暂存区（不要立刻关掉终端）。
- [x] 4.4 验证 stdout 那行匹配正则 `\[spike:readMz\] OK:.*"pid":\s*\d+.*"baseAddress":\s*"0x[0-9A-Fa-f]+".*"headerHex":\s*"4D 5A 90 00`。
- [x] 4.5 关闭 Electron 窗口（Ctrl+C 终端）。

## 5. 场景 B 验证（炉石未运行）

- [x] 5.1 **要求用户配合**：完全关闭炉石客户端（Task Manager 确认无 `Hearthstone.exe` 进程）。
- [x] 5.2 仓库根再次执行 `pnpm dev`，等待 Electron 主窗口出现。
- [x] 5.3 主进程 stdout 必须打印 `[spike:readMz] FAIL: process not found: Hearthstone.exe is not running`。
- [x] 5.4 主窗口必须正常显示 "FIRESTONE"，点击 Sidebar 各 Tab 切换正常（不闪退）。
- [x] 5.5 关闭 Electron。

## 6. 性能基线（场景 A 的扩展）

- [x] 6.1 临时修改 spike 触发块，循环跑 1000 次：

  ```typescript
  const N = 1000;
  const startedAt = performance.now();
  let lastResult: unknown = null;
  for (let i = 0; i < N; i++) {
    lastResult = await spikeReadMz();
  }
  const elapsed = performance.now() - startedAt;
  console.log(`[spike:perf] ${N} calls in ${elapsed.toFixed(2)}ms = ${(elapsed * 1000 / N).toFixed(2)} µs/call`);
  console.log('[spike:perf] last result:', JSON.stringify(lastResult));
  ```

- [x] 6.2 用户开炉石后跑 `pnpm dev`，记录 `[spike:perf]` 行的微秒数。
- [x] 6.3 把这个数字记录到 spike report 的 Performance Baseline 章节。
- [x] 6.4 把循环代码恢复成单次调用版本（可选，不恢复也行因为下一步要全删）。

## 7. 写 spike 报告

- [x] 7.1 创建 `docs/spikes/0001-hearthmirror-spike-report.md`，骨架：

  ```markdown
  # Spike 0001 Report: HearthMirror napi-rs Cross-Architecture Read

  > Executed during change `add-hearthmirror-bridge-spike` on <YYYY-MM-DD>.
  > Plan: `docs/spikes/0001-hearthmirror-spike.md`
  > ADR: `docs/adr/0001-hearthmirror-bridge.md`

  ## Outcome
  **Result**: PASSED / FAILED <选一个>
  <一段话总结>

  ## Actual Command Sequence
  <完整可复现的命令序列，从 `pnpm install` 到 `pnpm dev`>

  ## Encountered Issues
  <真实坑，如：napi-rs 版本号实际锁了 X.Y / windows crate 某 feature 缺失 / EnumProcessModulesEx flag 真实表现 / 是否需要管理员权限 / Defender 是否拦截>

  ## Performance Baseline
  - 单次 spike_read_mz: <真实 µs 数值>
  - 1000 次循环总耗时: <ms>
  - 平均: <µs/call>

  ## Recommendations for add-hearthmirror-bridge
  <基于 spike 经验给出的 3-5 条建议>

  ## Hearthstone Process Info Observed
  - PID: <实际 PID>
  - Base Address: <实际十六进制>
  - PE Magic: 4D 5A
  - DOS Stub Bytes 0-15: <16 字节 hex>
  - PE Header Machine Field: <如 0x014C = i386>
  ```

- [x] 7.2 把任务 4/5/6 中观察到的真实数据填入。
- [x] 7.3 commit：`git add docs/spikes/0001-hearthmirror-spike-report.md && git commit -m "docs(spike): write 0001 hearthmirror spike report with results"`。

## 8. 升级 ADR 0001 状态为 Validated

- [x] 8.1 修改 `docs/adr/0001-hearthmirror-bridge.md`：
  - 把首部 `> **Status**: Accepted (2026-04-19)` 改为 `> **Status**: Validated (<执行日期>)`
- [x] 8.2 在该文件 Consequences 章节末尾追加：

  ```markdown
  ### Validation
  This decision was validated by spike `docs/spikes/0001-hearthmirror-spike-report.md`
  on <YYYY-MM-DD>. Both Acceptance Criteria scenarios (Hearthstone running / not running)
  passed in the local environment.
  ```

- [x] 8.3 commit：`git add docs/adr && git commit -m "docs(adr): upgrade 0001 status to Validated after spike pass"`。

## 9. Teardown — 删除所有 spike 代码

- [x] 9.1 删除整个 `packages/hearthmirror-spike/` 目录：

  ```powershell
  git rm -r packages/hearthmirror-spike
  ```

- [x] 9.2 在 `apps/desktop/src/main/index.ts` 中删除 `=== SPIKE TRIGGER ===` 至 `=== END SPIKE ===` 之间的全部代码（包括边界注释行），并把回调改回 `() => {...}`（如果原来是 sync）。
- [x] 9.3 在 `apps/desktop/package.json` 的 `dependencies` 中删除 `"@hdt/hearthmirror-spike"` 一行。
- [x] 9.4 在根 `eslint.config.js` 的 `ignores` 数组中删除 `'packages/hearthmirror-spike/**'` 一行。
- [x] 9.5 仓库根执行 `pnpm install` 重新生成 lockfile（删除 spike workspace）。
- [x] 9.6 验证 spike 残留为零：

  ```powershell
  rg -i 'hearthmirror-spike|spike[A-Z][a-zA-Z]*Mz' apps/desktop/src
  ```

  期望：无任何匹配。
- [x] 9.7 commit：`git add . && git commit -m "chore(spike): teardown hearthmirror-spike after successful validation"`。

## 10. 最终质量门 + OpenSpec 验收

- [x] 10.1 跑完整质量门：

  ```powershell
  pnpm install --frozen-lockfile
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm --filter @hdt/desktop build
  ```

  全部退出码 0。
- [x] 10.2 把本文件 1.x ~ 9.x 任务全部标 `[x]`。
- [x] 10.3 同步 `openspec/changes/.NEXT.md`：把 `add-hearthmirror-bridge-spike` 标 ✓，"下一步" 改为 `add-hearthmirror-bridge`。
- [x] 10.4 `openspec validate add-hearthmirror-bridge-spike --strict` → `Change is valid`。
- [x] 10.5 `openspec status --change add-hearthmirror-bridge-spike` → `4/4 artifacts complete`。
- [x] 10.6 final commit：`git add . && git commit -m "docs(openspec): mark all tasks complete in add-hearthmirror-bridge-spike"`。
