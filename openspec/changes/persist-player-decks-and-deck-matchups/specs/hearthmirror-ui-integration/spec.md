## MODIFIED Requirements

### Requirement: Dashboard 顶部状态栏切到真实 hearthmirror 数据

The renderer's top header (in `apps/desktop/src/renderer/src/App.tsx`) SHALL display HearthMirror status and player identity using `window.hdt.hearthmirror.*` calls, polling every 5 seconds, with a persisted local player fallback supplied by the Electron main process.

- **Game Running 状态**: 根据 `await window.hdt.hearthmirror.isAlive()` 返回值显示。`true` 显示绿点 "Game Running" when a BattleTag is available, `true` with no BattleTag displays "Not Logged In", and `false` displays gray "Game Not Running".
- **玩家用户名**: when live `getBattleTag()` returns a BattleTag, the header displays `fullBattleTag`; when live BattleTag is unavailable, the header SHALL display the last persisted BattleTag if one exists; otherwise it displays the localized fallback.
- **玩家控件行为**: the player identity area SHALL be a display-only element, not a button. It MAY keep hover highlight styling, but it MUST NOT include a dropdown chevron or click handler.
- **通知控件**: the top header SHALL NOT render a notification bell or unread-dot affordance until a real notification feature exists.

The renderer's `apps/desktop/src/renderer/src/components/Dashboard.tsx` SHALL further:

- **Legend 段位**: 从 `await window.hdt.hearthmirror.getMedalInfo()` 取 `standard.legendRank > 0 ? Legend ${legendRank} : Star ${starLevel}`；若 `null` 显示 fallback。

The Electron main process SHALL persist the latest successful local player identity read, including BattleTag, optional account id, and `lastSeenAt`. Failed or null HearthMirror reads MUST NOT erase a previously persisted identity.

#### Scenario: 炉石运行 + 已登录时显示真实数据

- **GIVEN** 炉石主菜单运行 + 用户已登录战网
- **WHEN** 启动 `pnpm dev` 等 5 秒
- **THEN** 主窗口顶部玩家处显示真实 BattleTag（如 `Player#12345`），段位处显示真实段位
- **AND** the persisted player profile is updated with the same BattleTag and a fresh `lastSeenAt`

#### Scenario: 炉石未运行时显示 fallback

- **GIVEN** 炉石未运行
- **WHEN** 启动 `pnpm dev`
- **THEN** 顶部状态条显示灰色 "Game Not Running"
- **AND** the player identity displays the last persisted BattleTag when one exists
- **AND** the player identity displays the localized player fallback when no cached identity exists
- **AND** Dashboard 段位仍显示 fallback，主窗口不白屏

#### Scenario: 5 秒后状态变化能感知

- **GIVEN** 启动 dev 时炉石未运行 → 显示 "Game Not Running"
- **WHEN** 用户中途打开炉石（5 秒 polling 周期内）
- **THEN** 下一次 polling tick UI 自动切换到 "Game Running"，玩家处显示真实 BattleTag
- **AND** the cached fallback is refreshed

#### Scenario: Header removes fake interactive affordances

- **WHEN** the main window header renders
- **THEN** no notification bell button or unread red dot is present
- **AND** the player identity block contains no dropdown chevron
- **AND** clicking the player identity block performs no action

### Requirement: Renderer 测试 stub

The `apps/desktop/src/renderer/tests/setup.ts` SHALL extend the existing `window.hdt` stub to include `hearthmirror` namespace with all methods stubbed to `async () => null`/`async () => false` (for boolean/number returns), and any player-profile preload namespace added by this change, so the existing renderer smoke test continues to pass.

#### Scenario: 现有冒烟测试仍通过

- **WHEN** 跑 `pnpm test`
- **THEN** renderer tests pass with hearthmirror and player-profile stubs present

### Requirement: useHearthMirrorStatus hook（可选）

The renderer MAY include a small hook `useHearthMirrorStatus()` that encapsulates the 5-second polling logic for `isAlive` + `BattleTag` + `MedalInfo` + cached player profile. Its file location is `apps/desktop/src/renderer/src/hooks/use-hearthmirror-status.ts`. It SHALL handle the case where `window.hdt?.hearthmirror` is undefined and SHALL return cached identity when available.

#### Scenario: hook 失败安全

- **GIVEN** mock `window.hdt = undefined`
- **WHEN** 渲染使用此 hook 的组件
- **THEN** 不抛异常；hook 返回 `{ alive: false, battleTag: null, medal: null }` plus no cached identity

#### Scenario: hook returns cached identity when live tag is null

- **GIVEN** `isAlive()` returns false and player profile IPC returns a cached BattleTag
- **WHEN** the hook settles
- **THEN** the hook exposes the cached BattleTag for display while keeping `isAlive === false`

### Requirement: 渲染端 fallback

The renderer's components consuming `window.hdt.cards.*` (Decklist, Collection from `add-card-database`) AND `window.hdt.hearthmirror.*` (App header, Dashboard from this change) SHALL gracefully fall back when the underlying IPC returns `null`/`undefined`. No component SHALL throw or show white screen on data unavailability.

#### Scenario: cards 数据库未加载时 Decklist 不白屏

- **GIVEN** `data/cards/cards.collectible.enUS.json` 缺失
- **WHEN** 启动 `pnpm dev`
- **THEN** Decklist 区域仍渲染 fallback 内容

#### Scenario: hearthmirror 全部失败时 Dashboard 不白屏

- **GIVEN** 炉石未运行 + 主进程从未尝试 hearthmirror 连接
- **WHEN** 启动 `pnpm dev`
- **THEN** App 顶部 + Dashboard 全部显示 fallback，主窗口正常呈现
