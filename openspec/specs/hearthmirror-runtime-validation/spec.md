# hearthmirror-runtime-validation Specification

## Purpose

TBD - created by archiving change verify-hearthmirror-on-real-hs. Update Purpose after archive.
## Requirements
### Requirement: dump_reflection cargo example 存在并可用

The `packages/hearthmirror/native/examples/dump_reflection.rs` SHALL exist as a cargo example that, when run via `cargo run --example dump_reflection` from `packages/hearthmirror/native/`, calls all 12 reflection methods (`getBattleTag`, `getAccountId`, `getMedalInfo`, `getMatchInfo`, `getGameType`, `isSpectating`, `isGameOver`, `getServerInfo`, `getBattlegroundRatingInfo`, `getArenaDeck`, `getDecks`, `getCollection`) against the running Hearthstone process and prints one JSON Lines record per method to stdout. Each call MUST be wrapped so a panic or error in one method does not prevent the remaining 11 from running.

#### Scenario: 炉石未运行时优雅退出

- **GIVEN** Hearthstone.exe 未在系统中运行
- **WHEN** 执行 `cargo run --example dump_reflection`
- **THEN** example 输出一行 `{"method": "MonoRuntime::init", "status": "error", "error": "ProcessNotFound: Hearthstone.exe"}` 到 stdout，进程退出码为 0（不是 panic）

#### Scenario: 单方法失败不影响其他

- **GIVEN** Hearthstone 运行且已登录，但 `getBattleTag` 因字段名飘移返回 `Err`
- **WHEN** 执行 example
- **THEN** stdout 仍然包含 12 行 JSON（`getBattleTag` 行 status="error"，其余 11 行各自的 status），不在 `getBattleTag` 失败处中断

#### Scenario: JSON Lines 格式 schema 一致

- **WHEN** example 任一方法调用完成
- **THEN** 输出对应行 JSON 有且仅有这些键：`method` (string), `status` (`"ok"|"null"|"error"`), `value` (string, 序列化的返回值或 `null`), `error` (string, 错误消息或 `null`), `elapsed_ms` (number, 该方法耗时)

### Requirement: run-hearthmirror-spike PowerShell 脚本存在

The `scripts/run-hearthmirror-spike.ps1` SHALL exist and SHALL: (a) cd 到 `packages/hearthmirror/native`; (b) 执行 `cargo run --example dump_reflection 2>&1`，把 stdout 写入临时文件; (c) 解析 JSON Lines，渲染成 Markdown 表格（列：method / status / value（截断到 80 字符）/ error / elapsed_ms）; (d) 把环境信息（OS build、Hearthstone exe 版本、`mono-2.0-bdwgc.dll` 文件 SHA1、当前 UTC 时间）写到表格之前; (e) 把完整内容追加到 `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`（如该文件已存在则在 `## Run <N>` 段下追加新一节）。

#### Scenario: 多次运行追加不覆盖

- **GIVEN** spike 报告 `0003-*.md` 已存在并包含一次运行结果
- **WHEN** 再次执行 `pwsh scripts/run-hearthmirror-spike.ps1`
- **THEN** 报告末尾追加 `## Run 2` 段，原 `## Run 1` 段保留不动

#### Scenario: 缺少 dll 时仍能记录环境

- **GIVEN** Hearthstone 已退出，`mono-2.0-bdwgc.dll` 不可访问
- **WHEN** 脚本运行
- **THEN** 环境段中 `mono dll SHA1` 字段值为 `"unavailable"`，脚本不抛错

### Requirement: spike 报告 0003 必须包含规定段落

The `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md` SHALL exist after this change is complete and SHALL contain at minimum these top-level sections in this order:

1. `# Spike 0003: HearthMirror Reflection Runtime Validation`
2. `## Background` — 引用 [`add-hearthmirror-reflection-methods`](../../openspec/changes/add-hearthmirror-reflection-methods/) 与本 verify change，简述为什么做 spike
3. `## Methodology` — 简述 example + 脚本工作流程
4. `## Run 1` （以及任何后续 Run N）— 含环境矩阵 + 12 方法表 + run-specific notes
5. `## Findings` — 至少 3 条 finding，每条 `**Finding F-N**: <现象> — <推测原因>`
6. `## Recommendations` — 把 finding 映射到下一步具体 change（[`add-hearthmirror-offset-probing`](../../openspec/changes/add-hearthmirror-offset-probing/) 等），用 `Must Fix` / `Should Fix` / `Defer` 三档优先级标注
7. `## Environment Matrix Reference` — 测试机环境快照模板，留给后续 contributor 复制填写

#### Scenario: 报告无 finding 也必须显式写"无飘移"

- **GIVEN** Tier 1 测试 8 个方法全部 `status="ok"`，无字段名飘移
- **WHEN** 撰写 Findings 段
- **THEN** Findings 段至少写一条 `**Finding F-1**: 当前 Hearthstone build 与 hearthmirror 字段假设完全一致 — 无需立即 fix`，不允许空段

#### Scenario: Recommendations 必须 cross-link

- **WHEN** 任一 finding 标注 `Must Fix` 或 `Should Fix`
- **THEN** Recommendations 段对应条目 MUST 指明承担 fix 的 change（`add-hearthmirror-offset-probing` / `add-hearthmirror-image-walking` / 新建 hotfix change）的相对路径

### Requirement: 测试矩阵分两段执行

The spike SHALL execute test matrix in two tiers:

- **Tier 1 (mandatory)**: Hearthstone 运行至主菜单 + 已登录战网，跑 8 个不依赖对局状态的方法（getBattleTag, getAccountId, getMedalInfo, getMatchInfo, getDecks, getCollection, getServerInfo, getBattlegroundRatingInfo）
- **Tier 2 (best-effort)**: 进入任意一场实战或观战，跑余下 4 个（getGameType, isSpectating, isGameOver, getArenaDeck）

报告中每个方法 row MUST 标注它属于哪个 tier 与本次是否被实际测试（`tested` / `not-tested`）。

#### Scenario: Tier 2 未跑也算完成

- **GIVEN** Tier 1 全部 8 个方法 `tested`，Tier 2 因时间未进对局
- **WHEN** 完成 spike 并 archive change
- **THEN** 报告中 Tier 2 的 4 个方法行标 `not-tested`，change 仍可 archive；Recommendations 中显式提"Tier 2 未覆盖，留给下次跑 spike 时补充"

### Requirement: 不修改 lib 代码

The change SHALL NOT modify any file under `packages/hearthmirror/native/src/`. The change MAY modify only `examples/`, `scripts/`, `docs/`, and `openspec/changes/`.

#### Scenario: 发现飘移不立即 fix

- **GIVEN** spike Run 1 显示 `getBattleTag` 因 `m_netCacheValues` 字段已改名为 `_netCacheValues` 失败
- **WHEN** 撰写 Findings
- **THEN** finding 仅记录现象与推测，**不**修改 `field_paths.rs`；fix 留给后续 hotfix change 或 [`add-hearthmirror-offset-probing`](../../openspec/changes/add-hearthmirror-offset-probing/)

### Requirement: 更新交叉引用

After this change is archived, the following docs MUST be updated:

- [`add-hearthmirror-reflection-methods/tasks.md`](../../openspec/changes/add-hearthmirror-reflection-methods/tasks.md) section 7.1 status updated from `[ ]` 到 `[x]`，注明"由 [`verify-hearthmirror-on-real-hs`](../../openspec/changes/verify-hearthmirror-on-real-hs/) 兑现"
- [`docs/adr/0001-hearthmirror-bridge.md`](../../docs/adr/0001-hearthmirror-bridge.md) 在"约束 #5（动态偏移探测）"段后追加一行链接到 `docs/spikes/0003-*.md`

#### Scenario: tasks.md 反向勾上

- **WHEN** spike 完成
- **THEN** `add-hearthmirror-reflection-methods/tasks.md` 7.1 项的 checkbox 从 `[ ]` 改为 `[x]`，并在该项后追加一行注解 `> 由 verify-hearthmirror-on-real-hs 兑现：见 docs/spikes/0003-*.md`
