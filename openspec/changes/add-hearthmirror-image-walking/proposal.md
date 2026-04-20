## Why

[`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/) 解决了"Mono 偏移硬编码 → 升级就崩"的问题，但 `find_class` 的实现仍然有两块技术债：

1. **`MonoRuntime::find_class` 走 token 反向探测**（`runtime.rs::probe_class_def_table_offset`）：依赖 metadata reader 提供 token，对每个待查 class 都要扫一遍 `class_def_table` 候选偏移，启发式且只覆盖一个偏移点（`image.class_def_table`）。在 [hearthmirror-rs](D:/code/hearthmirror-rs) 里有更直接的方案：`MonoImage::class_cache` 完整哈希表遍历（`hm-core/src/mono/image.rs`），无需 metadata token，直接拿到 image 中所有已加载 class 的 `MonoClass*`。
2. **`MonoClass` 缺少继承链遍历能力**（当前 `class.rs` 仅返回自有声明字段）：[`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 中实现的 12 个方法目前**未触及**继承字段，但下一批业务方法（如 BattlegroundsRatingInfo 的 base class、deep MatchPlayer 链路）必然踩到。hearthmirror-rs 的 `MonoClass::fields_recursive() -> HashMap<String, MonoFieldDef>`（`hm-core/src/mono/class.rs`）含完整继承链解析，且把 `MonoFieldDef` 拆成独立模块带 `is_static` / `type_ptr` 等元数据。

本 change 把 hearthmirror-rs 的 `MonoImage` + `MonoClass` 升级 + `MonoFieldDef` 独立模块这三块移植到 HDT.js 的 napi-rs crate。**只动 class 解析层**，业务字段链路（reflection/*.rs）调用方式保持兼容。

> 这是 [`docs/superpowers/plans/2026-04-20-integrate-hearthmirror-rs.md`](../../../docs/superpowers/plans/2026-04-20-integrate-hearthmirror-rs.md) 的 Phase 4B/4C/4D/4F/4G（不含 4E VTable、§5 Collections、§6 业务方法）。前置依赖 [`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/) 提供 `image.class_cache` / `class.parent` / `class.field_count` 等偏移。

## What Changes

### 新增

- **`src/mono/image.rs`**（新模块）：
  - `pub struct MonoImage<'r> { runtime: &'r MonoRuntime, addr: RemotePtr }`
  - `pub fn enumerate_classes(&self) -> Result<Vec<MonoClassRef>, ScryError>` — 遍历 `class_cache` 哈希表，返回所有已加载 class
  - `pub fn find_class(&self, namespace: &str, name: &str) -> Result<Option<MonoClassRef>, ScryError>` — 通过 enumerate + name 匹配，**替代** `MonoRuntime::find_class` 的 token-probe 路径
  - `pub fn name(&self) -> Result<String>` — 读 `image.name` 字段
- **`src/mono/field.rs`**（新模块）：
  - `pub struct MonoFieldDef { pub name: String, pub offset: u32, pub type_ptr: RemotePtr, pub is_static: bool }`
  - `pub fn read(memory: &ProcessMemory, addr: RemotePtr, offsets: &FieldOffsets) -> Result<MonoFieldDef, ScryError>`
- **`MonoClass` 扩展**（`src/mono/class.rs`）：
  - `pub fn fields_recursive(&self) -> Result<HashMap<String, MonoFieldDef>, ScryError>` — 沿 `parent` 链向上遍历，合并所有声明字段（子类同名字段覆盖父类）
  - `pub fn parent(&self) -> Result<Option<MonoClassRef>, ScryError>`
  - `pub fn find_field(&self, name: &str) -> Result<Option<MonoFieldDef>, ScryError>` — 含继承链查找

### 修改

- **`src/mono/runtime.rs`**：
  - `MonoRuntime::find_class(namespace, name)` 内部改为：
    1. 用 `runtime.image_cache` 缓存 `MonoImage`（之前已有 `ac_image: Option<RemotePtr>` 字段）
    2. 委托给 `MonoImage::find_class(namespace, name)`
  - **删除** `probe_class_def_table_offset()` 与 `find_class_def_table_offset_cached()`
  - **删除** `RuntimeCache::class_def_table_offset` 字段
  - **保留** `RuntimeCache::classes: HashMap<String, MonoClassRef>` 缓存（避免重复遍历 class_cache）
- **`src/mono/object.rs`**：
  - 新增 `pub fn find_field(&self, name: &str) -> Result<Option<MonoFieldDef>, ScryError>` — 通过 `vtable.class.fields_recursive()` 查找含继承的字段（用于 reflection 方法处理继承字段时调用）
  - **不动** 现有 6 个 `read_*_field` helpers 的签名与行为
- **`src/reflection/*.rs`**：12 个反射方法**保持当前调用方式不变**。后续如果某方法需要继承字段，可单独切换到 `find_field`，但不在本 change 范围。

### Non-goals

- **不**重写 12 个反射方法的字段链（reflection/*.rs 不动）
- **不**移植 `VTable` 模块（hearthmirror-rs `hm-core/src/mono/vtable.rs`）— 留给后续 `add-hearthmirror-extra-methods` change
- **不**移植加强版 `ServiceLocator`（hearthmirror-rs `hm-collections/src/service_locator.rs`）— 同上
- **不**移植 `is_mulligan` / `dump_class` / `list_services` 业务方法
- **不**升级 `List` / `Dict` / `CustomMap` 集合模块
- **不**改 `field_paths.rs`（业务字段名常量）
- **不**改 napi 函数签名或 TS API
- **不**移除现有的 `MonoClass::field_offset(name)` 方法（如存在）— 它直接遍历 fields，不含继承；保留以支撑现有反射调用

## Capabilities

### New Capabilities

- `hearthmirror-class-resolution`: MonoImage 哈希表遍历 + MonoClass 继承链字段解析 + MonoFieldDef 独立模块的契约。

### Modified Capabilities

（无 — `hearthmirror-offset-probing` 与 `hearthmirror-reflection-methods` 的 spec 不动；本 change 仅在内部重构 `find_class` 实现路径）

## Impact

- **代码**：
  - 新增 `src/mono/image.rs`（约 200-250 行，含 hashtable 遍历逻辑 + 单测）
  - 新增 `src/mono/field.rs`（约 100-150 行）
  - 修改 `src/mono/class.rs`（净增约 100 行：`fields_recursive` + `parent` + `find_field`）
  - 修改 `src/mono/runtime.rs`（净减约 100 行：删 `probe_class_def_table_offset` + 改 `find_class` 委托）
  - 修改 `src/mono/object.rs`（增 `find_field` 方法，约 30 行）
  - 修改 `src/mono/mod.rs`（barrel：`pub mod image; pub mod field;`）
- **依赖**：[`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/)（必须先完成 — 用 `runtime.offsets.structs.image.class_cache` / `hashtable.{size,table}` / `class.parent` / `class.field_count` 偏移）
- **测试**：
  - `image.rs` 单测：mock 一个 hashtable buffer 验证遍历逻辑
  - `field.rs` 单测：mock 一个 MonoFieldDef 内存布局验证 `read`
  - `class.rs` 单测：mock 父子 class 链验证 `fields_recursive` 含继承
  - 集成测试：现有 12 个 reflection 集成测试在 skip-if-no-hs 下保持通过；如有炉石环境，`MonoImage::find_class("CollectionManager")` 必须成功
- **解锁**：未来反射方法实现可使用 `find_field`（含继承）+ `enumerate_classes`（用于 `dump_class` 调试工具）；后续 `add-hearthmirror-extra-methods` 中的 VTable 模块可基于 `MonoClass::parent` 实现 vtable→class 映射
- **风险**：
  - 切换 `find_class` 实现可能让某个边缘 class 在新路径下找不到（但旧路径找得到）— spike 0003 重跑必须验证 `getMatchInfo` / `getDecks` 等依赖 generic class 的方法仍工作
  - hashtable 遍历逻辑依赖 `image.class_cache` 偏移精确，如 prober 给出的偏移有误差 → enumerate 返回空或乱码。design 中明确"如 enumerate 返回 0 个 class，立刻 `Err(ClassCacheEmpty)`"防止静默失败
