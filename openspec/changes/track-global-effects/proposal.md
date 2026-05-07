## Why

Hearthstone 的部分卡牌打出后会修改**对局剩余时间内全局生效的规则**，
而不是单次结算。当前 Standard 轮换里典型例子：

- **Cleansing Cleric**（牧师）：打出后，本场内任何治疗效果额外 +2。
- **Tame Pet**（猎人）：打出后随机抽 3 张比 Tame Pet 费用高的野兽，本场
  剩下的 *Animal Companion* 召唤池就从原版三选一（Misha/Leokk/Huffer）
  替换为这 3 张抽出来的野兽里随机一个。

这类「持续生效的全局修正」对决策影响很大（是否换血、对手是否能接到
12 费 8/8 buff…），但我们的记牌器目前完全不显示 —— 玩家只能靠记忆。
Firestone 等竞品对这类效果有专门的列表面板，HDT.js 想达到对标质量
就必须有等价能力。

`@hdt/core` 已经从 HearthWatcher 收到 played-card 级别的事件流，新
增一层「全局效果注册表」是这条流的自然下游消费者，不需要新的数据源。
本 change 只覆盖**当前 Standard 轮换内**的全局效果（约 10–15 张卡），
为 Wild / Twist / Battlegrounds 留接口但不实现。

DEVELOPMENT_PLAN.md 把"对手识牌增强"放在 Phase 4，本 change 是
Phase 4 的一块：把 deck panel 从单视图扩展为带分页的多视图容器，并
新增第一类辅助视图 —— 全局效果列表。

## What Changes

- **NEW** `@hdt/core` 子模块 `global-effects/` 提供：
  - `EffectDef` 类型 —— 一个全局效果的元数据（id、source cardId、
    所属 player side、i18n key、可选 parameters schema、detector）。
  - `GlobalEffectsRegistry` —— 每个 `Game` 实例持有一个，订阅
    HearthWatcher 的 `card:played` 事件，对照 catalog 触发已知效果。
  - 内置 effect catalog 文件：每个 Standard 全局效果一个 .ts
    文件（`cleansing-cleric.ts`、`tame-pet.ts`、…），导出
    `EffectDef`。
  - 每场对局的 effects state 进入既有 `DeckTrackerSnapshot`（per-player
    `globalEffects: ActiveEffect[]`），通过现有 `deck-tracker:state`
    IPC 通道一并下发到 renderer，**无需新增 IPC 通道**。

- **MODIFIED** Deck-tracker snapshot：
  - `DeckTrackerSnapshot` 顶层增加 `friendlyEffects: ActiveEffect[]`
    与 `opposingEffects: ActiveEffect[]` 字段（默认空数组）。
  - `ActiveEffect` 形如
    `{ id, sourceCardId, triggeredAt, params?: Record<string, unknown> }`。
    `params` 为效果特有数据，例如 Tame Pet 的
    `{ pool: [cardId, cardId, cardId] }`。

- **NEW** Renderer 分页容器 `TrackerPanelTabs`：
  - 包裹己方 LiveDeckPanel + 一个新的 `GlobalEffectsPanel`，提供
    类似浏览器分页栏（Deck / Effects）的切换 UI。
  - 主 tab 保持 Deck（默认），Effects tab 在 effects 数量 > 0 时
    显示数字徽标。
  - 对手侧同结构包裹 `OpponentCardsPanel` + 对手的 `GlobalEffectsPanel`。
  - 同时应用于主窗口 Tracker 路由 与 in-game overlay（player /
    opponent 两个窗口）—— 即"两个 overlay 上也有"。

- **NEW** `GlobalEffectsPanel` renderer 组件：
  - 列表项：左侧 cost-tinted 卡牌图标（来源卡），右侧标题 +
    一句话效果描述（i18n）+ 可选的 params 渲染（Tame Pet 的 3 张
    池子用迷你卡片行展示）。
  - 空态：显示「本局尚未触发全局效果」的占位文案。
  - 通过 Zustand 的 `useDeckTrackerStore` 读取
    `friendlyEffects` / `opposingEffects`（按面板归属选）。

- **NEW** i18n keys 在 `resources/locales/{en-US,zh-CN}.json` 的
  `globalEffects.*` 命名空间：tab 标签、空态文案、每个内置 effect
  的标题 + 描述。

- **MODIFIED** `apps/desktop/src/main/deck-tracker.ts` 在每帧
  snapshot 构造时把 registry 里的 active effects 序列化进 snapshot。

**Non-goals**（明确不做的事）：

- **Wild / Twist / Arena / Mercenaries / Battlegrounds 模式的全局
  效果**。Catalog 只覆盖当前 Standard 轮换；framework 上为其他模式
  留扩展点（`mode?: GameMode` 字段）但不实现。
- **效果数值真假对账**。比如 Cleansing Cleric 的 +2 治疗，记牌器
  只标记"buff 已生效"，不重新计算后续治疗结算 —— 那是游戏端职责。
- **自动从卡牌文本反推效果定义**。Catalog 是手工维护的，每张卡
  一个 EffectDef 文件，等价于 hand-curated whitelist。
- **效果到期 / 解除的检测**。Standard 里大部分 global effects 是
  "本场剩余时间生效"（无解除条件），少数（如对手反制）暂不处理；
  catalog 的 EffectDef 留 `expiresOn?: ExpireRule` 字段但 M1 不实现
  任何 expire 规则。
- **从牌组列表 / 卡组编辑器 / 卡组发现里看到全局效果**。仅在比赛
  中的 LiveDeck panel 区域。
- **Tame Pet 等带参数效果的参数推断 fallback**。这次只实现对单一
  数据源（HearthWatcher Power.log 的 ZONE/SHOW_ENTITY 事件）的解析；
  如果日志缺数据就让该效果以 `params: undefined` 状态显示（UI 退
  化为只显示标题与描述）。
- **手动添加/编辑/隐藏效果**。Effects 面板纯只读。

## Capabilities

### New Capabilities

- `global-effects-tracker`: `@hdt/core` 子层 —— 提供 EffectDef
  schema、Catalog 加载、GlobalEffectsRegistry、对 HearthWatcher
  played-card 事件流的订阅、ActiveEffect 序列化、Standard 内置
  effect 实现（Cleansing Cleric、Tame Pet 等）。
- `global-effects-ui`: renderer 层 —— TrackerPanelTabs 分页容器
  组件、GlobalEffectsPanel 组件、tab 间状态切换（per-tab 持久化
  即可，无需跨 session 持久化）、i18n keys、与现有 Tracker 路由 +
  两个 overlay 窗口的集成。

### Modified Capabilities

- `deck-tracker-core`: `DeckTrackerSnapshot` 增加 `friendlyEffects`
  / `opposingEffects` 字段，主进程 deck-tracker 在每个 snapshot
  广播帧把 registry 的状态打包进去，renderer Zustand store 同步
  暴露 selectors。

## Impact

- **新增包路径**：`packages/core/src/global-effects/`（registry、
  catalog 子目录、types）。
- **修改文件**：
  - `packages/core/src/index.ts` — 导出 GlobalEffectsRegistry +
    types。
  - `packages/core/src/types/snapshot.ts` 或等价位置 —
    扩展 `DeckTrackerSnapshot`。
  - `apps/desktop/src/main/deck-tracker.ts` — 实例化 registry，
    订阅 watcher 事件，序列化进 snapshot。
  - `apps/desktop/src/renderer/src/stores/deck-tracker-store.ts` —
    暴露 `friendlyEffects` / `opposingEffects` selector。
  - `apps/desktop/src/renderer/src/components/` — 新增
    `TrackerPanelTabs.tsx` 与 `GlobalEffectsPanel.tsx`；修改
    `routes.tsx` 用容器包裹 LiveDeckPanel；修改 `OverlayView.tsx`
    与 `OpponentOverlayView.tsx` 同步包裹。
  - `resources/locales/{en-US,zh-CN}.json` — `globalEffects.*` 命名
    空间。
- **依赖**：无新增三方依赖。Tab UI 用现有 Tailwind v4 + Radix
  原语（如已用）；不引 react-tabs / headlessui 之类。
- **IPC**：复用 `deck-tracker:state`，无新通道。
- **schema 迁移**：无（snapshot 向下兼容 — renderer 把缺失字段当作
  空数组）。
- **测试**：
  - core 单元测试：catalog 完整性、registry 触发逻辑、snapshot 序列化
    （vitest）。
  - renderer 组件测试：TrackerPanelTabs 切换、GlobalEffectsPanel
    空态/有效态渲染（vitest + @testing-library/react）。
  - i18n 测试：en-US 与 zh-CN 都包含 `globalEffects.*` 全集。
