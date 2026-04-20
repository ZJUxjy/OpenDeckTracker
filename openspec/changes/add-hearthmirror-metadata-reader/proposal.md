## Why

`add-hearthmirror-bridge` 的 Phase D 把 ECMA-335 metadata 读取实现为手写的 `metadata/tables.rs`，**与 [design.md D2](../add-hearthmirror-bridge/design.md) 决策"使用 `pelite` 完成 PE / metadata 解析"明显冲突**（参见 2026-04-20 代码审查 B3）。同时手写实现只支持 `TypeDef` 表，不支持 `Field` / `MethodDef` / 按 heap 索引宽度（`StringHeapSize` / `GuidHeapSize` / `BlobHeapSize`）变长解码 token——而 [`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 中 12 个 IReflection 方法的字段偏移定位强依赖 `Field` 表（`MonoClass.fields` 在某些 generic / nested / static-only 类上不可用）。

不先把 metadata 层补完，B1（反射方法）就会无法落地——这是一个**纯架构债 / 阻塞依赖**型 change，不解决会让后续工作要么再次绕路要么返工。

> 这是 [DEVELOPMENT_PLAN.md](../../../DEVELOPMENT_PLAN.md) Phase 4（Memory Bridge）"hearthmirror 真实数据流"的前置条件，独立于 Phase 4 的其它子任务。

## What Changes

- **替换** `packages/hearthmirror/native/src/metadata/` 下的手写 PE / `#~` 解析实现：
  - 用 `pelite::PeFile::from_bytes` 取 PE 头、CLI Header、`Resources/Metadata` 区段
  - 引入 `pelite::pe32::Pe` 的 metadata helper（或必要时引入 `dnlib-rs` 之一的辅助 crate；在 design.md 选型敲定）
- **新增**支持 `Field` 表与 `MethodDef` 表（最小覆盖 `Name` / `Signature` / `Flags` 列），并按 metadata heap 索引宽度（2/4 字节）变长解码 token
- **新增** `find_field_token(class_token, field_name) -> Option<u32>` 与 `find_method_token(class_token, method_name) -> Option<u32>` API 供 reflection 层使用
- **保留**现有的"磁盘 fallback 到 `MonoImage.raw_data` 内存"双源策略与现有的 `find_class_token` 公共签名（向下兼容），底层换实现而已
- **测试**：用真实 `Assembly-CSharp.dll` 的离线样本（fixtures）验证已知 class / field / method token；用人工构造的越界 `#~` stream 验证防御性错误
- **删除** `metadata/tables.rs` 中目前仅支持 `TypeDef` 的实现及其内部 stream 解析私有函数（如 `parse_metadata_streams`、`parse_typedef_table`）

### Non-goals

- **不**实现完整的 .NET metadata reader（不支持 Generic / Property / Event / TypeRef 表，除非反射方法用得上）
- **不**改动 `MonoClass`、`OffsetProber`、`ServiceLocator` 等运行时反射结构
- **不**在本 change 中实施任何 `IReflection` 方法（那是 [`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 的范围）
- **不**调整 napi 暴露面或 IPC 契约（纯内部重构）
- **不**修改 design.md / ADR 0001（决策已存在，本 change 是回归到决策）

## Capabilities

### New Capabilities

- `hearthmirror-metadata-reader`: PE / ECMA-335 metadata 解析子能力，提供 `find_class_token` / `find_field_token` / `find_method_token`，作为 hearthmirror-native 内部模块，技术选型固定为 pelite

### Modified Capabilities

（无——本 change 创建独立的子能力 spec；上层 `hearthmirror-native` capability 在 `add-hearthmirror-bridge` 归档前不动其 spec，归档后再视情况合并）

## Impact

- **代码**：`packages/hearthmirror/native/src/metadata/`（重写 `tables.rs`，可能拆分为 `pe.rs` / `tables.rs` / `tokens.rs`）；`packages/hearthmirror/native/Cargo.toml`（新增/调整 `pelite` 依赖；考虑 `dnlib-rs` 的引入与许可证审查）
- **测试**：`packages/hearthmirror/native/tests/fixtures/`（新增 minimal `Assembly-CSharp.dll` 样本或合成 fixture）；`packages/hearthmirror/native/src/metadata/tables.rs` 单元测试
- **依赖**：可能新增 1 个 crate（`dnlib-rs` 或类似）；`pelite` 已在 `Cargo.toml`
- **不影响**：TS 包、apps/desktop、IPC 契约
- **解锁**：[`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 的 G.1–G.10 字段偏移定位
