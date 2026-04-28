## Context

`packages/hearthmirror/native/src/metadata/tables.rs` 当前是 4 个手写的 PE / metadata 解析阶段叠在一起的 ~400 行单文件：

1. `locate_cli_metadata`：手写 `IMAGE_DOS_HEADER` → `IMAGE_NT_HEADERS` → `OptionalHeader.DataDirectory[14]` → CLI Header → metadata RVA 转 file offset
2. `parse_metadata_streams`：手写 `BSJB` 签名 → version length-prefixed → flags + #streams → stream headers
3. `parse_typedef_table`：手写 `#~` stream → `Reserved/MajorVersion/MinorVersion/HeapSizes/Reserved/MaskValid/MaskSorted` → row count → 仅 `TypeDef` row 解析
4. 公共出口：`find_class_token(namespace, name) -> Option<u32>`

这违反 [`add-hearthmirror-bridge`](../add-hearthmirror-bridge/design.md) **D2 决策**（"使用 pelite 完成 PE / metadata 解析，不手写"），是 [2026-04-20 代码审查 B3](../../../.worktrees/integrate-hearthmirror-rs/docs/superpowers/plans/2026-04-20-add-hearthmirror-bridge-code-review.md) 的核心阻塞。同时漏掉了 `Field` / `MethodDef` 表，下游 [`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 会无法定位 generic / static-only 类的字段偏移。

## Goals / Non-Goals

**Goals:**

- 用 `pelite` crate 完整替换手写 PE / CLI Header / metadata stream 解析（回归 D2 决策）
- 支持至少 `TypeDef` / `Field` / `MethodDef` 三个 metadata 表
- 按 metadata heap 索引宽度（`StringHeapSize` / `GuidHeapSize` / `BlobHeapSize` 各 1 bit）变长解码（2 字节或 4 字节）
- 提供 `find_class_token` / `find_field_token` / `find_method_token` 公共 API
- 保留"磁盘读 `Assembly-CSharp.dll` → 失败 fallback 到 `MonoImage.raw_data` 内存"双源策略
- 真实 Hearthstone `Assembly-CSharp.dll` 离线 fixture 覆盖单测

**Non-Goals:**

- 不实现完整的 .NET metadata reader（不覆盖 `Property` / `Event` / `TypeRef` / `MemberRef` / `GenericParam` 等表，除非反射方法直接需要）
- 不实现 metadata write / 修改
- 不实现 Portable PDB / NIDM 解析
- 不在本 change 中调整 `Cargo.toml` 之外的依赖（如 napi-rs / windows / iced-x86）
- 不重构 `MonoClass` / `OffsetProber` / `ServiceLocator`

## Decisions

### Decision 1: PE 解析 crate

- **Context**: 当前手写 `IMAGE_DOS/NT_HEADERS` + DataDirectory 索引；维护成本高，易在 cross-arch 头时翻车
- **Options**:
  - **A. `pelite` 0.10.x**：纯 Rust、no_std friendly、被 `add-hearthmirror-bridge/Cargo.toml` 已声明（参见现有 D2 决策）；最近一次 release 2024-09，仓库活跃
  - **B. `goblin` 0.8.x**：更通用（支持 Mach-O / ELF），但对 .NET CLI 头处理更弱，最近活跃
  - **C. `object` 0.36.x**：rustc 自家用，cross-format 强；CLI 头需要再手套一层
  - **D. 保留手写**：违反 D2，且 B3 已点名
- **Choice**: **A. `pelite`**
- **Rationale**: D2 已敲定；纯 PE 场景下 pelite API 比 goblin / object 更直接（`PeFile::from_bytes` → `optional_header()` → `data_directory()[14]`）；与现有 `Cargo.toml` 一致，零新增依赖；no_std 兼容性减少未来 wasm 试探的阻碍

### Decision 2: ECMA-335 metadata stream 解析 crate

- **Context**: pelite 提供 PE 头/data directories，但 `#~` stream 内的表与 heap 解析需要专门库或自实现
- **Options**:
  - **A. `dnlib-rs`**：Rust 端口的 dnlib（C# 经典），支持完整 metadata 表；许可证 MIT；最近 commit 不如 pelite 活跃，需要审查 release 频率
  - **B. `assembly-inspector` / `assembly-tools-rs`**：更轻量但功能不全
  - **C. 在 `pelite` 上手写最小 metadata table reader**：只支持 `TypeDef` / `Field` / `MethodDef` 三个表 + 必要的 heap 索引宽度判断；实现量约 200–300 行，但完全可控且零额外依赖
  - **D. 沿用现有手写代码扩到 Field/MethodDef**：违反 D2
- **Choice**: **C. 在 `pelite` 上手写最小 reader**（命名 `metadata::tables`，子模块 `pe`、`heap`、`tokens`、`tables`）
- **Rationale**:
  1. dnlib-rs / assembly-tools 维护活跃度风险高，引入后若停更需要 fork 维护；本项目体量不值得
  2. 我们只需 3 个表 + 3 个 heap，自写代码 ≤ 300 行且可由 fixture 测全
  3. "用 pelite"在 D2 中本质指 PE 层；ECMA-335 表层 D2 没有强制 crate
  4. 保留把 reader 改成依赖外部 crate 的开放选项（API 边界封装在 `tables.rs` 内）

### Decision 3: heap 索引宽度判断

- **Context**: ECMA-335 II.24.2.6 `#~` header 的 `HeapSizes` 字节决定 String/Guid/Blob heap 索引是 2 字节还是 4 字节；当前手写代码假设全 2 字节，对大型 `Assembly-CSharp.dll`（~50 MB）会读错
- **Options**:
  - **A. 永远当 4 字节**：兼容大文件但浪费空间
  - **B. 严格按 `HeapSizes` 位判断**：标准做法
- **Choice**: **B**，并在每个 row 解析里通过 `HeapIndexWidth { string: u8, guid: u8, blob: u8 }` 注入
- **Rationale**: 标准要求；不做正确就过不了真实 fixture 测试

### Decision 4: 测试 fixture 策略

- **Context**: 单测需要真实 `Assembly-CSharp.dll` 才能验证；该文件来自炉石客户端，体积 ~50 MB 且受 Blizzard EULA 约束
- **Options**:
  - **A. 提交真实 `Assembly-CSharp.dll` 到仓库**：体积大、有许可证风险（不允许重新分发）
  - **B. 用 git-lfs 提交**：缓解体积，但许可证问题不解
  - **C. 提供脚本从用户本地炉石安装目录拷贝 + `.gitignore`**：测试默认 skip，CI 上设环境变量 `HEARTHSTONE_DIR` 启用
  - **D. 用 `csc` / `dotnet` 编译一个最小 stub `Assembly-CSharp.dll`**：可控、零许可证风险，但只能测有限 typedef
  - **E. 二进制 trim 工具：从真实 dll 抽取最小覆盖必要 token 的子集**：实现成本高
- **Choice**: **C + D 混合**：
  - 离线脚本 `scripts/extract-hearthstone-fixtures.ps1`：从 `%PROGRAMFILES(X86)%/Hearthstone/Hearthstone_Data/Managed/Assembly-CSharp.dll` 拷贝到 `packages/hearthmirror/native/tests/fixtures/.local/`（`.gitignore` 排除）
  - 提交一个用 `csc` / Roslyn 编译的最小 `MinimalAssembly.dll`（含 ServiceManager / Player / NetCache 等若干 namespace 与 fields stub），约 32 KB；
  - 单测分两层：
    - `tables_stub_test.rs`（默认运行，使用 `MinimalAssembly.dll`）
    - `tables_real_test.rs`（`#[cfg(feature = "real-fixtures")]` 或检测 `tests/fixtures/.local/Assembly-CSharp.dll` 存在时启用）
- **Rationale**: 满足 CI 离线运行，又能在开发者本地用真实样本验证；不引入 git-lfs；不冒许可证风险

### Decision 5: API 兼容性

- **Context**: `find_class_token` 已被 `add-hearthmirror-bridge` 中的 `service_locator` / `mono::probe` 等使用
- **Options**:
  - **A. 保留 `find_class_token(namespace, name) -> Option<u32>` 签名**
  - **B. 改成 `find_class_token(name: &ClassFullName)`**：更类型安全
- **Choice**: **A** + 新增 `find_field_token(class_token, field_name) -> Option<u32>` 与 `find_method_token(class_token, method_name) -> Option<u32>`；保留旧签名零破坏
- **Rationale**: 当前 change 的 Non-goal 之一就是不改 reflection 调用方；类型化迁移留给后续

## Risks / Trade-offs

- **R1**：`pelite` 0.10 在 64 位主机上读 32 位 PE 时 lifetime 较繁琐 → **缓解**：在 `metadata::pe` 内封装 `PeView<'a>` 的 lifetime，对外只暴露 `&[u8]` 与 `Vec<u8>` 类型
- **R2**：手写 metadata reader 在 `MaskValid` 表存在但 row count = 0 时（合法的 ECMA-335 情形）可能崩 → **缓解**：单测覆盖一个空 `Field` 表的合成 PE
- **R3**：`Assembly-CSharp.dll` 大（~50 MB），全文 mmap 进 ProcessMemory 的 fallback 路径耗时长 → **缓解**：fallback 路径只读 metadata 区段（CLI Header `Metadata.VirtualAddress`+`Size` 范围），通常 < 8 MB；性能基线在 `tables_real_test.rs` 中 assert ≤ 50 ms
- **R4**：未来引入 dnlib-rs 时需要重写 reader → **缓解**：`metadata::tables` 公共出口（3 个 `find_*_token` + `MetadataReader::open`）保持稳定 API；reader 实现细节封装

### 性能 / 安全 / 兼容性

- **性能**：仅打开 metadata 区段（< 8 MB），表行解析 O(rows)；预算：`MetadataReader::open` ≤ 30 ms（disk）/ ≤ 80 ms（memory fallback），单 token 查询 ≤ 1 ms
- **安全**：所有 row offset 计算用 `checked_add` / `get(..)`，越界返回 `Err(MetadataError::Truncated)`，不 panic（沿用 `clippy::unwrap_used` / `clippy::panic` deny）
- **兼容性**：仅 Windows + Hearthstone 当前 32 位 PE；arm64 / 64 位 PE 在 ECMA-335 上格式相同，但本 change 不做主动适配

## 最终目录树

```
packages/hearthmirror/native/src/metadata/
├── mod.rs                # 公共出口：MetadataReader / find_*_token
├── pe.rs                 # pelite 包装：CLI Header → metadata 区段切片
├── streams.rs            # #~ / #Strings / #GUID / #Blob 解析
├── tables.rs             # TypeDef / Field / MethodDef row 结构
├── tokens.rs             # token 编码/解码 + heap 索引宽度判断
└── tests/
    ├── tables_stub_test.rs
    └── tables_real_test.rs

packages/hearthmirror/native/tests/fixtures/
├── MinimalAssembly.dll   # ~32 KB 提交
├── MinimalAssembly.cs    # 源（用 dotnet csc 编译）
└── .local/               # .gitignore 排除（脚本输出位置）

scripts/
└── extract-hearthstone-fixtures.ps1   # 从用户本地炉石拷贝
```

## Migration Plan

- **步骤**：按 tasks.md 顺序实施；中途可工作（旧 `find_class_token` 在新代码上线前不删，由 cargo test gate 切换）
- **回滚**：`git revert <merge_commit>`；新 metadata 模块自包含，无外部 API 变化
- **下游**：[`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 在本 change merge 后才解锁

## Open Questions

- ❓ `MinimalAssembly.dll` 用 `dotnet build`（推荐）还是 `csc.exe` 直接调？后者免 SDK 依赖但需要 Mono / .NET Framework 装机
  - **倾向**：`dotnet build` + 在 README 注明开发依赖；CI 不需要重新生成（fixture 直接 commit）
- ❓ `tables_real_test.rs` 是否要在 CI 中跑？
  - **倾向**：否；CI 只跑 stub 测试。real test 由本地开发者跑炉石环境时验证
