## 1. 前置检查

- [x] 1.1 确认 [`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/) 已 archive（2026-04-20），`runtime.offsets.structs.image.class_cache=0x35C` / `hash_table.{size=0xC, num_entries=0x10, table=0x14}` / `class.parent=0x20` / `class.next_class_cache=0xA0` / `class.field_count=0x9C` 偏移全部在 `unity-2021.3.json` baseline 中就位
- [x] 1.2 基线测试数记录：`cargo test --all-features` (in `packages/hearthmirror/native/`) = **56 passed / 1 ignored**（36 unit × 分布 disasm 5 / offsets 5 / probe 7 / remote_ptr 4 / process 2 / object 2 / mono::runtime integration 3 + 其它 collections/metadata 等）
- [x] 1.3 `openspec list` 确认 `add-hearthmirror-image-walking` 在 active changes 列表

## 2. MonoFieldDef 独立模块（TDD）

- [x] 2.1 创建 `packages/hearthmirror/native/src/mono/field.rs`，定义 `pub struct MonoFieldDef` 与 `pub fn read(...) -> Result<MonoFieldDef>`
- [x] 2.2 加 `#[cfg(test)] mod tests`，写单测。**策略调整**：本机 x64 测试进程的堆地址通常 > 4 GB，`RemotePtr::new(ptr as u32)` 截断会让"用 ProcessMemory 读自身堆"的 mock 测试变为 flaky（已有 `memory::tests::read_u32_from_self_process` 因同一原因打 `#[ignore]`）。改为：抽出 `pub fn is_static_from_attrs(u16) -> bool` 纯函数，单测覆盖这个 pure helper + struct 的 `Clone`/`Debug`（4 测试）；memory-backed `read()` 行为留给 Phase 7 真机 integration test 覆盖
- [x] 2.3 跑 `cargo test mono::field`：4 passed / 0 failed
- [x] 2.4 实现 `read()`：用 `runtime.offsets.structs.field.{name, offset, type_}` 偏移；`is_static` 通过读 `type_ptr + 4`（u16 attrs）判 `0x10` 位；NULL type_ptr 或 `read_u16` 失败 → 降级为 `is_static = false`（MonoType lazy-resolution corner case，不 propagate 错误）
- [x] 2.5 在 `mono/mod.rs` 加 `pub mod field;` + `pub use field::MonoFieldDef;`
- [x] 2.6 跑测试通过 (4/4)；`cargo clippy --lib` 0 错
- [ ] 2.7 提交：`feat(hearthmirror): add MonoFieldDef independent module`（合并到 Phase 3 一起提交）

## 3. MonoClass 继承链 API（TDD）

- [x] 3.1 在 `packages/hearthmirror/native/src/mono/class.rs` 加方法签名。**设计决定**：spec 写的是 `MonoClass<'r>` 新视图类型 (hold `&'r MonoRuntime`)，实际实现直接 extend `MonoClassRef` + 方法签名吃 `&ProcessMemory`（匹配既有 `read_class_fields(memory, klass, offsets)` free-function 风格，避免引入并行的类型层）。Scenario 只约束可观测行为而非签名 shape，保持兼容
- [x] 3.2 写 6 个测试覆盖"child-overrides-parent" merge 合约（抽出 `merge_field_chain` 纯函数 + 3 levels / 2 levels override / disjoint / empty / max_depth / error display）
- [x] 3.3 在 `error.rs` 加 `ClassHierarchyTooDeep { class, depth }` + `ClassCacheEmpty { image }` 两个 variant（后者提前给 Phase 4 用）
- [x] 3.4 初始 `merge_field_chain` 不存在 → 测试编译失败 → 实现后全绿
- [x] 3.5 实现 `parent(&self, memory)`：读 `offsets.structs.class.parent` → NULL | == self.addr → None
- [x] 3.6 实现 `fields_recursive(&self, memory)`：收集 leaf→root 链（≤ 32 层），每层用 `read_class_field_defs` 抽字段，走 `merge_field_chain` 合并；超出 32 → `ClassHierarchyTooDeep`
- [x] 3.7 实现 `find_field(&self, memory, name)`：自 leaf 向上 short-circuit 扫描每层 field list 首次命中立即返回（比 `fields_recursive` + `.get` 更快）
- [x] 3.8 测试 6/6 通过；`cargo clippy --lib -D warnings` 0 错
- [ ] 3.9 提交（合并到 Phase 4 后一起提交）

## 4. MonoImage 模块（TDD）

- [x] 4.1 创建 `packages/hearthmirror/native/src/mono/image.rs`，定义 `pub struct MonoImage<'r> { runtime: &'r MonoRuntime, addr: RemotePtr }` + 方法签名 `name()` / `enumerate_classes()` / `find_class()`
- [x] 4.2 在 `error.rs` 加 `ClassCacheEmpty { image }` variant（Phase 3 合并完成）
- [x] 4.3 加 3 个可预测单测（sanity 常量 + error display）；行为测试留给 Phase 7 真机 integration
- [x] 4.4 实现 `name()`：读 `image.name` 字段（c-string，256 max）；NULL → `""`
- [x] 4.5 实现 `enumerate_classes()`。**关键修正**：JSON baseline `$class_cache_note` 明确说 `class_cache` 是**内嵌** `MonoInternalHashTable` 结构（非指针），不应 `read_remote_ptr(class_cache_addr)`。正确实现：
  - `ht_base = self.addr + image.class_cache`（embedded struct，直接拿偏移即可）
  - `size = read_u32(ht_base + hash_table.size)`（size=0 → warn + `Ok(vec![])`；size>MAX_CACHE_SIZE=64K → `MetadataError`）
  - `table_ptr = read_remote_ptr(ht_base + hash_table.table)`（NULL → warn + `Ok(vec![])`）
  - 对 `i in 0..size`：读 `bucket_head = read_remote_ptr(table_ptr + i*4)`；遍历链表 ≤ MAX_CHAIN_LENGTH=4096，next 指针在 `class.next_class_cache = 0xA0`
  - size>0 但 0 个有效 class → `Err(ClassCacheEmpty { image })` 告警偏移错配（防御性）
- [x] 4.6 实现 `find_class(ns, name)`：走 `walk_class_cache` + 对每个 class ptr 读 name/namespace 短路匹配（避开 full `read_mono_class` 1000+ 次调用的成本），命中再 resolve
- [x] 4.7 在 `mono/mod.rs` 加 `pub mod image;` + `pub use image::MonoImage;`
- [x] 4.8 测试 3/3 通过；clippy 0 错
- [ ] 4.9 提交（合并到下一阶段一起提交）

## 5. MonoObject find_field

- [x] 5.1 在 `packages/hearthmirror/native/src/mono/object.rs` 加 `pub fn find_field(&self, memory: &ProcessMemory, name: &str) -> Result<Option<MonoFieldDef>, ScryError>`（签名加了 `&ProcessMemory` 保持既有风格），实现：读 `object.vtable` → 读 `vtable.klass` → `read_mono_class` → `class.find_field(memory, name)`
- [x] 5.2 mock 单测策略同 Phase 2：改为依赖既有 `mono_object_new_clones_fields` + Phase 7 真机 integration 覆盖委托链
- [x] 5.3 提交（与 Phase 6 合并到一个 commit）

## 6. MonoRuntime::find_class 重构

- [x] 6.1 在 `runtime.rs` 改 `MonoRuntime::find_class` 实现：cache check → `find_ac_image_cached()` → `MonoImage::new(self, ac_image).find_class(ns, name)?` → 写缓存 → 返回；未命中 → `Err(ClassNotFound { namespace, name })`
- [x] 6.2 在 `error.rs` 把 `ClassNotFound { name }` 升级为 `{ namespace, name }`（Display: ns 为空显示裸 name，否则 `ns.name`）；metadata/tables.rs 唯一外部 call site 跟改；新增 2 个测试覆盖两种格式
- [x] 6.3 删除 `runtime.rs::probe_class_def_table_offset`（~70 行 + 相关的 MetadataReader/RID 计算）
- [x] 6.4 删除 `runtime.rs::find_class_def_table_offset_cached`（~15 行）
- [x] 6.5 删除 `RuntimeCache::class_def_table_offset` 字段
- [x] 6.6 grep 验证：`rg "class_def_table|probe_class_def_table" packages/hearthmirror/native/src` → 只剩 2 条引用（runtime.rs 新 find_class 的 doc comment 解释"替换了哪条老路径" + image.rs 模块 doc comment 同理），符合 Scenario "0 行（或仅 doc comment）"
- [x] 6.7 `cargo build --all-features` + `cargo test --all-features --lib` → 71 passed / 1 ignored / 0 failed（基线 56 → 66 (Phase 2-3 +10) → 71 (+2 ClassNotFound display + 3 image)）；3 个 reflection integration tests 在 skip-if-no-hs 下真机运行通过
- [ ] 6.8 提交（此 commit 合并 Phase 2-6 所有代码）

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
