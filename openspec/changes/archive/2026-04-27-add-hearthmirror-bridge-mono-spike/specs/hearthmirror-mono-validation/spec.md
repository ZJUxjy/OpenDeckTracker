## ADDED Requirements

### Requirement: Spike 包结构与边界

The repository SHALL contain a temporary `packages/hearthmirror-mono-spike/` workspace package during this change, marked exploratory in its README and deleted at teardown.

#### Scenario: spike 包存在并被标记
- **WHEN** apply 阶段进行到 build 验证
- **THEN** `packages/hearthmirror-mono-spike/README.md` 存在，含 "exploratory" 与 "do not depend"

#### Scenario: spike 包在 teardown 后不存在
- **WHEN** 本 change 全部完成
- **THEN** `Test-Path packages/hearthmirror-mono-spike` = `False` 且 `git ls-files packages/hearthmirror-mono-spike` 输出空

### Requirement: napi-rs 模块成功构建并加载

The spike SHALL produce a `.node` module via napi-rs CLI that can be `import`-ed by the Electron main process. The module SHALL export `async function spikeLocateMono(): Promise<MonoSpikeResult>`.

#### Scenario: napi build 产出 .node
- **WHEN** 在 `packages/hearthmirror-mono-spike/` 执行 `pnpm build`
- **THEN** 产出 `hearthmirror-mono-spike.win32-x64-msvc.node` + `index.js` + `index.d.ts`

#### Scenario: Electron 主进程能 import 模块
- **WHEN** 启动 `pnpm dev`
- **THEN** 主进程不抛出 `Cannot find module` 或 napi 加载错误

### Requirement: 6 步链路 stdout 输出

When Hearthstone is running at the main menu, calling `spikeLocateMono()` SHALL succeed and produce a JSON payload with the following non-empty fields, all printed to main process stdout (one log line per call):

- `pid`: positive integer
- `monoModuleName`: case-insensitive matches `mono-2.0-bdwgc.dll` or starts with `mono-`
- `monoModuleBase`: hex string `0x[0-9A-Fa-f]+`
- `monoModuleSize`: positive integer
- `peMachine`: contains `0x014C` (i386 32-bit confirm)
- `monoGetRootDomainRva`: hex string
- `monoGetRootDomainVa`: hex string equal to base + RVA
- `monoGetRootDomainFirstBytes`: 16 hex bytes
- `globalRootDomainAddr`: hex string (extracted from byte pattern A1+ret or fallback)
- `rootDomainPtr`: hex string, non-NULL
- `domainAssembliesPtr`: hex string, non-NULL
- `loadedImagesPtr`: hex string, non-NULL

#### Scenario: 主进程 stdout 输出合规结果
- **GIVEN** Hearthstone 主菜单运行中
- **WHEN** 启动 `pnpm dev`
- **THEN** 主进程 stdout 在 5 秒内打印 `[spike:mono] OK:` 行，JSON 含上述字段且符合约束

### Requirement: 失败路径优雅处理

When Hearthstone is not running, `spikeLocateMono()` SHALL reject with an Error message containing "process not found" or "mono runtime not found"; Electron main process SHALL NOT crash.

#### Scenario: 炉石未运行时
- **GIVEN** Hearthstone 未运行
- **WHEN** 启动 `pnpm dev`
- **THEN** 主进程 stdout 打印 `[spike:mono] FAIL:` 含 `process not found` 或 `mono runtime not found`，Electron 窗口仍正常显示 FIRESTONE

#### Scenario: 炉石进程在但 mono dll 找不到
- **GIVEN** 一个普通 32 位进程被假装为 Hearthstone（hypothetical / 不强制测试）
- **THEN** spike 报错时 message 包含 `mono runtime not found` 而不是 panic

### Requirement: 反汇编模式匹配的容错

The spike SHALL handle the case where `mono_get_root_domain`'s first bytes don't match the expected `A1 [4 bytes] C3` pattern. In that case, `globalRootDomainAddr` and `disasmPattern` SHALL be set to `"unknown"` instead of throwing; subsequent steps that depend on this value SHALL be skipped and `rootDomainPtr` etc. SHALL be `"<skipped: pattern unknown>"`. The spike report SHALL document the raw bytes for offline analysis.

#### Scenario: 模式匹配失败时不带崩 spike
- **GIVEN** `mono_get_root_domain` 函数体不是预期的 `A1 ... C3`
- **WHEN** spike 跑完
- **THEN** Promise resolve（不 reject），result.disasmPattern = "unknown"，result.rootDomainPtr = "<skipped: pattern unknown>"

### Requirement: spike 报告

The repository SHALL contain `docs/spikes/0002-hearthmirror-mono-spike-report.md` written before teardown, containing at minimum these H2 sections: `## Outcome`, `## Hearthstone Runtime Info`, `## 6-step Link Output`, `## Observed Offsets vs §7.2`, `## Encountered Issues`, `## Recommendations for add-hearthmirror-bridge`, `## Decision Outcome`.

#### Scenario: 报告章节齐全
- **WHEN** 读取 `docs/spikes/0002-hearthmirror-mono-spike-report.md`
- **THEN** 上述 7 个 H2 章节全部存在

#### Scenario: 偏移量比对表是真实数据
- **WHEN** 读取 `## Observed Offsets vs §7.2` 章节
- **THEN** 至少包含 MonoDomain.domain_assemblies 与 MonoDomain.loaded_images 两行实测偏移，**不**含 "TBD" / "approximately"

### Requirement: ADR 0001 增加 spike 02 验证记录

After this change, `docs/adr/0001-hearthmirror-bridge.md` Validation section SHALL include a line citing the spike 02 report.

#### Scenario: ADR Validation 段更新
- **WHEN** 读取 `docs/adr/0001-hearthmirror-bridge.md` 的 Validation 段
- **THEN** 包含子串 `docs/spikes/0002-hearthmirror-mono-spike-report.md`

### Requirement: Teardown 完整性

After teardown, all quality gates SHALL pass and no spike-related code SHALL remain in `apps/desktop/`.

#### Scenario: 质量门全绿
- **WHEN** 执行 `pnpm install --frozen-lockfile && pnpm cards:download && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @hdt/desktop build`
- **THEN** 全部命令退出码 0

#### Scenario: apps/desktop 中无 spike 残留
- **WHEN** 在 `apps/desktop/src/` 下 grep `mono-spike` / `spikeLocateMono` / `SPIKE TRIGGER`
- **THEN** 命中 0 处
