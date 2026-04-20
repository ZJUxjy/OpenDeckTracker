## Why

[Spike 0003](../../../docs/spikes/0003-hearthmirror-reflection-runtime-validation.md) Finding **F-1 (Critical, P0)** 证实：`MonoRuntime::init()` 在真实 Hearthstone 进程上以 `STATUS_ACCESS_VIOLATION` (0xC0000005) 崩溃，**12 个反射方法 100% 不可用**。崩溃是 Windows 结构化异常（SEH），`std::panic::catch_unwind` 接不住，进程必崩。

Root cause 已由 spike 的 `examples/diag_init.rs` 步进诊断定位到 [`packages/hearthmirror/native/src/mono/runtime.rs:97`](../../../packages/hearthmirror/native/src/mono/runtime.rs)：

```rust
let pe_size = mono.size.min(0x100_000) as usize;  // 1MB 上限，远小于 6.5MB 真实 mono dll
```

`pelite::pe32::PeView::module(ptr)` 把 `ptr` 当作完整 mapped PE 镜像处理。当后续 `exports.by().name("mono_get_root_domain")` 跟随 export name table RVA 跳到 1MB 偏移之后的字符串区域时，读到的是未映射内存 → SEH。

Spike attempt 3 已证实：把 cap 去掉、读完整 6,529,024 字节 → init 链 6 步全绿（包括 disasm pattern A 命中、root_domain 解到 `0x0B442E70`）。

> 这是源自 spike 0003 R-1 的 P0 阻塞修复，**强阻塞** [`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/) 与 [`add-hearthmirror-image-walking`](../add-hearthmirror-image-walking/) 的真机验证，必须先做。

## What Changes

- **修改** [`packages/hearthmirror/native/src/mono/runtime.rs`](../../../packages/hearthmirror/native/src/mono/runtime.rs) `find_mono_get_root_domain_va` 函数：
  - 删除 `let pe_size = mono.size.min(0x100_000) as usize;` 中的 `.min(0x100_000)` cap
  - 改为 `let pe_size = mono.size as usize;`
  - 同步更新行 96 的注释（"Read enough of the PE to satisfy pelite..."）为反映"必须读完整模块"的真实约束
- **新增** 1 个回归集成测试 `tests/integration_runtime_init.rs::init_succeeds_when_hearthstone_running`（skip-if-no-hs）：调 `MonoRuntime::init()` 必须返回 `Ok(_)` 不 panic
- **更新** [`docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`](../../../docs/spikes/0003-hearthmirror-reflection-runtime-validation.md) 追加 `## Run 2` 段，附 fix 后 `cargo run --example dump_reflection` 完整 12 方法实测结果（含 Tier 1 / Tier 2 状态、字段名飘移情况）
- **更新** [`openspec/changes/add-hearthmirror-reflection-methods/tasks.md`](../add-hearthmirror-reflection-methods/tasks.md) 7.1 注解，把"blocked by F-1"改为"由本 fix change 解封"

### Non-goals

- **不**重构 `find_mono_get_root_domain_va` 整体逻辑（如换 `pelite::pe32::PeFile::from_bytes` 做 bounds checking — 留给 spike R-4，未来视需求决定）
- **不**修改 `disasm` / `class.rs` / `object.rs` 任何代码
- **不**做 `add-hearthmirror-offset-probing` 与 `add-hearthmirror-image-walking` 范围内的工作
- **不**修字段名飘移（如 Run 2 显示有飘 → 单独 hotfix change）
- **不**改 napi 函数签名 / TS API / IPC

## Capabilities

### New Capabilities

- `hearthmirror-mono-init-pe-read`: `find_mono_get_root_domain_va` 读 PE bytes 时必须读完整模块大小的契约。

### Modified Capabilities

（无）

## Impact

- **代码**：1 行 fix（`runtime.rs:97`） + 注释更新 + 1 个集成测试文件（约 30 行）
- **依赖**：无新增
- **测试**：
  - 新增 `tests/integration_runtime_init.rs`（1 个测试，skip-if-no-hs）
  - 现有 48 个测试 + 12 个 reflection integration 在 fix 后必须保持绿；如 spike Run 2 显示某个 reflection 方法在 fix 后**失败**，是字段名飘移问题，不在本 change scope，单独 hotfix
- **解锁**：[`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/) 与 [`add-hearthmirror-image-walking`](../add-hearthmirror-image-walking/) 的真机回归路径
- **风险**：
  - 读完整 6.5MB 大约多耗 ~10ms（vs 1MB ~2ms），单次 init 影响可忽略（init 是一次性操作）
  - 远程进程读取大 buffer 增加内存占用（Rust 堆 6.5MB） — 一次性、init 后即释放，可接受
- **优先级**：P0 — 强阻塞 5e/5f 与所有真机 reflection 验证
