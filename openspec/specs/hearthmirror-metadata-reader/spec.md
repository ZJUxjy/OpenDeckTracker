# hearthmirror-metadata-reader Specification

## Purpose
TBD - created by archiving change add-hearthmirror-metadata-reader. Update Purpose after archive.
## Requirements
### Requirement: 用 pelite 解析 PE 与 CLI Header

The `packages/hearthmirror/native/src/metadata/pe.rs` module SHALL use `pelite::PeFile::from_bytes` (or `pelite::pe32::PeView`) to parse PE headers and locate the CLI Header (Optional Header DataDirectory index 14). It SHALL NOT implement any hand-rolled `IMAGE_DOS_HEADER` / `IMAGE_NT_HEADERS` / DataDirectory walking. The module SHALL expose `pub fn locate_metadata_section(image: &[u8]) -> Result<&[u8], MetadataError>` returning the slice of bytes covering the metadata stream area.

#### Scenario: pelite 取到 CLI Header

- **GIVEN** 真实 `Assembly-CSharp.dll`（来自 fixtures 或本地炉石安装）
- **WHEN** `locate_metadata_section(&dll_bytes)` 被调用
- **THEN** 返回 `Ok(slice)` 且 slice 起始字节为 `BSJB` 签名（`0x42 0x53 0x4A 0x42`），slice 长度等于 CLI Header 的 `Metadata.Size`

#### Scenario: 非 PE 输入返回 MetadataError 而非 panic

- **GIVEN** 一段长度 16 的全 0 buffer
- **WHEN** `locate_metadata_section` 被调用
- **THEN** 返回 `Err(MetadataError::InvalidPe)`，不 panic，不 unwrap

#### Scenario: 无 CLI 头的 PE 返回 NotDotNet

- **GIVEN** 一个原生 Win32 EXE（非 .NET）
- **WHEN** `locate_metadata_section` 被调用
- **THEN** 返回 `Err(MetadataError::NotDotNet)`

### Requirement: ECMA-335 metadata stream reader

The `metadata::streams` module SHALL parse the BSJB metadata header (signature + version length-prefixed string + flags + stream count + stream headers), exposing each named stream (`#~`, `#Strings`, `#GUID`, `#Blob`, `#US`) as `&[u8]` slices via `StreamSet::get(name)`. Stream headers SHALL be validated for offset+size in-bounds; out-of-bounds streams SHALL return `Err(MetadataError::Truncated)`.

#### Scenario: 找到所有标准 streams

- **GIVEN** `MinimalAssembly.dll` 的 metadata section
- **WHEN** `StreamSet::parse(metadata)` 被调用
- **THEN** 返回的集合包含至少 `#~` / `#Strings` / `#GUID` / `#Blob` 四个 stream，每个 slice 起止地址都落在 metadata section 内

#### Scenario: 流头描述越界时返回 Truncated

- **GIVEN** 一个手工构造的 metadata，将某 stream 的 `Size` 改为超过 metadata section 总长
- **WHEN** `StreamSet::parse` 被调用
- **THEN** 返回 `Err(MetadataError::Truncated)`

### Requirement: heap 索引宽度按 HeapSizes 字节判断

The `metadata::tokens::HeapIndexWidth` SHALL be derived from the `HeapSizes` byte at the standard offset in the `#~` header (II.24.2.6): bit 0 → String index width (0=2 bytes / 1=4 bytes), bit 1 → GUID index width, bit 2 → Blob index width. All Field/MethodDef/TypeDef row decoders SHALL receive a `HeapIndexWidth` and use the per-heap width when decoding name/signature/guid columns.

#### Scenario: 大文件触发 4 字节 Strings 索引

- **GIVEN** 真实 `Assembly-CSharp.dll`（其 `#Strings` heap 通常 > 64 KB）
- **WHEN** 解析 `#~` header
- **THEN** `HeapIndexWidth.string == 4`，且按 4 字节解码后任意 TypeDef row 的 `Name` 字段都能用 `Strings::resolve(idx)` 拿到非空字符串

#### Scenario: 小文件保持 2 字节索引

- **GIVEN** `MinimalAssembly.dll`（< 64 KB heaps）
- **WHEN** 解析 `#~` header
- **THEN** `HeapIndexWidth.string == 2 && .guid == 2 && .blob == 2`

### Requirement: 支持 TypeDef / Field / MethodDef 三个表

The `metadata::tables` module SHALL expose row iterators for at minimum: `TypeDef` (Flags / Name / Namespace / Extends / FieldList / MethodList), `Field` (Flags / Name / Signature), `MethodDef` (RVA / ImplFlags / Flags / Name / Signature / ParamList). Each row decoder SHALL respect `HeapIndexWidth` and table row counts from `MaskValid`. Iteration SHALL be `O(rows)` and not allocate per row beyond the row struct itself.

#### Scenario: 列出 ServiceManager 的字段

- **GIVEN** `MinimalAssembly.dll` 中有 `Blizzard.T5.Services.ServiceManager` 类，包含 `s_runtimeServices` 与 `s_dynamicServices` 两个 static field
- **WHEN** 调用 `find_class_token("Blizzard.T5.Services", "ServiceManager")` 拿到 token，再 iterate `Field` 表中属于该 class 的行
- **THEN** 返回的字段名列表包含 `s_runtimeServices` 与 `s_dynamicServices`

#### Scenario: 空 Field 表合法处理

- **GIVEN** 一个合成的 PE，其 `MaskValid` 包含 `Field` 表位但 row count = 0
- **WHEN** iterate `Field` 表
- **THEN** 返回 0 个 row，不 panic，不 error

### Requirement: 公共 token 查询 API

The `metadata` module SHALL expose three public functions on `MetadataReader`:

- `find_class_token(namespace: &str, name: &str) -> Option<u32>` — TypeDef token (高 8 bit = 0x02)
- `find_field_token(class_token: u32, field_name: &str) -> Option<u32>` — Field token (高 8 bit = 0x04)
- `find_method_token(class_token: u32, method_name: &str) -> Option<u32>` — MethodDef token (高 8 bit = 0x06)

Each SHALL return `None` (NOT `Err`) on miss. Tokens SHALL follow ECMA-335 II.22 encoding (table id in MSB, RID in low 24 bits).

#### Scenario: find_class_token 命中

- **WHEN** `reader.find_class_token("Blizzard.T5.Services", "ServiceManager")`
- **THEN** 返回 `Some(token)`，`(token >> 24) == 0x02` 且 `(token & 0xFF_FFFF) > 0`

#### Scenario: find_field_token 命中

- **GIVEN** 上一步拿到 `class_token`
- **WHEN** `reader.find_field_token(class_token, "s_runtimeServices")`
- **THEN** 返回 `Some(token)`，`(token >> 24) == 0x04`

#### Scenario: 未找到返回 None

- **WHEN** `reader.find_class_token("NonExistent", "Class")`
- **THEN** 返回 `None`，不 panic 不 throw

### Requirement: 双源 fallback（disk → memory）

The `MetadataReader::open(memory: &ProcessMemory, mono_image: RemotePtr) -> Result<Self, MetadataError>` constructor SHALL first attempt to read `Assembly-CSharp.dll` from disk by deriving the path from the running process's mono module path (e.g. `…/Hearthstone_Data/Managed/Assembly-CSharp.dll`). On disk read failure (file not found / IO error), it SHALL fall back to reading the `MonoImage.raw_data` field via `ProcessMemory`. The choice SHALL be logged via `eprintln!` only when the `HM_LOG` environment variable is set.

#### Scenario: 优先磁盘源

- **GIVEN** Hearthstone 已安装且有读权限
- **WHEN** `MetadataReader::open(memory, mono_image)` 被调用
- **THEN** 内部走 disk 路径成功，返回的 reader 与磁盘版本一致

#### Scenario: 磁盘失败时 fallback 到内存

- **GIVEN** mock 一个 mono 模块路径推导后磁盘不存在
- **WHEN** `MetadataReader::open` 被调用且 `MonoImage.raw_data` 字段非 NULL
- **THEN** 内部走 memory 路径成功；如设置 `HM_LOG=1` 则 stderr 含 `metadata fallback: memory`

### Requirement: 删除 add-hearthmirror-bridge 中的手写 PE 解析

After this change is merged, `packages/hearthmirror/native/src/metadata/tables.rs` SHALL NOT contain any private function named `locate_cli_metadata` / `parse_metadata_streams` / `parse_typedef_table`, nor any direct `IMAGE_DOS_HEADER` / `IMAGE_NT_HEADERS` byte parsing. The replacement SHALL be in `metadata::pe`/`metadata::streams`/`metadata::tables` per the design.

#### Scenario: ripgrep 验证手写 PE 解析已删除

- **WHEN** 在 `packages/hearthmirror/native/src` 下 `rg "IMAGE_DOS_HEADER|locate_cli_metadata|parse_typedef_table"`
- **THEN** 0 命中

### Requirement: clippy 静态门禁通过

The `packages/hearthmirror/native/src/metadata/` 模块下所有代码 SHALL pass `cargo clippy --release -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic`. Any unsafe block SHALL have a `// SAFETY:` comment.

#### Scenario: clippy 0 错误

- **WHEN** 在 `packages/hearthmirror/native/` 跑 clippy 命令
- **THEN** 退出码 0

