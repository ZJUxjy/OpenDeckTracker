# hearthmirror-class-resolution Specification

## Purpose

Provide a **non-heuristic, image-walking class resolution layer** for the
`hearthmirror-native` crate, replacing the brittle `class_def_table` byte-scan
that previously powered `MonoRuntime::find_class`.

The capability is composed of four pieces:

1. A `MonoImage<'r>` view (`src/mono/image.rs`) that walks the embedded
   `MonoInternalHashTable` at `MonoImage.class_cache` (offset `+0x35C` per the
   `unity-2021.3.json` baseline; `class_cache` is *not* a pointer field — it
   is the hash table struct itself, see `$class_cache_note` in the JSON).
   `enumerate_classes()` reads `class_cache.size` + `class_cache.table`,
   visits each non-NULL bucket head, and follows the `class.next_class_cache`
   (`+0xA0`) pointer through each chain. `find_class(namespace, name)` short-
   circuits on a name match without resolving the full `MonoClass` body.
2. A `MonoFieldDef` struct (`src/mono/field.rs`) carrying `name / offset /
   type_ptr / is_static`, where `is_static` is decoded from
   `MonoType.attrs & 0x10`. `MonoFieldDef::read` is the single source of
   truth for "what does a Mono field look like to this crate".
3. Inheritance-aware field lookup on `MonoClassRef` (`src/mono/class.rs`):
   `parent`, `fields_recursive`, and `find_field` traverse the parent chain
   (capped at 32 levels) and merge fields with "child overrides parent"
   semantics — the same rule the C# compiler uses for `new`-shadowed fields.
4. `MonoObject::find_field(name)` (`src/mono/object.rs`) — resolves the
   object's class through its vtable and delegates to `MonoClassRef::find_field`,
   so reflectors get inherited-field lookup without per-collector boilerplate.

`MonoRuntime::find_class` is re-implemented as a single
`MonoImage::find_class` call against the cached Assembly-CSharp image; the
~85 lines of `probe_class_def_table_offset` /
`find_class_def_table_offset_cached` / `RuntimeCache::class_def_table_offset`
are deleted. `ScryError::ClassNotFound` is upgraded from `{ name }` to
`{ namespace, name }` so callers see the full lookup key on failure.

This capability resolves Finding F-11 (post-`add-hearthmirror-offset-probing`
spike) and is consumed by all 12 `#[napi]` reflection methods through the
re-implemented `MonoRuntime::find_class`. Public napi signatures are
unchanged; behaviour change is internal-only.

## Requirements
### Requirement: MonoImage 类型与 enumerate_classes

The `packages/hearthmirror/native/src/mono/image.rs` SHALL define `pub struct MonoImage<'r>` with at least:

- `runtime: &'r MonoRuntime`
- `addr: RemotePtr`

提供方法：

- `pub fn new(runtime: &'r MonoRuntime, addr: RemotePtr) -> Self`
- `pub fn name(&self) -> Result<String, ScryError>` — 读 `image.name` 字段（c-string）
- `pub fn enumerate_classes(&self) -> Result<Vec<MonoClassRef>, ScryError>` — 遍历 `class_cache` MonoInternalHashTable，返回所有桶链表中的 MonoClass 指针
- `pub fn find_class(&self, namespace: &str, name: &str) -> Result<Option<MonoClassRef>, ScryError>` — 调 enumerate + 按 namespace/name 匹配

`enumerate_classes` SHALL 使用 `runtime.offsets.structs.image.class_cache`、`runtime.offsets.structs.hashtable.{size, table}`、`runtime.offsets.structs.class.next_class_cache`（如该偏移在 baseline JSON 或 prober 输出中存在）来遍历 hashtable。

#### Scenario: enumerate 返回 Assembly-CSharp.dll 全部 class

- **GIVEN** Hearthstone 运行，`MonoImage` 指向 Assembly-CSharp.dll
- **WHEN** `image.enumerate_classes()` 被调用
- **THEN** 返回 `Vec<MonoClassRef>` 长度 ≥ 1000

#### Scenario: enumerate 在空 image 上返回空 Vec

- **GIVEN** `class_cache` 字段读出 NULL 指针
- **WHEN** `enumerate_classes` 被调用
- **THEN** 返回 `Ok(vec![])`，并 `tracing::warn!` 一条 "class_cache is NULL"

#### Scenario: enumerate 返回 0 在偏移正确时视为错误

- **GIVEN** `class_cache` 非 NULL，`size > 0`，但遍历完所有桶后 0 个 class
- **WHEN** `enumerate_classes` 被调用
- **THEN** 返回 `Err(ScryError::ClassCacheEmpty)`，提示偏移可能错配

#### Scenario: find_class 命中

- **GIVEN** `enumerate_classes` 返回中含 `CollectionManager`
- **WHEN** `image.find_class("", "CollectionManager")` 被调用
- **THEN** 返回 `Ok(Some(class_ref))`，class_ref 指向该 MonoClass

#### Scenario: find_class 未命中

- **WHEN** `image.find_class("", "NonExistentClass")` 被调用（且 enumerate 返回非空但不含此 class）
- **THEN** 返回 `Ok(None)`，不 Err

### Requirement: MonoFieldDef 独立模块

The `packages/hearthmirror/native/src/mono/field.rs` SHALL define:

```rust
pub struct MonoFieldDef {
    pub name: String,
    pub offset: u32,
    pub type_ptr: RemotePtr,
    pub is_static: bool,
}
```

提供 `pub fn read(memory: &ProcessMemory, addr: RemotePtr, offsets: &FieldOffsets) -> Result<MonoFieldDef, ScryError>`：

- `name`: 通过 `memory.read_remote_ptr(addr + offsets.name)` 拿 c-string ptr，再读字符串
- `offset`: `memory.read_u32(addr + offsets.offset)`
- `type_ptr`: `memory.read_remote_ptr(addr + offsets.type_)`
- `is_static`: 如 `type_ptr.is_null() == false`，读 `type_ptr + 4`（attrs 字段，u16），按位检查 `MONO_FIELD_ATTR_STATIC == 0x10`；NULL → false

#### Scenario: 读取静态字段

- **GIVEN** mock 内存布局：`name="s_instance"`, `offset=0`, `type` attrs 含 `0x10`
- **WHEN** `MonoFieldDef::read` 被调用
- **THEN** 返回 `MonoFieldDef { name: "s_instance".into(), offset: 0, type_ptr: <非 NULL>, is_static: true }`

#### Scenario: 读取实例字段

- **GIVEN** mock 内存布局：`name="m_data"`, `offset=12`, `type` attrs 不含 `0x10`
- **WHEN** `read` 被调用
- **THEN** `is_static == false`

#### Scenario: NULL type_ptr 不 panic

- **GIVEN** mock 内存布局 `type_ptr=NULL`
- **WHEN** `read` 被调用
- **THEN** 返回 `is_static = false`，不 panic / 不 Err

### Requirement: MonoClass 继承链 API

The `packages/hearthmirror/native/src/mono/class.rs` SHALL extend `MonoClass<'r>` with:

- `pub fn parent(&self) -> Result<Option<MonoClassRef>, ScryError>` — 读 `class.parent` 偏移；NULL → None；自循环 → None
- `pub fn fields_recursive(&self) -> Result<HashMap<String, MonoFieldDef>, ScryError>` — 沿 parent 链向上遍历，合并所有声明字段，子类同名覆盖父类
- `pub fn find_field(&self, name: &str) -> Result<Option<MonoFieldDef>, ScryError>` — 调 `fields_recursive` + 查 HashMap

`fields_recursive` SHALL 在 parent 链深度超过 32 时返回 `Err(ScryError::ClassHierarchyTooDeep)`。

#### Scenario: 继承字段合并

- **GIVEN** A → B → C 三层继承（C extends B extends A），A 有 `m_a`, B 有 `m_b`, C 有 `m_c`
- **WHEN** `c.fields_recursive()` 被调用
- **THEN** 返回 HashMap 含 `m_a`、`m_b`、`m_c` 三键

#### Scenario: 子类覆盖同名父类字段

- **GIVEN** A 有 `m_id offset=4`, B extends A 也有 `m_id offset=8`（C# `new` 关键字）
- **WHEN** `b.fields_recursive()` 被调用
- **THEN** 返回 HashMap 中 `m_id.offset == 8`（B 版本）

#### Scenario: 自循环 parent 安全终止

- **GIVEN** mock class 的 `parent` 字段指向自身
- **WHEN** `parent()` 被调用
- **THEN** 返回 `Ok(None)`，不死循环

#### Scenario: 过深继承链 Err

- **GIVEN** mock 33 层继承链
- **WHEN** `fields_recursive()` 被调用
- **THEN** 返回 `Err(ScryError::ClassHierarchyTooDeep)`

#### Scenario: find_field 命中继承

- **GIVEN** 父类 A 有字段 `m_base`，子类 B 不重新声明此字段
- **WHEN** `b.find_field("m_base")` 被调用
- **THEN** 返回 `Ok(Some(<父类 m_base FieldDef>))`

### Requirement: MonoObject find_field 助手

The `packages/hearthmirror/native/src/mono/object.rs` SHALL extend `MonoObject<'r>` with:

- `pub fn find_field(&self, name: &str) -> Result<Option<MonoFieldDef>, ScryError>` — 通过 `vtable.class.find_field(name)` 查找含继承的字段

现有 6 个 `read_*_field` helpers（`read_string_field` / `read_int32_field` / `read_int64_field` / `read_bool_field` / `read_object_field` / `read_pointer_field`）签名与行为 SHALL 保持完全不变。

#### Scenario: find_field 委托给 class

- **GIVEN** mock `MonoObject` 其 vtable.class 链指向有字段 `m_data` 的 class
- **WHEN** `object.find_field("m_data")` 被调用
- **THEN** 返回 `Ok(Some(field_def))`

### Requirement: MonoRuntime::find_class 重构

`MonoRuntime::find_class(namespace, name)` 实现 SHALL：

1. 检查 `RuntimeCache::classes` 缓存（key = `format!("{}::{}", namespace, name)`）；命中 → 返回缓存
2. 缓存未命中 → 用 `runtime.open_assembly_csharp()?` 拿 Assembly-CSharp image addr
3. 构造 `MonoImage::new(self, ac_image)`
4. 调 `image.find_class(namespace, name)?`
5. 命中 → 写缓存 + 返回；未命中 → 返回 `Err(ScryError::ClassNotFound { namespace, name })`

实现 SHALL **NOT** 调用任何 `class_def_table` 相关函数（这些函数 SHALL 在本 change 中被删除）。

#### Scenario: 命中 find_class

- **GIVEN** Hearthstone 运行
- **WHEN** `runtime.find_class("", "CollectionManager")` 被调用
- **THEN** 返回 `Ok(<class_ref>)`，且第二次调用返回相同 ref（缓存生效）

#### Scenario: 未命中 find_class

- **WHEN** `runtime.find_class("", "NonExistent")` 被调用
- **THEN** 返回 `Err(ScryError::ClassNotFound { namespace: "", name: "NonExistent" })`

### Requirement: 删除 class_def_table 相关代码

The crate SHALL NOT contain any `class_def_table` heuristic probing code after this change. Specifically:

- `runtime.rs::probe_class_def_table_offset` 函数 SHALL 不存在
- `runtime.rs::find_class_def_table_offset_cached` 函数 SHALL 不存在
- `RuntimeCache::class_def_table_offset` 字段 SHALL 不存在
- `MonoRuntime::find_class` 实现 SHALL 不引用任何 metadata token 反向探测路径

`RuntimeCache::classes` 缓存 SHALL 保留（key/value 类型不变）。

#### Scenario: grep 验证零残留

- **WHEN** 执行 `Select-String -Path packages/hearthmirror/native/src/**/*.rs -Pattern "class_def_table|probe_class_def_table"`
- **THEN** 返回 0 行（或仅 cargo doc comment）

### Requirement: 反射方法兼容

After this change, all 12 reflection methods (`getBattleTag` ... `isGameOver`) SHALL retain their public napi signatures and pass `cargo test -p hearthmirror-native --all-features`（48+ tests）。任何反射方法 SHALL **NOT** 被本 change 修改字段链路调用代码（仅可被动受益于 `MonoRuntime::find_class` 内部路径切换）。

#### Scenario: 反射测试基线保持

- **WHEN** 执行 `cargo test -p hearthmirror-native --all-features`
- **THEN** 输出 `>= 48 passed; 0 failed`

#### Scenario: napi 签名不变

- **WHEN** 比较本 change 前后 `lib.rs` 中 `#[napi]` 函数签名
- **THEN** 12 个反射函数签名完全一致

### Requirement: 集成测试新增

The `packages/hearthmirror/native/tests/integration_image_walking.rs` SHALL 创建，含至少 2 个测试：

- `enumerate_classes_returns_assembly_csharp_classes` — skip-if-no-hs，验证 enumerate 返回 ≥ 1000 个 class
- `find_class_collection_manager` — skip-if-no-hs，验证 `MonoImage::find_class("", "CollectionManager")` 返回 `Some`

#### Scenario: 集成测试在无炉石环境跳过

- **GIVEN** Hearthstone 未运行
- **WHEN** 执行 `cargo test --test integration_image_walking`
- **THEN** 输出 "SKIP: no Hearthstone process found" × 2，退出码 0

