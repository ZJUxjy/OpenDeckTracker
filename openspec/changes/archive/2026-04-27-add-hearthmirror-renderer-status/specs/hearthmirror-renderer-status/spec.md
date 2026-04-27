## ADDED Requirements

### Requirement: useHearthMirrorStatus 聚合 hook

The `apps/desktop/src/renderer/src/hooks/use-hearthmirror-status.ts` SHALL export `useHearthMirrorStatus()` returning an object with at least:

```ts
{
  isAlive: boolean
  battleTag: { name: string; fullBattleTag: string } | null
  medalInfo: MedalInfo | null
  lastUpdatedAt: number  // unix ms
}
```

It SHALL poll every 5000 ms via `setInterval`, calling `window.hdt.hearthmirror.isAlive()`, then (only if isAlive=true) `getBattleTag()` and `getMedalInfo()`. All IPC calls SHALL be wrapped in the existing `swallow` helper (default `isAlive=false`, `battleTag=null`, `medalInfo=null` on rejection). It SHALL clean up the interval on unmount.

#### Scenario: 第一次 tick 立即拉

- **WHEN** 组件首次 mount
- **THEN** hook 立即（在第一个 useEffect 周期内）发起一次 `isAlive()` 调用，不等 5 秒

#### Scenario: 炉石未运行时跳过子调用

- **GIVEN** `isAlive()` 返回 false
- **WHEN** 一次 polling tick 执行
- **THEN** hook 仅调用 `isAlive()` 一次，**不**调用 `getBattleTag()` 或 `getMedalInfo()`

#### Scenario: unmount 后 interval 被清

- **WHEN** 组件 unmount
- **THEN** 后续 5 秒/10 秒/15 秒... 都不再发起新的 `isAlive()` 调用（vitest fake timers 验证）

#### Scenario: IPC reject 时回退默认值

- **GIVEN** `window.hdt.hearthmirror.isAlive` reject
- **WHEN** polling tick 执行
- **THEN** hook 状态变为 `{ isAlive: false, battleTag: null, medalInfo: null }`，组件不抛错

### Requirement: App.tsx 顶部 header 接入

The `apps/desktop/src/renderer/src/App.tsx` SHALL replace the hardcoded "Game Running" indicator and "PlayerOne" username with `useHearthMirrorStatus()` data per the following mapping:

| `isAlive` | `battleTag` | header 文本 | 状态点颜色 |
|---|---|---|---|
| `false` | * | `"Game Not Running"` | 灰（`text-zinc-500` 或同色系） |
| `true` | `null` | `"Not Logged In"` | 黄（`text-amber-500` 或同色系） |
| `true` | `{ fullBattleTag }` | `fullBattleTag`（如 `"Player#12345"`） | 绿（`text-emerald-500` 或同色系） |

#### Scenario: 炉石未运行时显示灰态

- **GIVEN** `useHearthMirrorStatus` 返回 `{ isAlive: false }`
- **WHEN** 渲染 App
- **THEN** header 含文本 "Game Not Running"，状态点 className 含 `text-zinc-500` 或 `bg-zinc-500`

#### Scenario: 运行未登录显示黄态

- **GIVEN** `useHearthMirrorStatus` 返回 `{ isAlive: true, battleTag: null }`
- **WHEN** 渲染 App
- **THEN** header 含文本 "Not Logged In"

#### Scenario: 运行已登录显示真实 BattleTag

- **GIVEN** `useHearthMirrorStatus` 返回 `{ isAlive: true, battleTag: { fullBattleTag: "Player#12345" } }`
- **WHEN** 渲染 App
- **THEN** header 含文本 "Player#12345"，状态点 className 含 `text-emerald-500` 或 `bg-emerald-500`

### Requirement: Dashboard.tsx 段位字段接入

The `apps/desktop/src/renderer/src/components/Dashboard.tsx` SHALL replace the hardcoded `MOCK_STATS.currentRank` text in the top stats card with the following derivation from `useHearthMirrorStatus().medalInfo.standard`:

| `medalInfo.standard` | 显示文本 |
|---|---|
| `null` | mock fallback（保持现有 `"Legend"` 字面量） |
| `{ legendRank: n }` 且 `n > 0` | `` `Legend ${n}` `` |
| `{ legendRank: 0, starLevel: m }` | `` `Star ${m}` `` |

#### Scenario: medalInfo null 时显示 mock

- **GIVEN** `medalInfo` is null
- **WHEN** 渲染 Dashboard
- **THEN** rank 字段文本为 `"Legend"`（mock fallback，与改造前视觉一致）

#### Scenario: 标准模式传说排名显示

- **GIVEN** `medalInfo.standard = { legendRank: 1234, starLevel: 0 }`
- **WHEN** 渲染 Dashboard
- **THEN** rank 字段文本为 `"Legend 1234"`

#### Scenario: 标准模式星级显示

- **GIVEN** `medalInfo.standard = { legendRank: 0, starLevel: 42 }`
- **WHEN** 渲染 Dashboard
- **THEN** rank 字段文本为 `"Star 42"`

### Requirement: 测试默认 stub 与现有冒烟测试不破

The `apps/desktop/src/renderer/tests/setup.ts` SHALL ensure `window.hdt.hearthmirror` is stubbed with all 16 methods (or full union per current preload bridge) returning sensible defaults: async functions resolving to `null` for `Option<T>` returns, `false` for boolean, `0` for number. Existing renderer smoke tests SHALL continue to pass (49+ tests in current 7 test files).

#### Scenario: 现有冒烟测试通过

- **WHEN** 在 `apps/desktop` 跑 `pnpm test`
- **THEN** 所有原有测试（pre-change 通过的）继续通过；新增的 dashboard.test.tsx / header.test.tsx 也通过

### Requirement: 三态 React Testing Library 测试

The change SHALL add `apps/desktop/src/renderer/tests/header.test.tsx` and `apps/desktop/src/renderer/tests/dashboard.test.tsx`. Each test file SHALL cover the three rendering states (game-not-running / running-not-logged-in / running-logged-in) by mocking `window.hdt.hearthmirror.*` per-test via `vi.mocked` or assignment.

#### Scenario: header.test.tsx 覆盖 3 态

- **WHEN** 跑 `pnpm --filter @hdt/desktop test header`
- **THEN** 至少 3 个 `it()` 通过，分别 assert "Game Not Running" / "Not Logged In" / 真实 BattleTag 文本出现

#### Scenario: dashboard.test.tsx 覆盖 3 态

- **WHEN** 跑 `pnpm --filter @hdt/desktop test dashboard`
- **THEN** 至少 3 个 `it()` 通过，分别 assert "Legend"（mock fallback）/ "Star <n>" / "Legend <n>" 文本出现

### Requirement: 修复 add-hearthmirror-bridge tasks.md H.3 状态

After this change is merged, `openspec/changes/add-hearthmirror-bridge/tasks.md` items H.3.x (renderer integration) SHALL be marked `[x]` (checked) again, and any TODO comments inserted by the 2026-04-20 review SHALL be removed.

#### Scenario: H.3 全部勾选

- **WHEN** 检查 `openspec/changes/add-hearthmirror-bridge/tasks.md` Phase H.3 段
- **THEN** 所有 H.3.* checkbox 均为 `[x]`，无 `TODO: [add-hearthmirror-renderer-status]` 注释残留
