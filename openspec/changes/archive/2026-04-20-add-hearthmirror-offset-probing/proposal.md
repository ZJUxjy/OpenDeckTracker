## Why

[`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 的 12 个反射方法已经技术性闭环，但实现里**两个稳定性炸弹**未拆：

1. `packages/hearthmirror/native/src/reflection/field_paths.rs:116-134` 硬编码了 Unity 2021.3 Mono 的结构偏移（`MONO_CLASS_NAME = 0x2C`、`MONO_CLASS_FIELDS = 0x3C` 等）。注释自承"These may need runtime probing for different Mono builds" — 一旦炉石升级 Mono 版本（Unity 2022/2023/etc），所有反射全部失效。
2. `packages/hearthmirror/native/src/mono/runtime.rs` 中 `discover_offsets` / `probe_class_def_table_offset` 用手写的字节模式扫描定位偏移，鲁棒性差且只覆盖 2 个偏移点（domain.loaded_images + class_def_table）—— 其余 6+ 个 critical 偏移都依赖硬编码 fallback。

[D:\code\hearthmirror-rs](D:/code/hearthmirror-rs) 早就为这俩问题准备好了成熟方案：`iced-x86` 通用反汇编引擎（`hm-core/src/disasm.rs`，362 行）+ JSON 偏移配置（`hm-core/src/mono/offsets.rs`，418 行）+ `OffsetProber`（10 个 critical/best-effort probes）。本 change 把这套机制移植到 HDT.js 的 napi-rs crate，**只解决偏移层**，业务字段名常量（`field_paths.rs` 上半部）和 12 个反射方法实现保持不变。

> 这是 [`docs/superpowers/plans/2026-04-20-integrate-hearthmirror-rs.md`](../../../docs/superpowers/plans/2026-04-20-integrate-hearthmirror-rs.md) 的 Phase 1+2+3 + Phase 8B 部分（不含 §4-§7 的 Mono 模块/集合/业务方法重写）。设计目标见 [ADR 0001 约束 #5](../../../docs/adr/0001-hearthmirror-bridge.md)（"Mono 偏移量必须动态探测"）。

## What Changes

### 新增

- **依赖**：`packages/hearthmirror/native/Cargo.toml` 添加 `iced-x86 = { version = "1.21", default-features = false, features = ["std", "decoder", "fast_fmt"] }`、`serde = { version = "1.0", features = ["derive"] }`、`serde_json = "1.0"`。
- **`src/disasm.rs`**：移植自 `hearthmirror-rs/hearthmirror/crates/hm-core/src/disasm.rs`，提供：
  - `find_field_load_displacement(bytes: &[u8], bitness: u32) -> Option<u32>` — 跟踪函数体中最后一个 `mov reg, [reg+disp]` 的 displacement
  - `find_first_absolute_load(bytes: &[u8], bitness: u32) -> Option<u32>` — 提取第一个 `mov reg, [absolute_addr]` 的 absolute address
  - `DEFAULT_PROBE_WINDOW: usize = 256` 常量
- **`src/mono/offsets.rs`**：移植偏移结构 + `hex_or_int` 反序列化器 + `MonoOffsets::from_str`。包含 `MonoStructs { domain, assembly, image, hashtable, class, field, vtable, object, string, array }` 11 个 sub-struct。
- **`config/mono-offsets/unity-2021.3.json`**：从 hearthmirror-rs 复制；通过 `include_str!()` 在编译期内嵌为默认 baseline。
- **`src/mono/probe.rs`**（重写或新建）：`OffsetProber { mem, mono_module, exports, bitness }` 类型 + `probe_all() -> MonoOffsets` 方法，覆盖：
  - 6 个 critical probes（`MonoDomain.assemblies` / `MonoAssembly.image` / `MonoImage.name` / `MonoImage.class_cache` / `MonoClass.name` / `MonoClass.fields`）
  - 4 个 best-effort probes（`MonoClass.parent` / `MonoClass.field_count` / `MonoObject.vtable` / `MonoVTable.class`）

### 修改

- **`src/mono/runtime.rs`**：
  - `MonoRuntime` 新增字段 `offsets: MonoOffsets` 与 `exports: HashMap<String, RemotePtr>`
  - `init()` 流程改为：(1) find mono dll → (2) 用 `pelite` 读 export 表为 HashMap → (3) 加载 baseline JSON → (4) 跑 `OffsetProber::probe_all()` → (5) 用 `disasm::find_first_absolute_load()` 替换旧 byte-pattern 找 `mono_get_root_domain` → (6) 解引用 root_domain
  - **删除** `extract_global_root_domain_addr()` 中的 `Pattern A` / `Pattern B` 硬编码字节模式
  - **删除** `discover_offsets()` 与 `probe_class_def_table_offset()`（被 `OffsetProber` 取代）
- **`src/reflection/field_paths.rs`**：
  - **删除** Mono 结构偏移常量段（116-134 行：`MONO_CLASS_NAME` 等 13 个常量）
  - 业务字段名常量段（10-114 行）**完全不动**
- **`src/mono/class.rs` / `src/mono/object.rs`**：把硬编码偏移引用替换为 `runtime.offsets.structs.<type>.<field>`；**不**修改 `MonoClass` / `MonoObject` 的公共 API 与字段链路逻辑（这是下一个 change `add-hearthmirror-image-walking` 的事）

### Non-goals

- **不**移植 `MonoImage::class_cache` 完整遍历（`hm-core/src/mono/image.rs`） — 留给 [`add-hearthmirror-image-walking`](../add-hearthmirror-image-walking/)
- **不**新增 `MonoFieldDef` 独立模块 — 同上
- **不**移植 `VTable` 模块、加强版 `ServiceLocator`、`is_mulligan` / `dump_class` / `list_services` — 留给后续 `add-hearthmirror-extra-methods` change
- **不**修改业务字段名常量（`FLD_NET_CACHE_VALUES = "m_netCacheValues"` 等） — 字段名飘移走 hotfix 而非本 change
- **不**改 12 个反射方法的链路代码（reflection/*.rs） — 它们调用方式不变
- **不**改 napi 函数签名或 TS API
- **不**降级 32-bit 子进程或重新评估 ADR 0001（保持 napi-rs in-process）

## Capabilities

### New Capabilities

- `hearthmirror-offset-probing`: Mono 偏移管理子系统的契约：`iced-x86` 反汇编 API、JSON baseline 加载与解析、`OffsetProber` 探测顺序与 fallback 策略、6+4 个 probe 的语义。

### Modified Capabilities

（无 — `hearthmirror-reflection-methods` 与 `hearthmirror-metadata-reader` 的 spec 不动）

## Impact

- **代码**：
  - 新增 `src/disasm.rs`（约 350-400 行，含单测）
  - 新增 `src/mono/offsets.rs`（约 400-450 行）
  - 新增/重写 `src/mono/probe.rs`（约 300-400 行，覆盖 10 个 probes）
  - 新增 `config/mono-offsets/unity-2021.3.json`（约 100 行）
  - 修改 `src/mono/runtime.rs`（净增约 50 行：-100 删旧 +150 接新）
  - 修改 `src/mono/class.rs` / `src/mono/object.rs`（小改：把硬编码偏移 → `offsets.structs.*` 字段访问，约 20 行）
  - 修改 `src/reflection/field_paths.rs`（删 13 个 Mono 偏移常量）
- **依赖**：`iced-x86` 1.21 + `serde` 1.0 + `serde_json` 1.0 — 增加 `.node` binary 体积约 200-400 KB（仅 decoder 启用，无 formatter/encoder）
- **测试**：
  - `disasm.rs` 内单测覆盖反汇编核心路径
  - `mono/offsets.rs` 内单测覆盖 JSON 加载、`hex_or_int` 解析
  - 集成测试：现有 `tests/integration_reflection.rs` 12 个方法在 skip-if-no-hs 下保持通过；如有炉石环境，`MonoRuntime::init()` 必须用新 offset probing 成功
- **依赖前置**：[`verify-hearthmirror-on-real-hs`](../verify-hearthmirror-on-real-hs/)（强烈建议先做，输出 spike 报告以校验本 change 是否真的解决了实测中暴露的问题）
- **解锁**：[`add-hearthmirror-image-walking`](../add-hearthmirror-image-walking/)（依赖 `MonoOffsets` 配置访问 `image.class_cache` 偏移）
- **风险**：`iced-x86` 反汇编结果在某些边缘指令序列上可能与 hearthmirror-rs 的 32-bit 进程内行为不一致 — 在 design 中明确 `bitness=32` 必须硬编码（HDT 是 64-bit 进程读 32-bit 炉石），并在测试中覆盖几个已知 mov 指令样本
