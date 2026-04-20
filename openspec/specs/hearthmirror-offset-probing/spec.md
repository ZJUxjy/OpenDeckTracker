# hearthmirror-offset-probing Specification

## Purpose

Provide a **dynamic Mono offset probing layer** for the `hearthmirror-native`
crate so the bridge survives Hearthstone / Unity / Mono BDWGC version drift
without per-build hand-tuning.

The capability is composed of three pieces:

1. A minimal `iced-x86`-based disassembly engine (`src/disasm.rs`) that
   extracts the field-load displacement out of short Mono accessor functions
   (`mono_class_get_name`, `mono_image_get_name`, …).
2. A typed `MonoOffsets` struct (`src/mono/offsets.rs`) backed by a JSON
   baseline (`config/mono-offsets/unity-2021.3.json`) embedded at build time,
   so no runtime file IO is required and the JSON is the single source of
   truth for "what offsets the crate believes Mono uses".
3. An `OffsetProber` (`src/mono/probe.rs`) that walks the mono DLL's PE
   export table, disassembles 10 well-known accessor functions, and, for each
   probed field, either accepts the disassembled displacement (if it falls
   inside a per-field "sane range") or falls back to the baseline value.
   Critical probes (`image.name`, `image.class_cache`, `class.name`,
   `class.fields`, `assembly.image`, `domain.assemblies`) abort `init()` only
   if the corresponding mono export is missing; best-effort probes
   (`class.parent`, `class.field_count`, `object.vtable`, `vtable.class`)
   never abort.

The "sane range" gate (Decision D13 in the originating change) was added
after empirical evidence on Hearthstone's BDWGC Mono fork showed that several
accessors are compiled as **profiled thunks** whose first instructions touch
TLS / profile-counter slots rather than the target field, causing naive
disassembly to return garbage displacements (e.g. `0xE10`). Range-gating
keeps the crate robust against this without needing per-version JSON
overrides for every minor Mono build.

This capability replaces both the byte-pattern scans previously living in
`runtime.rs` and the 13 hand-coded `MONO_CLASS_*` / `MONO_IMAGE_*` constants
previously in `field_paths.rs`. It is consumed by every other hearthmirror
module that reads Mono structures (`metadata`, `mono::class`, `mono::object`,
`reflection::*`).

## Requirements
### Requirement: 反汇编引擎 disasm 模块

The `packages/hearthmirror/native/src/disasm.rs` SHALL exist and SHALL export at least:

- `pub const DEFAULT_PROBE_WINDOW: usize = 256;`
- `pub fn find_field_load_displacement(bytes: &[u8], bitness: u32) -> Option<u32>`
- `pub fn find_first_absolute_load(bytes: &[u8], bitness: u32) -> Option<u32>`

实现 SHALL 使用 `iced_x86::Decoder` (version 1.x) 解码字节流。`bitness` 参数 SHALL 接受 `32` 与 `64`，但所有调用方在本仓库内 SHALL 传 `32`（被反汇编对象是 32-bit Hearthstone 进程的 mono.dll 代码）。

#### Scenario: find_first_absolute_load 解析 mov eax, [imm32]

- **GIVEN** byte sequence `[0xA1, 0x78, 0x56, 0x34, 0x12, 0xC3]`（`mov eax, [0x12345678]; ret`）
- **WHEN** `find_first_absolute_load(&bytes, 32)` 被调用
- **THEN** 返回 `Some(0x12345678)`

#### Scenario: find_field_load_displacement 解析 mov eax, [ecx+0Ch]

- **GIVEN** byte sequence `[0x8B, 0x41, 0x0C, 0xC3]`（`mov eax, [ecx+0xC]; ret`）
- **WHEN** `find_field_load_displacement(&bytes, 32)` 被调用
- **THEN** 返回 `Some(0x0C)`

#### Scenario: 无匹配指令返回 None

- **GIVEN** byte sequence 仅含 `[0x90, 0x90, 0xC3]`（`nop; nop; ret`）
- **WHEN** 任一 disasm 函数被调用
- **THEN** 返回 `None`，不 panic

#### Scenario: 截断字节流不 panic

- **GIVEN** byte sequence `[0xA1, 0x78]`（不完整 mov 指令）
- **WHEN** `find_first_absolute_load(&bytes, 32)` 被调用
- **THEN** 返回 `None`，不 panic

### Requirement: MonoOffsets 类型与 JSON 配置

The `packages/hearthmirror/native/src/mono/offsets.rs` SHALL define a `MonoOffsets` struct containing a `structs: MonoStructs` field. `MonoStructs` SHALL contain at least these sub-structs (matching upstream `hearthmirror-rs/hm-core/src/mono/offsets.rs`):

- `domain: DomainOffsets` — `assemblies` field
- `assembly: AssemblyOffsets` — `image` field
- `image: ImageOffsets` — `name`, `class_cache` fields
- `hashtable: HashTableOffsets` — `size`, `table` fields
- `class: ClassOffsets` — `name`, `namespace`, `fields`, `field_count`, `parent` fields
- `field: FieldOffsets` — `name`, `type`, `offset` fields
- `vtable: VTableOffsets` — `class` field
- `object: ObjectOffsets` — `vtable` field
- `string: StringOffsets` — `length`, `chars` fields
- `array: ArrayOffsets` — `bounds`, `max_length`, `vector` fields

`MonoOffsets` SHALL provide:

- `pub fn from_str(json: &str) -> Result<Self, MonoOffsetsError>`
- `pub fn default() -> Self` — returning the bundled `unity-2021.3.json` baseline

Field values SHALL be deserialized via a `hex_or_int` helper accepting both string `"0xC"` and integer `12` JSON forms.

#### Scenario: 加载 unity-2021.3 baseline 成功

- **WHEN** `MonoOffsets::default()` 被调用
- **THEN** 返回 `Ok` 实例，`structs.class.name` 等于 baseline JSON 中 `class.name` 字段的值，所有 sub-struct 字段非零

#### Scenario: hex_or_int 接受 hex 字符串

- **GIVEN** JSON 片段 `{"name": "0x2C"}`
- **WHEN** 反序列化为 `ClassOffsets`
- **THEN** `name` 字段值 = `0x2C`（44 十进制）

#### Scenario: hex_or_int 接受整数

- **GIVEN** JSON 片段 `{"name": 44}`
- **WHEN** 反序列化为 `ClassOffsets`
- **THEN** `name` 字段值 = `44`

#### Scenario: 缺失字段 ignored 而非 error

- **GIVEN** JSON 含未识别的 key 如 `"$comment": "..."` 或 `"future_field": 99`
- **WHEN** 反序列化
- **THEN** 反序列化成功，未识别字段被忽略

### Requirement: unity-2021.3 baseline JSON 文件

The file `packages/hearthmirror/native/config/mono-offsets/unity-2021.3.json` SHALL exist and SHALL be a valid JSON document conforming to the `MonoOffsets` schema. The crate SHALL embed it via `const DEFAULT_OFFSETS_JSON: &str = include_str!("...")` so that no runtime file IO is required.

#### Scenario: include_str 内嵌成功

- **WHEN** crate 编译
- **THEN** `DEFAULT_OFFSETS_JSON` 是非空 `&'static str`，包含至少 50 个字符

#### Scenario: 文件 vs 内嵌一致

- **GIVEN** 物理 JSON 文件
- **WHEN** 通过 `include_str!` 加载与通过 `std::fs::read_to_string` 加载比较
- **THEN** 两者内容字节级相等（验证 `MonoOffsets::from_str(DEFAULT_OFFSETS_JSON)` 与 `MonoOffsets::from_str(&fs::read_to_string(path).unwrap())` 结果相等）

### Requirement: OffsetProber 类型与探测协议

The `packages/hearthmirror/native/src/mono/probe.rs` SHALL define a `pub struct OffsetProber<'m>` (or similar) containing references/handles to `&ProcessMemory`, the mono `ModuleInfo`, the `HashMap<String, RemotePtr>` of mono exports, and a `bitness: u32` (= 32). It SHALL provide:

- `pub fn new(...) -> Self`
- `pub fn probe_all(&self, baseline: MonoOffsets) -> Result<MonoOffsets, ScryError>`

`probe_all` SHALL execute these probes in this order:

**Critical (failure → return Err):**
1. `image.name` via reading bytes at `mono_image_get_name`
2. `image.class_cache` via reading bytes at `mono_image_loaded`
3. `class.name` via reading bytes at `mono_class_get_name`
4. `class.fields` via reading bytes at `mono_class_get_field_from_name`
5. `assembly.image` via reading bytes at `mono_assembly_get_image`
6. `domain.assemblies` via reading bytes at `mono_domain_get_assemblies`

**Best-effort (failure → log warning, keep baseline value):**
7. `class.parent` via `mono_class_get_parent`
8. `class.field_count` via `mono_class_num_fields`
9. `object.vtable` via `mono_object_get_class`（tracks vtable load before `mov eax, [vtable+class_offset]`）
10. `vtable.class` via 同上 second instruction

#### Scenario: 6 个 critical probe 任一失败时 init 失败

- **GIVEN** mono 导出表中缺少 `mono_class_get_name` 函数
- **WHEN** `probe_all(baseline)` 被调用
- **THEN** 返回 `Err(ScryError::OffsetProbeFailed("class.name"))`

#### Scenario: best-effort probe 失败保留 baseline 值

- **GIVEN** mono 导出表存在 `mono_class_num_fields` 但反汇编返回 None
- **WHEN** `probe_all(baseline)` 被调用
- **THEN** 返回 `Ok(offsets)`，其中 `offsets.structs.class.field_count == baseline.structs.class.field_count`，并通过 `tracing` 记录一条 warning

#### Scenario: 全部 probe 成功覆盖 baseline

- **GIVEN** mono 导出表健全且反汇编返回有效 displacement
- **WHEN** `probe_all(baseline)` 被调用
- **THEN** 返回 `Ok(offsets)`，所有 10 个 probe 对应字段被实测值覆盖（可能与 baseline 不同）

#### Scenario: bitness 必须为 32

- **WHEN** `OffsetProber::new(memory, module, exports, bitness=64)` 被调用
- **THEN** 在 `probe_all` 调用时返回 `Err(ScryError::InvalidProbeBitness(64))`，或在 `new` 内 debug_assert（实现自由）

### Requirement: PE export 表读取助手

The `packages/hearthmirror/native/src/mono/probe.rs`（或 `mod.rs`）SHALL provide `pub fn read_exports_map(memory: &ProcessMemory, module: &ModuleInfo) -> Result<HashMap<String, RemotePtr>, ScryError>` 使用 `pelite::pe32::PeView` 遍历 export table，键为 export 名（如 `"mono_get_root_domain"`），值为对应 RVA + module base 后的 `RemotePtr`。

#### Scenario: 找到典型 mono export

- **GIVEN** Hearthstone 运行且 `mono-2.0-bdwgc.dll` 已加载
- **WHEN** `read_exports_map` 被调用
- **THEN** 返回的 HashMap 包含至少这些 key：`mono_get_root_domain`, `mono_image_get_name`, `mono_class_get_name`

#### Scenario: 模块缺失返回 Err

- **GIVEN** 传入一个 `ModuleInfo` 指向不存在的 base address
- **WHEN** `read_exports_map` 被调用
- **THEN** 返回 `Err(ScryError::PeParseError(...))`，不 panic

### Requirement: MonoRuntime::init 使用新 offset probing

The `MonoRuntime::init()` flow SHALL be:

1. `find_pid(HEARTHSTONE_EXE)?`
2. `OwnedProcessHandle::open(pid)?`
3. `find_mono_module(memory.handle())?`
4. `read_exports_map(&memory, &mono_module)?`（新）
5. `MonoOffsets::default()` 作为 baseline（新）
6. `OffsetProber::new(...).probe_all(baseline)?`（新）
7. 用 `disasm::find_first_absolute_load(...)` 反汇编 `mono_get_root_domain` 函数体，提取 root_domain 地址（替代旧 byte-pattern）
8. `memory.read_remote_ptr(root_domain_addr)?`
9. 构造 `MonoRuntime { memory, mono_module, offsets, exports, root_domain, ... }`

`MonoRuntime` struct SHALL include 至少 `pub offsets: MonoOffsets` 与 `pub exports: HashMap<String, RemotePtr>` 公共字段，以便 `class.rs` / `object.rs` 等子模块直接访问。

#### Scenario: init 在缺少 mono export 时失败

- **GIVEN** mono dll 加载但 export 表中缺少 `mono_get_root_domain`
- **WHEN** `MonoRuntime::init()` 被调用
- **THEN** 返回 `Err(ScryError::ExportNotFound("mono_get_root_domain"))`

#### Scenario: init 成功后 offsets 字段已填充

- **GIVEN** Hearthstone 正常运行
- **WHEN** `MonoRuntime::init()` 成功返回
- **THEN** 返回的 `MonoRuntime.offsets.structs.class.name`、`structs.image.name`、`structs.domain.assemblies` 均非零

### Requirement: 删除旧字节模式与硬编码偏移

After this change, the following SHALL be removed:

- `runtime.rs` 中的 `Pattern A` / `Pattern B` 字节模式扫描代码
- `runtime.rs` 中的 `discover_offsets()` 函数及其所有调用方
- `field_paths.rs` 中的 13 个 Mono 结构偏移常量（`MONO_CLASS_NAME`、`MONO_CLASS_NAMESPACE`、`MONO_CLASS_FIELD_COUNT`、`MONO_CLASS_FIELDS`、`MONO_CLASS_PARENT`、`MONO_CLASS_STATIC_FIELD_DATA`、`MONO_CLASS_FIELD_SIZE`、`MONO_CLASS_FIELD_NAME`、`MONO_CLASS_FIELD_TYPE`、`MONO_CLASS_FIELD_PARENT`、`MONO_CLASS_FIELD_OFFSET`、`MONO_CLASS_FIELD_TOKEN`、`MONO_IMAGE_NAME`）
- 对上述常量的所有引用，改为通过 `runtime.offsets.structs.<type>.<field>` 访问

`field_paths.rs` 中业务字段名常量段（`FLD_NET_CACHE_VALUES`、`FLD_BATTLE_TAG` 等约 60 个常量）SHALL 保留，**不动**。

#### Scenario: grep 验证零残留

- **WHEN** 执行 `rg "MONO_CLASS_NAME|MONO_CLASS_FIELDS|MONO_IMAGE_NAME" packages/hearthmirror/native/src` 或等价 PowerShell `Select-String`
- **THEN** 返回 0 条匹配（或仅匹配本 spec 引用文档）

#### Scenario: class.rs 通过 offsets 字段访问

- **WHEN** 检查 `packages/hearthmirror/native/src/mono/class.rs`
- **THEN** 所有 Mono class 内部偏移读取通过 `runtime.offsets.structs.class.*` 形式，无硬编码 `0x2C` 等魔数

### Requirement: 现有反射方法兼容性

After this change, all 12 existing reflection methods (`getBattleTag` ... `isGameOver`) SHALL retain their current public napi signatures and behavioral contracts. `cargo test -p hearthmirror-native --all-features` SHALL pass with the same test count and outcomes as before this change (48 tests, 36 unit + 12 integration with skip-if-no-hs).

#### Scenario: napi 签名不变

- **WHEN** 比较本 change 前后 `packages/hearthmirror/native/src/lib.rs` 中 `#[napi]` 标注的函数签名
- **THEN** 12 个反射函数的参数与返回类型完全一致

#### Scenario: 测试基线保持

- **WHEN** 执行 `cargo test -p hearthmirror-native --all-features`
- **THEN** 输出至少 `48 passed; 0 failed`（允许新增测试，不允许丢失或失败）

### Requirement: ADR 0001 约束 #5 兑现记录

After this change is archived, [`docs/adr/0001-hearthmirror-bridge.md`](../../../docs/adr/0001-hearthmirror-bridge.md) SHALL contain a paragraph under "约束 #5（动态偏移探测）" referencing this change as the implementation evidence.

#### Scenario: ADR 链接已更新

- **WHEN** 阅读 `docs/adr/0001-hearthmirror-bridge.md`
- **THEN** "约束 #5" 段后存在文本块引用 `add-hearthmirror-offset-probing` change 与 `disasm.rs` / `mono/offsets.rs` / `mono/probe.rs` 三个模块，并链接到 spike 0003 的实测验证记录

