## 1. 准备测试 fixture

- [x] 1.1 在 `packages/hearthmirror/native/tests/fixtures/` 下新建 `MinimalAssembly.cs`，包含 `Blizzard.T5.Services.ServiceManager` 与 `Blizzard.T5.Services.IService` 两个最小 stub 类（含 2 个 static field：`s_runtimeServices` / `s_dynamicServices`）
- [x] 1.2 用 `dotnet build -c Release` 或 `csc /target:library` 编译为 `MinimalAssembly.dll`（≤ 64 KB），提交到 `tests/fixtures/MinimalAssembly.dll`
- [x] 1.3 新建 `scripts/extract-hearthstone-fixtures.ps1`：从 `${env:PROGRAMFILES(X86)}\Hearthstone\Hearthstone_Data\Managed\Assembly-CSharp.dll` 拷贝到 `packages/hearthmirror/native/tests/fixtures/.local/Assembly-CSharp.dll`
- [x] 1.4 在 `packages/hearthmirror/native/tests/fixtures/.gitignore` 中加入 `.local/`
- [x] 1.5 在 `packages/hearthmirror/native/tests/fixtures/README.md` 写明 fixture 来源与生成方式
- [x] 1.6 提交：`test(hearthmirror): add minimal assembly fixture for metadata reader`

## 2. 引入 pelite + 写失败测试（TDD red）

- [x] 2.1 在 `packages/hearthmirror/native/Cargo.toml` 确认 `pelite = "0.10"` 已声明（如缺则添加）
- [x] 2.2 创建 `packages/hearthmirror/native/src/metadata/pe.rs` 空文件，导出 `pub fn locate_metadata_section(image: &[u8]) -> Result<&[u8], MetadataError>` 占位（`unimplemented!()`）
- [x] 2.3 在 `packages/hearthmirror/native/src/metadata/mod.rs` 中改 `pub mod pe;`，更新 `MetadataError` enum 加入 `InvalidPe` / `NotDotNet` / `Truncated` 变体
- [x] 2.4 在 `metadata/pe.rs` 写两个测试：`locate_metadata_section_finds_bsjb` 用 `MinimalAssembly.dll`、`locate_metadata_section_rejects_garbage` 用 `[0u8; 16]`
- [x] 2.5 跑 `cargo test -p hearthmirror-native metadata::pe`，确认两个测试 fail（`unimplemented!()` panic）
- [x] 2.6 提交：`test(hearthmirror): add failing PE locator tests for pelite migration`

## 3. 实现 PE 解析（TDD green）

- [x] 3.1 在 `metadata/pe.rs` 用 `pelite::pe32::PeView::from_bytes` 取 optional header data directory[14]，按 RVA→file offset 切片，返回 metadata section
- [x] 3.2 跑 `cargo test -p hearthmirror-native metadata::pe`，确认 2 个 test 通过
- [x] 3.3 跑 `cargo clippy -p hearthmirror-native -- -D warnings -D clippy::unwrap_used`，确认 0 错误
- [x] 3.4 提交：`feat(hearthmirror): implement metadata::pe via pelite`

## 4. 实现 BSJB stream 解析

- [x] 4.1 创建 `metadata/streams.rs`，定义 `pub struct StreamSet<'a> { streams: HashMap<&'static str, &'a [u8]> }` 与 `StreamSet::parse(metadata: &[u8])`
- [x] 4.2 写 3 个失败测试：`parse_finds_standard_streams` / `parse_rejects_truncated_stream` / `get_returns_slice`
- [x] 4.3 实现 BSJB sig + version length-prefixed + flags + #streams + 循环读 stream header（offset/size/name 4 字节 padding）
- [x] 4.4 跑 `cargo test -p hearthmirror-native metadata::streams`，3 个 test 通过
- [x] 4.5 提交：`feat(hearthmirror): implement metadata::streams BSJB reader`

## 5. 实现 heap + token 解码

- [x] 5.1 创建 `metadata/tokens.rs`，定义 `pub struct HeapIndexWidth { string: u8, guid: u8, blob: u8 }` 与 `pub struct Token(u32)` + `Token::table_id()` / `Token::rid()`
- [x] 5.2 在 `metadata::streams` 上加 `pub fn strings(&self) -> Strings<'a>` / `pub fn guids(&self) -> Guids<'a>` / `pub fn blobs(&self) -> Blobs<'a>` 三个 heap 包装
- [x] 5.3 写测试：`heap_index_width_from_byte_decodes_bits` 覆盖 8 种位组合
- [x] 5.4 写测试：`strings_resolve_returns_null_terminated_utf8` 用 `MinimalAssembly.dll`，分别按 2 字节与 4 字节索引读
- [x] 5.5 实现并跑通；提交：`feat(hearthmirror): add metadata heap and token decoders`

## 6. 实现 TypeDef / Field / MethodDef 表

- [x] 6.1 在 `metadata/tables.rs` 中删掉旧的 `parse_typedef_table` / `locate_cli_metadata` / `parse_metadata_streams` 私有函数（旧公共入口 `find_class_token` 暂保留转调到 stub）
- [x] 6.2 新增 `pub struct TablesReader<'a>`，构造参数 `(metadata: &'a [u8], heap: HeapIndexWidth)`；解析 `#~` header 的 `MaskValid` / `MaskSorted` / row counts
- [x] 6.3 实现 `TablesReader::iter_typedefs(&self) -> impl Iterator<Item = TypeDefRow>`
- [x] 6.4 实现 `TablesReader::iter_fields(&self)` 与 `TablesReader::iter_methoddefs(&self)`
- [x] 6.5 测试：`tables_iter_typedefs_finds_servicemanager` / `tables_iter_fields_finds_s_runtimeservices` / `tables_handles_empty_field_table`
- [x] 6.6 跑 `cargo test -p hearthmirror-native metadata`，全绿
- [x] 6.7 提交：`feat(hearthmirror): add TypeDef/Field/MethodDef row iterators`

## 7. 公共 API：find_*_token

- [x] 7.1 在 `metadata/mod.rs` 定义 `pub struct MetadataReader<'a>` 持有 `pe slice` + `StreamSet` + `TablesReader`
- [x] 7.2 实现 `MetadataReader::open(memory: &ProcessMemory, mono_image: RemotePtr) -> Result<Self, MetadataError>`：先 disk 后 memory fallback，HM_LOG 控制日志
- [x] 7.3 实现 `find_class_token(ns, name)` / `find_field_token(class_token, name)` / `find_method_token(class_token, name)`
- [x] 7.4 测试：用 `MinimalAssembly.dll` 走完 3 个 API；用一个不存在的路径触发 fallback（mock）
- [x] 7.5 跑 `cargo test -p hearthmirror-native metadata::reader_test`，全绿
- [x] 7.6 删除 `metadata/tables.rs` 中保留的旧 `find_class_token` 转调 stub，确保下游 `service_locator.rs` / `mono::probe.rs` 编译通过
- [x] 7.7 跑 `cargo build -p hearthmirror-native --release`，确认无构建错误
- [x] 7.8 提交：`feat(hearthmirror): expose find_class/field/method_token via MetadataReader`

## 8. 验证 + 验收

- [x] 8.1 跑 `cargo test -p hearthmirror-native --all-features`，全绿
- [x] 8.2 跑 `cargo clippy -p hearthmirror-native -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic`，0 错误
- [x] 8.3 在 `packages/hearthmirror/native/src/metadata/` 下 `rg "IMAGE_DOS_HEADER|locate_cli_metadata|parse_typedef_table"`，确认 0 命中
- [ ] 8.4 （可选 / 本地）有炉石环境时跑 `scripts/extract-hearthstone-fixtures.ps1` 拿到真实 dll，跑 `cargo test -p hearthmirror-native --features real-fixtures`，全绿，性能 < 80 ms
- [ ] 8.5 跑 `pnpm test`（应不受影响），全绿
- [ ] 8.6 在仓库根跑 `openspec validate add-hearthmirror-metadata-reader --strict`，0 错误
- [ ] 8.7 提交：`chore(hearthmirror): finalize metadata reader migration`

## 9. 文档收尾

- [ ] 9.1 在 `openspec/changes/.NEXT.md` 把 `add-hearthmirror-metadata-reader` 状态从未提案改为 `✓`
- [ ] 9.2 在 `docs/adr/0001-hearthmirror-bridge.md` 末尾追加一条 "2026-04-XX: metadata reader 已迁移到 pelite，回归 D2"
- [ ] 9.3 提交：`docs(hearthmirror): record metadata reader migration completion`
