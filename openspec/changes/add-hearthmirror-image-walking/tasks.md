## 1. 前置检查

- [ ] 1.1 确认 [`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/) 已 archive，`runtime.offsets.structs.image.class_cache` / `hashtable.{size,table}` / `class.parent` / `class.field_count` 偏移可用
- [ ] 1.2 跑 `cargo test -p hearthmirror-native --all-features`，记录基线测试数（应 ≥ 48 + offset-probing 新增）
- [ ] 1.3 跑 `openspec list` 确认 `add-hearthmirror-image-walking` 在 active

## 2. MonoFieldDef 独立模块（TDD）

- [ ] 2.1 创建 `packages/hearthmirror/native/src/mono/field.rs`，定义 `pub struct MonoFieldDef` 与 `pub fn read(...) -> Result<MonoFieldDef>`
- [ ] 2.2 加 `#[cfg(test)] mod tests`，写 3 个失败单测（静态字段 / 实例字段 / NULL type_ptr）
- [ ] 2.3 跑 `cargo test field`，确认 fail
- [ ] 2.4 实现 `read()`：用 `runtime.offsets.structs.field.{name, offset, type_}` 偏移；`is_static` 通过读 `type_ptr + 4`（u16 attrs）判 `0x10` 位
- [ ] 2.5 在 `mono/mod.rs` 加 `pub mod field;`
- [ ] 2.6 跑测试通过；clippy 0 错误
- [ ] 2.7 提交：`feat(hearthmirror): add MonoFieldDef independent module`

## 3. MonoClass 继承链 API（TDD）

- [ ] 3.1 在 `packages/hearthmirror/native/src/mono/class.rs` 加方法签名（占位 `unimplemented!()`）：
  - `pub fn parent(&self) -> Result<Option<MonoClassRef>, ScryError>`
  - `pub fn fields_recursive(&self) -> Result<HashMap<String, MonoFieldDef>, ScryError>`
  - `pub fn find_field(&self, name: &str) -> Result<Option<MonoFieldDef>, ScryError>`
- [ ] 3.2 在 `class.rs` 写 4 个失败单测：继承字段合并 / 子类覆盖 / 自循环 parent / 过深链 Err
- [ ] 3.3 在 `error.rs` 加 `ClassHierarchyTooDeep` variant
- [ ] 3.4 跑测试 fail
- [ ] 3.5 实现 `parent()`：读 `class.parent` 偏移；NULL → None；== self.addr → None
- [ ] 3.6 实现 `fields_recursive()`：循环 `parent()` ≤ 32 次，自底向上 push 父类字段进 HashMap，最后 push 自有字段（HashMap insert 自动覆盖）
- [ ] 3.7 实现 `find_field()`：调 `fields_recursive()?` + `.get(name).cloned()`
- [ ] 3.8 跑测试通过；clippy 0 错误
- [ ] 3.9 提交：`feat(hearthmirror): add MonoClass.parent/fields_recursive/find_field with inheritance`

## 4. MonoImage 模块（TDD）

- [ ] 4.1 创建 `packages/hearthmirror/native/src/mono/image.rs`，定义 `pub struct MonoImage<'r>` + 方法签名
- [ ] 4.2 在 `error.rs` 加 `ClassCacheEmpty` variant
- [ ] 4.3 加 4 个失败单测：mock hashtable buffer 验证 enumerate / NULL class_cache / find_class 命中 / find_class 未命中
- [ ] 4.4 实现 `name()`：读 `image.name` 字段（c-string）
- [ ] 4.5 实现 `enumerate_classes()`：
  - 读 `class_cache_addr = self.addr + offsets.image.class_cache`
  - 读 `cache_struct_addr` = `read_remote_ptr(class_cache_addr)`
  - 如 NULL → return `Ok(vec![])` + warn
  - 读 `size = read_u32(cache_struct_addr + offsets.hashtable.size)`
  - 读 `table_ptr = read_remote_ptr(cache_struct_addr + offsets.hashtable.table)`
  - 对 `i in 0..size`：读 `bucket_head = read_remote_ptr(table_ptr + i*4)`；遍历链表（next 指针在 `class.next_class_cache` 偏移）push 到 Vec
- [ ] 4.6 实现 `find_class(ns, name)`：调 enumerate + 对每个 class 读 namespace/name 匹配
- [ ] 4.7 在 `mono/mod.rs` 加 `pub mod image;`
- [ ] 4.8 跑测试通过
- [ ] 4.9 提交：`feat(hearthmirror): add MonoImage with class_cache enumeration`

## 5. MonoObject find_field

- [ ] 5.1 在 `packages/hearthmirror/native/src/mono/object.rs` 加 `pub fn find_field(&self, name: &str) -> Result<Option<MonoFieldDef>, ScryError>`，实现：读 vtable → 读 class → 调 `class.find_field(name)`
- [ ] 5.2 加 1 个 mock 单测验证委托链
- [ ] 5.3 提交：`feat(hearthmirror): add MonoObject.find_field delegating to MonoClass`

## 6. MonoRuntime::find_class 重构

- [ ] 6.1 在 `runtime.rs` 改 `MonoRuntime::find_class` 实现：缓存命中 → 返回；未命中 → `MonoImage::new(self, ac_image).find_class(ns, name)?` → 写缓存 → 返回
- [ ] 6.2 在 `error.rs` 加 `ClassNotFound { namespace: String, name: String }` variant（如已存在则复用）
- [ ] 6.3 删除 `runtime.rs::probe_class_def_table_offset`
- [ ] 6.4 删除 `runtime.rs::find_class_def_table_offset_cached`
- [ ] 6.5 删除 `RuntimeCache::class_def_table_offset` 字段
- [ ] 6.6 grep 验证：`Select-String -Path packages/hearthmirror/native/src/**/*.rs -Pattern "class_def_table|probe_class_def_table"` → 0 行（或仅 doc comment）
- [ ] 6.7 跑 `cargo build` + `cargo test --all-features`，所有测试包括 12 个 reflection integration（skip-if-no-hs）保持绿
- [ ] 6.8 提交：`refactor(hearthmirror): replace find_class with MonoImage walking, drop class_def_table probe`

## 7. 集成测试

- [ ] 7.1 创建 `packages/hearthmirror/native/tests/integration_image_walking.rs`
- [ ] 7.2 复用 `skip_if_no_hs()` 工具函数（从 `integration_reflection.rs` 提取共用 helper 或直接复制）
- [ ] 7.3 写 2 个测试：
  - `enumerate_classes_returns_assembly_csharp_classes` — 跳过条件 + 调 `MonoRuntime::init` + `open_assembly_csharp` + `MonoImage::enumerate_classes`，断言 len ≥ 1000
  - `find_class_collection_manager` — 跳过条件 + `runtime.find_class("", "CollectionManager")` 断言 `Ok(_)`
- [ ] 7.4 在无炉石环境跑 `cargo test --test integration_image_walking`，输出 SKIP × 2 + 退出码 0
- [ ] 7.5 提交：`test(hearthmirror): add integration tests for image walking`

## 8. 文档与 ADR 更新

- [ ] 8.1 在 `docs/adr/0001-hearthmirror-bridge.md` 增加 "约束 #6（优先用 loaded_images）" 实施记录段（如已存在则补充本 change 引用）
- [ ] 8.2 更新 `packages/hearthmirror/native/README.md`（如存在）：补 "Class resolution" 节，简介 hashtable walking 与继承链遍历
- [ ] 8.3 在 `openspec/changes/.NEXT.md` 把 `add-hearthmirror-image-walking` 状态标 `✓✓`
- [ ] 8.4 提交：`docs(hearthmirror): record image walking in ADR 0001 and update NEXT`

## 9. 验证 + 验收

- [ ] 9.1 跑 `cargo test -p hearthmirror-native --all-features`：测试数 ≥ baseline + 新增（field 3 + class 4 + image 4 + object 1 + integration 2 ≈ 14 新测）
- [ ] 9.2 跑 `cargo clippy -p hearthmirror-native --all-features -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic`，0 错误
- [ ] 9.3 跑 `pnpm test`、`pnpm typecheck`、`pnpm lint`：保持基线
- [ ] 9.4 跑 `openspec validate add-hearthmirror-image-walking --strict`，0 错误
- [ ] 9.5 **真机回归**（如本机有炉石）：
  - 跑 `cargo test --test integration_image_walking`：2 个测试全绿，enumerate 数量 ≥ 1000
  - 跑 `cargo run --example dump_reflection`（来自 [`verify-hearthmirror-on-real-hs`](../verify-hearthmirror-on-real-hs/)）：12 方法状态 ≥ 上一轮 baseline（不退化）
  - 在 `docs/spikes/0003-*.md` 追加 `## Run N` 标 "post-image-walking"
- [ ] 9.6 提交（如有遗漏）：`docs(hearthmirror): finalize image walking change`
