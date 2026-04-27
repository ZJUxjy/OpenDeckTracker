## Why

Spike 01（[`add-hearthmirror-bridge-spike`](../add-hearthmirror-bridge-spike/)）已经验证了"64 位 napi-rs 能跨架构读 32 位炉石进程内存"这件事的物理可行性，但还有一个未消除的核心风险：

> 我们能否在炉石进程内**找到 Mono 运行时**，并解析它内部的关键结构？

具体来说：
1. 炉石用的 Mono DLL 实际名字是 `mono-2.0-bdwgc.dll`（Unity 标准 embedded runtime），不是裸 `mono.dll`。`Rewrite_Design.md` 当时写的是 `mono.dll`。
2. `Rewrite_Design.md` §7.2 列出的 Mono 内部偏移量基于 Unity 2021.3。当前炉石客户端的 Unity 版本可能不同，偏移量也可能漂移。
3. 解析 PE 导出表（找 `mono_get_root_domain`）这一步在 Rust + 跨进程 ReadProcessMemory 场景下没有现成完美 crate，需要验证最小手写或 pelite 方案是否可行。

如果这三件事中任意一件失败，`add-hearthmirror-bridge` 就要在写大量代码前回头补上。所以再做一个 ≤ 1 工作日 spike 把它们钉死，是当前最高 ROI 的事。

本 change 的产出**主要是 spike 报告**（`docs/spikes/0002-hearthmirror-mono-spike-report.md`）+ 一组实测的偏移量记录（如果与 Rewrite_Design.md §7.2 不同则记入"已知偏差"）+ Unity/Mono 版本号确认。Spike 期间临时新建 `packages/hearthmirror-mono-spike/`，结束删除。

## What Changes

- 临时新建 `packages/hearthmirror-mono-spike/`：
  - `Cargo.toml` 用 napi-rs 3.x（沿用 spike 01 的工具链），target `x86_64-pc-windows-msvc`，依赖 `windows` crate（feature 略多于 spike 01）+ 可选 `pelite` 用于 PE 导出表解析。
  - `src/lib.rs`：暴露 `#[napi] async fn spike_locate_mono(): Promise<MonoSpikeResult>`，按 Implementation Sketch 实现下面 6 步链路。
  - `package.json` 沿用 spike 01 模板。
- 在 `apps/desktop/src/main/index.ts` 临时增加 SPIKE TRIGGER 块（启动后自动跑一次 mono spike，stdout 打印结果），与 spike 01 同样形态。
- `apps/desktop/package.json` 临时加 `"@hdt/hearthmirror-mono-spike": "workspace:*"` 依赖。
- 在炉石客户端运行的前提下跑 `pnpm dev`，主进程 stdout 必须打印至少：
  - **L1**: Hearthstone PID + `mono-2.0-bdwgc.dll` 模块基址 + 模块大小
  - **L2**: 该 DLL 的 PE Optional Header `Subsystem` + `Magic`（确认是 32 位 PE32）
  - **L3**: `mono_get_root_domain` 导出函数的 RVA + 绝对 VA + 函数前 16 字节机器码
  - **L4**: `mono_get_root_domain` 反汇编出的全局变量地址（典型形如 `mov eax, [rel <addr>]; ret`）
  - **L5**: 解引用全局变量得到的 `MonoDomain*` 指针
  - **L6**: 从 MonoDomain 按 §7.2 偏移量读出 `domain_assemblies` MonoGList* 与 `loaded_images` MonoGList* 的指针值（验证它们非 NULL 且看起来像合法堆地址）
- 写 `docs/spikes/0002-hearthmirror-mono-spike-report.md`，包含：
  - **Outcome**: PASS / PARTIAL / FAIL 与一段话总结
  - **Hearthstone runtime info**: Unity 版本（从 PE 资源或硬编码字符串里查）、Mono 版本（从 `mono_get_runtime_build_info` 字符串）、PE Machine field
  - **Observed offsets**: 实测的 MonoDomain.domain_assemblies / .loaded_images 偏移量是否符合 §7.2 的 0x0C / 0x14
  - **Encountered issues**: 真实坑（如 `mono_get_root_domain` 函数体长得跟 §7.2 描述不一样、需要不同的反汇编模式等）
  - **Recommendations for add-hearthmirror-bridge**：基于 spike 经验给出 5–10 条建议
- 升级 `docs/adr/0001-hearthmirror-bridge.md`：在 Validation 段追加 "Spike 02 (mono runtime locate) PASSED on <date>"。
- **Teardown**：删除 `packages/hearthmirror-mono-spike/`、删 main/index.ts 的 SPIKE TRIGGER 块、删 desktop dependencies。
- 同步 `openspec/changes/.NEXT.md`，把 `add-hearthmirror-bridge-mono-spike` 标 ✓，确认下一个是 `add-hearthmirror-bridge` 正式实施。

### Non-goals

- ❌ 不验证 ECMA-335 元数据解析（disk-side `Assembly-CSharp.dll` 读取与 `#~` 流解析）。这是后续 `add-hearthmirror-bridge` 范围。
- ❌ 不验证字段偏移映射（MonoClass.fields 数组遍历）。
- ❌ 不验证任何 IReflection 业务方法。
- ❌ 不实现 ServiceLocator 模式。
- ❌ 不做版本适配 / 偏移量探测算法（如果实测偏移与 §7.2 不符，仅记录到 spike report，**不**在 spike 内修复）。
- ❌ 不引入 SQLite、不引入 zustand、不动 renderer UI。
- ❌ 不做单元测试（spike 是 throw-away）。
- ❌ 不做 prebuild 或 CI 集成。

## Capabilities

### New Capabilities

- `hearthmirror-mono-validation`：spike 02 验收契约 —— 定义"如何确认 Mono 运行时能被定位、关键导出函数能被解析、根域指针能被读出"，包括 6 行 stdout 输出的 PASS/FAIL 判定、spike report 必填章节、teardown 范围。本 capability 在 spike 出口（teardown 完成）后自动履行（report 已写 + ADR 更新 = 契约完成）。

### Modified Capabilities

- `hearthmirror-bridge`（来自 `decide-hearthmirror-bridge`）：在 ADR 0001 Validation 段补充 spike 02 通过的事实；更新 `Rewrite_Design.md` §7（如有偏移量偏差则附 errata）。

## Impact

- **新建临时代码**：`packages/hearthmirror-mono-spike/`（spike 出口前删除）。
- **临时修改**：`apps/desktop/src/main/index.ts`（spike 出口前删除）、`apps/desktop/package.json`（spike 出口前删除依赖）。
- **持久产出**：
  - `docs/spikes/0002-hearthmirror-mono-spike-report.md`（新增）
  - `docs/adr/0001-hearthmirror-bridge.md`（追加 Validation 行）
  - `openspec/changes/.NEXT.md`（标记完成 + 队列下一个）
  - 如果实测偏移与 §7.2 不符：`Rewrite_Design.md` 加 errata 段
- **依赖**：临时新增 `pelite`（Rust crate，可选；如果手写 PE 解析也行就不加），其余 windows crate features 已有。
- **风险**：spike 失败的 fallback 已在 design 的 Decision Outcomes 段定义（最严重情形：Mono 偏移量大幅偏移 → `add-hearthmirror-bridge` 需先做版本适配模块，工作量增加但不阻塞）。
