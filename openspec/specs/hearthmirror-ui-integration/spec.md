# hearthmirror-ui-integration Specification

## Purpose

TBD - created by archiving change add-hearthmirror-bridge. Update Purpose after archive.
## Requirements
### Requirement: Dashboard 顶部状态栏切到真实 hearthmirror 数据

The renderer's top header (in `apps/desktop/src/renderer/src/App.tsx`) SHALL replace the hardcoded mock for the following three fields with `window.hdt.hearthmirror.*` calls, polling every 5 seconds:

- **Game Running 状态**: 当前 mock = `<Monitor /> Game Running` 绿点。新行为：根据 `await window.hdt.hearthmirror.isAlive()` 返回值，true 显示绿点 "Game Running"，false 显示灰点 "Game Not Running"。
- **PlayerOne 用户名**: 当前 mock = `PlayerOne` 字符串。新行为：从 `await window.hdt.hearthmirror.getBattleTag()` 取 `.name` 字段；若 `null` 显示 `Not Connected`。

The renderer's `apps/desktop/src/renderer/src/components/Dashboard.tsx` SHALL further:

- **Legend 段位**: 当前 mock = `MOCK_STATS.currentRank = 'Legend'`。新行为：从 `await window.hdt.hearthmirror.getMedalInfo()` 取 `standard.legendRank > 0 ? Legend ${legendRank} : Star ${starLevel}`；若 `null` 显示 mock。

#### Scenario: 炉石运行 + 已登录时显示真实数据
- **GIVEN** 炉石主菜单运行 + 用户已登录战网
- **WHEN** 启动 `pnpm dev` 等 5 秒
- **THEN** 主窗口顶部 PlayerOne 处显示真实 BattleTag（如 `Player#12345`），段位处显示真实段位

#### Scenario: 炉石未运行时显示 fallback
- **GIVEN** 炉石未运行
- **WHEN** 启动 `pnpm dev`
- **THEN** 顶部状态条显示灰色 "Game Not Running"，PlayerOne 显示 "Not Connected"，Dashboard 段位仍显示 mock "Legend"，**主窗口不白屏**

#### Scenario: 5 秒后状态变化能感知
- **GIVEN** 启动 dev 时炉石未运行 → 显示 "Game Not Running"
- **WHEN** 用户中途打开炉石（5 秒 polling 周期内）
- **THEN** 下一次 polling tick UI 自动切换到 "Game Running"，PlayerOne 显示真实 BattleTag

### Requirement: Renderer 测试 stub

The `apps/desktop/src/renderer/tests/setup.ts` SHALL extend the existing `window.hdt` stub to include `hearthmirror` namespace with all 13 methods stubbed to `async () => null`/`async () => false` (for boolean/number returns), so the existing renderer smoke test continues to pass.

#### Scenario: 现有冒烟测试仍通过
- **WHEN** 跑 `pnpm test`
- **THEN** 7 个测试文件、49+ 个测试全部通过；新增的 hearthmirror 相关 stub 不破坏 App 渲染

### Requirement: useHearthMirrorStatus hook（可选）

The renderer MAY include a small hook `useHearthMirrorStatus()` that encapsulates the 5-second polling logic for `isAlive` + `BattleTag` + `MedalInfo`. Its file location is `apps/desktop/src/renderer/src/hooks/use-hearthmirror-status.ts`. It SHALL handle the case where `window.hdt?.hearthmirror` is undefined (defensive, similar to `Decklist`'s pattern).

#### Scenario: hook 失败安全
- **GIVEN** mock `window.hdt = undefined`
- **WHEN** 渲染使用此 hook 的组件
- **THEN** 不抛异常；hook 返回 `{ alive: false, battleTag: null, medal: null }`

### Requirement: 渲染端 fallback

The renderer's components consuming `window.hdt.cards.*` (Decklist, Collection from `add-card-database`) AND `window.hdt.hearthmirror.*` (App header, Dashboard from this change) SHALL gracefully fall back when the underlying IPC returns `null`/`undefined`. No component SHALL throw or show white screen on data unavailability.

#### Scenario: cards 数据库未加载时 Decklist 不白屏
- **GIVEN** `data/cards/cards.collectible.enUS.json` 缺失
- **WHEN** 启动 `pnpm dev`
- **THEN** Decklist 区域仍渲染 mock 卡牌（与 `add-card-database` 已有要求一致）

#### Scenario: hearthmirror 全部失败时 Dashboard 不白屏
- **GIVEN** 炉石未运行 + 主进程从未尝试 hearthmirror 连接
- **WHEN** 启动 `pnpm dev`
- **THEN** App 顶部 + Dashboard 全部显示 fallback，主窗口正常呈现 FIRESTONE
