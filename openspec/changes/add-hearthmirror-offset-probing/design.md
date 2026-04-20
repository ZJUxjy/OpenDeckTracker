## Context

### 现状（2026-04-20，post-reflection-methods archive）

| 关注点 | 当前实现 | 问题 |
|---|---|---|
| Mono 结构偏移来源 | `field_paths.rs:116-134` 13 个硬编码常量（"Unity 2021.3 Mono, 32-bit"） | 炉石升级 Unity → 全部失效 |
| `mono_get_root_domain` 定位 | `runtime.rs::extract_global_root_domain_addr` 用字节模式 `A1 + ?? + ?? + ?? + ?? + C3` 扫 | 编译器换 codegen 即失败 |
| `domain.loaded_images` 偏移 | `runtime.rs::discover_offsets` 反复 `read_remote_ptr` 扫合理 GList 头 | 启发式，且只覆盖 1 个偏移 |
| `image.class_def_table` 偏移 | `runtime.rs::probe_class_def_table_offset` 用 metadata token 反向校验 | 启发式，依赖 metadata reader 可用 |
| 集合 / object / vtable 偏移 | 无探测，全部硬编码 | 同上 |

### 上游素材（hearthmirror-rs）

| 模块 | 路径 | 行数 | 角色 |
|---|---|---|---|
| Disasm engine | `hearthmirror-rs/hearthmirror/crates/hm-core/src/disasm.rs` | 362 | iced-x86 包装：`find_field_load_displacement` + `find_first_absolute_load` |
| Offset structs | `hearthmirror-rs/hearthmirror/crates/hm-core/src/mono/offsets.rs` | 418 | 11 个 sub-struct + JSON 反序列化 |
| Offset baseline | `hearthmirror-rs/hearthmirror/config/mono-offsets/unity-2021.3.json` | ~100 | Unity 2021.3 Mono 偏移基线 |
| OffsetProber | 同 `offsets.rs` 内部 | — | 6 critical + 4 best-effort probes |

### 用户需求

把上游 4 件套移植到 HDT.js 的 napi-rs crate，让 reflection 方法在炉石 Mono 升级后**自动适应**而不是全部失效。本 change 的成功标准 = 在 [`verify-hearthmirror-on-real-hs`](../verify-hearthmirror-on-real-hs/) Run 1 的同一台机器上重跑 spike，所有 Tier 1 方法的 status 不退化（之前 ok 的仍 ok）。

## Goals / Non-Goals

### Goals

- 引入 `iced-x86` 反汇编基础设施，替代所有手写字节模式扫描。
- 提供 `MonoOffsets` 类型 + JSON baseline + `OffsetProber`，覆盖 6 critical + 4 best-effort 偏移点。
- 在 `MonoRuntime::init()` 中按 "JSON baseline → Prober refine" 顺序填充 `MonoOffsets`，保证即便 Prober 失败也有 fallback。
- 把 `class.rs` / `object.rs` 中所有硬编码偏移引用改成 `runtime.offsets.structs.*` 字段访问。
- **保持** 12 个反射方法的字段链路代码与公共 napi 签名完全不变。

### Non-Goals

- 不重写 `MonoImage::find_class`（仍走 token + class_def_table 路径，留给 [`add-hearthmirror-image-walking`](../add-hearthmirror-image-walking/) 升级为 class_cache walking）。
- 不引入 `MonoFieldDef` 独立模块。
- 不动业务字段名常量。
- 不动 napi 签名 / TS wrapper / IPC / renderer。
- 不引入 32-bit 子进程 / JSON-RPC（ADR 0001 决定不变）。
- 不打包 release `.node` binary（每个 change 完成时单独跑 `napi build --release` 由人工验证）。

## Decisions

### Decision D1: `iced-x86` 特性集 = `std + decoder + fast_fmt`

- **What**: Cargo dependency 写为 `iced-x86 = { version = "1.21", default-features = false, features = ["std", "decoder", "fast_fmt"] }`。
- **Why**:
  - `decoder` 是反汇编核心，必选。
  - `fast_fmt` 提供轻量字符串格式化（仅诊断时用），比 `intel`/`gas`/`nasm`/`masm` 完整 formatter 节省 200+ KB。
  - `default-features = false` 关闭 `instr_info`、`encoder`、`db`、`code_asm` 等不用的子系统。
- **Trade-off**: 如果未来诊断需要更友好的反汇编输出，可单独临时开 formatter。当前阶段不需要。

### Decision D2: JSON 偏移 baseline 用 `include_str!()` 内嵌

- **What**: `unity-2021.3.json` 文件物理存在 `packages/hearthmirror/native/config/mono-offsets/unity-2021.3.json`，但通过 `const DEFAULT_OFFSETS_JSON: &str = include_str!("../config/mono-offsets/unity-2021.3.json");` 编译期内嵌为 `&'static str`，运行时从字符串 parse。
- **Why**:
  - 避免运行时文件查找的路径不确定性（napi-rs 加载到 Electron 时 cwd 不一定是 crate 根）。
  - 多 baseline 时（如未来加 unity-2022.3.json）每个文件一个 `include_str!`，由 `MonoRuntime::init()` 按 mono dll 版本字符串选择加载哪个。
- **Alternatives**:
  - **A: 运行时读文件** — 路径不可控，pass。
  - **B: 把 JSON 转 Rust 常量** — 失去"配置可视化"优势，编辑成本高，pass。

### Decision D3: `bitness` 硬编码为 32

- **What**: `OffsetProber` 内部所有 `iced_x86::Decoder::new(bitness, bytes, options)` 调用传 `bitness = 32`。
- **Why**: HDT.js 宿主是 64-bit 进程，但反汇编的目标是 32-bit 炉石进程内的 mono.dll 机器码。bitness 描述的是被反汇编的字节流的指令编码，不是运行环境。
- **Validation**: 在 `disasm.rs` 单测里加一个 sample 32-bit `mov reg, [absolute]` 字节，断言能正确解码出 absolute address。

### Decision D4: `OffsetProber` 探测分两层

- **What**:
  - **Critical probes (6)**: `MonoDomain.assemblies`, `MonoAssembly.image`, `MonoImage.name`, `MonoImage.class_cache`, `MonoClass.name`, `MonoClass.fields`。任一失败 → `MonoRuntime::init()` 返回 `ScryError::OffsetProbeFailed("<name>")`。
  - **Best-effort probes (4)**: `MonoClass.parent`, `MonoClass.field_count`, `MonoObject.vtable`, `MonoVTable.class`。失败 → 沉默使用 baseline JSON 默认值，记录 `tracing::warn!`。
- **Why**:
  - critical 偏移影响"找得到 class / 找得到 field" 的根本能力，必须实测确认。
  - best-effort 偏移在多数 Mono build 上保持稳定（v1.21 → v2.x 之间几乎不变），允许失败回落。

### Decision D5: 探测顺序与依赖

- **What**: `probe_all()` 严格串行，因为后置 probe 依赖前置 probe 的成功结果：
  1. 反汇编 `mono_image_get_name` → `image.name` 偏移
  2. 反汇编 `mono_image_loaded` → `image.class_cache` 偏移（依赖 `image.name` 已知，作为字段位置参考）
  3. 反汇编 `mono_class_get_name` → `class.name` 偏移
  4. 反汇编 `mono_class_get_field_from_name` → `class.fields` 偏移
  5. 反汇编 `mono_assembly_get_image` → `assembly.image` 偏移
  6. 反汇编 `mono_domain_get_assemblies` → `domain.assemblies` 偏移
  7-10. best-effort probes（顺序无关）
- **Why**: 探测错一步全错，串行最简单且不会浪费时间在已知失败路径。

### Decision D6: PE export 表读取用 `pelite`

- **What**: 写 `pub fn read_exports_map(memory: &ProcessMemory, module: &ModuleInfo) -> Result<HashMap<String, RemotePtr>>`，用 `pelite::pe32::PeView::module(...).exports()?.functions()` 遍历。
- **Why**:
  - HDT.js 已经依赖 `pelite`（metadata reader），无需再引入手写 PE parser。
  - hearthmirror-rs 用手写 parser 是因为它运行在 32-bit 进程内、想避免依赖；HDT.js 没这个限制。
- **Adapter**: hearthmirror-rs 的 `OffsetProber` 直接接受 `HashMap<String, usize>`，HDT.js 改为 `HashMap<String, RemotePtr>` — 在 prober 内部转 `usize` 时用 `.0 as usize`（仅做反汇编 buffer 读取，不参与远程指针计算）。

### Decision D7: `field_paths.rs` 拆分（最小破坏）

- **What**: 删除 `field_paths.rs:116-134` 的 13 个 Mono 结构偏移常量（`MONO_CLASS_NAME`、`MONO_CLASS_FIELDS` 等）。**保留** 1-114 行的业务字段名常量段。删除后 `class.rs` / `object.rs` / `runtime.rs` 中对这些常量的引用改成 `runtime.offsets.structs.<type>.<field>` 访问。
- **Why**: 业务字段名（`m_netCacheValues`）与 Mono 结构偏移（`MONO_CLASS_NAME=0x2C`）是两个完全独立的关注点，硬塞在一个文件违反 SRP。本 change 只动后者；前者留给"字段名飘移 hotfix"或后续 change 处理。
- **风险**: `class.rs` / `object.rs` 中可能有零散位置直接读这些常量，需要 grep 确认全部替换 — tasks.md 6.1-6.2 覆盖。

### Decision D8: 旧字节模式代码删除策略

- **What**: 在同一 commit 中删除 `runtime.rs` 中：
  - `extract_global_root_domain_addr` 的 byte-pattern 逻辑（替换为 `disasm::find_first_absolute_load`）
  - `discover_offsets` 函数及其调用方
  - `probe_class_def_table_offset` 函数（注：`class_def_table` 偏移属于 `image` struct 的扩展，可暂时保留启发式 — **本 change 暂不动 class_def_table 探测**，留给 `add-hearthmirror-image-walking` 一并升级为 class_cache walking）
- **Why**: 保持基础设施 change 的最小关注面。`class_def_table` 探测虽然丑但仍能工作，留到下一 change 与"image walking 重构" 一并处理减少回归点。

### Decision D9: 测试策略

- **Unit tests** (lib + #[cfg(test)] mod tests):
  - `disasm::find_first_absolute_load` 对 `A1 78 56 34 12 C3` 字节序列返回 `Some(0x12345678)`
  - `disasm::find_field_load_displacement` 对 `8B 41 0C C3` 返回 `Some(0x0C)`
  - `MonoOffsets::from_str(unity_2021_3_json)` 成功，关键字段值符合预期
  - `OffsetProber::new(...)` 接受 `HashMap<String, RemotePtr>` 不 panic
- **Integration tests** (`tests/integration_reflection.rs` 已存在 12 个 + `runtime.rs::integration_tests` 3 个):
  - 保持 skip-if-no-hs，**不新增**集成测试
  - 在有炉石机器上手动跑：`cargo test -p hearthmirror-native --all-features` 应保持全绿
- **不 mock OffsetProber** — 反汇编逻辑不易 mock 出真实场景；信任 unit + 真机回归 + spike 0003 的实测验证。

### Decision D10: ADR 0001 约束 #5 兑现声明

- **What**: 本 change 完成时在 `docs/adr/0001-hearthmirror-bridge.md` "约束 #5（动态偏移探测）"段后追加段落，引用本 change 与 spike 0003 作为实施证据。
- **Why**: ADR 是项目记忆。完成 change 不更新 ADR 等于让历史决策悬空。

## Risks / Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| `iced-x86` 增加 `.node` binary 200-400 KB | L | 关闭非必要 features；如需进一步瘦身可用 `wasm-only` 子集（unlikely needed） |
| 反汇编 32-bit 代码在 64-bit 宿主行为差异 | M | `bitness=32` 显式硬编码 + 单测验证经典字节序列 + 真机回归 |
| `pelite::pe32::PeView` 在炉石 mono dll 上 export table 遍历失败 | L | metadata reader 已用 `pelite::pe32::PeView` 验证过同一 dll，路径已知工作 |
| 删旧 byte-pattern 后某些机器上 `mono_get_root_domain` 反汇编返回 None | H | spike 0003 必须先跑过；如本机能 init 成功则代表反汇编路径 OK；附 fallback "如 prober 全失败则回退到 baseline JSON 默认值"逻辑 |
| `field_paths.rs` 删除常量后 grep 漏改 | M | tasks.md 6.x 显式 `rg MONO_CLASS_NAME packages/hearthmirror/native` 验证 0 匹配 |
| `class_def_table` 探测仍是旧启发式，未一起升级 | L | 设计中明确：留给下一 change，不在本 change 范围；reflection 方法当前能用就保留 |

## Migration Plan

无运行时迁移（内部基础设施，napi 公共 API 不变）。代码层迁移：
- `field_paths::MONO_CLASS_NAME` 等 13 个常量的所有引用改为 `runtime.offsets.structs.class.name` 等。
- `runtime.rs` 中字节模式 `Pattern A` / `Pattern B` 删除。
- 新增 dependency 后第一次 `cargo build` 会下载 `iced-x86` 与 `serde_json`，CI 缓存需更新（GitHub Actions 自动）。

## Open Questions

- **是否需要 unity-2022.3 / 2023.x baseline JSON？** — 取决于 spike 0003 揭示的炉石当前 Unity 版本。如仍是 2021.3 → 单 baseline 够用；如已升级 → 在 follow-up change 中加多 baseline 选择逻辑（不在本 change scope）。
- **`OffsetProber` 失败时的诊断信息粒度？** — 当前设计是 "critical 失败 → `OffsetProbeFailed(<name>)`"。是否需要把每个 probe 的反汇编 raw bytes dump 到日志便于调试？暂定写 `tracing::error!` 加 byte preview，detail 留给手动重跑 example 时观察。
