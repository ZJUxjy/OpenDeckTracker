## Context

记牌器的对手 panel 现在是个被动展示器：把对手打过的牌按时序铺出来，剩下的解读交给玩家。
我们已经具备所有原料：
- HearthWatcher 的 origin classifier 会在 `EntityInfo.created` 上标"这张牌不是从原始卡组来的"
  （依据是"按 cardId 累计计数超过原 deck 中该 card 的数量"这个启发式）。
- `popular-decks:list` IPC 返回 hsguru 同步好的热门构筑，每副带 `cardNames` / 决定型 `deckstring`。
- `DeckTrackerSnapshot.opponent.revealed[]` 给我们打过的牌 + zone + entityId。

但两条数据没接通：(1) `created` 标记被 `buildOpponentRecords()` 投影时丢掉了；(2) 整个 snapshot
里**根本没有 opponent class**（hero entity 在投影时被过滤）。这次 change 把这两个先决条件
补上，再加最简的匹配引擎和 UI。

## Goals / Non-Goals

**Goals:**
- 让对手 panel 多出"猜测构筑"区块：top-1 卡组名 + 职业 + 胜率 + 匹配分 + 置信度，可展开看 top2~5
- 算法纯函数化、可单测、可解释（用户能理解"为什么是这套"）
- 创造卡（Discover/Generate/亡语等产生的）从匹配输入里剔除，UI 显示剔除条数
- 跟随 deck-tracker 推送节奏（~500ms），不轮询

**Non-Goals:**
- 不引入概率 / ML / 历史命中率统计
- 不抓 Power.log 的 `CREATOR` tag —— 用现有 `info.created` 启发式
- 不预测自定义卡组、只匹配热门库
- 不在 mulligan 期做预测
- 不改 hearthwatcher origin classifier 的实现（接受其现有精度）
- 不实现"按手牌 slot 位置识别发现卡"—— 该信号不可靠（Hearthstone 允许卡牌被插入任意 slot）

## Decisions

### Decision 1：评分公式

- **Context**：要给"对手已观测的非创造卡"和"候选卡组的多重集"算一个 0~1 的相似度。
- **Options**：
  - A. **Observation-coverage**: `Σ min(observed[c], deck[c]) / Σ observed[c]`
    — 对每张观测到的牌，问"这张牌在卡组里有几张"，加起来除以观测总数。1.0 = 全部观测到的牌
    都在该 deck 里。
  - B. **Jaccard 多重集**: `|observed ∩ deck| / |observed ∪ deck|`
    — 对称，但分母含整个 30 张 deck，导致前 5 turn 分数永远很低。
  - C. **TF-IDF / 罕见卡加权**：罕见卡命中加分。
- **Choice**：A
- **Rationale**：
  - 早期阶段（observed 少）也能给出有意义的 0~1 分布
  - 容易解释："你已经看到对手打的这 X 张牌里，有 Y 张这套卡组也带 → score = Y/X"
  - 用户体感对：如果对手到目前为止打的所有牌都在某 deck 里，那 deck 当然 100%
  - 不会因为对手只打了 1 张就给所有带这张牌的 deck 满分误导：低 observed 用 confidence 标志
    单独标识（见 Decision 2）
  - C 等加权方案需要长期统计，YAGNI

### Decision 2：Confidence 分级

- 阈值：< 5 → low，5–9 → medium，≥ 10 → high
- **Rationale**：炉石平均一局 7~10 turn，每 turn 对手大约打 1 张牌（不严格，但量级合理）。
  10+ 张观测后预测的 stability 显著上升；< 5 张时几乎所有 deck 都能 100% 命中是常态，UI 必须
  把这个不确定性传达给玩家。

### Decision 3：用 cardId 还是 dbfId 做匹配键

- **Context**：deckstring 解码出来是 `dbfId`，opponent.revealed 出来是 `cardId`（字符串）。
- **Choice**：cardId
- **Rationale**：cardId 是稳定的字符串 ID（如 `EX1_277`），dbfId 在新版本可能变。同时
  `OpponentCardRecord` 早就用 cardId，没必要在前端做 cardId↔dbfId 来回转。
  实现上：`deckCardLookup(deckstring)` 内部 `decodeDeck` → 拿 dbfId list → 通过 CardDb 反查
  cardId → 返回 `Map<cardId, count>`。

### Decision 4：纯函数 + 注入 lookup

- 核心 `predictOpponentDecks` 接受 `deckCardLookup: (deckstring) => Map<cardId, count> | null` 注入
- core 包不依赖 hearthdb / Buffer / electron，避免渲染端 / 测试 / 主进程都能复用
- 主进程实现 `deckCardLookup` 时调 `decodeDeck` + CardDb，结果可缓存（同一 deckstring 在
  同一同步周期内只解码一次）

### Decision 5：IPC 推送 vs 渲染端轮询

- **Choice**：主进程在每次 deck-tracker push snapshot 时**也**广播 `opponent-deck-prediction:update`
- **Rationale**：deck-tracker 已经有 onStateChange 推送机制（500ms 节奏），predictions 直接挂在
  这条管线后。渲染端订阅 `onUpdate` 即可，避免重复轮询。
- 仍保留 `opponent-deck-prediction:get` 作为渲染端首次挂载或刷新的同步入口。

### Decision 6：缓存 / 性能

- 候选卡组 ~70+，每副 deckstring 解码 ~30 张牌的 dbfId → cardId 查表 ~一次几百微秒。每 500ms
  推送一次，预算够用。
- 仍然加 LRU cache（key=deckstring，value=`Map<cardId, count>`），cache size 200。同步快照变更
  时整体清空。

### Decision 7：opponentClass 解析时机 + 缓存

- **Context**：hero entity 在 mulligan 阶段就出现，class 一开始就能拿到。但 `game.opposingPlayer.entities`
  在 mid-turn 偶尔会有边界情况（hero swap 等）。
- **Choice**：deck-tracker 内部缓存 "本场最早一次成功解析到的 class"，后续 snapshot 即使 entity
  消失也持续返回缓存值；match 重置（`onMatchEnd` / `onMatchStart`）时清空。
- **Rationale**：避免 UI 闪烁（class 突然变 null 又变回来）。

### Decision 8：UI 区块位置

- 放在 `OpponentCardsPanel.tsx` 顶部、revealed cards list 之上
- 折叠时只占 ~64px 高，不挤压 revealed list
- 展开时多 ~140px（top2~5 各 ~30px）
- 创造卡剔除提示：作为副标题行，灰色小字
- **未选 Tab 切换方案**：用户在打牌中常态扫一眼对手 panel，不应该再加一次点击切到"猜测"
  Tab；置顶 + 折叠最省眼神

### Decision 9：i18n 文案表

```
decks.opponentPrediction.sectionTitle:        "Predicted deck" / "猜测构筑"
decks.opponentPrediction.expand:              "Show alternatives" / "查看其他可能"
decks.opponentPrediction.collapse:            "Hide alternatives" / "收起"
decks.opponentPrediction.noMatch:             "No matching popular decks" / "没有匹配的热门卡组"
decks.opponentPrediction.excludedCards:       "Excluded {count} created cards" / "已剔除 {count} 张创造卡"
decks.opponentPrediction.confidenceLow:       "low" / "低置信度"
decks.opponentPrediction.confidenceMedium:    "medium" / "中"
decks.opponentPrediction.confidenceHigh:      "high" / "高"
decks.opponentPrediction.matchScore:          "{score}% match" / "{score}% 匹配"
```

## 文件结构

```
packages/core/src/tracker/
├── types.ts                                  # MODIFIED: opponentClass + created
├── deck-tracker.ts                           # MODIFIED: 透传 created + 解析 hero class
├── opponent-deck-prediction.ts               # NEW: predictOpponentDecks 纯函数
└── opponent-deck-prediction.test.ts          # NEW: 算法 + 边界

apps/desktop/src/main/
├── opponent-deck-prediction-ipc.ts           # NEW: IPC handler + push
├── opponent-deck-prediction-ipc.test.ts      # NEW: IPC mock + push 验证
└── ipc.ts                                    # MODIFIED: 注册新 IPC

apps/desktop/src/preload/index.ts             # MODIFIED: 暴露 opponentDeckPrediction

apps/desktop/src/renderer/src/components/
├── OpponentCardsPanel.tsx                    # MODIFIED: 加预测区块
└── OpponentDeckPredictionSection.tsx         # NEW: 区块组件

resources/locales/en-US.json                  # MODIFIED
resources/locales/zh-CN.json                  # MODIFIED
```

## Risks / Trade-offs

- **Risk**：origin classifier 的"按计数推断 created"启发式漏标 → **Mitigation**：本 change 不动
  classifier；UI 上"已剔除 N 张"提示让用户对剔除数量有感知；如果某局明显异常（比如剔除 0
  但用户知道对手发现了一堆），用户可以选择忽略 prediction。
- **Risk**：低 observed 时几乎所有候选卡组都得分 1.0，UI 显示的 top-1 看起来很自信 →
  **Mitigation**：`confidence: 'low'` 标志 + 文案说明；并列高分时按 `gamesCount` 取最常见的
  那个，至少别给一个奇葩 deck 误导用户。
- **Risk**：`onMatchStart` / `onMatchEnd` 没正确清 opponentClass cache → **Mitigation**：deck-tracker
  本就有 phase machine，加单测覆盖 PRE_MATCH → IN_MATCH → POST_MATCH 的 class 生命周期。
- **Risk**：candidates 全部解码失败（cache 损坏 / cards.json 老版本）→ **Mitigation**：
  predictOpponentDecks 中静默 drop 解码失败的，IPC 返回 `[]`，UI 显示 "no match" 文案。
- **Risk**：deck-tracker IPC push 频率高 + 候选 70 多副，性能炸 → **Mitigation**：deckstring →
  Map<cardId, count> 走 LRU cache；实测 70 副 × ~30 张 lookup ≈ 几 ms，远低于 500ms 节奏。
- **Trade-off**：不抓 `CREATOR` tag。用现有 `created` 启发式，准确率有上限。后续如果发现误差大，
  可独立做一个 change 升级 origin classifier。
- **Trade-off**：不显示 deck variant 区分（v1/v2/v3）—— top-N 列表里同一 archetype 不同
  variant 会挤在一起。可接受：variant 之间差几张牌，对玩家决策影响有限；UI 已经显示完整
  deck name 区分。

## Migration Plan

1. 落 core 层类型变更（`opponentClass` + `OpponentCardRecord.created`）+ deck-tracker 投影 +
   单测 —— 不破坏现有渲染端（新字段是新增，老消费者忽略即可）
2. 落核心算法 + 单测
3. 落 IPC + preload + 渲染端区块
4. 落 i18n
5. typecheck / 全测 / 手测：随便一局对手打几张牌看是否猜出合理结果；发现卡剔除提示出现

## Open Questions

- 是否需要在主页面（OpponentOverlay 之外）也展示预测？—— 暂不做，OpponentOverlay 是用户在游戏中
  唯一会扫到的地方。
- 是否提供"导入此卡组到我的列表"按钮？—— 可以做，但放在后续 change（点了等于把对手 deck 拉到
  本地用，本 change 范围外）。
- 是否要把 `DeckTrackerSnapshot.opponentClass` 暴露给其他 UI 区块（如 stats / match-history）？
  —— 暴露了就在那里，但本 change 不消费；后续 stats 改进时可以一起利用。
