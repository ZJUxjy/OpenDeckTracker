## Context

### 现状（假设 `add-hearthmirror-offset-probing` 已完成）

post-offset-probing 状态：

| 组件 | 状态 |
|---|---|
| Mono 偏移管理 | ✅ JSON baseline + iced-x86 prober |
| `MonoRuntime::find_class(ns, name)` | ⚠️ 仍走 `image.class_def_table` 启发式探测 + 用 metadata token 反向校验 |
| `MonoClass.fields()` | ✅ 返回自有声明字段 |
| `MonoClass.fields_recursive()` | ❌ 未实现 — 父类字段不可访问 |
| `MonoFieldDef` | ⚠️ 内联在 `class.rs`，无 `is_static` / `type_ptr` 元数据 |
| `MonoImage` | ❌ 不存在独立类型 |

### 上游素材

| 模块 | 路径 | 行数 | 角色 |
|---|---|---|---|
| MonoImage | `hearthmirror-rs/hm-core/src/mono/image.rs` | ~250 | class_cache hashtable walk + find_class |
| MonoClass | `hearthmirror-rs/hm-core/src/mono/class.rs` | ~300 | 自有 + 继承字段解析 + parent 链 |
| MonoFieldDef | `hearthmirror-rs/hm-core/src/mono/field.rs` | ~120 | 独立模块 + `read()` + `is_static` |

### 用户需求

把 `find_class` 从"用 metadata token 反向猜偏移"重构为"沿 hashtable 直接遍历"，同时把 `MonoClass` 升级为支持继承字段访问。两件事强耦合（继承字段读取需要 `parent` 字段，`parent` 偏移由 prober 提供，且 `MonoFieldDef` 拆出后多个模块都要用）— 适合一个 change 内一次完成。

## Goals / Non-Goals

### Goals

- 引入 `MonoImage` 独立类型，实现 `enumerate_classes()` + `find_class(ns, name)`。
- 把 `MonoRuntime::find_class` 的实现委托给 `MonoImage::find_class`，删除 `class_def_table` 启发式探测。
- 引入 `MonoFieldDef` 独立模块，含 `is_static` / `type_ptr` 元数据。
- `MonoClass` 增 `parent()` / `fields_recursive()` / `find_field()`，支持继承链遍历。
- `MonoObject` 增 `find_field(name)` 自动用 `fields_recursive`。
- **保持** 12 个反射方法对外 API 不变；它们继续走 `MonoRuntime::find_class` + `MonoObject::read_*_field`，但内部走新路径。

### Non-Goals

- 不实现 VTable 模块（`hearthmirror-rs/hm-core/src/mono/vtable.rs`）。
- 不动业务字段名 / 反射方法链路。
- 不引入新 napi 函数。
- 不实现 `enumerate_classes` 的 napi 暴露（`dump_class` 业务功能留给 `add-hearthmirror-extra-methods`）。

## Decisions

### Decision D1: MonoImage 用 borrow 而非 Arc

- **What**: `pub struct MonoImage<'r> { runtime: &'r MonoRuntime, addr: RemotePtr }`，生命周期绑定 `MonoRuntime`。
- **Why**:
  - 与现有 `MonoClass<'r>` / `MonoObject<'r>` 一致。
  - `MonoImage` 只是一个轻量 view，无需独立所有权。
  - hearthmirror-rs 同样设计。
- **Trade-off**: 跨函数返回 `MonoImage` 受 `'r` 限制 — 但内部 API 不需要"返回 image 给外部持有"，只在 `MonoRuntime::find_class` 内部短期用。

### Decision D2: class_cache hashtable 遍历算法

- **What**:
  - Mono `MonoImage.class_cache` 字段指向一个 `MonoInternalHashTable`（不是 `GHashTable`）
  - 该表布局（按 hearthmirror-rs offsets）：`{ next_addr_offset, hash_func, key_extract, ..., size: u32, table: **u8 }`
  - 遍历方式：读 `size`（桶数）→ 读 `table` 拿到 `MonoClass**` 数组 → 对每个非空桶遍历 `MonoClass` 链表（链表 next 指针在 `MonoClass.next_class_cache` 偏移，由 prober 提供，但若 prober 未覆盖则用 baseline JSON 默认）
- **Why**:
  - 这是 mono runtime 内部实现，与 hearthmirror-rs 一致（已在真实炉石上验证多年）。
  - 比"扫 metadata token + 反向校验"鲁棒得多。
- **Edge case**: `class_cache` 为 NULL 或 `size == 0` → 返回 empty Vec + `tracing::warn!`，**不**返回 Err（因为某些 image 可能合法地无类）。

### Decision D3: fields_recursive 合并策略 — 子类覆盖父类

- **What**: 当父类与子类有同名字段（C# 语义：`new` 关键字隐藏父类字段），子类版本胜出。
- **Why**:
  - 反射 API 调用方期望"通过短名拿到当前类的字段"，与 C# 反射 `GetField(name)` 行为一致。
  - 同名字段在 C# 业务代码里极少见，但 base class `m_id` vs override 是潜在场景。
- **Implementation**: 自底向上遍历 `parent` 链时，先放父类字段进 HashMap，再放子类（HashMap insert 自动覆盖）。

### Decision D4: parent 链终止条件

- **What**: `MonoClass.parent()` 返回 `Option<MonoClassRef>`：
  - 如 `parent_addr == 0` → `None`
  - 如 `parent_addr == self.addr` → `None`（防止自循环 — 罕见但 mono 有 corner case）
  - 如遍历深度 > 32 → `Err(ScryError::ClassHierarchyTooDeep)` 防止无限循环
- **Why**: C# 继承链最深约 10 层（System.Object → ... → 业务类），32 是 5x 安全裕度。

### Decision D5: MonoFieldDef 字段集

- **What**: `pub struct MonoFieldDef { pub name: String, pub offset: u32, pub type_ptr: RemotePtr, pub is_static: bool }`
- **Why**:
  - `name` + `offset` 是当前反射方法所需。
  - `type_ptr` 为未来 type signature 解析（如区分 `int32` vs `int64`）保留。
  - `is_static` 用于判断字段是否在 vtable static area（虽然本 change 不实现 vtable 读取，先把元数据带上）。
- **Implementation**: `read()` 用 `runtime.offsets.structs.field` 拿 `name` / `offset` 偏移；`is_static` 通过读 `field.type` 指针的 attribute flag 位（`MONO_FIELD_ATTR_STATIC = 0x10`）判断。

### Decision D6: find_class 缓存策略

- **What**: `MonoRuntime` 已有 `RuntimeCache::classes: HashMap<String, MonoClassRef>` 缓存（key = `format!("{}::{}", ns, name)`）。本 change 保留此缓存，未命中时调 `MonoImage::find_class`。
- **Why**: enumerate_classes 遍历整个 hashtable 不便宜（典型炉石 image 含 5000+ class），缓存避免重复扫描。
- **Cache invalidation**: 不实现（炉石进程内 class 永不卸载，缓存无 stale 风险）。

### Decision D7: image 的 ac_image 缓存继续保留

- **What**: `MonoRuntime::open_assembly_csharp` 当前缓存 Assembly-CSharp.dll 的 image RemotePtr 到 `RuntimeCache::ac_image`。本 change **保留** 此缓存，并把它升级为 `MonoImage<'r>` 的构造源（`MonoImage { runtime, addr: ac_image }`）。
- **Why**: 99% 反射方法只查 Assembly-CSharp 内的类，专门优化此路径。

### Decision D8: 删除 probe_class_def_table_offset

- **What**: 在同一 commit 中：
  - 删 `runtime.rs::probe_class_def_table_offset`
  - 删 `runtime.rs::find_class_def_table_offset_cached`
  - 删 `RuntimeCache::class_def_table_offset` 字段
  - 删 `MonoRuntime::find_class` 中所有 token-probe 相关分支
- **Why**: 该路径被 `MonoImage::find_class` 替代，留着是死代码污染。

### Decision D9: 测试策略

- **Unit tests**:
  - `image.rs`: mock 一个 `&[u8]` hashtable buffer（含 4 个桶、每桶 2 个 class node），验证 enumerate 返回 8 个 class addr
  - `field.rs`: mock 一个 MonoFieldDef 内存布局，验证 `read()` 返回正确 name / offset / is_static
  - `class.rs`: mock A → B → C 父子链（C 含 `m_a`、B 含 `m_b`、A 含 `m_a` 同名），验证 `fields_recursive()` 返回 `{m_a (C 版), m_b}`
- **Integration tests**:
  - 现有 12 个 reflection integration 保持 skip-if-no-hs 通过
  - 新增 `tests/integration_image_walking.rs`：1 个测试 `enumerate_classes_returns_assembly_csharp_classes`（skip-if-no-hs，验证 enumerate 返回 ≥ 1000 个 class）+ 1 个测试 `find_class_collection_manager`（验证能找到 `CollectionManager`）

### Decision D10: 兼容旧 RuntimeCache 字段

- **What**: 删除 `class_def_table_offset` 字段后，旧 cache `HashMap<String, MonoClassRef>` 保留。新增字段：无（image 通过 `ac_image` 字段定位即可）。
- **Why**: 最小化 struct 接口扰动。

## Risks / Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| `class_cache` hashtable 内存布局假设错误 | H | 单测覆盖 hashtable 遍历；真机回归必须验证 enumerate 返回 ≥ 1000 个 class（empty → 偏移错） |
| 父类指针有循环（mono corner case） | L | parent 链深度上限 32 |
| reflection 方法在新 find_class 路径下找不到某个 class | M | spike 0003 必须重跑；本 change 完成时所有 12 个 reflection 测试全绿 |
| 缓存策略不当导致 stale class | L | 进程内 class 永不卸载，无 stale；如未来支持热更新再考虑 |
| `MonoFieldDef::read()` 在 type_ptr 为 NULL 时 panic | L | `read()` 显式 `if type_ptr.is_null() { is_static = false }` 而非 unwrap |
| 新 image 模块依赖 `class.next_class_cache` 偏移（best-effort prober 可能未覆盖） | M | 若 prober 未给出 → 用 baseline JSON 中的默认值；如默认值也错 → enumerate 返回 0 → 显式 `Err(ClassCacheEmpty)` |

## Migration Plan

无（内部重构，napi 公共 API 不变）。代码层迁移：
- `MonoRuntime::find_class` 内部委托新 `MonoImage::find_class`，外部调用方零感知。
- 12 个反射方法的 `runtime.find_class(...)` + `class.field_offset(...)` + `object.read_*_field(...)` 链路保持不变。

## Open Questions

- **enumerate 是否要 napi 暴露？** — 暂不。等 `add-hearthmirror-extra-methods` 中的 `dump_class` 业务方法时再决定。
- **MonoFieldDef 是否要扩展 `attr_flags: u32`？** — 暂只暴露 `is_static`；其他 attribute（public / private / readonly）当前业务无需，留给后续按需加。
- **如果 spike 0003 显示当前 `find_class` 实现能用，本 change 还有必要吗？** — 仍有：(a) 继承字段访问能力是 future-proof 的；(b) 删除启发式探测代码降低维护成本；(c) hashtable walk 比 token probe 快约 10x（一次性遍历 5000 class vs 每次 find 都扫候选偏移）。
