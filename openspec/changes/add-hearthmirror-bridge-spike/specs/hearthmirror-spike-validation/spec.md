## ADDED Requirements

### Requirement: Spike 包结构与边界

The repository SHALL contain a temporary `packages/hearthmirror-spike/` workspace package during this change. The package SHALL declare itself as exploratory in its README and SHALL NOT be referenced by any production package other than `@hdt/desktop` (and the reference in `@hdt/desktop` is itself temporary). The package SHALL be deleted entirely as part of this change's teardown.

#### Scenario: spike 包存在并标记为 exploratory（apply 中段）
- **WHEN** apply 阶段进行到 build 验证步骤
- **THEN** `packages/hearthmirror-spike/README.md` 存在，文件首段含 "exploratory" 与 "do not depend"

#### Scenario: spike 包在 teardown 后不存在
- **WHEN** 本 change 全部任务完成
- **THEN** `Test-Path packages/hearthmirror-spike` 返回 `False`，`git ls-files packages/hearthmirror-spike` 输出空

### Requirement: napi-rs 模块成功构建并加载

The spike SHALL produce a `.node` native module via `@napi-rs/cli` that can be successfully `import`-ed by the Electron main process at runtime. The module SHALL export a single `async function spikeReadMz(): Promise<SpikeResult>`.

#### Scenario: napi build 产出 .node 文件
- **WHEN** 在 `packages/hearthmirror-spike/` 执行 `pnpm build`
- **THEN** 产出 `packages/hearthmirror-spike/*.node`（具体文件名形如 `hearthmirror-spike.win32-x64-msvc.node`），并自动产出 `index.cjs`（CommonJS 加载器）与 `index.d.ts`（TypeScript 类型）

#### Scenario: Electron 主进程能 import spike 模块
- **WHEN** 在 `apps/desktop/src/main/index.ts` 中 `import { spikeReadMz } from '<spike-package>'` 后跑 `pnpm dev`
- **THEN** Electron 主进程启动时**不**抛出 `Cannot find module` 或 `node:napi` 相关错误

### Requirement: 场景 A 验证（Hearthstone 运行时）

When `Hearthstone.exe` is running, calling `spikeReadMz()` SHALL resolve with a `SpikeResult` containing a non-zero PID, a hex base address string, and a 16-byte header hex string starting with `4D 5A 90 00`.

#### Scenario: 主进程 stdout 输出场景 A 的合规结果
- **GIVEN** Hearthstone 客户端正在运行
- **WHEN** 启动 `pnpm dev`
- **THEN** 主进程 stdout 在 5 秒内打印一行匹配正则 `\[spike:readMz\] OK:.*pid:\s*\d+,\s*baseAddress:\s*0x[0-9A-Fa-f]+,\s*headerHex:\s*4D 5A 90 00`

### Requirement: 场景 B 验证（Hearthstone 未运行）

When `Hearthstone.exe` is not running, calling `spikeReadMz()` SHALL reject the Promise with an Error whose message contains "process not found" (case-insensitive). The Electron main process SHALL NOT crash, and the renderer SHALL display the FIRESTONE main window normally.

#### Scenario: 主进程 stdout 输出场景 B 的合规错误
- **GIVEN** Hearthstone 未运行
- **WHEN** 启动 `pnpm dev`
- **THEN** 主进程 stdout 在 5 秒内打印一行匹配 `\[spike:readMz\] FAIL:.*process not found` 且 Electron 窗口正常显示 "FIRESTONE"

#### Scenario: 失败路径不带崩 Electron
- **GIVEN** 场景 B 触发的 spike 失败
- **WHEN** Electron 窗口已显示
- **THEN** 用户点击 Sidebar 各路由（Tracker / Stats / Collection / Settings）切换正常，Window 不闪退

### Requirement: spike 报告

The spike SHALL produce `docs/spikes/0001-hearthmirror-spike-report.md` documenting actual command sequences, encountered issues, and a performance baseline. The report SHALL be written **before** teardown.

#### Scenario: 报告包含必要章节
- **WHEN** 读取 `docs/spikes/0001-hearthmirror-spike-report.md`
- **THEN** 文件至少包含 H2 章节：`## Outcome`、`## Actual Command Sequence`、`## Encountered Issues`、`## Performance Baseline`、`## Recommendations for add-hearthmirror-bridge`

#### Scenario: 性能基线包含具体数值
- **WHEN** 读取 `## Performance Baseline` 章节
- **THEN** 包含至少一条形如 `单次 spike_read_mz: <数字> µs`（数字必须是真实测量值，禁止 "TBD" / "approximately X"）

### Requirement: ADR 0001 状态升级

After a successful spike, `docs/adr/0001-hearthmirror-bridge.md` SHALL have its Status changed from `Accepted` to `Validated`, and its Consequences section SHALL append a line citing the spike report.

#### Scenario: ADR Status 已升级
- **WHEN** 读取 `docs/adr/0001-hearthmirror-bridge.md` 的前 10 行
- **THEN** 包含 `Status: Validated`，**不**包含 `Status: Accepted`

#### Scenario: Consequences 引用了报告
- **WHEN** 读取 `docs/adr/0001-hearthmirror-bridge.md` 的 Consequences 章节
- **THEN** 包含子串 `docs/spikes/0001-hearthmirror-spike-report.md`

### Requirement: Teardown 完整性

After teardown, the repository SHALL pass the same quality gates as before this change started: `pnpm install` clean, `pnpm typecheck` zero errors, `pnpm lint` zero errors, `pnpm test` all pass, `pnpm --filter @hdt/desktop build` succeeds. No spike-related code SHALL remain in `apps/desktop/`.

#### Scenario: 所有质量门通过
- **WHEN** teardown 完成后执行 `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @hdt/desktop build`
- **THEN** 全部命令退出码 0

#### Scenario: apps/desktop 中无 spike 残留
- **WHEN** 在 `apps/desktop/src/` 下 grep `spike` / `Spike` / `SPIKE` / `hearthmirror-spike`
- **THEN** 命中 0 处（test 文件中的无关单词不算）

## MODIFIED Requirements

### Requirement: ADR 文档存在且可追溯

The repository SHALL contain `docs/adr/0001-hearthmirror-bridge.md` recording the architecture decision (Status / Context / Decision / Consequences). The `Rewrite_Design.md` document SHALL contain a banner at the top pointing to this ADR and stating that its architecture sections are superseded. After this change, the ADR Status SHALL be `Validated` (upgraded from `Accepted`), with a citation to the spike report in its Consequences section.

#### Scenario: ADR 文件存在且非空
- **WHEN** 检查 `docs/adr/0001-hearthmirror-bridge.md`
- **THEN** 文件存在，内容包含 "Status: Validated" 段、"Decision: 64-bit napi-rs" 段、"Consequences" 段

#### Scenario: Rewrite_Design.md 顶部有 supersession banner
- **WHEN** 读取 `Rewrite_Design.md` 的前 50 行
- **THEN** 包含子串 "superseded" 和 "docs/adr/0001-hearthmirror-bridge.md"

#### Scenario: ADR Consequences 引用了 spike 报告
- **WHEN** 读取 `docs/adr/0001-hearthmirror-bridge.md` 的 Consequences 章节
- **THEN** 包含子串 `docs/spikes/0001-hearthmirror-spike-report.md`
