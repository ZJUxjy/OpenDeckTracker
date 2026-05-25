## Why

[ADR 0002](../../../docs/adr/0002-hearthmirror-mac-bridge.md) 选定 **方案 A（Rust + napi-rs，cfg 分平台）** 作为 OpenDeckTracker 的 macOS HearthMirror 桥接架构，但目前状态为 `Accepted`（基于推理与对照 ADR 0001），尚未在真实 macOS 环境中验证以下三个最高风险点：

1. **`task_for_pid` + `com.apple.security.cs.debugger` entitlement 经 ad-hoc `codesign --sign -` 处理后，能否在 macOS 12+ 上拿到 `Hearthstone` 的 task port，并 `mach_vm_read_overwrite` 读出 Mach-O magic？**
2. **napi-rs `darwin-arm64` 二进制能否被当前 Electron 37 + Node 22 主进程顺利加载？**
3. **`CGWindowListCopyWindowInfo` + Accessibility API 能否拿到 Hearthstone 桌面 / 全屏两种状态下的 frame + fullscreen 信息？**

任意一个失败，ADR 0002 就需要由 ADR 0003 推翻或调整：

- 如果 (1) 失败：触发 fallback 到 HSTracker HearthMirror dylib（方案 B），整个 Phase 1 路线重排。
- 如果 (2) 失败：触发对 napi-rs / Electron ABI 兼容性的深度排查，可能要降级 Electron 或 napi-rs 版本。
- 如果 (3) 失败：Phase 3（Overlay）方案需要重做。

所以**必须**在写任何 Phase 1 production 代码之前用 ≤ 3 工作日的 spike 钉死。

本 change 的产出**主要是 spike 报告**（`docs/spikes/0006-hearthmirror-mac-spike-report.md`）与 ADR 0002 状态升级（`Accepted` → `Validated`）。Spike 期间会临时新建 `packages/hearthmirror-mac-spike/` 包跑代码，spike 出口前删除该包（与 spike 0001 模式一致）。

## What Changes

- 临时新建 `packages/hearthmirror-mac-spike/`（macos 分支独有，**不影响 Windows**）：
  - `Cargo.toml` 用 napi-rs 3.x，target 仅 `aarch64-apple-darwin`，依赖 `mach2` / `libproc` / `core-foundation` / `objc2` / `objc2-app-kit` / `objc2-application-services` 的最小 features。
  - `src/lib.rs` 暴露两个 `#[napi]` async 函数：
    - `spike_read_macho()` — 找 Hearthstone PID → `task_for_pid` → 找 main image base → `mach_vm_read_overwrite` 16 字节，返回 `(pid, base, hex_string)`。
    - `spike_read_hearthstone_window()` — `CGWindowListCopyWindowInfo` 找 owner == `Hearthstone` → `AXUIElementCreateApplication` 拿 fullscreen → 返回 `(x, y, width, height, fullscreen)`。
  - `entitlements.dev.plist` 声明 `com.apple.security.cs.debugger` + `com.apple.security.cs.disable-library-validation`。
  - `package.json` 用 `@napi-rs/cli` 跑 `napi build --target aarch64-apple-darwin`。
  - `README.md` 标注「Exploratory，spike 出口前删除」。
- 在 `apps/desktop/src/main/index.ts` 临时增加一个**仅 darwin 触发**的 spike 块，启动后跑一次 `spike_read_macho()` 与 `spike_read_hearthstone_window()`，把结果 `console.log` 到主进程 stdout（无需手动触发）。
  - **Windows 端 main/index.ts 行为零变更**——spike 块用 `if (process.platform === 'darwin')` 守卫。
- 在 `apps/desktop/package.json` 临时加 `"@hdt/hearthmirror-mac-spike": "workspace:*"`（spike 出口前删除）。
- 写一个 `scripts/codesign-mac-spike.sh` 帮 spike 二进制 ad-hoc 签名（应用 entitlements）。
- 用户在 Apple Silicon 真机上跑 4 个场景（见 [`docs/spikes/0006-hearthmirror-mac-spike.md`](../../../docs/spikes/0006-hearthmirror-mac-spike.md) §Acceptance Criteria）：
  - **场景 A**：HS 运行 + spike 已签 → `[mac-spike:macho] OK: ...` 且 hex 头匹配 `^(CF FA ED FE|FE ED FA CF)`。
  - **场景 B**：HS 未运行 → `[mac-spike:macho] FAIL: process not found`。
  - **场景 C**：HS 运行 + spike **未签** → `[mac-spike:macho] FAIL: task_for_pid failed (KERN_FAILURE|KERN_NO_ACCESS)`。
  - **场景 D**：HS 运行 + 桌面/全屏分别测一次 → `[mac-spike:window] OK: { width, height, fullscreen }` 与实际肉眼匹配。
- 在 `docs/spikes/0006-hearthmirror-mac-spike-report.md` 记录：
  - 实际命令序列（让 Phase 1 各 change 复用）；
  - 真实坑（`task_for_pid` 在 macOS 12 / 13 / 14 / 15 上的可能差异；arm64e PAC 是否对 `mach_vm_read` 透明；`AXIsProcessTrusted` 是否 spike 期间也需要）；
  - macOS / 芯片 / Hearthstone build 版本三元组；
  - 签名命令的实际形态；
  - 性能基线**不在本 spike 范围**（留给 Phase 1）。
- 把 `docs/adr/0002-hearthmirror-mac-bridge.md` 的 Status 从 `Accepted` 改为 `Validated`，并在 Consequences 末尾追加 `Validated by: docs/spikes/0006-hearthmirror-mac-spike-report.md`。
- **Teardown** 整个 spike 包 + 主进程 spike 块 + desktop 依赖项，最终零残留。

### Non-goals

- ❌ 不实现任何 Mono 64-bit 反射（`Assembly-CSharp` 定位 / 字段偏移 / IReflection 业务方法）。
- ❌ 不引入正式的 macOS 平台抽象 trait（留给 `refactor-hearthmirror-platform-traits`）。
- ❌ 不接 TypeScript 端 `HearthMirror` wrapper。
- ❌ 不做 prebuild 二进制分发优化、universal binary。
- ❌ 不写单元测试（spike 是 throw-away code）。
- ❌ 不改 CI workflow（spike 不进 CI）。
- ❌ 不解决 Apple Developer ID 正式签名 / Notarization（留给 Phase 4）。
- ❌ **不动 `packages/hearthmirror/native/` 现有 Windows 实现 / `Cargo.toml` / `package.json`**——本 change 只新建独立 spike 包。
- ❌ 不接 Power.log 路径检测（留给 Phase 2）。
- ❌ 不改 overlay 窗口管理逻辑（留给 Phase 3）。
- ❌ 不做性能 benchmark（留给 Phase 1）。
- ❌ 不在 renderer UI 上加任何 spike 入口（避免 spike teardown 时漏改）。

## Capabilities

### New Capabilities

- `hearthmirror-mac-spike-validation`：spike 验收契约——定义「如何确认 ADR 0002 的方案 A 在真实 macOS 环境中可行」，包括四个场景的 Pass/Fail 判定、spike report 必须记录的内容、ADR 状态升级条件、teardown 必须清理的范围。本 capability 在 spike 出口（teardown 完成）后自动失效（report 已存在 + ADR 升级 = 契约履行）。

### Modified Capabilities

- `hearthmirror-bridge`（来自 `decide-hearthmirror-bridge`）：扩展为「跨平台 Rust + napi-rs 桥接」，正式纳入 macOS 端的 cfg 分平台实现要求；ADR 0001 与 ADR 0002 互为补充。

## Impact

- **新增临时代码**：`packages/hearthmirror-mac-spike/` 整个目录（spike 出口前删除）。
- **临时修改**：
  - `apps/desktop/src/main/index.ts`：darwin-only spike 块（spike 出口前删除）；
  - `apps/desktop/package.json`：临时 workspace 依赖（spike 出口前删除）；
  - `scripts/codesign-mac-spike.sh`：spike 期间使用，spike 出口前删除（或归档到 `scripts/archive/`）。
- **持久产出**：
  - `docs/spikes/0006-hearthmirror-mac-spike-report.md`（新增）；
  - `docs/spikes/0006-hearthmirror-mac-spike.md`（已在本 change 之前作为路线图一部分写入，作为 spike plan）；
  - `docs/adr/0002-hearthmirror-mac-bridge.md`（Status 升级 + Validated 段追加）；
  - `openspec/changes/.NEXT.md`（标记 spike 已完成，next = `refactor-hearthmirror-platform-traits`）。
- **依赖**：临时新增 napi-rs 工具链对 macOS target 的支持（dev dep, spike 出口前 `pnpm remove`），Rust 端临时 `Cargo.lock` 在 spike 出口前删除（连同整个 spike 包）。
- **Windows 端零影响**：本 change 不修改 `packages/hearthmirror/native/` 任何文件，Windows CI 不受影响。
- **风险**：spike 失败的处置已在 [`docs/spikes/0006-hearthmirror-mac-spike.md`](../../../docs/spikes/0006-hearthmirror-mac-spike.md) §Decision Outcomes 段定义。

## Sequencing notes

- 本 change 必须在 macOS 实机上跑（Apple Silicon + macOS 12+ + Hearthstone Mac 客户端）；agent 可以完成全部代码 / 文档骨架，但 §4-§6 的真机验证步骤需要用户配合执行并把 stdout 反馈回来。
- 本 change 与 Windows 端任何进行中的 work 都**不**互斥（在 macos 分支独立推进）。
