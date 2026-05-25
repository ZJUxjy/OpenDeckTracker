# Spike 0006: HearthMirror macOS Cross-Process Memory Read

> Time-boxed: ≤ 3 working days. References: [`docs/adr/0002-hearthmirror-mac-bridge.md`](../adr/0002-hearthmirror-mac-bridge.md), [`docs/macos-roadmap.md`](../macos-roadmap.md).

## Goal

在最小工作量下端到端验证 ADR 0002 选定方案 A（Rust + napi-rs，cfg 分平台）在真实 macOS 环境下的三个最高风险点：

1. **`task_for_pid` + entitlement 链路可走通**——经 ad-hoc `codesign --sign - --entitlements ...` 处理后的二进制能在 macOS 12+ 上拿到 `Hearthstone` 的 task port，进而 `mach_vm_read_overwrite` 读出 Mach-O magic（`0xFEEDFACF` for 64-bit, big or little endian）。
2. **napi-rs `darwin-arm64` 二进制能被当前 Electron 37 + Node 22 主进程加载**——验证工具链兼容（与 Windows 端 `win32-x64-msvc` 同样工作流）。
3. **`CGWindowListCopyWindowInfo` 能拿到 Hearthstone 窗口 frame**——验证不需要写 NSWindow 子类即可拿到 overlay 定位所需的几何信息；fullscreen 用启发式（frame ≈ 主显示器 bounds）打底，真实 AX 检测放 Phase 1。

## Acceptance Criteria

Spike 在以下三种场景下输出预期结果。**spike 需在 Apple Silicon 真机上跑**（Intel Mac 不在路线范围）。

> **关于签名的负向验证**：原计划包含「场景 C：未签名 → task_for_pid 失败」，自我审查中识别为方法论错误（`task_for_pid` 检查的是**调用进程** Electron 而非 addon），已抛弃。签名链路的负向证据由 Phase 4（release packaging）的 notarization → install 链路提供；本 spike 内部只做正向验证：场景 A 必须先跑过 `scripts/codesign-mac-spike.sh` 才会 PASS。

### 场景 A — Hearthstone 正在运行 + spike 二进制已 ad-hoc 签名

- 在 Electron 主进程触发 spike 入口（启动时一次性触发，与 spike 0001 模式一致）。
- 主进程 stdout 必须打印：
  - Hearthstone 进程 PID（非零正整数）；
  - `Hearthstone.app/Contents/MacOS/Hearthstone` Mach-O image 的 `base address`（典型 ~ `0x100000000` ± ASLR slide）；
  - base 处前 16 字节 hex（**必须以 `CF FA ED FE`（little-endian `MH_MAGIC_64`）或 `FE ED FA CF`（big-endian）开头**）。

### 场景 B — Hearthstone 未运行

- 同样的 spike 入口触发。
- Promise reject 一个 `Error`，message 含 `"process not found"`（小写不敏感）。
- Electron 主窗口**不崩溃**，能正常切路由。

### 场景 D — 窗口几何探测 + 启发式 fullscreen

- 在场景 A 同一会话里跑窗口探测：
  - `CGWindowListCopyWindowInfo` 找到 owner == `Hearthstone` 的 onscreen 窗口（layer 0），输出 frame `{x, y, width, height}`；
  - 启发式 fullscreen：frame 在 ±4px 内匹配主显示器 (`CGDisplayBounds(CGMainDisplayID())`) 时报 `fullscreen: true`，否则 `false`；
  - 验证桌面模式下 frame 与实际窗口位置吻合（用 `screencapture -i` 截图比对）；窗口被拉到覆盖整个主显示器时 `fullscreen == true` 且尺寸等于显示器分辨率。
  - **限制**：本启发式不区分 macOS 的真 spaces "Enter Full Screen" vs 手动最大化；真值检测（AXFullScreen attribute）放 Phase 1。

## Out of Scope

明确**不**在 spike 范围（留给后续 Phase 1 实施 changes）：

- AX-based 全屏判定（`kAXFullScreenAttribute`）—— Phase 1 实装；
- Mono 64-bit 反射、`Assembly-CSharp` 定位、字段偏移探测；
- Mono runtime 静态变量解析、ServiceLocator、IReflection 业务方法；
- TypeScript 端 `HearthMirror` wrapper 的 macOS 接入；
- Power.log 路径检测（留给 `add-hearthwatcher-mac-paths`）；
- Overlay 窗口跟随、NSWindow level / collectionBehavior（留给 `port-overlay-window-to-mac`）；
- 单元测试、E2E 测试、CI 集成；
- 正式 Apple Developer ID 签名 + Notarization（留给 Phase 4）；
- prebuild 二进制分发优化、universal binary（已确认不出）。

## Implementation Sketch

> 供实施者参考，不约束。整体仿照 spike 0001（`packages/hearthmirror-spike/`）模式：临时新建 throw-away 包，spike 出口前 teardown。

- 临时新建 `packages/hearthmirror-mac-spike/` workspace 包：
  - `Cargo.toml` 用 napi-rs 模板，target 仅 `aarch64-apple-darwin`，`crate-type = ["cdylib"]`。
  - 依赖（macOS only，gated by `[target."cfg(target_os = \"macos\")".dependencies]`）：
    ```toml
    napi = { version = "3", default-features = false, features = ["napi9", "async"] }
    napi-derive = "3"
    mach2 = "0.4"
    libproc = "0.14"
    core-foundation = "0.10"
    core-graphics = "0.25"
    ```
    > 不引 `objc2` 系列：spike 的 fullscreen 用 frame≈display 启发式，不需要 AX。
  - `build.rs` 同 spike 0001。
  - `entitlements.dev.plist` 必须同时包含 task_for_pid 路径和 Electron Hardened Runtime 路径，否则 re-sign 后 Electron 自己启动失败：
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
      <!-- Electron 37 / V8 (Hardened Runtime) - MUST stay or re-sign breaks Electron -->
      <key>com.apple.security.cs.allow-jit</key>
      <true/>
      <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
      <true/>
      <key>com.apple.security.cs.disable-library-validation</key>
      <true/>
    </dict>
    </plist>
    ```
- Rust 调用序列：
  1. `libproc::listpids(ProcType::ProcAllPIDS)` 拿全部 pid → 用 `pidpath` 找包含 `/MacOS/Hearthstone` 的 path。
  2. `task_for_pid(mach_task_self(), pid, &mut task)` 拿 `task_t`；失败结构化返回 KERN_NO_ACCESS / KERN_FAILURE 标签。
  3. `task_info(task, TASK_DYLD_INFO, ...)` 拿到 `dyld_all_image_infos` 远端地址（注意 `task_dyld_info` 是 `#[repr(C, packed(4))]`，u64 字段用 `ptr::read_unaligned` 安全读）。
  4. `mach_vm_read_overwrite` 读 `dyld_all_image_infos` header → 拿 `infoArray` 指针 → 走 `dyld_image_info` 数组找 path 含 `/MacOS/Hearthstone` 的 entry → 拿到 main image base。
  5. `mach_vm_read_overwrite(task, base, 16, &mut buf)` 拿头 16 字节验 magic。
  6. 把 `(pid, base, hex_string)` 包成 `MachoSpikeResult` 返回 napi-rs。
- 窗口探测：
  - `CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID)` 拿 onscreen 窗口列表。
  - 因为 `core-graphics` 0.25 中 `kCGNullWindowID` / `kCGWindowList*` 常量在 `core_graphics::window` 模块（不再是 `display`），import 路径要走对。
  - 用**无类型的** `CFArray<CFDictionary>` + 手动 `dict.find(key.to_void())` 解析（typed `CFDictionary<CFString, CFType>` 的 `CFType::downcast` 在 0.10 上不工作）。
  - 启发式 fullscreen：frame.w/h 在 ±4px 内匹配 `CGDisplayBounds(CGMainDisplayID())` 即报 `true`。
- 主进程触发块（ad-hoc 签名后的 .node 在 macOS 上）：
  ```ts
  // === SPIKE TRIGGER (remove on teardown) ===
  if (process.platform === 'darwin') {
    try {
      const { spikeReadMacho, spikeReadHearthstoneWindow } = await import('@hdt/hearthmirror-mac-spike');
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
- 签名步骤（spike 期间必跑一次）：
  ```bash
  cd packages/hearthmirror-mac-spike
  pnpm exec napi build --platform --release --target aarch64-apple-darwin
  cd ../..
  bash scripts/codesign-mac-spike.sh   # 同时签 .node 和 dev Electron.app
  ```
- 验证：场景 A/B 各跑一遍，场景 D 在场景 A 同一会话里跑。

## Decision Outcomes

### Spike PASS（推进 Phase 1）

- 三个场景输出预期 → ADR 0002 升级为 `Validated`。
- 写 spike report 到 `docs/spikes/0006-hearthmirror-mac-spike-report.md`。
- 在 `openspec/changes/.NEXT.md` 标记 spike 完成，next = `refactor-hearthmirror-platform-traits`。
- Teardown spike 包，回归干净状态。

### Spike PARTIAL（场景 D 启发式 fullscreen 不可靠）

- 在 spike report 中详细记录哪种屏幕配置下启发式失效（例如外接 4K + scaled、HiDPI notch、splitview）。
- 创建 follow-up change `investigate-mac-fullscreen-detection` 在 Phase 1 用 AX 真值替换。
- 仍升级 ADR 0002 为 `Validated`，但在 Consequences 加 caveat 引用上述 follow-up。

### Spike FAIL（场景 A 失败 = `mach_vm_read` 完全读不到 / napi-rs darwin-arm64 加载失败）

- 触发 ADR 0002 fallback：考虑方案 B（借 HSTracker HearthMirror dylib）。
- 写一份 ADR 0003 `hearthmirror-mac-fallback-bridge` 阐述决策切换。
- macos 路线全面延期，重新规划 Phase 1。

## Performance Note

性能基线**不在本 spike 验收范围**——本 spike 只回答「能不能读」，不回答「读得多快」。性能测量留给 Phase 1 的 `add-hearthmirror-mac-memory` change，与 Windows spike 0001 的 ~252 µs/call 做横向对比。
