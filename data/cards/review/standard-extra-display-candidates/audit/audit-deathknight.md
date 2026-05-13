# 死亡骑士 (Death Knight) 额外显示审核

## 概览
- 卡牌总数: 15
- 建议保留并显示: 14
- 建议移除（不需要额外显示）: 1
- 需要修正建议: 10

> 总体判断：死亡骑士本类的"残骸（Corpse）"是一种隐藏资源，游戏内并不会以醒目的方式显示当前累计、当前可用、本局已消耗量，玩家肉眼很难数清楚。所以**绝大多数与残骸阈值有关的卡，都确实需要在记牌器上额外显示一个数值**。但原始 JSON 的问题主要在于：
> 1. 一套模板化的 `suggestedDisplayTextZhCN` 被无差别套用到所有牌（包括纯墓地池效果、缝合巨人这种"历史累计消耗"型、任务进度型），细节并不贴切；
> 2. `stateNeeded` 里频繁出现的 `resourceSpentThisGameIfNeeded` 对大多数普通的"消耗 X 残骸"卡是**多余**的，只有缝合巨人（RLK_744）这类**真正依赖历史累计**的牌才需要；
> 3. 个别卡（乌索克 EDR_819）效果其实是"结算瞬间生成"的池子，**结算前没东西可显示**，应当移除；
> 4. 个别卡（塔兰吉 TIME_619）的"邦桑迪"是固定特殊实体，应作为**联动卡位置追踪**（linked_card_location），不是泛泛的墓地候选池。

---

## 逐卡审核

### 5. 解冻 (RLK_101)
- **卡牌文本**: 抽一张牌。消耗2份残骸，再抽一张。
- **当前建议 displayType**: resource_counter
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 类型大方向正确——残骸阈值需要悬停提示；
  - 但 `stateNeeded` 多余地塞入了 `resourceSpentThisGameIfNeeded`，这里只关心"当前残骸 ≥ 2 吗"；
  - 模板化的 `suggestedDisplayTextZhCN` 占位符 `{required}` 应明确为 `2`，并提示"是否触发第二张抽牌"。
- **修正建议**:
  - displayType: `resource_threshold_progress`（统一与"消耗 N 残骸"型一致）
  - stateNeeded: `currentCorpseCount`
  - 应展示内容：`残骸：{currentCorpses}/2 — {currentCorpses>=2 ? "可额外抽 1 张" : "尚不足"}`
  - 备注: 此牌只关心当前是否够 2，不需要历史已消耗量。

---

### 6. 吸血鬼之血 (CORE_RLK_051)
- **卡牌文本**: 使你的英雄获得+5生命值。消耗3份残骸，多获得5点并抽一张牌。
- **当前建议 displayType**: resource_counter
- **审核结论**: ⚠️ 需修正
- **问题**: 同 RLK_101，方向对但模板化文案不够明确，`resourceSpentThisGameIfNeeded` 多余。
- **修正建议**:
  - displayType: `resource_threshold_progress`
  - stateNeeded: `currentCorpseCount`
  - 应展示内容：`残骸：{currentCorpses}/3 — {>=3 ? "额外 +5 生命并抽 1 张" : "仅基础 +5 生命"}`
  - 备注: 阈值固定为 3。

---

### 10. 僵尸新娘 (CORE_RLK_504)
- **卡牌文本**: 战吼：消耗最多10份残骸，召唤一个攻击力和生命值等同于消耗残骸数并具有嘲讽的复活的新郎。
- **当前建议 displayType**: resource_counter
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 原 `categories` 标了 `graveyard_pool`、`trackingHints` 标了 `friendly_graveyard / death_history_by_card_type_tribe_cost_keyword`，这是**错误的**——本牌不从墓地复活随从，只是命名带"复活的新郎"种族而已；
  - 这是一张"消耗最多 N"型，要显示的就是当前残骸数（封顶 10），用来预览身材。
- **修正建议**:
  - displayType: `resource_threshold_progress`
  - stateNeeded: `currentCorpseCount`
  - 应展示内容：`残骸：{min(currentCorpses,10)} — 召唤 {min(currentCorpses,10)}/{min(currentCorpses,10)} 嘲讽随从`
  - 备注: **删除 graveyard_pool 相关 tracking**；不需要历史累计。

---

### 11. 邪爆 (CORE_RLK_035)
- **卡牌文本**: 引爆一份残骸，对所有随从造成1点伤害。如果有随从存活，重复此效果。
- **当前建议 displayType**: resource_counter
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 残骸数量决定最多能"循环"几轮 AOE，这是玩家**最需要**的预览信息；
  - 原模板没体现这层语义。
- **修正建议**:
  - displayType: `resource_threshold_progress`
  - stateNeeded: `currentCorpseCount`
  - 应展示内容：`残骸：{currentCorpses} — 最多对全场随从造成 {currentCorpses}×1 点伤害`
  - 备注: 实际伤害取决于随从是否每轮都存活，记牌器给出"最大上限"即可。

---

### 14. 玛洛加尔领主 (RLK_085)
- **卡牌文本**: 战吼：将你的所有残骸复活为1/1并具有突袭的复活的傀儡。每有一个放不下的傀儡，使一个傀儡获得+2/+2。
- **当前建议 displayType**: resource_counter
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 此牌效果由"当前总残骸数"完全决定身材分布，预览价值高；
  - 与僵尸新娘同理：原始 `graveyard_pool` 标签是误标，本牌不挑墓地具体实体；
  - 需要再额外计算"将放下几个、剩多少加 +2/+2"，对玩家很有用。
- **修正建议**:
  - displayType: `resource_threshold_progress`
  - stateNeeded: `currentCorpseCount`、`friendlyBoardFreeSlots`
  - 应展示内容：`残骸：{currentCorpses} — 上场 {min(currentCorpses, freeSlots)} 个；剩 {max(0, currentCorpses-freeSlots)} 个分配为 +{(剩)*2}/+{(剩)*2}`
  - 备注: 删除 graveyard 相关 tracking；强烈建议加入剩余位置计算。

---

### 16. 缝合巨人 (RLK_744)
- **卡牌文本**: 在本局对战中，你每消耗过一份残骸，本牌的法力值消耗便减少（1）点。
- **当前建议 displayType**: resource_spent_cost_progress
- **审核结论**: ✅ 保留（仅微调）
- **问题**:
  - 这是少数**真正需要"本局历史累计消耗"**的卡，原 `displayType` 正确；
  - 但 `trackingHints` 里塞了一堆 `cards_played_*` / `spells_cast_this_game` / `summons_discards_overloads_*` 与本牌无关，应当裁剪——本牌只关心"本局消耗残骸总数"；
  - 文案 `进度：{count}` 不够具体。
- **修正建议**:
  - displayType: `resource_spent_cost_progress`（保留）
  - stateNeeded: `corpsesSpentThisGame`（仅此一项）
  - 应展示内容：`本局已消耗残骸：{spent} — 当前费用：{max(0, 9 - spent)} 法力值`
  - 备注: 最重要的一张 corpse 历史型卡，是缝合巨人这一类的代表。

---

### 22. 沃尔科罗斯 (FIR_951)
- **卡牌文本**: 突袭。嘲讽。战吼：选择消耗10份，20份或30份残骸以获得等量属性值。
- **当前建议 displayType**: resource_threshold_progress
- **审核结论**: ✅ 保留（微调）
- **问题**: 类型完全正确，应明确告知当前残骸命中哪一档（10/20/30）。
- **修正建议**:
  - displayType: `resource_threshold_progress`（保留）
  - stateNeeded: `currentCorpseCount`
  - 应展示内容：`残骸：{currentCorpses}；可用档位：{tiers满足列表}（例如：可选 10 / 20，未达 30）`
  - 备注: 此牌典型多阈值选择型，三档高亮反馈对玩家很有价值。

---

### 23. 乌索克 (EDR_819)
- **卡牌文本**: 战吼：攻击所有其他随从。亡语：复活本随从消灭的随从。
- **当前建议 displayType**: entity_kill_pool
- **审核结论**: ❌ 移除
- **问题**:
  - 亡语复活的是"**本随从**消灭的随从"——这部分实体是**结算之时**才会被记录到该实体身上，**出牌前根本没有候选池**；
  - 在牌库/手牌中悬停时，玩家面前的随从池子是不可预测的（取决于战吼能否打到、能否击杀，以及当前对面/己方场面）；
  - 这种"瞬时生成、绑定到具体战场实体"的效果不属于需要预先显示的范畴，普通的随从战吼图示已足够；
  - 即便是上场后追踪它"已绑定哪些将要复活的随从"，那也是常规亡语随从行为，记牌器一般不会为单独一个亡语随从开窗口显示。
- **修正建议**:
  - 整张卡建议从额外显示候选中移除。
  - 备注: 与"召唤一个本局死亡的友方亡灵"这种从墓地池子里挑（如悼念成真）截然不同，不应放在同一类。

---

### 24. 恐怖再起 (TLC_433)
- **卡牌文本**: 任务：消耗15份残骸。奖励：泰拉克斯，魔骸暴龙。
- **当前建议 displayType**: resource_quest_progress
- **审核结论**: ✅ 保留（微调）
- **问题**:
  - 类型完全正确，任务进度本就需要历史累计；
  - 但占位符 `{required}` 模糊，应固定为 15；
  - 一旦任务被打出，记牌器需要追踪的是"打出任务之后消耗的残骸"，不是"本局累计"——这点应在文档里明确（炉石任务条件通常从打出后开始计算）。
- **修正建议**:
  - displayType: `resource_quest_progress`（保留）
  - stateNeeded: `corpsesSpentSinceQuestPlayed`、`questActive`
  - 应展示内容：在牌库/手牌时：`任务奖励：泰拉克斯；阈值 15 残骸`；任务打出后：`进度：{spentSince}/15`
  - 备注: 与缝合巨人不同——缝合巨人统计的是"全局历史"，本任务只统计"任务激活后"消耗。

---

### 29. 重生的翼手龙 (TLC_436)
- **卡牌文本**: 突袭。吸血。消耗残骸而非法力值。
- **当前建议 displayType**: resource_playability
- **审核结论**: ✅ 保留（微调）
- **问题**:
  - "消耗残骸而非法力值"——cost 字段写 5，意味着需要 5 份残骸而非 5 法力值；
  - 玩家在手牌时最想知道的就是"我现在能不能甩它出来"，类型正确；
  - 文案不够明确，应直接给出"残骸 X/5"红绿提示。
- **修正建议**:
  - displayType: `resource_playability`（保留）
  - stateNeeded: `currentCorpseCount`、`currentManaCrystals`（前者主，后者用来确认替代规则成立）
  - 应展示内容：`残骸：{currentCorpses}/5 — {>=5 ? "可打出（消耗 5 残骸）" : "残骸不足"}`
  - 备注: 此类"以残骸替代法力值"型未来若有更多卡，可复用同一 displayType。

---

### 35. 永时收割者哈斯克 (TIME_618)
- **卡牌文本**: 战吼：使你的英雄获得"亡语：消耗最多20份残骸，复活你的英雄并使其具有等量生命值。"
- **当前建议 displayType**: persistent_resource_effect
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 战吼把英雄变成有亡语的"复活英雄"实体；亡语触发时消耗最多 20 残骸；
  - 真正需要悬停展示的是**英雄当前是否带着这个亡语 buff**，以及**触发时能复活到多少血**；
  - 原 `categories` 含 `graveyard_pool` 是误标，本卡和墓地池子无关，仅与残骸数挂钩。
- **修正建议**:
  - displayType: `persistent_resource_effect`（保留），但 stateNeeded 精简
  - stateNeeded: `currentCorpseCount`、`heroHasHaskelDeathrattleBuff`
  - 应展示内容：
    - 手牌/牌库时：`战吼为英雄附加亡语：复活时取当前残骸数（最多 20）作为生命值`
    - 战吼已触发后（如果记牌器有英雄状态面板）：`亡语已附加；当前若触发可复活为 {min(currentCorpses, 20)} 生命`
  - 备注: 删除 graveyard/deathrattle 多余 tracking。

---

### 36. 悼念成真 (TIME_616)
- **卡牌文本**: 召唤在本局对战中死亡的法力值消耗最高的友方亡灵。
- **当前建议 displayType**: graveyard_candidate_pool
- **审核结论**: ✅ 保留（微调）
- **问题**:
  - 类型完全正确：需要追踪"本局对战中死亡的**亡灵**牌池（友方）"，并按法力值排序，最高的就是结算目标；
  - 原 `trackingHints` 里有 `cards_played_*` 系列，与本牌无关，应裁剪；
  - 文案 `墓地候选：{cardNames}` 不够精准——其实只有"最高费的那一张"是结果，但展示**整个候选池+排序**对玩家判断价值更高。
- **修正建议**:
  - displayType: `graveyard_candidate_pool`（保留）
  - stateNeeded: `friendlyGraveyardFiltered:{ tribe:UNDEAD }`，并按费用降序
  - 应展示内容：
    - 预测召唤：`{topUndeadName}（{topUndeadCost}费）`
    - 完整候选（折叠）：`已死亡友方亡灵：{list of name(cost)}`
  - 备注: 必须**只统计友方墓地**且**只统计亡灵种族**；最高费需要计算并高亮。

---

### 37. 墓地尊主塔兰吉 (TIME_619)
- **卡牌文本**: 奇闻。战吼：抽取邦桑迪（如果他已经死亡则将其复活），选择并使其获得一项恩泽。
- **当前建议 displayType**: linked_card_location
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 方向正确：邦桑迪是一张特定的、独一无二的卡（Bwonsamdi），玩家关心"他现在在哪儿"（牌库/手牌/战场/墓地/已转化）；
  - 但原 `categories` 含 `graveyard_pool / death_event_trigger` 是误标——塔兰吉不挑墓地池子，只跟邦桑迪一张牌挂钩；
  - 现有 `trackingHints` 全部围绕"墓地候选池"，应替换为"单一特定卡位置追踪"。
- **修正建议**:
  - displayType: `linked_card_location`（保留）
  - stateNeeded: `bwonsamdiLocation`（zone: deck/hand/play/graveyard/transformed/missing）、`bwonsamdiAliveOrDead`
  - 应展示内容：`邦桑迪位置：{位置中文}；战吼结算：{若在场不变 / 若死亡则复活 / 若不在套牌则抽取}`
  - 备注: 此牌的额外显示价值在于让玩家明确战吼到底会做什么（已经在场？被消除了？），是典型的"指向特定卡 + 多状态展示"型。

---

### 40. 投喂加餐 (CATA_465)
- **卡牌文本**: 召唤五条5/4的亡灵幼龙。消耗8份残骸，使其获得突袭。
- **当前建议 displayType**: resource_threshold_progress
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 类型正确，文案模板化；
  - 这里只关心当前残骸是否 ≥ 8。
- **修正建议**:
  - displayType: `resource_threshold_progress`（保留）
  - stateNeeded: `currentCorpseCount`
  - 应展示内容：`残骸：{currentCorpses}/8 — {>=8 ? "5×5/4 亡灵幼龙带突袭" : "5×5/4 亡灵幼龙（无突袭）"}`
  - 备注: 删除 `resourceSpentThisGameIfNeeded`。

---

### 25. 古生物秘术 (TLC_434)
- **卡牌文本**: 发现一张亡灵牌。消耗5份残骸，改为保留全部三张牌。
- **当前建议 displayType**: resource_threshold_progress
- **审核结论**: ✅ 保留（已较为正确）
- **问题**:
  - 类型与 stateNeeded 都已经合理，文案 `残骸：{corpses}/5；发现结果：{resultText}` 也较具体；
  - 唯一可改进：`resultText` 在出牌前并不存在，应改为"预期效果"。
- **修正建议**:
  - displayType: `resource_threshold_progress`（保留）
  - stateNeeded: `currentCorpseCount`
  - 应展示内容：`残骸：{currentCorpses}/5 — {>=5 ? "保留全部 3 张发现牌" : "三选一发现"}`
  - 备注: 在该 JSON 中这条已是最接近正确写法的一项，建议作为其他卡的模板参考。

---

## 总结建议

1. **模板化文案需要按"效果家族"拆分**：当前 JSON 把所有残骸卡共享一句 `资源：{count}/{required}；当前效果：{effectPreview}`，缺少差异化。建议至少分为三类文案模板：
   - **阈值替换型**（解冻、吸血鬼之血、邪爆、投喂加餐、古生物秘术、僵尸新娘、玛洛加尔领主、沃尔科罗斯、重生的翼手龙）：`残骸：{cur}/{N} — 达标效果：…；未达效果：…`
   - **本局历史累计型**（缝合巨人、恐怖再起任务）：`本局已消耗残骸：{spent}（/N）— 当前费用 or 进度：…`
   - **联动单卡位置型**（墓地尊主塔兰吉）：`{特定卡}位置：…；战吼结算分支：…`

2. **统一裁剪 `resourceSpentThisGameIfNeeded`**：除缝合巨人 (RLK_744)、恐怖再起 (TLC_433) 之外，其他 corpse 卡牌都只需要 `currentCorpseCount`，不需要历史累计。当前所有卡一律塞上是过度收集。

3. **错误的 `graveyard_pool` 标签应整理**：僵尸新娘、玛洛加尔领主、永时收割者哈斯克、塔兰吉这四张卡都被错误打上了 `graveyard_pool` 或 `death_history_by_card_type_tribe_cost_keyword`，但它们实际上跟墓地随从池没有关系（前两张只关心残骸数；后两张分别跟"英雄状态/特定单卡"挂钩）。建议复审分类逻辑。

4. **真正属于墓地池子的只有"悼念成真"一张**：在死亡骑士 15 张候选中，**真正需要"友方墓地按种族/费用过滤池"展示的只有 TIME_616 悼念成真**。如果记牌器要实现"墓地候选池显示"功能，可以先以这张为模板。

5. **建议移除乌索克 (EDR_819)**：该卡的"复活池"是结算瞬间生成的、绑定在战场实体上的，没有"提前可悬停的内容"，不属于额外显示候选。

6. **特定单卡追踪 (塔兰吉)**：邦桑迪 (Bwonsamdi) 是一张独立可识别的传说卡，作为"linked_card_location"展示价值极高，应作为该 displayType 的标杆案例。这一类未来还会扩展（其它"抽取/复活特定具名卡"型）。

7. **死亡骑士独有但本批次未覆盖**："本局打出 X 张符文牌""本局护甲值变化""本局施法消耗的法力值"等历史型字段，在本批 15 张候选里**并未出现**，本批均为残骸/墓地/联动卡位置类。若后续补全 DK 牌池，再单独审核此类卡。
