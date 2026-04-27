## Why

`Rewrite_Design.md` 假设的 `ffi-napi` 已经废弃（Windows + Node ≥ 18 无法编译），并且基于"必须 32 位"的旧约束推导出整套 32 位 Node + 32 位 Rust 架构。本 change 之前我们已经验证：

- **`ffi-napi` 死了**（Windows ≥ Node 18），现代候选有 `koffi` / `napi-rs` / `ffi-rs`。
- **64 位进程可以直接用 `ReadProcessMemory()` 读取 32 位炉石进程**，只需把目标指针当作 `u32` 处理；32 位 Node/Electron 不再是硬性约束。
- Electron 自身在 64 位上的发布质量、性能、生态都明显好于 32 位（32 位发布质量已经下滑，多次出现 ia32 ffmpeg 包错位等 bug）。

这意味着 `Rewrite_Design.md` 的"x86 32 位是硬约束"结论是基于过时假设，需要在动手写任何 native 代码**之前**重新评审，否则我们会在错误的工程化基础上花掉数周。本 change 的产出是一份 ADR + 一个最小的 spike 计划，用最小代价把"哪种 bridge 架构最适合"这件事钉死，再让后续的 `add-hearthmirror-bridge` change 在确定的方向上展开实施。

## What Changes

- 新增 `docs/adr/0001-hearthmirror-bridge.md` ADR 文档，按 [Michael Nygard ADR 模板](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) 客观对比 4 个候选方案：
  - **A. `koffi`** — 运行时 FFI，纯 C++ 引擎，64 位 Node 调任意 DLL。
  - **B. 32 位 `napi-rs`** — 编译时绑定，但要求 32 位 Electron。
  - **C. 32 位独立 Rust 子进程 + stdio JSON-RPC** — 进程隔离，64 位 Electron 编排 32 位 Rust 二进制。
  - **D. 64 位 `napi-rs`** — 编译时绑定，64 位 Rust 直接在 Electron 主进程内通过 64 位 `ReadProcessMemory` 读 32 位炉石内存。
- 给出 **Choice + Rationale + 已知风险与缓解**。
- 新增 `docs/spikes/0001-hearthmirror-spike.md` spike 计划，定义一个 0.5–1 天工时、高风险点驱动的最小验证：能否用入选方案在 64 位 Node 中读到正在运行的 `Hearthstone.exe` 的 PE 头 magic bytes（`0x4D 0x5A` "MZ"）。
- **更新** `Rewrite_Design.md` 顶部加一个 **Status / Supersession** 段，明确"x86 32 位约束已被本 ADR 推翻，正确架构以本 ADR 为准"，避免后续读者按旧文档动工。
- **更新** `openspec/changes/.NEXT.md`，把 `decide-hearthmirror-bridge` 标记为已开工，同时把"方案 D"加入候选列表（之前漏写）。

### Non-goals（本 change **不**做的事）

- ❌ 不写任何 Rust 代码（spike 的 *计划* 写出来，但 spike 的 *执行* 留给单独的 change `add-hearthmirror-bridge-spike`）。
- ❌ 不引入 `napi-rs` / `koffi` / `ffi-rs` / `@napi-rs/cli` / Rust 工具链等任何新依赖。
- ❌ 不修改任何 `apps/` 或 `packages/` 下的源码。
- ❌ 不实现 `IReflection` 的任何业务方法（这都是后续 change 的事）。
- ❌ 不解决 Mono 偏移量随版本变化的问题（在 ADR 中识别为已知风险，缓解策略放进 spike 计划，实施留给后续）。
- ❌ 不做代码签名 / Windows Defender 白名单 / 杀软兼容相关工作。

## Capabilities

### New Capabilities

- `hearthmirror-bridge`：定义"HDT.js 通过哪种 bridge 架构访问 Hearthstone 进程内存"这件事的契约 —— 包含位数、进程拓扑、Rust ↔ TypeScript 边界形态、错误恢复语义、性能预算。本 change 引入的是**架构契约**，不是运行时实现；后续 `add-hearthmirror-bridge` change 在此契约下实施 native 代码。

### Modified Capabilities

（本 change 不修改任何现有 spec。）

## Impact

- **代码**：零代码改动。本 change 完全是文档型。
- **新文件**：
  - `docs/adr/0001-hearthmirror-bridge.md`（ADR）
  - `docs/spikes/0001-hearthmirror-spike.md`（spike 计划）
- **修改文件**：
  - `Rewrite_Design.md` 顶部加 Status 段
  - `openspec/changes/.NEXT.md` 调整候选清单
- **依赖**：无新增（spike 实施时才会引入 napi-rs 等）。
- **CI/CD**：无影响。
- **风险**：本 change 的最大风险是"做了 ADR 但被后续实现偏离"——`add-hearthmirror-bridge` change 在 design.md 中必须显式回引这份 ADR 的 Choice，且任何偏离必须在那份 design 的 Decisions 段重新论证。
