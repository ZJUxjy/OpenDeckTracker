# hearthmirror-mono-init-pe-read Specification

## Purpose
TBD - created by archiving change fix-hearthmirror-pe-read-cap. Update Purpose after archive.
## Requirements
### Requirement: find_mono_get_root_domain_va 必须读完整 mono dll 模块字节

The `packages/hearthmirror/native/src/mono/runtime.rs::find_mono_get_root_domain_va` function SHALL read the full mono dll module bytes (size as reported by `ModuleInfo.size`) into the local PE buffer before invoking `pelite::pe32::PeView::module(buffer.as_ptr())`. The function SHALL NOT cap the read size to any constant smaller than the actual module size. Specifically, the previous expression `mono.size.min(0x100_000)` SHALL NOT exist anywhere in `runtime.rs`.

#### Scenario: 1MB cap 已删除

- **WHEN** 执行 `Select-String -Path packages/hearthmirror/native/src/mono/runtime.rs -Pattern "0x100_000|min\(0x"` 或 `Select-String -Pattern "min\(0x10\d_000\)"` 等价 grep
- **THEN** 返回 0 行匹配在 `find_mono_get_root_domain_va` 函数体内（注释引用 spike 0003 中提到 `0x100_000` 历史值是允许的，但**不能在代码语句中出现**）

#### Scenario: 读取大小 = 模块完整大小

- **WHEN** `find_mono_get_root_domain_va` 被调用
- **THEN** 它调用 `memory.read_bytes(RemotePtr::new(base_addr), pe_size)`，其中 `pe_size == mono.size as usize`，没有任何缩减或上限

### Requirement: MonoRuntime::init 在真实炉石进程上不崩溃

When invoked with a running Hearthstone process loaded with `mono-2.0-bdwgc.dll` (any version where the dll is a valid PE32 image with `mono_get_root_domain` exported), `MonoRuntime::init()` SHALL return either `Ok(MonoRuntime { ... })` or a typed `Err(ScryError::*)` value. It SHALL NOT terminate the process with `STATUS_ACCESS_VIOLATION` (0xC0000005) or any other Windows structured exception originating from buffer-bounds violations in `find_mono_get_root_domain_va`.

#### Scenario: 真机 init 成功（fix 后）

- **GIVEN** Hearthstone.exe 运行，已登录主菜单
- **WHEN** 执行 `cargo run --example diag_init`（来自 spike 0003）
- **THEN** Step 4-7 全部输出 `OK`，没有 `STATUS_ACCESS_VIOLATION` / `0xC0000005` 字样

#### Scenario: 集成测试覆盖

- **GIVEN** Hearthstone.exe 运行
- **WHEN** 执行 `cargo test -p hearthmirror-native --test integration_runtime_init`
- **THEN** 测试 `init_succeeds_when_hearthstone_running` 通过（assert init 返回 Ok 且 `global_root_domain_addr` 非零）

#### Scenario: 无炉石环境正常 skip

- **GIVEN** Hearthstone 未运行
- **WHEN** 执行同一测试
- **THEN** 测试 skip（`skip_if_no_hs()` 返回 true → 提前 return），不报错

### Requirement: 新增回归集成测试

The `packages/hearthmirror/native/tests/integration_runtime_init.rs` SHALL exist and SHALL contain:

- `fn skip_if_no_hs() -> bool` — 复用现有 helper 行为：枚举进程，找不到 `Hearthstone.exe` 时返回 true 并 println 一行 SKIP
- `#[test] fn init_succeeds_when_hearthstone_running()` — 调 `skip_if_no_hs()` guard + `MonoRuntime::init().expect("init must succeed")` + 断言 `global_root_domain_addr.0 != 0`

#### Scenario: 测试文件存在且编译通过

- **WHEN** 执行 `cargo build --tests -p hearthmirror-native`
- **THEN** 编译通过，包含 `integration_runtime_init` 测试 target

#### Scenario: 无炉石环境测试数 = 49

- **GIVEN** 无炉石环境（CI 默认）
- **WHEN** 执行 `cargo test -p hearthmirror-native --all-features`
- **THEN** 输出 `>= 49 passed; 0 failed`（原 48 + 本 change 新增 1 个 init test，integration 测试被 skip 但仍计数）

### Requirement: spike 0003 必须含 Run 2 fix 后实测

After this change is implemented, [`docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`](../../../docs/spikes/0003-hearthmirror-reflection-runtime-validation.md) SHALL contain a `## Run 2` section appended after the existing `## Run 1`, recording the post-fix dump_reflection output. The Run 2 section MUST include:

- 顶部一行注明触发 commit："post-fix-hearthmirror-pe-read-cap commit `<sha>`"
- 完整 environment 矩阵（与 Run 1 同表格式）
- 12 方法 × {tier, tested, status, value, error, elapsed_ms} 表格
- 至少一段 "## Findings (Run 2)" 增量 finding，对比 Run 1 的变化（哪些方法解封 / 仍然失败 / 字段名飘移等）

#### Scenario: Run 2 段落存在

- **WHEN** 阅读 `0003-*.md`
- **THEN** 文件中存在 `## Run 2` 标题且后续段含 12 行方法表

#### Scenario: 字段名飘移记录但不在本 change 修复

- **GIVEN** Run 2 显示如 `getBattleTag` 因字段名 `m_netCacheValues` 不匹配返回 null
- **WHEN** 撰写 Run 2 Findings
- **THEN** finding 标注 `**Finding F-N (post-fix)**: ... — 字段名飘移，**non-blocking for fix-pe-read-cap**，留给后续 hotfix 或 5e`

### Requirement: 注释更新

The comment immediately preceding the `let pe_size = ...` statement in `find_mono_get_root_domain_va` SHALL reference spike 0003 F-1 and explicitly warn against re-introducing a size cap. The previous comment text "Read enough of the PE to satisfy pelite (header + tables, ~64 KB is generous)." SHALL NOT remain.

#### Scenario: 注释含 spike 引用

- **WHEN** 阅读 `runtime.rs::find_mono_get_root_domain_va` 函数体
- **THEN** `let pe_size = ...` 前的注释包含字符串 "spike 0003" 或 "F-1" 或 "STATUS_ACCESS_VIOLATION"，且无 "~64 KB is generous" 字样

### Requirement: cross-link 更新

After this change is archived, the following docs SHALL be updated:

- [`openspec/changes/add-hearthmirror-reflection-methods/tasks.md`](../../openspec/changes/add-hearthmirror-reflection-methods/tasks.md) 7.1 注解：把 spike 0003 F-1 "blocked" 注解扩展，标注"由 fix-hearthmirror-pe-read-cap 解封"
- [`openspec/changes/.NEXT.md`](../../openspec/changes/.NEXT.md) 5d-fix 段从 ✓ 升 ✓✓

#### Scenario: reflection-methods tasks.md 已注解 fix

- **WHEN** 阅读 `add-hearthmirror-reflection-methods/tasks.md` 7.1 项注解
- **THEN** 注解包含 "fix-hearthmirror-pe-read-cap" 字样

