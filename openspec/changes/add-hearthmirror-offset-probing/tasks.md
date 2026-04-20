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

## 6. MonoRuntime 接入新 offset 系统

- [ ] 6.1 改 `MonoRuntime` struct：增 `pub offsets: MonoOffsets` 与 `pub exports: HashMap<String, RemotePtr>` 字段
- [ ] 6.2 重写 `MonoRuntime::init()` 按 spec Requirement "MonoRuntime::init 使用新 offset probing" 的 9 步流程
- [ ] 6.3 删除 `extract_global_root_domain_addr` 中的 byte-pattern 扫描代码（替换为 `disasm::find_first_absolute_load(bytes, 32).ok_or(ScryError::OffsetProbeFailed("root_domain"))?`）
- [ ] 6.4 删除 `discover_offsets` 函数及其调用方
- [ ] 6.5 **保留** `probe_class_def_table_offset`（留给 image-walking change 处理；本 change 不动）
- [ ] 6.6 跑 `cargo build -p hearthmirror-native` + `cargo test -p hearthmirror-native --all-features` 全绿（有 skip-if-no-hs 的集成测试）
- [ ] 6.7 提交：`refactor(hearthmirror): wire MonoRuntime::init to new offset probing pipeline`

## 7. 替换硬编码偏移引用

- [ ] 7.1 跑 `Get-ChildItem -Path packages/hearthmirror/native/src -Filter *.rs -Recurse | Select-String "MONO_CLASS_NAME|MONO_CLASS_FIELDS|MONO_IMAGE_NAME"` 列出所有引用点
- [ ] 7.2 把每处引用替换为 `runtime.offsets.structs.class.name` / `.fields` / `.image.name` 等（注意：这要求 `MonoClass` / `MonoObject` 持有 `&MonoRuntime` 引用 — 当前已是这种模式，确认即可）
- [ ] 7.3 删除 `field_paths.rs:116-134` 的 13 个 Mono 结构偏移常量（保留 1-114 行业务字段名常量）
- [ ] 7.4 重跑 grep，确认零残留：`Select-String -Path packages/hearthmirror/native/src/**/*.rs -Pattern "MONO_CLASS_NAME|MONO_CLASS_FIELDS|MONO_IMAGE_NAME"` → 0 行
- [ ] 7.5 跑 `cargo build` + `cargo test --all-features` 全绿
- [ ] 7.6 提交：`refactor(hearthmirror): replace hardcoded Mono offsets with runtime.offsets access`

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
