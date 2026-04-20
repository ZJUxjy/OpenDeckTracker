## 1. 依赖与脚手架

- [ ] 1.1 在 `packages/hearthmirror/native/Cargo.toml` `[dependencies]` 段添加：
  ```toml
  iced-x86 = { version = "1.21", default-features = false, features = ["std", "decoder", "fast_fmt"] }
  serde = { version = "1.0", features = ["derive"] }
  serde_json = "1.0"
  ```
- [ ] 1.2 跑 `cargo check -p hearthmirror-native`，确认依赖解析通过
- [ ] 1.3 创建目录 `packages/hearthmirror/native/config/mono-offsets/`
- [ ] 1.4 提交：`build(hearthmirror): add iced-x86 + serde for offset probing`

## 2. disasm 模块（TDD）

- [ ] 2.1 创建 `packages/hearthmirror/native/src/disasm.rs`，定义函数签名 + `unimplemented!()` 占位
- [ ] 2.2 在文件末尾加 `#[cfg(test)] mod tests`，写 4 个失败单测：
  - `find_first_absolute_load` 对 `[0xA1, 0x78, 0x56, 0x34, 0x12, 0xC3]` 返回 `Some(0x12345678)`
  - `find_field_load_displacement` 对 `[0x8B, 0x41, 0x0C, 0xC3]` 返回 `Some(0x0C)`
  - 二者对 `[0x90, 0x90, 0xC3]` 返回 `None`
  - 二者对截断字节 `[0xA1, 0x78]` 返回 `None`，不 panic
- [ ] 2.3 跑 `cargo test -p hearthmirror-native disasm`，确认 4 测试 fail
- [ ] 2.4 实现 `find_first_absolute_load`：用 `iced_x86::Decoder::new(bitness, bytes, DecoderOptions::NONE)` 迭代指令，匹配 `Mnemonic::Mov` + `OpKind::Memory` 且 `MemoryDisplSize == 4` 且 `MemoryBase == None`，返回 `instr.memory_displacement32() as u32`
- [ ] 2.5 实现 `find_field_load_displacement`：迭代到最后一个 `Mov` with `OpKind::Memory` + 非零 `MemoryBase`，返回 `instr.memory_displacement32()`
- [ ] 2.6 加 `pub const DEFAULT_PROBE_WINDOW: usize = 256;`
- [ ] 2.7 在 `lib.rs` 加 `pub mod disasm;`
- [ ] 2.8 跑测试通过；clippy 0 错误（lib only）
- [ ] 2.9 提交：`feat(hearthmirror): add iced-x86 disassembly engine in disasm.rs`

## 3. MonoOffsets 类型 + JSON baseline（TDD）

- [ ] 3.1 创建 `packages/hearthmirror/native/src/mono/offsets.rs`，定义 11 个 sub-struct (`DomainOffsets` 到 `ArrayOffsets`) + 顶层 `MonoOffsets { structs: MonoStructs }`
- [ ] 3.2 实现 `hex_or_int` 自定义反序列化器（`fn hex_or_int<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u32, D::Error>`）
- [ ] 3.3 加 `#[cfg(test)] mod tests`，写 4 个失败单测：
  - `from_str` 接受 `{"name": "0x2C"}` 与 `{"name": 44}` 等价
  - `from_str` 忽略 `$comment` 等未识别 key
  - `default()` 返回非零 `class.name`
  - `from_str(DEFAULT_OFFSETS_JSON) == fs::read_to_string("config/.../unity-2021.3.json")` 解析结果
- [ ] 3.4 从 `D:\code\hearthmirror-rs\hearthmirror\config\mono-offsets\unity-2021.3.json` 复制到 `packages/hearthmirror/native/config/mono-offsets/unity-2021.3.json`，确认文件存在
- [ ] 3.5 在 `offsets.rs` 加 `pub const DEFAULT_OFFSETS_JSON: &str = include_str!("../../config/mono-offsets/unity-2021.3.json");`（注意相对路径）
- [ ] 3.6 实现 `MonoOffsets::from_str` + `MonoOffsets::default()`
- [ ] 3.7 在 `mono/mod.rs` 加 `pub mod offsets;`
- [ ] 3.8 跑测试通过；clippy 0 错误
- [ ] 3.9 提交：`feat(hearthmirror): port MonoOffsets struct + unity-2021.3 baseline JSON`

## 4. PE export 读取 helper

- [ ] 4.1 在 `packages/hearthmirror/native/src/mono/probe.rs`（或 `mod.rs`）添加 `pub fn read_exports_map(memory: &ProcessMemory, module: &ModuleInfo) -> Result<HashMap<String, RemotePtr>, ScryError>`
- [ ] 4.2 实现：用 `pelite::pe32::PeView::module(...)` 拿 PE，调 `.exports()?.functions()` 与 `.exports()?.names()` 配对，返回 `HashMap<name_string, RemotePtr::new(module.base + rva)>`
- [ ] 4.3 加单测：构造一个 mock `&[u8]` PE 镜像（最小可解析 export table）；或者跳过单测，仅在集成测试覆盖
- [ ] 4.4 提交：`feat(hearthmirror): add read_exports_map helper using pelite`

## 5. OffsetProber 类型与 probe_all（核心 - TDD 困难，重单测 + 真机回归）

- [ ] 5.1 在 `packages/hearthmirror/native/src/mono/probe.rs` 定义：
  ```rust
  pub struct OffsetProber<'m> {
      memory: &'m ProcessMemory,
      mono_module: &'m ModuleInfo,
      exports: &'m HashMap<String, RemotePtr>,
      bitness: u32,
      probe_window: usize,
  }
  ```
- [ ] 5.2 实现 `pub fn new(...)` + `pub fn probe_all(&self, baseline: MonoOffsets) -> Result<MonoOffsets, ScryError>`
- [ ] 5.3 实现 6 个 critical probes（按 design D5 顺序），每个 probe：
  - 从 `exports` 找函数 `RemotePtr`
  - `memory.read_bytes(va, probe_window)` 读 256 字节
  - 调 `disasm::find_field_load_displacement` 或 `find_first_absolute_load`
  - 失败 → `Err(ScryError::OffsetProbeFailed(probe_name.into()))`
- [ ] 5.4 实现 4 个 best-effort probes：失败仅 `tracing::warn!` + 保持 baseline 值
- [ ] 5.5 在 `ScryError` 添加 `OffsetProbeFailed(String)` 与 `ExportNotFound(String)` 与 `InvalidProbeBitness(u32)` variant
- [ ] 5.6 单测覆盖：
  - 缺少 export 时返回 `ExportNotFound`
  - bitness != 32 时返回 `InvalidProbeBitness`（或 debug_assert）
  - mock disasm 返回 None 时 critical 失败 / best-effort 保留 baseline
- [ ] 5.7 跑测试通过
- [ ] 5.8 提交：`feat(hearthmirror): implement OffsetProber with 6 critical + 4 best-effort probes`

## 5.5 偏移路由统一 + P0 修复（2026-04-20 review 后插入）

> **触发**：Phase 5 review 发现 crate 内 4 套偏移源，A=`MonoOffsets` 与 C=`field_paths.rs` 11/13 字段冲突，且 `FIELD_NAME`/`FIELD_TYPE` 名字与值互换 (P0)。Phase 6 必须先做这一步否则 OffsetProber 接入只是装饰。详见 design.md "Phase 5.5 Audit"。

### 5.5.A 路由层（D11）

- [x] 5.5.1 在 `MonoClassRef` 加 `offsets: Arc<MonoOffsets>` 字段（`use std::sync::Arc`、`use crate::mono::offsets::MonoOffsets`）
- [x] 5.5.2 在 `MonoObject` 加 `offsets: Arc<MonoOffsets>` 字段
- [x] 5.5.3 修改 `read_class_fields(memory, klass, offsets: &MonoOffsets)`，把 6 处常量引用换为 `offsets.structs.class.field_count` / `.fields`、`offsets.structs.field.size` / `.name` / `.offset`
- [x] 5.5.4 修改 `read_mono_class(memory, klass, offsets: Arc<MonoOffsets>)`，把 `MONO_CLASS_NAME` / `MONO_CLASS_NAMESPACE` 换为 `offsets.structs.class.name` / `.name_space`；调用 `read_class_fields(memory, klass, &offsets)`；按 D12 改写 `static_field_data` 计算（vtable + dynamic）；返回 `MonoClassRef { ..., offsets }`
- [x] 5.5.5 修改 `MonoObject::new(addr, class)` 从 `class.offsets.clone()` 拷贝 Arc
- [x] 5.5.6 修改 `MonoObject::from_address(memory, addr, offsets: Arc<MonoOffsets>)`，把内部 `read_class_fields` 调用补上 `&offsets`
- [x] 5.5.7 在 `MonoObject` 添加便利方法 `pub fn child_from_address(&self, memory, addr) -> Result<Option<Self>, ScryError> { Self::from_address(memory, addr, self.offsets.clone()) }`
- [x] 5.5.8 修改 `MonoObject::read_object_field` 调用点：`MonoObject::from_address(memory, ptr, self.offsets.clone())`

### 5.5.B Runtime + 反射调用点

- [x] 5.5.9 在 `MonoRuntime` struct 加 `pub offsets: Arc<MonoOffsets>` 字段；`init()` 中初始化为 `Arc::new(MonoOffsets::default())`（Phase 6 替换为 prober 结果）。注：导入时用 `MonoOffsets as RuntimeOffsets` 别名避免与 legacy `runtime.rs::MonoOffsets { domain_loaded_images }` 冲突
- [x] 5.5.10 在 `MonoRuntime::find_class:287` 把 `read_mono_class(&self.memory, class_ptr)` → `read_mono_class(&self.memory, class_ptr, self.offsets.clone())`
- [x] 5.5.11 在 `MonoRuntime::find_ac_image_cached:350` 把 `field_paths::MONO_IMAGE_NAME` → `self.offsets.structs.image.name`
- [x] 5.5.12 在 `MonoRuntime::probe_class_def_table_offset:465` 把 `field_paths::MONO_CLASS_NAME` → `self.offsets.structs.class.name`
- [x] 5.5.13 修改 3 个 reflection 直接 `MonoObject::from_address(mem, addr)` 调用为 `parent.child_from_address(mem, addr)`：
  - `reflection/collection.rs:41`（parent = `instance`，并删除现已不用的 `MonoObject` import）
  - `reflection/decks.rs:56`（parent = `deck`）
  - `reflection/decks.rs:108`（parent = `instance`）

### 5.5.C 删除 + 测试更新

- [x] 5.5.14 删除 `field_paths.rs:116-134` 的 13 个 Mono 结构偏移常量段；保留一个迁移说明注释指向 `MonoOffsets` 与 design.md
- [x] 5.5.15 验证 `Get-ChildItem packages/hearthmirror/native/src -Recurse -Filter *.rs | Select-String 'MONO_CLASS_NAME|MONO_CLASS_FIELD|MONO_IMAGE_NAME'` 在 `src/` 下命中数 = 0 ✓
- [x] 5.5.16 更新 `object.rs` 的 2 个直接构造测试 (`mono_object_missing_field_returns_none`, `mono_object_new_clones_fields`)：在结构字面量加 `offsets: Arc::new(MonoOffsets::default())`；`mono_object_new_clones_fields` 加 `Arc::ptr_eq` 断言
- [x] 5.5.17 跑 `cargo build --all-features` 通过 (6.46s, 0 errors)
- [x] 5.5.18 跑 `cargo test --all-features --lib` 全绿 (53 passed, 0 failed, 1 ignored — 含 5 个 offsets 测试 + 6 个 disasm 测试 + 4 个 probe 测试 + 2 个更新后的 object 测试)
- [x] 5.5.19 跑 `cargo clippy --all-features --lib -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic` 0 错误（lib-only 是项目约定 gate；`--tests` 上 37 个 unwrap/expect 是 `add-hearthmirror-metadata-reader` 已记录的 baseline，未引入新触发）
- [ ] 5.5.20 真机延后：当前会话 Hearthstone 未运行；Phase 6 一并真机验证（5.5 不引入新失败模式因为 Arc<MonoOffsets::default()> 在功能上等价于把 11/13 已修正的偏移挂上线，仅当 reflection 链路真正跑过 `read_mono_class` 才有可观察差异 — 走 init 时已通过单测覆盖路由）
- [x] 5.5.21 提交：`refactor(hearthmirror): unify Mono offset routing via Arc<MonoOffsets>; fix P0 FIELD_NAME/TYPE swap`

## 6. OffsetProber 接入 MonoRuntime（缩小 scope，5.5 后才上）

> **前置**：5.5 必须完成 — 路由层已就绪后，Phase 6 仅做"把 `Arc::new(MonoOffsets::default())` 换成 `Arc::new(prober.probe_all(default())?)`"的 hot-swap。

- [x] 6.1 在 `MonoRuntime` struct 加 `pub exports: HashMap<String, RemotePtr>` 字段（OffsetProber 构造期借用，初始化后 runtime 持有，便于 diag_init 复探）
- [x] 6.2 在 `MonoRuntime::init()` 的 `find_mono_module` 之后插入 `read_exports_map` + `OffsetProber::new(...)?.probe_all(MonoOffsets::default())`，失败 fallback baseline 并 `eprintln!`，最终 `Arc::new(offsets)` 写入 `self.offsets`
- [x] 6.3 替换 `extract_global_root_domain_addr` 内部 byte-pattern (Pattern A/B 16 字节窗) 为 `disasm::find_first_absolute_load(bytes, 32)`，窗口扩到 `DEFAULT_PROBE_WINDOW=256`；找不到时返回 `ScryError::OffsetProbeFailed`。同时删除 `find_mono_get_root_domain_va` (改用 exports map `lookup_export`)
- [x] 6.4 删除 `discover_offsets` + `discover_offsets_cached` + 旧 `pub struct MonoOffsets { domain_loaded_images }` + `RuntimeCache::offsets` 字段；`find_ac_image_cached` 重写：`read_remote_ptr(root_domain + domain.domain_assemblies)` → `glist::iter` (GSList 与 GList 头两字段同构) → 每节点 deref `assembly.image` 拿 `MonoImage*` → 校验 `image.name`。同步删除 `RuntimeOffsets` 别名 (legacy 同名 struct 已删)、删除 `looks_like_cstring` / `probe_field_offset` import、删除集成测试 `discover_domain_offsets` (语义不再适用)
- [x] 6.5 **保留** `probe_class_def_table_offset`（留给 image-walking change 处理；本 change 不动）
- [x] 6.6 跑 `cargo build -p hearthmirror-native --all-features` 0 errors + `cargo test -p hearthmirror-native --all-features --lib` 53 passed (1 ignored) + `cargo clippy --all-features --lib -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic` 0 errors
- [x] 6.7 顺手清理 `mono/probe.rs`：删 caller-less 的 `probe_field_offset` / `looks_like_cstring` / `looks_readable` / `MAX_PROBE_SLOTS` + 重写模块级 doc；删 `error.rs::DisasmPatternUnknown` (caller 已切到 `OffsetProbeFailed`)
- [x] 6.8 加 integration test `offset_prober_runs_during_init`：验 `runtime.offsets.structs.class.name` 在合理范围 + `runtime.exports` 含 `mono_get_root_domain` (skip-if-no-HS pattern 与既有测试一致)
- [ ] 6.9 真机（如有）：跑 `cargo run -p hearthmirror-native --example diag_init` + `cargo test -p hearthmirror-native --all-features` (含 integration)；记录到 spike 0003 Run N
- [ ] 6.10 提交：`refactor(hearthmirror): wire MonoRuntime::init to OffsetProber + switch domain walk to domain_assemblies`

## 7. 收尾 polish + 文档（合并原 Phase 7）

> Phase 5.5 已完成 `field_paths.rs` 删除 + 路由替换；Phase 7 退化为 review 反馈 polish。

- [ ] 7.1 (LOW 1) `OffsetProber.probe_window` 字段保留为 `pub`（评估后保持当前设计），加 doc comment 说明"未来可能为长函数 prologue（如 enumerate 类）扩到 512+"
- [ ] 7.2 (LOW 5) 在 `OffsetProber::probe_all` 顶部 doc comment 中文档化 "JSON exports_to_probe 列了 13 个，本函数只 probe 10 个" 的差异：`mono_get_root_domain` 单独由 `extract_global_root_domain_addr` 用 `find_first_absolute_load` 处理；`mono_field_get_parent` / `mono_field_get_offset` / `mono_field_get_type` / `mono_field_get_name` 是 sanity probes（baseline 已知正确，未来可加 assertion）；`mono_vtable_get_static_field_data` 是 complex（非 displacement，按 D12 在 `read_mono_class` 内动态计算）
- [ ] 7.3 (LOW 2) 在 `OffsetProber` 模块级 doc comment 加一行 "Best-effort failures use `eprintln!` for now; consider `tracing` once project adopts a logging framework"
- [ ] 7.4 重跑 grep，确认 `field_paths.rs` 已无 `MONO_*` 结构常量：`Select-String -Path packages/hearthmirror/native/src/**/*.rs -Pattern "pub const MONO_CLASS_|pub const MONO_IMAGE_"` → 0 行
- [ ] 7.5 跑 `cargo build` + `cargo test --all-features` 全绿
- [ ] 7.6 提交：`docs(hearthmirror): polish OffsetProber per cf22d47 review`

## 8. ADR & 文档更新

- [ ] 8.1 在 `docs/adr/0001-hearthmirror-bridge.md` "约束 #5（动态偏移探测）" 段后追加段落：
  ```
  > **实施记录（2026-04-XX）**: 由 [`add-hearthmirror-offset-probing`](../../openspec/changes/add-hearthmirror-offset-probing/) 兑现，引入 `iced-x86` 反汇编 + `MonoOffsets` JSON 配置 + `OffsetProber`（6 critical + 4 best-effort）。实测验证见 [spike 0003](../spikes/0003-hearthmirror-reflection-runtime-validation.md)。
  ```
- [ ] 8.2 更新 `packages/hearthmirror/native/README.md`（如存在）：在功能列表加一段"Offset probing"，简介反汇编机制
- [ ] 8.3 在 `openspec/changes/.NEXT.md` 把 `add-hearthmirror-offset-probing` 状态标 `✓✓`
- [ ] 8.4 提交：`docs(hearthmirror): record offset probing in ADR 0001 and update NEXT`

## 9. 验证 + 验收

- [ ] 9.1 跑 `cargo test -p hearthmirror-native --all-features`：测试数 ≥ 48（旧 36 unit + 12 integration） + 新增 disasm/offsets/probe 单测，全绿
- [ ] 9.2 跑 `cargo clippy -p hearthmirror-native --all-features -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic`，0 错误（lib + new modules）
- [ ] 9.3 跑 `pnpm test`、`pnpm typecheck`、`pnpm lint`：保持基线（71 tests，无新增 typecheck/lint 错误）
- [ ] 9.4 跑 `openspec validate add-hearthmirror-offset-probing --strict`，0 错误
- [ ] 9.5 **真机回归**（如本机有炉石）：
  - 跑 `cargo test -p hearthmirror-native --all-features`：3 个 runtime integration test 全绿
  - 跑 `cargo run --example dump_reflection`（来自 [`verify-hearthmirror-on-real-hs`](../verify-hearthmirror-on-real-hs/)）：12 方法状态不退化
  - 在 `docs/spikes/0003-*.md` 追加 `## Run N` 标 "post-offset-probing"
- [ ] 9.6 提交（如有遗漏）：`docs(hearthmirror): finalize offset probing change`

## 10. （可选）风险检查

- [ ] 10.1 `cargo bloat --release -p hearthmirror-native --crates`（如装了 cargo-bloat）：确认 `iced-x86` 增量 < 500 KB
- [ ] 10.2 跑 `napi build --release`（仅冒烟，不必替换 `.node`）：确认 release binary 编译通过
