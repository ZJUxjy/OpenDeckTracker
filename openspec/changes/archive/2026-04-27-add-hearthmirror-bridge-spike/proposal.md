## Why

[ADR 0001](../../../docs/adr/0001-hearthmirror-bridge.md) 选定**方案 D（64 位 napi-rs，同进程）**，但当前状态为 `Accepted`（基于推理），尚未在真实环境中验证：

1. napi-rs 3.x 是否能与当前的 Node 22 + Electron 33 ABI 兼容、能成功被 `BrowserWindow` 主进程 `import` 调用？
2. 64 位 Rust 进程能否用标准 `OpenProcess` + `EnumProcessModulesEx(LIST_MODULES_32BIT)` + `ReadProcessMemory` 真正读到一个 32 位运行中的 `Hearthstone.exe` 模块基址前 16 字节？

这两个问题任意一个失败，ADR 0001 就需要被 ADR 0002 推翻并回退到方案 C，影响后续所有 hearthmirror 相关 change。所以**必须**在写任何 production 代码之前用 ≤ 1 工作日的 spike 钉死。

本 change 的产出**主要是 spike 报告**（`docs/spikes/0001-hearthmirror-spike-report.md`）与 ADR 0001 状态升级（`Accepted` → `Validated`）。Spike 期间会临时新建 `packages/hearthmirror-spike/` 包跑代码，spike 出口前删除该包。

## What Changes

- 临时新建 `packages/hearthmirror-spike/`：
  - `Cargo.toml` 用 napi-rs 3.x，target 仅 `x86_64-pc-windows-msvc`，依赖 `windows` crate 的最小 features。
  - `src/lib.rs` 暴露一个 `#[napi]` 函数 `spike_read_mz()`，按 [`docs/spikes/0001-hearthmirror-spike.md`](../../../docs/spikes/0001-hearthmirror-spike.md) "Implementation Sketch" 写。
  - `package.json` 用 `@napi-rs/cli` 跑 `napi build` 产出 `.node`。
- 在 `apps/desktop/src/main/ipc.ts` 临时增加 `ipcMain.handle('spike:readMz', ...)`，调用 spike 模块。
- 在 `apps/desktop/src/preload/index.ts` 临时暴露 `window.hdt.spike.readMz()`。
- 在 `apps/desktop/src/main/index.ts` 主窗口启动后立即跑一次 spike 并把结果 `console.log` 到主进程 stdout（无需手动触发）。
- 跑 `pnpm dev`，在两种场景下验收：
  - **场景 A**（用户手动开炉石）：主进程 stdout 必须打印 PID + 模块基址 + `4D 5A 90 00 ...` hex 头。
  - **场景 B**（炉石未运行）：主进程 stdout 必须打印明确的 "process not found" 错误，Electron 窗口正常显示 FIRESTONE。
- 在 `docs/spikes/0001-hearthmirror-spike-report.md` 记录：
  - 实际命令序列（让后续 `add-hearthmirror-bridge` 复用）
  - 遇到的真实坑（napi-rs 版本号 / windows crate features / Electron ABI / 是否需要管理员）
  - 性能基线（连续 1000 次 16 字节 ReadProcessMemory 的总耗时 / 平均 µs）
- 把 `docs/adr/0001-hearthmirror-bridge.md` 的 Status 从 `Accepted` 改为 `Validated`，并在 Consequences 末尾追加一行 `Validated by: docs/spikes/0001-hearthmirror-spike-report.md`。
- **删除** `packages/hearthmirror-spike/`、`apps/desktop/src/main/ipc.ts` 中的 spike handler、preload 中的 spike 暴露、main/index.ts 中的 spike 自动调用 —— 全部 spike 代码 teardown。
- 在 `apps/desktop/src/renderer/src/env.d.ts` 中临时添加的 `window.hdt.spike` 类型定义也一并删除（如果有）。

### Non-goals

- ❌ 不实现任何 Mono 解析（mono.dll 定位、根域查找、ECMA-335 元数据）。
- ❌ 不引入 `packages/hearthmirror/` 正式包（留给 `add-hearthmirror-bridge`）。
- ❌ 不做 prebuild 二进制分发优化。
- ❌ 不写单元测试（spike 是 throw-away code）。
- ❌ 不改 CI workflow（spike 不进 CI）。
- ❌ 不解决 Windows Defender / 杀软误报。
- ❌ 不写 IReflection 任何业务方法。
- ❌ 不在 renderer UI 上加任何 spike 入口（避免 spike teardown 时漏改）。

## Capabilities

### New Capabilities

- `hearthmirror-spike-validation`：spike 验收契约 —— 定义"如何确认 ADR 0001 的方案 D 在真实环境中可行"，包括场景 A/B 的 Pass/Fail 判定、spike report 必须记录的内容、ADR 状态升级条件、teardown 必须清理的范围。本 capability 在 spike 出口（teardown 完成）后自动失效（report 已存在 + ADR 升级 = 契约履行）。

### Modified Capabilities

- `hearthmirror-bridge`（来自 `decide-hearthmirror-bridge`）：把 ADR 0001 的状态从 `Accepted` 升级到 `Validated`，并要求 `Rewrite_Design.md` 的 supersession banner 也指向 spike report 作为补充证据。

## Impact

- **新增临时代码**：`packages/hearthmirror-spike/` 整个目录（spike 出口前删除）。
- **临时修改**：`apps/desktop/src/main/{index.ts,ipc.ts}` 与 `src/preload/index.ts` 加 spike 触发逻辑（spike 出口前删除）。
- **持久产出**：
  - `docs/spikes/0001-hearthmirror-spike-report.md`（新增）
  - `docs/adr/0001-hearthmirror-bridge.md`（Status / Consequences 修改）
  - `openspec/changes/.NEXT.md`（标记 spike 已完成，next = `add-hearthmirror-bridge`）
- **依赖**：临时新增 `@napi-rs/cli`（dev dep, spike 出口前 `pnpm remove`），Rust 端临时 `Cargo.lock` 在 spike 出口前删除（连同整个 spike 包）。
- **风险**：spike 失败的 risk 已在 [`docs/spikes/0001-hearthmirror-spike.md`](../../../docs/spikes/0001-hearthmirror-spike.md) "Decision Outcomes" 段定义，触发 ADR 0002 fallback 流程。
