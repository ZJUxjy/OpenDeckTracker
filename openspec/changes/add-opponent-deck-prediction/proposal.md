## Why

记牌器目前已记录对手打过的牌、合并了 hsguru 同步好的热门套牌库，但**没有把这两条数据接起来**：
看到对手打了几张牌之后，用户仍然要靠经验自己猜对面是哪套构筑。我们可以根据已打出的牌做匹配，
直接给出"最像的几套热门构筑"作为猜测。

但有两个炉石机制阻碍朴素匹配：
1. **发现 / 随机生成** 会让对手打出原本不在卡组里的牌（发现来的、亡语招出的、随机生成的等）。
   如果把这些牌一起拿去和卡组列表匹配，会产生大量噪音 —— 比如对手发现了一张 Fireball，匹配
   分数突然倾向所有带 Fireball 的卡组。必须把这类"创造卡"剔除出匹配输入。
2. **未捕获对手职业**：现状 `DeckTrackerSnapshot` 里压根没有 `opponentClass` 字段，hero 实体在
   投影时被过滤掉了。这意味着我们没法先按职业窄化候选集 —— 而职业是最强的过滤信号。

因此本 change 的范围是：补齐这两个先决条件，再把匹配引擎和 UI 接上。

跟 DEVELOPMENT_PLAN.md 的关系：DEVELOPMENT_PLAN 把"对手套牌识别"放在 Phase 5（in-match
observability 的延续）。本 change 是该能力的第一版 —— 走"已观测原牌 ∩ 候选卡组多重集"这条
最简单可解释的路线，不引入概率模型 / 机器学习。

## What Changes

### 数据管线（先决条件）

- **HearthWatcher → core 类型**：在 `OpponentCardRecord` 上新增 `created: boolean` 字段，把
  `EntityInfo.created` 的发现/生成标记一路传到渲染端。当前这个标记在 `buildOpponentRecords()`
  投影里被丢掉了。
- **DeckTrackerSnapshot.opponentClass**：从对手 hero entity（`HERO_*` cardId）解码出 `HeroClass`，
  写进 snapshot。空场 / 解码失败时为 `null`，不报错。

### 预测引擎（核心）

- 新增 `packages/core/src/tracker/opponent-deck-prediction.ts`：纯函数 `predictOpponentDecks(input)`，
  输入对手已观测的卡（带 `created` 标记）+ 职业 + 格式 + 候选热门卡组列表，输出排好序的
  `OpponentDeckPrediction[]`（top 5），每条带 deck 元信息和 0~1 的 match score。
- 算法：先按 (class, format) 过滤候选；然后对每张**非 `created`** 的对手牌，按 cardId 计入"已观测
  原牌多重集"；用 `Σ min(observed[cid], deck[cid]) / Σ observed[cid]`（IoU 的"覆盖率"变体）打分；
  并列时用 `gamesCount` 做先验 tiebreaker。详细见 design.md。

### IPC + UI

- 新增主进程 IPC handler `opponent-deck-prediction:get`：拿当前 snapshot + 缓存的热门卡组，跑预测
  函数返回结果。每次 deck-tracker 推送 snapshot 时也通过 `webContents.send('opponent-deck-prediction:update')`
  广播一次（避免渲染端做轮询）。
- 渲染端 `OpponentCardsPanel.tsx` 顶部新增"猜测构筑"区块：显示 top1 卡组（名称 + 职业 + 胜率 +
  匹配分），底下可展开 top2~5；当 ≥ 1 张创造卡被剔除时，标签显示 *"已剔除 N 张创造卡"* 提示。
- i18n：新增 `decks.opponentPrediction.*` 文案集。

### Non-goals

- **不**做 ML / 概率分布建模 —— 第一版用确定性 IoU 类公式，结果可解释、可单测。
- **不**记录历史预测准确率 —— 这次只是猜，不持币验证。
- **不**额外抓 Power.log 的 `CREATOR` 标签 —— 现有 `EntityInfo.created` 启发式（按 deck
  剩余 count 推断）已经够用，不为这一个 feature 重写 origin classifier。
- **不**扩展手牌位置追踪 —— 用户说"如位于手牌的什么位置"是为了识别发现，但发现卡的判定
  已经由 `created` 标记覆盖；手牌位置在炉石里也不稳定（卡可以被插入到任意 slot），不是
  可靠信号。
- **不**改 hsguru 同步本身 —— 直接消费现有的 `popular-decks:list` IPC。
- **不**在 mulligan 阶段做预测 —— mulligan 期对手没打牌，预测无意义。
- **不**预测自定义 / 用户保存的卡组 —— 只匹配热门库。
- **不**做实时高频更新（每 frame 重算）—— 跟随 deck-tracker 的 ~500ms 节奏。

## Capabilities

### New Capabilities

- `opponent-deck-prediction`：预测引擎（纯函数 + IPC handler）+ 渲染端"猜测构筑"UI 区块

### Modified Capabilities

- `deck-tracker-core`：新增 `opponentClass` 字段；`OpponentCardRecord` 新增 `created: boolean`
  字段（投影时把 `EntityInfo.created` 透传出来）

## Impact

- **代码**：
  - `packages/core/src/tracker/types.ts` — `OpponentCardRecord` 加 `created: boolean`，
    `DeckTrackerSnapshot` 加 `opponentClass: HeroClass | null`
  - `packages/core/src/tracker/deck-tracker.ts` — 投影时透传 `created`、解析 hero → class
  - `packages/core/src/tracker/opponent-deck-prediction.ts` — **新增** 预测函数
  - `apps/desktop/src/main/opponent-deck-prediction-ipc.ts` — **新增** IPC handler + 推送
  - `apps/desktop/src/main/ipc.ts` — 注册新 IPC
  - `apps/desktop/src/preload/index.ts` — 暴露 `window.hdt.opponentDeckPrediction.{get, onUpdate}`
  - `apps/desktop/src/renderer/src/components/OpponentCardsPanel.tsx` — 加"猜测构筑"区块
  - `resources/locales/{en-US,zh-CN}.json` — 新增 i18n key
- **类型变更影响面**：`DeckTrackerSnapshot` shape 变更需要回填默认 `opponentClass: null`、
  `created: false`，避免 snapshot 老消费者报错。
- **依赖**：无新增 npm 依赖
- **测试**：core 层 `opponent-deck-prediction.test.ts` 覆盖匹配 / 创造卡剔除 / 排序 / 边界；
  main 层 IPC 集成测试（snapshot → 预测 → 推送）；renderer 单测断言区块出现 + 计数正确。
- **风险**：
  1. `EntityInfo.created` 启发式本身有误判（origin classifier 可能漏标 / 错标）—— 这次不动它，
     接受现有精度，未来若需要再迭代
  2. 同步缓存为空时，预测会返回空数组，UI 需显示"未同步热门卡组"占位文案
  3. 卡组覆盖率公式对"对手只打过 1 张牌"非常敏感（任何带这张牌的卡组都满分）—— UI 在低
     置信度（如 observed < 5）时显示 "low confidence" 标志
