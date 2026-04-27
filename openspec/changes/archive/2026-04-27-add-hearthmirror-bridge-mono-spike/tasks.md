> 实施约定：spike 性质（throw-away）。代码用 `chore(spike):` 前缀；teardown 用 `chore(spike): teardown ...`；文档用 `docs:`。
> 工作目录默认 `D:\code\HDT_js`。

## 1. 创建 spike 包骨架

- [x] 1.1 创建目录 `packages/hearthmirror-mono-spike/src/`。
- [x] 1.2 创建 `packages/hearthmirror-mono-spike/package.json`（沿用 spike 01 模板，name `@hdt/hearthmirror-mono-spike`，napi.name `hearthmirror-mono-spike`）。
- [x] 1.3 创建 `packages/hearthmirror-mono-spike/Cargo.toml`：

  ```toml
  [package]
  name = "hearthmirror-mono-spike"
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
    "Win32_System_LibraryLoader",
  ]

  [build-dependencies]
  napi-build = "2"

  [profile.release]
  lto = true
  ```

- [x] 1.4 创建 `packages/hearthmirror-mono-spike/build.rs`（同 spike 01）。
- [x] 1.5 创建 `packages/hearthmirror-mono-spike/README.md`（标记 exploratory，引用 spike 02 计划与 ADR 0001）。
- [x] 1.6 在根 `eslint.config.js` 的 `ignores` 加 `'packages/hearthmirror-mono-spike/**'`。

## 2. Rust 实现：模块查找 + PE 解析 + 反汇编 + MonoDomain 读取

- [x] 2.1 创建 `packages/hearthmirror-mono-spike/src/lib.rs`，按以下骨架实现：

  ```rust
  #![deny(unsafe_op_in_unsafe_fn)]

  use std::time::Instant;

  use napi_derive::napi;
  use windows::Win32::Foundation::{CloseHandle, HANDLE, HMODULE};
  use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;
  use windows::Win32::System::Diagnostics::ToolHelp::{
      CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
      TH32CS_SNAPPROCESS,
  };
  use windows::Win32::System::ProcessStatus::{
      EnumProcessModulesEx, GetModuleBaseNameW, GetModuleInformation,
      LIST_MODULES_32BIT, MODULEINFO,
  };
  use windows::Win32::System::Threading::{
      OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
  };

  const TARGET_EXE: &str = "Hearthstone.exe";
  const PREFERRED_MONO: &str = "mono-2.0-bdwgc.dll";

  #[napi(object)]
  pub struct MonoSpikeResult {
      pub pid: u32,
      pub mono_module_name: String,
      pub mono_module_base: String,
      pub mono_module_size: u32,
      pub pe_machine: String,
      pub pe_subsystem: String,
      pub mono_get_root_domain_rva: String,
      pub mono_get_root_domain_va: String,
      pub mono_get_root_domain_first_bytes: String,
      pub global_root_domain_addr: String,
      pub disasm_pattern: String,
      pub root_domain_ptr: String,
      pub domain_assemblies_ptr: String,
      pub loaded_images_ptr: String,
      pub elapsed_micros: u32,
      pub notes: Vec<String>,
  }

  // === 工具函数 ===
  fn map_err(e: windows::core::Error) -> napi::Error { /* same as spike 01 */ }
  fn pwstr_to_string(slice: &[u16]) -> String { /* same as spike 01 */ }
  struct HandleGuard(HANDLE);
  impl Drop for HandleGuard { /* same as spike 01 */ }

  // === Step 1: find Hearthstone PID and mono module ===
  fn find_pid(target: &str) -> napi::Result<Option<u32>> { /* same as spike 01 */ }

  fn find_mono_module(h_process: HANDLE, notes: &mut Vec<String>)
      -> napi::Result<(String, HMODULE, MODULEINFO)> {
      // EnumProcessModulesEx with LIST_MODULES_32BIT
      // For each module: GetModuleBaseNameW
      //   1. exact match PREFERRED_MONO (case-insensitive) → return
      //   2. else collect any "mono*" candidates
      // After loop: if exact found, use it; else if exactly 1 candidate, use it + push note;
      //             else error "mono runtime not found"
  }

  // === Step 2: read PE Optional Header ===
  fn read_pe_header(h_process: HANDLE, base: HMODULE)
      -> napi::Result<(u16 /* machine */, u16 /* subsystem */, u32 /* export rva */, u32 /* export size */)> {
      // Read 0x400 bytes from base
      // DOS header at +0x00; e_lfanew at +0x3C
      // PE signature at base + e_lfanew
      // COFF header at +0x04: machine (u16, +0x00)
      // Optional header at +0x18; verify magic == 0x010B (PE32) or 0x020B (PE32+)
      // Subsystem at offset depending on PE32 vs PE32+
      // Data Directories: PE32 → +0x60, PE32+ → +0x70; entry [0] = Export Table
  }

  // === Step 3: parse export table to find mono_get_root_domain ===
  fn find_export_rva(h_process: HANDLE, base: HMODULE, export_rva: u32, export_size: u32, name: &str)
      -> napi::Result<u32> {
      // Read export directory (40 bytes)
      // Read NumberOfNames * u32 name pointer table
      // Read NumberOfFunctions * u32 export address table
      // Read NumberOfNames * u16 ordinal table
      // For each name pointer: read C string, compare to `name`
      // If match: ordinal = ordinal_table[i]; return address_table[ordinal]
  }

  // === Step 4: extract global root_domain address from function bytes ===
  // Pattern A: A1 [4 bytes] C3              (mov eax, [moffs32]; ret)
  // Pattern B: 55 89 E5 A1 [4 bytes] 5D C3  (push ebp; mov ebp,esp; mov eax,[moffs32]; pop ebp; ret)
  fn extract_global_addr(bytes: &[u8]) -> (Option<u32>, &'static str) {
      if bytes.len() >= 6 && bytes[0] == 0xA1 && bytes[5] == 0xC3 {
          let addr = u32::from_le_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]);
          return (Some(addr), "A1+ret");
      }
      if bytes.len() >= 9 && bytes[0..3] == [0x55, 0x89, 0xE5] && bytes[3] == 0xA1 && bytes[8] == 0xC3 {
          let addr = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
          return (Some(addr), "push ebp/A1/pop ebp/ret");
      }
      (None, "unknown")
  }

  // === Steps 5-6 ===
  fn read_u32_le(h_process: HANDLE, addr: u32) -> napi::Result<u32> {
      let mut buf = [0u8; 4];
      let mut read: usize = 0;
      unsafe {
          ReadProcessMemory(h_process, addr as *const _, buf.as_mut_ptr() as *mut _,
                            4, Some(&mut read))
      }.map_err(map_err)?;
      Ok(u32::from_le_bytes(buf))
  }

  // === Main entry ===
  #[napi]
  pub async fn spike_locate_mono() -> napi::Result<MonoSpikeResult> {
      let started = Instant::now();
      let mut notes: Vec<String> = vec![];

      let pid = find_pid(TARGET_EXE)?
          .ok_or_else(|| napi::Error::from_reason("process not found: Hearthstone.exe is not running"))?;

      let h_process = unsafe {
          OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid)
      }.map_err(map_err)?;
      let _guard = HandleGuard(h_process);

      let (mono_name, mono_base, mod_info) = find_mono_module(h_process, &mut notes)?;
      let (machine, subsystem, export_rva, _export_size) = read_pe_header(h_process, mono_base)?;
      let func_rva = find_export_rva(h_process, mono_base, export_rva, _export_size, "mono_get_root_domain")?;

      let func_va = mono_base.0 as u32 + func_rva;

      // Read 16 bytes of function code
      let mut func_bytes = [0u8; 16];
      let mut read: usize = 0;
      unsafe {
          ReadProcessMemory(h_process, func_va as *const _, func_bytes.as_mut_ptr() as *mut _,
                            16, Some(&mut read))
      }.map_err(map_err)?;
      let first_bytes_hex = func_bytes.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");

      let (global_addr_opt, pattern) = extract_global_addr(&func_bytes);

      let (global_addr_str, root_domain_str, dom_assem_str, loaded_imgs_str) = match global_addr_opt {
          Some(global_addr) => {
              let root_domain = read_u32_le(h_process, global_addr)?;
              if root_domain == 0 {
                  notes.push("root_domain pointer is NULL — Hearthstone may not be fully loaded yet".to_string());
                  (format!("0x{:08X}", global_addr), "0x00000000".to_string(),
                   "<skipped: root_domain NULL>".to_string(), "<skipped: root_domain NULL>".to_string())
              } else {
                  // §7.2: domain_assemblies @ +0x0C, loaded_images @ +0x14
                  let dom_assem = read_u32_le(h_process, root_domain + 0x0C)?;
                  let loaded_imgs = read_u32_le(h_process, root_domain + 0x14)?;
                  (format!("0x{:08X}", global_addr),
                   format!("0x{:08X}", root_domain),
                   format!("0x{:08X}", dom_assem),
                   format!("0x{:08X}", loaded_imgs))
              }
          }
          None => {
              notes.push("disasm pattern unknown — see firstBytes for offline analysis".to_string());
              ("<skipped: pattern unknown>".to_string(),
               "<skipped: pattern unknown>".to_string(),
               "<skipped: pattern unknown>".to_string(),
               "<skipped: pattern unknown>".to_string())
          }
      };

      let elapsed = started.elapsed();
      Ok(MonoSpikeResult {
          pid,
          mono_module_name: mono_name,
          mono_module_base: format!("0x{:08X}", mono_base.0 as usize),
          mono_module_size: mod_info.SizeOfImage,
          pe_machine: format!("0x{:04X}", machine),
          pe_subsystem: format!("0x{:04X}", subsystem),
          mono_get_root_domain_rva: format!("0x{:08X}", func_rva),
          mono_get_root_domain_va: format!("0x{:08X}", func_va),
          mono_get_root_domain_first_bytes: first_bytes_hex,
          global_root_domain_addr: global_addr_str,
          disasm_pattern: pattern.to_string(),
          root_domain_ptr: root_domain_str,
          domain_assemblies_ptr: dom_assem_str,
          loaded_images_ptr: loaded_imgs_str,
          elapsed_micros: elapsed.as_micros().min(u32::MAX as u128) as u32,
          notes,
      })
  }
  ```

- [x] 2.2 在 `packages/hearthmirror-mono-spike/` 跑 `pnpm exec napi build --platform --release`，期望产出 `.node` 文件。
- [x] 2.3 commit：`git add packages/hearthmirror-mono-spike eslint.config.js && git commit -m "chore(spike): add hearthmirror-mono-spike rust crate"`。

## 3. 主进程 SPIKE TRIGGER

- [x] 3.1 在 `apps/desktop/src/main/index.ts` 的 `app.whenReady().then(async () => {...})` 末尾追加：

  ```typescript
  // === SPIKE TRIGGER (remove on teardown of add-hearthmirror-bridge-mono-spike) ===
  try {
    const { spikeLocateMono } = await import('@hdt/hearthmirror-mono-spike');
    try {
      const result = await spikeLocateMono();
      console.log('[spike:mono] OK:', JSON.stringify(result, null, 2));
    } catch (err) {
      console.log('[spike:mono] FAIL:', (err as Error).message);
    }
  } catch (loadErr) {
    console.log('[spike:mono] MODULE LOAD FAIL:', (loadErr as Error).message);
  }
  // === END SPIKE ===
  ```

- [x] 3.2 在 `apps/desktop/package.json` `dependencies` 加 `"@hdt/hearthmirror-mono-spike": "workspace:*"`。
- [x] 3.3 在仓库根跑 `pnpm install`。
- [x] 3.4 跑 `pnpm typecheck`，期望零错误。
- [x] 3.5 commit：`git add apps/desktop pnpm-lock.yaml && git commit -m "chore(spike): wire main process to call spikeLocateMono on startup"`。

## 4. 场景 A 验证（炉石主菜单运行中）

- [x] 4.1 **要求用户配合**：打开炉石客户端到主菜单（**等加载完毕后再操作**，约 5 秒，否则 root_domain 可能仍为 NULL）。
- [x] 4.2 杀掉所有残留 electron 进程：`Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force`。
- [x] 4.3 跑 `pnpm dev`，等待主进程 stdout 打印 `[spike:mono] OK: {...}` 多行 JSON。
- [x] 4.4 完整复制 JSON 内容到 spike report 暂存区。
- [x] 4.5 验证关键字段：
  - `monoModuleName` 含 `mono-2.0-bdwgc.dll` 或以 `mono-` 开头
  - `peMachine` = `0x014C`（i386）
  - `monoGetRootDomainFirstBytes` 不全为 `00 00 ...`
  - `rootDomainPtr` 不为 `0x00000000` 也不是 `<skipped:...>`
  - `domainAssembliesPtr` 与 `loadedImagesPtr` 都是合理 32 位地址（不是 0、不是越界数）
- [x] 4.6 关闭 Electron。

## 5. 场景 B 验证（炉石未运行）

- [x] 5.1 关闭炉石。
- [x] 5.2 杀残留 electron + 跑 `pnpm dev`。
- [x] 5.3 主进程 stdout 必须打印 `[spike:mono] FAIL: process not found: Hearthstone.exe is not running`。
- [x] 5.4 主窗口正常显示 FIRESTONE，Sidebar 切换正常。
- [x] 5.5 关闭 Electron。

## 6. 写 spike 报告

- [x] 6.1 创建 `docs/spikes/0002-hearthmirror-mono-spike-report.md`，骨架：

  ```markdown
  # Spike 0002 Report: HearthMirror Mono Runtime Locate

  > Executed during change `add-hearthmirror-bridge-mono-spike` on <YYYY-MM-DD>.
  > Plan: spike implementation in `add-hearthmirror-bridge-mono-spike` change
  > ADR: `docs/adr/0001-hearthmirror-bridge.md`
  > Builds on: spike 01 report `0001-hearthmirror-spike-report.md`

  ## Outcome
  **Result**: PASSED / PARTIAL / FAILED <选一个>
  <一段话总结>

  ## Hearthstone Runtime Info
  - PID: <实际值>
  - Mono module: <name + base + size>
  - PE Machine: <0x014C 或其他>
  - PE Subsystem: <值>
  - Hearthstone.exe path: <若能从模块列表读出>
  - Unity version (best effort): <若能确认>

  ## 6-step Link Output
  完整 JSON 输出（直接贴 stdout 的 [spike:mono] OK 行）。

  ## Observed Offsets vs §7.2
  | 结构.字段 | §7.2 偏移 | 实测偏移 | 状态 |
  |---|---|---|---|
  | MonoDomain.domain_assemblies | 0x0C | 0x0C | ✅ 一致 |
  | MonoDomain.loaded_images | 0x14 | <实测> | ✅ / ⚠️ 偏差 |

  ## Encountered Issues
  - <真实坑：编译器优化、PE 字段位置、ASLR 后地址、是否需要管理员、Defender 是否拦截 ReadProcessMemory>

  ## Recommendations for add-hearthmirror-bridge
  1. PE 解析建议用 pelite（vs 手写）
  2. 反汇编建议用 iced-x86（vs byte pattern）
  3. mono module 名匹配策略
  4. 需要等"主菜单加载完毕"再启动会话的运行时检测
  5. 偏移量配置化的策略
  ...

  ## Decision Outcome
  - ✅ **PASSED → 启动 add-hearthmirror-bridge** 或
  - ⚠️ **PARTIAL → 启动 add-hearthmirror-bridge 但加版本适配模块** 或
  - ❌ **FAILED → 开 ADR 0002，重新评估架构**
  ```

- [x] 6.2 把 task 4 中观察到的真实数据填入 + Observed Offsets 表 + 真实 Recommendations。
- [x] 6.3 commit：`git add docs/spikes && git commit -m "docs(spike): write 0002 hearthmirror mono spike report"`。

## 7. 升级 ADR 0001

- [x] 7.1 在 `docs/adr/0001-hearthmirror-bridge.md` 的 Validation 段末尾追加：

  ```markdown
  Spike 02 (mono runtime locate) PASSED on <date>; see
  `docs/spikes/0002-hearthmirror-mono-spike-report.md`.
  ```

- [x] 7.2 commit：`git add docs/adr && git commit -m "docs(adr): record spike 02 validation in ADR 0001"`。

## 8. Teardown

- [x] 8.1 删 spike 包：`git rm -r packages/hearthmirror-mono-spike`，然后物理删除剩余目录 `Remove-Item -Recurse -Force packages/hearthmirror-mono-spike`（如有）。
- [x] 8.2 删 `apps/desktop/src/main/index.ts` 中 `=== SPIKE TRIGGER ===` 至 `=== END SPIKE ===` 块（spike 02 的那个；spike 01 的早已 teardown）。
- [x] 8.3 删 `apps/desktop/package.json` 的 `"@hdt/hearthmirror-mono-spike": "workspace:*"`。
- [x] 8.4 删 `eslint.config.js` 的 `'packages/hearthmirror-mono-spike/**'` ignore。
- [x] 8.5 跑 `pnpm install` 重生成 lockfile。
- [x] 8.6 验证残留为零：`rg -i 'mono-spike|spikeLocateMono' apps/desktop/src` 命中 0。
- [x] 8.7 commit：`git add . && git commit -m "chore(spike): teardown hearthmirror-mono-spike"`。

## 9. 同步 .NEXT.md + 最终验收

- [x] 9.1 在 `openspec/changes/.NEXT.md` 把 `add-hearthmirror-bridge-mono-spike` 标 ✓，next = `add-hearthmirror-bridge`。
- [x] 9.2 跑全套质量门：`pnpm install --frozen-lockfile && pnpm cards:download && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @hdt/desktop build`，全 0 退出码。
- [x] 9.3 把本文件 1.x ~ 9.x 全部标 `[x]`。
- [x] 9.4 `openspec validate add-hearthmirror-bridge-mono-spike --strict` → valid。
- [x] 9.5 `openspec status --change add-hearthmirror-bridge-mono-spike` → 4/4 done。
- [x] 9.6 final commit：`git add . && git commit -m "docs(openspec): mark all tasks complete in add-hearthmirror-bridge-mono-spike"`。
