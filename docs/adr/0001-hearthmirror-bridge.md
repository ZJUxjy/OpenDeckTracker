# ADR 0001: Hearthstone Memory Bridge Architecture

> **Status**: Accepted (2026-04-19)
> **Deciders**: HDT.js core team
> **Supersedes**: Architecture sections (§1–6) of [`Rewrite_Design.md`](../../Rewrite_Design.md)

## Context

HDT.js 的核心差异化能力（卡组追踪、卡牌收藏读取、对手段位识别等）依赖从运行中的 `Hearthstone.exe` 进程读取 Mono 运行时管理的 C# 对象。原 [`Rewrite_Design.md`](../../Rewrite_Design.md) 给出了完整的 native 引擎架构（Rust + 32 位 + `ffi-napi`），但其中两个核心假设已被证实过时：

1. **`ffi-napi` 已不可用** — Windows + Node ≥ 18 无法编译，原仓库 issue #269 公开请求 archive。
2. **「必须 32 位」是误判** — 64 位进程可以直接用标准 [`ReadProcessMemory()`](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-readprocessmemory) 读 32 位炉石进程内存，唯一注意点是把对端指针当 `u32` 处理。反方向（32 位读 64 位）才需要 `NtWow64ReadVirtualMemory64` 等 hack。

约束：

- **目标进程**：`Hearthstone.exe` 是 32 位 Unity Mono（非 IL2CPP），地址空间 ≤ 4 GB，所有指针 4 字节。
- **宿主**：HDT.js 是 Electron 桌面应用，主平台 Windows 10/11 x64。Phase 0 已经把 Electron 锁定为 64 位（参见 `add-monorepo-skeleton`）。
- **Mono 内部结构**：`MonoDomain` / `MonoImage` / `MonoClass` / `MonoObject` / `MonoArray` 等结构按 32 位指针对齐（4 字节 stride），与宿主位数无关——这意味着无论我们用什么宿主架构，Rust 端都得用 `u32` 表示对端指针。

## Decision

**HDT.js will access Hearthstone process memory via a Rust crate compiled to a 64-bit Windows native Node.js module using `napi-rs`, loaded directly into the Electron main process.** （评估矩阵中的 Option D。）

## Considered Options

### A. `koffi`（运行时 FFI）

- 形态：Rust 不出场。所有内存读取与 Mono 解析逻辑用 TypeScript + `koffi` 直接调 Windows API DLL。
- ✅ 无 Rust 工具链 / 无 CI 矩阵；分发简单。
- ❌ Mono 解析器在 TS 里手写非常痛苦（几十个内部结构 + 4 字节对齐 + 32 位指针适配）。
- ❌ 每次内存读取过一次 FFI（~500 ns/call），单帧覆盖层刷新累计开销不可忽视。
- ❌ 类型安全弱，调试链路长（segfault 直接带崩 Electron 没有 Rust 堆栈）。

### B. 32 位 `napi-rs` + 32 位 Electron

- 形态：Rust 编译成 ia32 `.node` 模块，Electron 也用 32 位发布版。
- ✅ 与炉石位数对齐，`ReadProcessMemory` 调用最直观。
- ❌ 64 位 Electron 才是主流，32 位发布质量持续下滑。
- ❌ napi-rs ia32 历史构建坑多（issue #284），社区主流不推荐。
- ❌ 锁死 32 位限制，未来扩展空间几乎为零。

### C. 32 位 Rust 子进程 + stdio JSON-RPC

- 形态：`hearthmirror-native` 编译为独立 32 位 `.exe`，Electron `spawn` 它通过 stdin/stdout 用 JSON-RPC 通信。
- ✅ 进程隔离 — Rust 端 panic / segfault 不影响 Electron 主进程。
- ✅ 位数完全隔离 — 32 位 Rust 读 32 位炉石，零跨架构边界。
- ❌ 运维复杂度最高（双产物、子进程编排、僵尸清理、缓冲处理）。
- ❌ 单次 RPC ≥ 1 ms 量级 IPC 开销。
- ❌ 独立 .exe 主动调 `OpenProcess`/`ReadProcessMemory` 一个游戏进程，杀软最敏感。

### D. 64 位 `napi-rs`（chosen）

- 形态：Rust 编译成 x64 `.node` 模块，被 Electron 主进程直接 `import`。Rust 内用 64 位 `OpenProcess` + 64 位 `ReadProcessMemory` 读取 32 位炉石进程，**Mono 内部所有指针在 Rust 端用 `u32`**（包装为 `RemotePtr` newtype）。
- ✅ 同进程零 IPC，调用即函数调用（< 1 µs）。
- ✅ napi-rs 64 位 windows-msvc 是标准 CI 矩阵，构建/分发最熟。
- ✅ 64 位 Electron 主流，未来扩展空间大。
- ✅ Rust 类型系统能从源头排除 32/64 位指针混淆。
- ✅ 错误处理最规整（Rust `Result` 经 napi-rs 自动转 JS Promise reject）。
- ⚠️ 同进程无隔离：Rust panic 会带崩 Electron — 通过 `catch_unwind` + `napi::Result` 暴露面 + `clippy::unwrap_used` CI 门禁缓解。

## Decision Drivers

权重最高的三项维度上，D 全面领先：

| 维度 | 权重 | A | B | C | **D** |
|---|---|---|---|---|---|
| 单次内存读取性能 | 高 | 差 | 中 | 差 | **优** |
| 类型安全 | 高 | 差 | 优 | 中 | **优** |
| 工程化成熟度 | 高 | 中 | 差 | 中 | **优** |

完整 8 维评估矩阵见 [`openspec/changes/decide-hearthmirror-bridge/design.md`](../../openspec/changes/decide-hearthmirror-bridge/design.md) §Decisions §D1。

## Consequences

### Positive

- TypeScript ↔ Rust 边界类型安全，IDE 智能提示完整。
- 单次内存读取性能比子进程方案快 ~1000 倍（µs vs ms 量级），覆盖层高频刷新可承受。
- napi-rs 工具链（`@napi-rs/cli`、prebuild 二进制分发）社区成熟，CI 矩阵有标准模板。
- 不锁死老平台，未来若 Hearthstone 改 IL2CPP 或 Blizzard 变更架构，仍有调整空间。

### Negative

- **同进程无隔离风险**：Rust 端 panic 会带崩 Electron 主进程（缓解：见下方 Engineering Constraints）。
- **CI 矩阵需维护**：要为 `win32-x64-msvc` 构建 prebuild 二进制；首版可走 source-only + postinstall `cargo build`，prebuild 留作优化。
- **跨架构边界要小心**：64 位读 32 位时 `MEMORY_BASIC_INFORMATION32` / `MODULEENTRY32W` 等带 32 后缀类型必须正确选择，是一次性工程负担。

### Engineering Constraints (binding for downstream changes)

任何后续 `add-hearthmirror-bridge*` change 的 design.md 必须复述并细化以下约束：

1. **永不 panic**：所有 `unsafe` Windows API 调用必须封装在 `unsafe fn raw_*`，外层 `pub fn` 必须返回 `Result<T, ScryError>`。禁止 `panic!` / `unwrap()` / `expect()` / `todo!()` / `unreachable!()`。
2. **`#[napi]` 暴露面**：所有 `#[napi]` 方法签名为 `fn(...) -> napi::Result<T>`（reject Promise 而非 throw / abort）。
3. **`RemotePtr(u32)` newtype**：远程进程内的指针必须用 `RemotePtr` 包装，禁止裸 `u32` / `usize` / `*const T` 表示远程指针。
4. **CI 静态门禁**：在 hearthmirror crate 内运行 `cargo clippy -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic`。

## Related

- 详细评估与 risk matrix：[`openspec/changes/decide-hearthmirror-bridge/design.md`](../../openspec/changes/decide-hearthmirror-bridge/design.md)
- Spike 计划：[`docs/spikes/0001-hearthmirror-spike.md`](../spikes/0001-hearthmirror-spike.md)
- Mono 运行时知识（仍为权威参考）：[`Rewrite_Design.md`](../../Rewrite_Design.md) §7+
- Capability 契约：[`openspec/changes/decide-hearthmirror-bridge/specs/hearthmirror-bridge/spec.md`](../../openspec/changes/decide-hearthmirror-bridge/specs/hearthmirror-bridge/spec.md)
