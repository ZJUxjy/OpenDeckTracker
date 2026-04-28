## Why

[`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 把 12 个 `IReflection` 方法从桩升级为真实 Mono 遍历实现，但**所有验证都在没有炉石进程的环境下进行**：mock 单测覆盖逻辑分支，集成测试通过 `skip_if_no_hs` 在无炉石时直接 return。结果是：

- `field_paths.rs` 中硬编码的 Mono 偏移（`MONO_CLASS_NAME = 0x2C` 等）**从未在真实 Hearthstone 进程上验证过**。
- 12 个方法的 C# 字段名取自 [HearthSim/HearthMirror](https://github.com/HearthSim/HearthMirror)，**可能与当前线上 Hearthstone 版本（2026 年）不一致**。
- 后续 [`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/) 与 [`add-hearthmirror-image-walking`](../add-hearthmirror-image-walking/) 投入 8-12 小时换稳定性，但**没有 baseline 数据证明这些钱花在哪条裂缝上**。

本 change 是"砸钱前先量缝"的 spike：在一台真实有炉石的机器上跑 12 个反射方法，记录每个方法的实际返回、错误、耗时，输出一份 `2026-04-XX-hearthmirror-runtime-validation.md` spike 报告。该报告将直接驱动 `add-hearthmirror-offset-probing` 与 `add-hearthmirror-image-walking` 的优先级与设计决策。

> 这是 [DEVELOPMENT_PLAN.md](../../../DEVELOPMENT_PLAN.md) Phase 4（Memory Bridge）的"事后验证 spike"，与 [`docs/spikes/`](../../../docs/spikes/) 系列同类（`0001-mono-runtime-probe.md` 等）。

## What Changes

- **新增** `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`：12 个方法 × {状态、返回示例、错误、耗时、字段链路是否对得上} 表格 + 总结性"哪些链路飘了 / 哪些偏移坏了"的 finding 列表。
- **新增** `packages/hearthmirror/native/examples/dump_reflection.rs`（cargo example）：连接到运行中的 Hearthstone，依次调用 12 个反射方法，把结果以 JSON 打印到 stdout。该 example 是 spike 报告的数据源工具，但作为代码长期保留（未来回归用）。
- **新增** `scripts/run-hearthmirror-spike.ps1`：一键跑 example + 把输出收集到 spike 报告附件。
- **更新** [`add-hearthmirror-reflection-methods/tasks.md`](../add-hearthmirror-reflection-methods/tasks.md) 7.1 项：从"可选"升级为"由本 change 兑现"，并 cross-link 到本 spike。
- **更新** [`docs/adr/0001-hearthmirror-bridge.md`](../../../docs/adr/0001-hearthmirror-bridge.md) 增加一行"约束 #5（动态偏移探测）的实测验证记录"指向本 spike。

### Non-goals

- **不**修复任何 reflection 方法（只识别问题，不实施 fix——fix 走 [`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/) 或后续 hotfix change）
- **不**修改 `field_paths.rs` 中的字段名或偏移常量（即便发现飘移，也只是记录在 spike）
- **不**移植 hearthmirror-rs 任何代码（移植走单独 change）
- **不**做 UI 端到端验证（已由 [`add-hearthmirror-renderer-status`](../add-hearthmirror-renderer-status/) 的单测覆盖；如本 spike 报告显示 reflection 全部 OK，可在收尾时手动 `pnpm dev` 看一眼，但不是 spec 要求）
- **不**承诺测试覆盖率或 clippy 0 错误（example 代码允许 `unwrap`/`expect`，因为是诊断脚本而非生产代码）

## Capabilities

### New Capabilities

- `hearthmirror-runtime-validation`: 一份"在真实炉石进程上验证 reflection 方法是否工作"的 spike 工件契约，包括 example 工具、报告结构、必须采集的指标。

### Modified Capabilities

（无）

## Impact

- **代码**：新增 1 个 cargo example（`packages/hearthmirror/native/examples/dump_reflection.rs`，约 100-150 行）+ 1 个 PowerShell 脚本（约 30 行）。**不改 lib 代码**。
- **文档**：新增 1 份 spike 报告（`docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`，预计 200-300 行含数据表）。
- **依赖**：[`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 必须已 archive；本机有炉石客户端可启动并登录战网。
- **解锁**：[`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/) 与 [`add-hearthmirror-image-walking`](../add-hearthmirror-image-walking/) 的优先级与具体偏移列表。
- **风险**：本机环境（炉石版本、Mono build、Windows 版本、有无 anti-cheat）的差异可能让 spike 结果不具普遍性 — 在 spike 报告中显式记录环境矩阵。
